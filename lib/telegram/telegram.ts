/**
 * lib/telegram.ts — sending a placed order to a Telegram chat.
 *
 * SERVER ONLY. Never import this from a client component. The bot token is a credential: the
 * moment it reaches the browser it is public, and anyone can then post into the restaurant's
 * chat as the bot. The client talks to /api/order-notify instead, and this module stays behind
 * that route. (`server-only` is not installed here, so the guarantee is kept by import
 * discipline plus a comment rather than by the compiler.)
 *
 * Two things are deliberately separated:
 *   - `formatOrderMessage` is pure and holds every customer-controlled string, so it can be
 *     tested for escaping without a token or a network.
 *   - `sendOrderToTelegram` is the only thing that touches the network or the environment.
 */

import type { Order } from '../types';

/** Telegram rejects a request that hangs around; this is a notification, not a dependency. */
const SEND_TIMEOUT_MS = 8_000;

export type TelegramFailure = 'not_configured' | 'rejected' | 'unreachable' | 'bad_payload';

export interface TelegramResult {
    delivered: boolean;
    /** Present when not delivered. Safe to log; never contains the token. */
    reason?: TelegramFailure;
    detail?: string;
}

/**
 * Telegram's HTML parse mode only recognises a small tag set, and anything that looks like a
 * tag in a guest's name or address is either swallowed or rejected. Every customer-controlled
 * value goes through here, so a guest called `<b>admin</b>` stays literal text.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const line = (label: string, value: string) => `<b>${escapeHtml(label)}</b>  ${escapeHtml(value)}`;

/**
 * The notification body. Deliberately a receipt a human can act on at a glance: who, what,
 * how much, how it is being collected, and where — because the person reading it has to decide
 * whether to call the guest.
 */
export function formatOrderMessage(order: Order): string {
    const info = order.customerInfo;
    const items = order.items
        .map(item => `• ${escapeHtml(String(item.quantity))}x ${escapeHtml(item.name)} — ৳${escapeHtml(String(item.total))}`
            + (item.specialInstructions ? `\n    <i>${escapeHtml(item.specialInstructions)}</i>` : ''))
        .join('\n');

    const rows = [
        `<b>New order ${escapeHtml(order.id)}</b>`,
        line('Name', info?.name || '—'),
        line('Phone', info?.phone || '—'),
        line('Collection', info?.deliveryType === 'delivery' ? 'Delivery' : info?.deliveryType === 'pickup' ? 'Pickup' : '—'),
    ];

    if (info?.deliveryType === 'delivery') {
        rows.push(line('Address', info.address || '—'));
        if (info.distance !== undefined) rows.push(line('Distance', `${info.distance.toFixed(2)} km from the kitchen`));
    }

    if (info?.preferredTime) rows.push(line('Preferred time', info.preferredTime));
    if (info?.preferences?.length) rows.push(line('Notes', info.preferences.join('; ')));

    return [
        ...rows,
        '',
        items,
        '',
        line('Subtotal', `৳${order.subtotal}`),
        line('Delivery fee', `৳${order.deliveryFee ?? 0}`),
        `<b>Total ৳${order.total}</b>`,
        line('Payment', order.paymentStatus === 'paid' ? 'Paid (simulated)' : 'Due on collection'),
    ].join('\n');
}

/**
 * Posts a message to the configured chat. Never throws: a kitchen must still be able to take an
 * order when Telegram is down, so every failure comes back as `delivered: false` and the caller
 * decides what to do about it.
 */
export async function sendTelegramMessage(text: string): Promise<TelegramResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

    // Optional by design: the app must work with no Telegram configured at all.
    if (!token || !chatId) return { delivered: false, reason: 'not_configured' };
    if (!text.trim()) return { delivered: false, reason: 'bad_payload' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            // Telegram explains itself in the body; the status is enough to act on here and
            // logging the body risks echoing the chat id back into application logs.
            return { delivered: false, reason: 'rejected', detail: `HTTP ${response.status}` };
        }
        return { delivered: true };
    } catch {
        return { delivered: false, reason: 'unreachable' };
    } finally {
        clearTimeout(timeout);
    }
}

/** An order, rendered and sent. The only difference from a raw message is the formatting. */
export function sendOrderToTelegram(order: Order): Promise<TelegramResult> {
    return sendTelegramMessage(formatOrderMessage(order));
}
