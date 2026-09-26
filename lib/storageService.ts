import { ChatMessage, Order } from './types';

const CHAT_KEY = 'fourseason_chat_v1';
const ORDER_KEY = 'fourseason_order_draft';
const HISTORY_KEY = 'fourseason_order_history';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Enough for "same as last time" without unbounded localStorage growth. */
const MAX_HISTORY = 10;

/**
 * localStorage is user-writable, so everything read back out of it is untrusted input —
 * `JSON.parse` returns `any` and a user (or another script) can have written anything there.
 * These guards are the boundary; the old version cast straight to `any` and would happily
 * spread a malformed record into React state.
 */
function isStoredMessage(value: unknown): value is ChatMessage {
    if (typeof value !== 'object' || value === null) return false;
    const message = value as Partial<ChatMessage>;
    return (
        typeof message.id === 'string' &&
        typeof message.content === 'string' &&
        (message.sender === 'user' || message.sender === 'ai' || message.sender === 'system')
    );
}

function isStoredOrder(value: unknown): value is Order {
    if (typeof value !== 'object' || value === null) return false;
    const order = value as Partial<Order>;
    return Array.isArray(order.items) && typeof order.id === 'string';
}

/** Timestamps survive JSON as strings, so they are revived on the way in. */
function reviveMessage(message: ChatMessage): ChatMessage {
    return { ...message, timestamp: new Date(message.timestamp) };
}

function parseJson(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

export const StorageService = {
    saveChatSession: (messages: ChatMessage[]) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
        } catch (e) {
            console.error('Failed to save chat', e);
        }
    },

    loadChatSession: (): ChatMessage[] => {
        if (typeof window === 'undefined') return [];
        try {
            const parsed = parseJson(localStorage.getItem(CHAT_KEY));
            if (!Array.isArray(parsed)) return [];

            const cutoff = Date.now() - SESSION_TTL_MS;
            const validMessages = parsed
                .filter(isStoredMessage)
                .filter(message => {
                    const time = new Date(message.timestamp).getTime();
                    return Number.isFinite(time) && time > cutoff;
                })
                .map(reviveMessage);

            // If anything was dropped, rewrite the session so the bad rows do not linger.
            if (validMessages.length !== parsed.length) {
                localStorage.setItem(CHAT_KEY, JSON.stringify(validMessages));
            }

            return validMessages;
        } catch (e) {
            console.error('Failed to load chat', e);
            return [];
        }
    },

    saveOrderDraft: (order: Order) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(ORDER_KEY, JSON.stringify(order));
        } catch (e) {
            console.error('Failed to save order draft', e);
        }
    },

    loadOrderDraft: (): Order | null => {
        if (typeof window === 'undefined') return null;
        try {
            const parsed = parseJson(localStorage.getItem(ORDER_KEY));
            if (!isStoredOrder(parsed)) return null;
            return {
                ...parsed,
                items: parsed.items.map(item => ({ ...item })),
                createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
            };
        } catch (e) {
            console.error('Failed to load order draft', e);
            return null;
        }
    },

    clearOrderDraft: () => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(ORDER_KEY);
    },

    /**
     * Completed orders, newest first. This is what makes "same as last time" possible, and it
     * is deliberately client-side: there is no backend in this project (see README Roadmap).
     */
    saveCompletedOrder: (order: Order) => {
        if (typeof window === 'undefined') return;
        try {
            const existing = StorageService.loadOrderHistory().filter(
                previous => previous.id !== order.id && previous.customerInfo?.phone !== order.customerInfo?.phone
            );
            localStorage.setItem(HISTORY_KEY, JSON.stringify([order, ...existing].slice(0, MAX_HISTORY)));
        } catch (e) {
            console.error('Failed to save order history', e);
        }
    },

    loadOrderHistory: (): Order[] => {
        if (typeof window === 'undefined') return [];
        try {
            const parsed = parseJson(localStorage.getItem(HISTORY_KEY));
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(isStoredOrder).map(order => ({
                ...order,
                items: order.items.map(item => ({ ...item })),
                createdAt: order.createdAt ? new Date(order.createdAt) : new Date(),
            }));
        } catch (e) {
            console.error('Failed to load order history', e);
            return [];
        }
    },

    clearSession: () => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(CHAT_KEY);
        localStorage.removeItem(ORDER_KEY);
    },

    /** Explicitly wipes the saved order history — used by the "clear data" control. */
    clearOrderHistory: () => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(HISTORY_KEY);
    },
};
