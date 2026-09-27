/**
 * lib/placeOrder.ts — turning an untrusted order payload into an order the kitchen will accept.
 *
 * The order is assembled in the browser, so by the time it reaches the server it is a claim, not
 * an order. This module is the boundary: it re-prices every line from the menu, clamps quantities,
 * re-derives totals, and hands the result to `validateOrder` — the same rules the UI applies. A
 * tampered payload can change which dishes are ordered; it cannot change what they cost or slip
 * past a business rule.
 *
 * Kept out of the route handler so it can be tested directly. This is the one place in the app
 * where a bug means someone is charged the wrong amount or the kitchen cooks an order that should
 * have been refused.
 */

import { calculateTotals, finalizeOrder, validateOrder } from './order';
import { findMenuItemByCode } from './menuIndex';
import type { CartItem, CustomerInfo, Order, OrderValidationResult } from './types';

const MAX_ITEMS = 60;
const MAX_TEXT = 200;
const MAX_QUANTITY = 99;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');

export type PriceResult =
    | { ok: true; order: Order; dropped: string[]; validation: OrderValidationResult }
    | { ok: false; reason: 'empty' | 'invalid'; detail: string; order?: Order; validation?: OrderValidationResult };

export function priceOrderFromWire(input: unknown): PriceResult {
    if (typeof input !== 'object' || input === null) {
        return { ok: false, reason: 'empty', detail: 'No order was supplied.' };
    }
    const raw = input as Record<string, unknown>;

    const dropped: string[] = [];
    const items: CartItem[] = [];

    for (const entry of (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_ITEMS)) {
        const line = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;

        const menuItem = findMenuItemByCode(line.code);
        if (!menuItem) {
            dropped.push(text(line.code) || '?');
            continue;
        }

        const requested = Number(line.quantity);
        const quantity = Math.min(
            MAX_QUANTITY,
            Math.max(1, Number.isFinite(requested) ? Math.trunc(requested) : 1),
        );
        const notes = text(line.specialInstructions);

        items.push({
            id: String(menuItem.id),
            code: String(menuItem.code),
            name: menuItem.name,
            // From the menu, never from the payload: this is the whole point of the module.
            price: menuItem.price,
            quantity,
            total: menuItem.price * quantity,
            ...(notes ? { specialInstructions: notes } : {}),
        });
    }

    if (items.length === 0) {
        return {
            ok: false,
            reason: 'empty',
            detail: dropped.length
                ? `None of those dishes are on the menu: ${dropped.join(', ')}.`
                : 'An order with at least one dish is required.',
        };
    }

    const info = (typeof raw.customerInfo === 'object' && raw.customerInfo !== null
        ? raw.customerInfo
        : {}) as Record<string, unknown>;

    const customerInfo: CustomerInfo = {
        name: text(info.name),
        phone: text(info.phone),
        ...(text(info.address) ? { address: text(info.address) } : {}),
        deliveryType: info.deliveryType === 'delivery' ? 'delivery' : 'pickup',
        ...(text(info.preferredTime) ? { preferredTime: text(info.preferredTime) } : {}),
        preferences: Array.isArray(info.preferences)
            ? info.preferences.filter((p): p is string => typeof p === 'string').map(p => p.slice(0, 120)).slice(0, 8)
            : [],
        /*
         * A distance is a fact about the map, not about a payload, so it is deliberately not
         * carried over. That leaves the radius check to the kitchen for any guest who did not drop
         * a pin — the alternative is letting a client assert its own coordinates.
         */
        locationVerified: false,
    };

    const totals = calculateTotals(items, { deliveryType: customerInfo.deliveryType });

    const order: Order = {
        id: text(raw.id) || `ORD-${Date.now().toString(36).toUpperCase()}`,
        items,
        customerInfo,
        status: 'confirmed',
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        total: totals.total,
        createdAt: new Date(),
        paymentMethod: 'cod',
        paymentStatus: 'pending',
    };

    const validation = validateOrder(order);
    if (!validation.valid) {
        return { ok: false, reason: 'invalid', detail: validation.issues[0].message, order, validation };
    }

    return { ok: true, order: finalizeOrder(order, 'confirmed'), dropped, validation };
}
