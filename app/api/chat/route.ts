import { NextResponse } from 'next/server';
import { getLogicResponse } from '@/lib/engine';
import type { ChatMessage, Order } from '@/lib/types';

/**
 * The waiter endpoint.
 *
 * This route exists because the model call has to happen on the server. The Gemini SDK reads
 * `process.env.GEMINI_API_KEY`, and only `NEXT_PUBLIC_*` variables are inlined into a client
 * bundle — so when this call sat in the client component, the key resolved to `undefined`,
 * every request threw, and the widget silently degraded to the local intent layer, which can
 * open the menu but cannot add a dish. Moving the call here is what makes conversational
 * ordering work at all, and it is also what keeps the key off the client.
 *
 * Do not "fix" a missing key here by prefixing it with NEXT_PUBLIC_. That would publish it to
 * every visitor and hand your quota to anyone who opens devtools.
 */

// The SDK and the in-memory rate-limit bucket both assume Node, not edge.
export const runtime = 'nodejs';
// A model reply must never be cached or statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * Generous enough for a long ordering conversation, low enough that a caller cannot post a
 * megabyte of history and have the model read all of it. The engine truncates each message
 * again before sending, but the request should be rejected long before that.
 */
const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 4000;

const SENDERS = new Set<ChatMessage['sender']>(['user', 'ai', 'system']);
const MESSAGE_TYPES = new Set<ChatMessage['type']>(['text', 'menu_item', 'order_update', 'quick_reply', 'suggestion']);

function badRequest(detail: string) {
    return NextResponse.json({ error: 'bad_request', detail }, { status: 400 });
}

/**
 * JSON has no Date, so every timestamp arrives as a string. The engine reads only `content`
 * when building the conversation, but the order is echoed back into the prompt, and reviving
 * the dates keeps the object honest rather than handing downstream code a `Date` that is
 * really a string.
 */
function reviveDate(value: unknown): Date {
    const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(NaN);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function parseMessages(input: unknown): ChatMessage[] | null {
    if (!Array.isArray(input) || input.length === 0) return null;

    // Keep the tail: the model only needs recent turns, and dropping the head bounds the cost.
    const recent = input.slice(-MAX_MESSAGES);
    const messages: ChatMessage[] = [];

    for (const entry of recent) {
        if (typeof entry !== 'object' || entry === null) return null;
        const raw = entry as Record<string, unknown>;

        const content = typeof raw.content === 'string' ? raw.content.trim() : '';
        if (!content) return null;

        const sender = SENDERS.has(raw.sender as ChatMessage['sender'])
            ? (raw.sender as ChatMessage['sender'])
            : 'user';

        const type = MESSAGE_TYPES.has(raw.type as ChatMessage['type'])
            ? (raw.type as ChatMessage['type'])
            : 'text';

        messages.push({
            id: typeof raw.id === 'string' ? raw.id : `srv-${messages.length}`,
            content: content.slice(0, MAX_CONTENT_CHARS),
            sender,
            // Never trust a client-supplied timestamp for a user turn: it is used for display
            // and ordering only, so normalising is safer than carrying whatever arrived.
            timestamp: reviveDate(raw.timestamp),
            type,
        });
    }

    return messages;
}

/**
 * The basket is advisory context for the prompt, never a price authority — the client already
 * re-derives every line total through `createDraftOrder`/`finalizeOrder` before checkout. This
 * only has to be shaped correctly enough for the system instruction to read.
 */
function parseOrder(input: unknown): Order | null {
    if (typeof input !== 'object' || input === null) return null;
    const raw = input as Record<string, unknown>;
    if (!Array.isArray(raw.items)) return null;

    const items = raw.items
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .slice(0, 60)
        .map(item => ({
            id: typeof item.id === 'string' ? item.id : String(item.code ?? ''),
            code: typeof item.code === 'string' ? item.code : '',
            name: typeof item.name === 'string' ? item.name : '',
            price: typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0,
            quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0,
            total: typeof item.total === 'number' && Number.isFinite(item.total) ? item.total : 0,
            ...(typeof item.specialInstructions === 'string' ? { specialInstructions: item.specialInstructions } : {}),
        }))
        .filter(item => item.code !== '');

    if (items.length === 0) return null;

    const customerInfo = typeof raw.customerInfo === 'object' && raw.customerInfo !== null
        ? (raw.customerInfo as Order['customerInfo'])
        : undefined;

    return {
        id: typeof raw.id === 'string' ? raw.id : 'draft',
        items: items as Order['items'],
        customerInfo,
        createdAt: reviveDate(raw.createdAt),
        ...(typeof raw.subtotal === 'number' ? { subtotal: raw.subtotal } : {}),
        ...(typeof raw.total === 'number' ? { total: raw.total } : {}),
    } as Order;
}

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return badRequest('Body must be JSON.');
    }

    if (typeof body !== 'object' || body === null) {
        return badRequest('Body must be an object.');
    }

    const payload = body as Record<string, unknown>;
    const messages = parseMessages(payload.messages);
    if (!messages) {
        return badRequest('`messages` must be a non-empty array of chat messages.');
    }

    // Throws are handled inside the engine, which reports failures on `meta.error` rather than
    // rejecting — that channel is what lets the UI tell "the waiter answered" from "the waiter
    // could not be reached", and both paths return a usable reply.
    const result = await getLogicResponse(messages, parseOrder(payload.order));

    // The status reflects transport-level failure; the body always carries the reply, so the
    // client can read `meta` without special-casing an error response.
    const code = result.meta?.error?.code;
    const status = code === 'rate_limited' ? 429
        : code === 'missing_api_key' ? 503
            : code === 'timeout' || code === 'upstream' ? 502
                : 200;

    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    const retryAfter = result.meta?.error?.retryAfterSeconds;
    if (code === 'rate_limited' && typeof retryAfter === 'number' && retryAfter > 0) {
        headers['Retry-After'] = String(Math.ceil(retryAfter));
    }

    return NextResponse.json(result, { status, headers });
}
