"use server";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { headers } from "next/headers";
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT, RESTAURANT_DATA } from "./constants";
import { ChatMessage, Order, AIResponse, OrderAction, OrderValidationResult, EngineError } from "./types";
import { validateOrder } from "./order";
import { parseManageOrderArgs } from "./toolArgs";
import { consumeAiQuota } from "./rateLimit";

/** Hard ceiling on a single model call. Also enforced by the SDK via httpOptions.timeout. */
const TIMEOUT_MS = 20_000;
const MODEL = "gemini-3.1-flash-lite";
/** Sliding context window. Each turn is ~13k tokens of menu, so this is the main cost lever. */
const HISTORY_WINDOW = 10;
/** Defensive cap on a single inbound message — the payload is untrusted (AUDIT §S4). */
const MAX_MESSAGE_CHARS = 2_000;

/**
 * The AI never has to see image URLs, and `description` is what makes 51 KB out of 51 KB.
 * Measured with a 239-item menu:
 *   full JSON            51.1 KB (~13,000 tokens)
 *   minus descriptions   34.0 KB (~8,700 tokens)  <- would cost menu Q&A quality
 *   minus image URLs     50.6 KB                 <- not worth it
 * Gemini context caching is NOT available on the free tier, so the only lever is sending
 * less. Serialised once per instance rather than per request; see README Roadmap.
 */
let cachedMenuPayload: string | undefined;
function getMenuPayload(): string {
    if (!cachedMenuPayload) cachedMenuPayload = JSON.stringify(RESTAURANT_DATA.menu);
    return cachedMenuPayload;
}

/**
 * Built lazily so a missing key never constructs an SDK client with an empty string
 * (which produced a confusing "kitchen engine" error on every single message).
 */
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
 * Every field is validated again on arrival (see parseOrderAction usage below and
 * `processOrderAction` in ChatWidget): the model is an untrusted input source, so its
 * output is treated as a *request*, never as a command. A hallucinated item code, a
 * negative quantity or an out-of-policy `confirm` is rejected here rather than obeyed.
 */
const manageOrderTool: FunctionDeclaration = {
    name: 'manage_order',
    description: 'Manage the guest\'s order: add/remove items, change quantities and notes, record details and preferences, or confirm the order.',
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
                description: 'Category ID to open when action is "browse_menu" (e.g. "chinese", "beverages").'
            },
            subcategory_id: {
                type: Type.STRING,
                description: 'Subcategory ID to open (e.g. "soups", "grilled", "appetizers"). Use this for specific sections within a category.'
            },
            items: {
                type: Type.ARRAY,
                description: 'List of items to act on. Required for "add", "remove", "set_quantity" and "set_notes".',
                items: {
                    type: Type.OBJECT,
                    properties: {
                        item_code: {
                            type: Type.STRING,
                            description: 'The unique code of the menu item (e.g., "101", "221"). Must be an existing code — unknown codes are discarded.'
                        },
                        quantity: {
                            type: Type.INTEGER,
                            description: 'For "add": how many to add (1 or more; omit for 1). For "remove": how many to take away — omit it or use 0 to remove the item entirely. For "set_quantity": the NEW total for that item, not a delta (use 0 to take it off the order).'
                        },
                        notes: {
                            type: Type.STRING,
                            description: 'Special instructions, spice levels or variations. Required for "set_notes" (e.g. "make it spicier", "no onions please").'
                        }
                    },
                    required: ['item_code']
                }
            },
            customer_details: {
                type: Type.OBJECT,
                description: 'Customer information. Required for "update_info". You may record the details the guest gives you, but you cannot verify a delivery location — only the map can do that.',
                properties: {
                    name: { type: Type.STRING, description: 'Customer full name' },
                    phone: { type: Type.STRING, description: 'Customer phone number' },
                    address: { type: Type.STRING, description: 'Delivery address (required for delivery)' },
                    delivery_type: { type: Type.STRING, enum: ['pickup', 'delivery'], description: 'Type of order' },
                    preferred_time: { type: Type.STRING, description: 'Preferred delivery/pickup time' },
                    preferences: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Short facts the guest has told you that should be remembered for the rest of the conversation — allergies, dietary needs, spice tolerance, a usual order. One short phrase per entry, e.g. "allergic to peanuts", "prefers extra spicy", "regularly orders the grilled chicken".'
                    }
                }
            }
        },
        required: ['action']
    }
};

const getSystemInstruction = (currentOrder: Order | null) => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Serialize context
    const orderContext = currentOrder ? JSON.stringify({
        itemCount: currentOrder.items.length,
        subtotal: currentOrder.subtotal,
        items: currentOrder.items.map(i => `${i.quantity}x ${i.name} [Code: ${i.code}] ${i.specialInstructions ? `(Note: ${i.specialInstructions})` : ''}`),
        customerInfo: {
            name: currentOrder.customerInfo?.name || "Not provided",
            phone: currentOrder.customerInfo?.phone || "Not provided",
            deliveryType: currentOrder.customerInfo?.deliveryType || "pickup",
            address: currentOrder.customerInfo?.address || "Not provided"
        }
    }) : "Empty Cart";

    /**
     * Conversational memory. Anything the guest has told us this session is replayed into every
     * later turn, so the waiter does not ask twice about an allergy or a usual order. Costs a
     * few dozen tokens — far cheaper than the re-asking it prevents.
     */
    const preferences = currentOrder?.customerInfo?.preferences ?? [];
    const memoryBlock = preferences.length > 0
        ? `\n  **WHAT THIS GUEST HAS TOLD US** (honour these without being asked again):\n${preferences.map(p => `    - ${p}`).join('\n')}`
        : '';

    return `You are **SeasonBot**, the professional Head Waiter at **Four Season Restaurant** (Dhanmondi, Dhaka).

  **YOUR GOAL**: Provide a professional "Real-Life" 5-Star Dining Service. Follow a strict hospitality workflow.

  **CURRENT STATUS**:
  - Time: ${day}, ${time}
  - Cart: ${orderContext}
  - **DELIVERY RULES**: Minimum ৳${MIN_ORDER_AMOUNT} required. Service only within ${MAX_DELIVERY_RANGE}km from Satmasjid Road, Dhanmondi.
  - **PICKUP RULES**: No minimum.
${memoryBlock}

  **ORDER COMPLETION CHECKLIST**:
  1. Items in Cart? ${currentOrder && currentOrder.items.length > 0 ? "✅" : "❌"}
  2. Customer Name/Phone? ${currentOrder?.customerInfo?.name && currentOrder?.customerInfo?.phone ? "✅" : "❌"}
  3. Delivery/Pickup? ${currentOrder?.customerInfo?.deliveryType ? `✅ (${currentOrder.customerInfo.deliveryType})` : "❌"}
  4. Address/Location? ${currentOrder?.customerInfo?.deliveryType === 'delivery' ? (currentOrder.customerInfo.locationVerified ? "✅" : "❌") : "N/A"}

  **MENU KNOWLEDGE (Items & Codes)**:
  ${getMenuPayload()}

  **WORKFLOW & BEHAVIOR**:

  1.  **🛒 Changing the basket**:
      - 'add' puts something new in the basket (or adds another serving of it).
      - 'remove' takes servings away; omit the quantity to remove the item entirely.
      - 'set_quantity' sets the NEW total for an item — "make it three instead of two". Use 0 to take it off.
      - 'set_notes' changes an instruction already on a line — "make it spicier", "no onions please".
      - To swap one dish for another, use 'remove' then 'add'.
      - After any change, ask: "Sir/Ma'am, would you like anything else?".

  2.  **🧠 Remember what you are told**:
      - If the guest mentions an allergy, a dietary need, a spice preference or a usual order, record it with 'update_info' → 'preferences'. It is remembered for the rest of the conversation and you will see it below under WHAT THIS GUEST HAS TOLD US.
      - Do not ask for information you have already been given.

  3.  **❓ When something is ambiguous, ask — do not guess**:
      - If a request could mean more than one thing ("two chicken or two shrimp?"), ask ONE short clarifying question before acting.
      - If the guest names a dish that is not on the menu, say so plainly and offer the closest thing we do have.
      - Never invent a dish, a code or a price. Every item_code must come from the menu list above.

  4.  **📝 Permission to Place Order**:
      - When the user says they are done, ask: "Would you like to place the order now?".
      - If yes, proceed to the checkout view using the 'checkout' action.

  5.  **🚚 Information & Validation (The Check)**:
      - Collect Name and Mobile Number if missing.
      - **Mobile Validation**: Ensure the phone number is a valid Bangladeshi number (e.g., 017... or +8801...). If invalid, politely ask them to provide a correct 11-digit BD mobile number.
      - **Price Check**: If delivery is chosen and total is < ৳${MIN_ORDER_AMOUNT}, explain: "Sir/Ma'am, we require a minimum order of ৳${MIN_ORDER_AMOUNT} for Home Delivery. Your current total is ৳${currentOrder?.subtotal || 0}. Would you like to add something else, or would you prefer to collect it as a Takeaway?"
      - **Location Check**: For delivery, open the map and explain: "Our delivery service is available within a ${MAX_DELIVERY_RANGE}km radius of Dhanmondi. Please pin your exact location on the map." Only a pin dropped on the map counts as a verified location.

  6.  **✅ Final Confirmation**:
      - Only call 'confirm' once every check above passes. If anything is missing, ask for it instead — a confirmation that gets rejected is worse than a question.

  **TONE**:
  - Always start with "Assalamu Alaikum" or a polite greeting.
  - Language: Strictly **English** unless the user speaks Bengali first.
  - Hospitality: Professional, high-end restaurant vibe. Use "Sir/Ma'am" and "Please/Thank you" appropriately.
  - Be brief. One or two sentences per reply, then stop and let the guest respond.
  - Always reply with a text confirmation before or after using a tool.
  `;
};

/**
 * Treats a rejected `confirm` as a normal conversational turn: the customer is told exactly
 * what is still missing instead of being shown a confirmation that the server refuses to
 * honour. Deliberately does NOT make a second model call to re-prompt — on a free tier with
 * a per-project RPD ceiling, a deterministic reply is the responsible choice.
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
            message: "Our kitchen engine is having trouble connecting. Please try again in short while.",
            degraded: true,
        };
    }
    return {
        code: 'unknown',
        message: "I apologize, something went wrong on our side. Please try again in a moment.",
        degraded: true,
    };
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

    const validHistory = history
        .filter(msg => msg.sender !== 'system')
        .slice(-HISTORY_WINDOW)
        .filter(msg => typeof msg?.content === 'string' && msg.content.length > 0)
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content.slice(0, MAX_MESSAGE_CHARS) }],
        }));

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

    try {
        const modelResponse = await getClient().models.generateContent({
            model: MODEL,
            contents: validHistory,
            config: {
                systemInstruction: getSystemInstruction(currentOrder),
                temperature: 0.5, // Slightly lower for more deterministic waiter behavior
                tools: [{ functionDeclarations: [manageOrderTool] }],
                abortSignal: controller.signal,
                httpOptions: { timeout: TIMEOUT_MS },
            }
        });

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

        // Auto-generate fallback text if tool is called without text
        let finalText = textResponse;
        if (orderAction && !finalText) {
            const map: Record<string, string> = {
                checkout: "Certainly, Sir/Ma'am. I am opening your billing summary for review. 📝",
                confirm: "Thank you! Your order has been confirmed and sent to our kitchen. 👨‍🍳",
                update_info: "I have updated your information. Thank you. ✍️",
                add: "Certainly, I've added that to your cart. Would you like anything else? 🛒",
                remove: "Removed from your cart. Anything else? 🛒",
                browse_menu: "Of course, I am opening our menu for you now. 📖"
            };
            finalText = map[orderAction.action] || "One moment please, I am processing that...";
        }

        // Corrections the model needs to hear: an invented item code, a clamped quantity, an
        // unknown menu section. Appended to the reply so the customer (and, on the next turn,
        // the model reading its own message back) knows what did not happen.
        if (notices.length > 0) {
            finalText = `${finalText}\n\n${notices.join(' ')}`;
        }

        return { text: finalText, orderAction, meta: { source: 'model', aiAvailable: true, latencyMs } };

    } catch (error: unknown) {
        const engineError = toEngineError(error);
        console.error(`[engine] ${engineError.code}`, error);
        return degradedReply(engineError);
    } finally {
        clearTimeout(timeoutId);
    }
}
