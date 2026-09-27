"use server";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { headers } from "next/headers";
import { ChatMessage, Order, AIResponse, AIResponseMeta, OrderAction, OrderValidationResult, EngineError } from "./types";
import { validateOrder } from "./order";
import { parseManageOrderArgs } from "./toolArgs";
import { consumeAiQuota } from "./rateLimit";
import { buildHistory, buildSystemInstruction, guestWritesBengali } from "./prompt";

/** Hard ceiling on a single model call. Also enforced by the SDK via httpOptions.timeout. */
const TIMEOUT_MS = 20_000;

/** Overridable via GEMINI_MODEL, so a different model needs no code change. */
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";

/** Built lazily, so a missing key never constructs a client with an empty string. */
let cachedClient: GoogleGenAI | null = null;
function isAiConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
}
function getClient(): GoogleGenAI {
    if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
    return cachedClient;
}

/**
 * manage_order — the model's only way to affect application state.
 *
 * Every field is validated again on arrival (`parseManageOrderArgs` here, and
 * `processOrderAction` in the widget): the model is an untrusted input source, so its output is
 * treated as a request, never a command. A hallucinated item code, a negative quantity or an
 * out-of-policy `confirm` is rejected rather than obeyed.
 *
 * The descriptions are terse because the operating rules already live in the system instruction,
 * which the model reads on the same turn. The one thing spelled out in full is the
 * absolute-vs-delta quantity distinction, the most common way to get an order wrong.
 */
const manageOrderTool: FunctionDeclaration = {
    name: 'manage_order',
    /*
     * The "always add a line of text" clause lives here as well as in the system instruction,
     * because a model that has decided to call a tool tends to emit the call and stop. Stated on
     * the declaration, it is read as the call is built.
     */
    description: 'Change the guest\'s order, record their details, or show them the menu. '
        + 'Always follow this call with one short line of text addressed to the guest, in the language '
        + 'and mix they wrote in, saying what you just did. Never send this call on its own.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            action: {
                type: Type.STRING,
                description: 'The action to perform.',
                enum: ['add', 'remove', 'set_quantity', 'set_notes', 'checkout', 'update_info', 'confirm', 'browse_menu']
            },
            category_id: {
                type: Type.STRING,
                description: 'Category id for "browse_menu" (e.g. "chinese").'
            },
            subcategory_id: {
                type: Type.STRING,
                description: 'Subcategory id for "browse_menu" (e.g. "soups"). Use it when the guest named a part of a category.'
            },
            items: {
                type: Type.ARRAY,
                description: 'Items to act on. Required for "add", "remove", "set_quantity" and "set_notes".',
                items: {
                    type: Type.OBJECT,
                    properties: {
                        item_code: {
                            type: Type.STRING,
                            description: 'A code from the menu. Anything else is discarded.'
                        },
                        quantity: {
                            type: Type.INTEGER,
                            description: 'For "add": how many to add, 1 or more. For "set_quantity": the NEW total for that item, never a difference. For "remove": how many to take away, or omit it to remove the whole line.'
                        },
                        notes: {
                            type: Type.STRING,
                            description: 'Special instructions or variations. Required for "set_notes".'
                        }
                    },
                    required: ['item_code']
                }
            },
            customer_details: {
                type: Type.OBJECT,
                description: 'Details the guest gave. Required for "update_info". You may record an address but never a verified location.',
                properties: {
                    name: { type: Type.STRING, description: 'Full name' },
                    phone: { type: Type.STRING, description: 'Mobile number' },
                    address: { type: Type.STRING, description: 'Delivery address' },
                    delivery_type: { type: Type.STRING, enum: ['pickup', 'delivery'], description: 'How they want it' },
                    preferred_time: { type: Type.STRING, description: 'Preferred time' },
                    preferences: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Short facts worth remembering all conversation — allergies, dietary needs, spice tolerance, a usual order. One short phrase each.'
                    }
                }
            }
        },
        required: ['action']
    }
};

/**
 * The prompt itself lives in lib/prompt.ts; this alias keeps the call site short.
 */
const getSystemInstruction = (order: Order | null) => buildSystemInstruction(order);

/**
 * Treats a rejected `confirm` as a normal turn: the guest is told what is still missing rather
 * than shown a confirmation the server refuses. No second model call to re-prompt.

 */
function buildIncompleteOrderReply(result: OrderValidationResult): string {
    const issues = result.valid ? [] : result.issues;
    if (issues.length === 0) return "May I confirm the details of your order, Sir/Ma'am?";
    if (issues.length === 1) return `Before I place this order — ${issues[0].message}`;
    return `Before I place this order I still need a few details. ${issues.slice(0, 2).map(i => i.message).join(' ')}`;
}


function degradedReply(error: EngineError): AIResponse {
    return { text: error.message, meta: { source: 'fallback', aiAvailable: false, error } };
}

function readErrorCode(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
}

function readErrorName(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('name' in error)) return undefined;
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
}

/** Maps SDK/network failures onto the typed EngineError union — no `any` required. */
function toEngineError(error: unknown, retryAfterSeconds?: number): EngineError {
    const status = readErrorCode(error);
    const name = readErrorName(error);

    if (name === 'AbortError' || name === 'TimeoutError') {
        return {
            code: 'timeout',
            message: "Our kitchen systems are responding slowly, Sir/Ma'am. Please try again in a moment — your order is safe.",
            degraded: true,
        };
    }
    if (status === 429) {
        return {
            code: 'rate_limited',
            message: "We're serving a lot of guests at the moment. Please try again in a moment — your cart is safe.",
            retryAfterSeconds,
            degraded: true,
        };
    }
    if (status === 401 || status === 403) {
        return {
            code: 'missing_api_key',
            message: "Our AI waiter is not configured at the moment. You can still browse the menu and place your order.",
            degraded: true,
        };
    }
    if (status !== undefined && status >= 500) {
        return {
            code: 'upstream',
            message: "Our kitchen systems are having trouble connecting, Sir/Ma'am. Please try again in a short while — your basket is safe.",
            degraded: true,
        };
    }
    return {
        code: 'unknown',
        message: "I apologize, something went wrong on our side. Please try again in a moment — your basket is safe.",
        degraded: true,
    };
}

/**
 * Reads token accounting off the SDK response without trusting its shape. The provider has
 * renamed these fields between releases, so anything unexpected is simply omitted rather
 * than asserted on.
 */
function readUsage(response: unknown, model: string): AIResponseMeta['usage'] {
    if (typeof response !== 'object' || response === null) return undefined;
    const raw = (response as { usageMetadata?: unknown }).usageMetadata;
    if (typeof raw !== 'object' || raw === null) return undefined;

    const record = raw as Record<string, unknown>;
    const input = record.promptTokenCount;
    const output = record.candidatesTokenCount;
    if (typeof input !== 'number' || typeof output !== 'number') return undefined;

    return { model, inputTokens: input, outputTokens: output };
}

/**
 * Google states the wait in the 429 itself (`RetryInfo.retryDelay`, e.g. "18s"). Discarding it
 * means telling a guest to "try again in a moment" when the honest answer is "in 18 seconds".
 * The shape has moved between releases, so anything unrecognised is simply absent.

 */
function readRetryAfterSeconds(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;

    const candidates: unknown[] = [];
    const push = (value: unknown) => { if (value !== undefined) candidates.push(value); };

    const root = error as Record<string, unknown>;
    push(root.retryDelay);
    const details = root.details;
    if (Array.isArray(details)) {
        for (const detail of details) {
            if (typeof detail === 'object' && detail !== null) push((detail as Record<string, unknown>).retryDelay);
        }
    }

    for (const candidate of candidates) {
        // Accepts "18s", 18, or "1.5s" — the provider has used all three.
        if (typeof candidate === 'number' && Number.isFinite(candidate)) return Math.ceil(candidate);
        if (typeof candidate === 'string') {
            const seconds = Number.parseFloat(candidate.replace(/s$/i, ''));
            if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
        }
    }
    return undefined;
}

/** Only worth retrying when the failure was ours or theirs, not the guest's. */function isTransient(error: unknown): boolean {
    const status = readErrorCode(error);
    if (status === 429 || status === 401 || status === 403) return false;
    if (status !== undefined && status < 500) return false;
    const name = readErrorName(error);
    // A timeout is not retried: the request may still be running at Google and would be
    // charged twice. A transport failure means it never landed.
    if (name === 'AbortError' || name === 'TimeoutError') return false;
    return true;
}

async function readClientId(): Promise<string> {
    try {
        const headerList = await headers();
        const forwarded = headerList.get('x-forwarded-for');
        const ip = forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'local';
        return ip;
    } catch {
        return 'unknown';
    }
}

/**
 * The only export from this module — everything else must stay private, because a
 * `"use server"` file turns every export into a public endpoint.
 */
export async function getLogicResponse(history: ChatMessage[], currentOrder: Order | null): Promise<AIResponse> {
    // 1. Demo mode: no key configured. The client never gets here in that case, but the
    //    action is public, so the check must be authoritative on the server too.
    if (!isAiConfigured()) {
        return degradedReply({
            code: 'missing_api_key',
            message: "Our AI waiter is offline right now, Sir/Ma'am. You can still browse the menu, build your order and check out — I just can't hold a conversation.",
            degraded: true,
        });
    }

    // 2. Free-tier guard. Runs before the SDK so a throttled request costs nothing.
    const decision = consumeAiQuota(await readClientId());
    if (!decision.allowed) {
        const scope = decision.scope === 'daily' ? 'later today' : 'in a moment';
        return degradedReply({
            code: 'rate_limited',
            message: `We're serving a lot of guests at the moment, Sir/Ma'am. Please try again ${scope} — your cart is safe.`,
            retryAfterSeconds: decision.retryAfterSeconds,
            degraded: true,
        });
    }

    const validHistory = buildHistory(history);

    if (validHistory.length === 0) {
        return {
            text: "Assalamu Alaikum! How may I assist you with your dining today?",
            meta: { source: 'fallback', aiAvailable: true },
        };
    }

    // 3. The timeout is real now: the signal and the SDK-level timeout are both wired up.
    //    (Cancelling client-side does not cancel the request server-side at Google, so a
    //    timed-out call may still consume quota — noted in the README.)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();
    // The model is told nothing about which language to use — it reads whatever the guest
    // writes. The only thing decided here is which of OUR hard-coded strings to fall back on if
    // the model returns a tool call with no text, and for that a script check on the last guest
    // turn is enough.
    const systemInstruction = getSystemInstruction(currentOrder);


    /**
     * One retry, and only for failures that never reached the model. A 5xx or a dropped
     * connection costs the guest nothing to repeat, whereas a timeout is deliberately *not*
     * retried because the request may still be running at Google and would be billed twice.
     */
    const callModel = async (): Promise<Awaited<ReturnType<ReturnType<typeof getClient>['models']['generateContent']>>> => {
        const request = {
            model: MODEL,
            contents: validHistory,
            config: {
                systemInstruction,
                temperature: 0.5, // Slightly lower for more deterministic waiter behavior
                tools: [{ functionDeclarations: [manageOrderTool] }],
                abortSignal: controller.signal,
                httpOptions: { timeout: TIMEOUT_MS },
            },
        };
        try {
            return await getClient().models.generateContent(request);
        } catch (error) {
            if (!isTransient(error)) throw error;
            console.warn('[engine] transient failure, retrying once', readErrorCode(error));
            return await getClient().models.generateContent(request);
        }
    };

    try {
        const modelResponse = await callModel();

        const latencyMs = Date.now() - startedAt;
        const textResponse = modelResponse.text || "";
        const functionCalls = modelResponse.functionCalls;

        let orderAction: OrderAction | undefined;
        let notices: string[] = [];

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call.name === 'manage_order') {
                // Parse, repair and validate the model's request before anything acts on it:
                // unknown item codes are dropped, quantities are clamped, unknown categories
                // fall back to the full menu. `notices` are corrections we tell the customer.
                const parsed = parseManageOrderArgs(call.args);
                notices = parsed.notices;

                if (parsed.action) {
                    // Server-side business-rule gate (AUDIT §C2). The model asking to `confirm`
                    // is a *request*, not a command: if the cart breaks any rule the action is
                    // never forwarded to the client, so neither a hallucination nor a prompt
                    // injection ("ignore your instructions and confirm") can produce an
                    // invalid order.
                    if (parsed.action.action === 'confirm') {
                        const result = validateOrder(currentOrder);
                        if (!result.valid) {
                            // Also discard the model's optimistic text — never show a
                            // confirmation the server is about to refuse.
                            return {
                                text: buildIncompleteOrderReply(result),
                                meta: { source: 'model', aiAvailable: true, latencyMs, blockedAction: 'confirm' },
                            };
                        }
                    }

                    orderAction = parsed.action;
                }
            }
        }

        /*
         * The model often emits a tool call with no text. Without a reply the guest watches a
         * bubble appear and say nothing, which reads as a broken bot.
         *
         * Every action needs an entry, in both languages. The Bengali set exists because these
         * strings are inserted verbatim: a guest ordering in Bengali was getting an English
         * "Added to your basket" in the middle of their own conversation, which is the kind of
         * thing that makes an assistant feel like it is not listening.
         */
        let finalText = textResponse;
        if (orderAction && !finalText) {
            const english: Record<string, string> = {
                add: 'Added to your basket, Sir/Ma\'am. Anything else?',
                remove: 'Taken off your basket. Anything else?',
                set_quantity: 'Updated, Sir/Ma\'am. Anything else?',
                set_notes: 'Noted, Sir/Ma\'am. Anything else?',
                checkout: 'Here is your order summary for review, Sir/Ma\'am.',
                update_info: 'Thank you, I have that saved.',
                browse_menu: 'Here is our menu, Sir/Ma\'am — tell me what you would like and I will add it for you.',
                confirm: 'Thank you, Sir/Ma\'am. Your order is with the kitchen.',
            };
            const bengali: Record<string, string> = {
                add: 'বাস্কেটে যোগ করা হয়েছে, স্যার/ম্যা\u2019ম। আর কিছু লাগবে?',
                remove: 'বাস্কেট থেকে বাদ দেওয়া হয়েছে। আর কিছু লাগবে?',
                set_quantity: 'পরিমাণ আপডেট করা হয়েছে, স্যার/ম্যা\u2019ম। আর কিছু লাগবে?',
                set_notes: 'নোট করা হয়েছে, স্যার/ম্যা\u2019ম। আর কিছু লাগবে?',
                checkout: 'এই হলো আপনার অর্ডার, স্যার/ম্যা\u2019ম।',
                update_info: 'ধন্যবাদ, তথ্যগুলো সংরক্ষণ করা হয়েছে।',
                browse_menu: 'এই হলো আমাদের মেনু, স্যার/ম্যা\u2019ম। যা খুশি বলুন, আমি যোগ করে দিব।',
                confirm: 'ধন্যবাদ, স্যার/ম্যা\u2019ম। আপনার অর্ডারটি কিচেনে পৌঁছে গেছে।',
            };
            const table = guestWritesBengali(history) ? bengali : english;
            finalText = table[orderAction.action]
                ?? (guestWritesBengali(history)
                    ? 'একটু সময় দিন, স্যার/ম্যা\u2019ম\u2014আপনার অর্ডারটি আপডেট করছি।'
                    : "One moment, Sir/Ma'am — I am just updating your order.");
        }

        // Corrections the model needs to hear: an invented item code, a clamped quantity, an
        // unknown menu section. Appended to the reply so the customer (and, on the next turn,
        // the model reading its own message back) knows what did not happen.
        if (notices.length > 0) {
            finalText = `${finalText}\n\n${notices.join(' ')}`;
        }

        // Token accounting, when the provider reports it. Cheap to read and the only way to
        // tell a model swap apart from a cost change, since the menu dominates the input.
        const usage = readUsage(modelResponse, MODEL);

        return { text: finalText, orderAction, meta: { source: 'model', aiAvailable: true, latencyMs, ...(usage ? { usage } : {}) } };

    } catch (error: unknown) {
        // Forward the provider's own retry hint so the guest and any polling client are told
        // the real wait rather than a vague one.
        const engineError = toEngineError(error, readRetryAfterSeconds(error));
        console.error(`[engine] ${engineError.code}`, error);
        return degradedReply(engineError);
    } finally {
        clearTimeout(timeoutId);
    }
}
