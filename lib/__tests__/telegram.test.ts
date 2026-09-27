/**
 * The Telegram notification is the one place guest-supplied text leaves the app and lands in a
 * third-party chat. These cover the two things that can go wrong there: markup in a name being
 * interpreted rather than shown, and a field silently missing from the message the kitchen reads.
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, formatOrderMessage } from '@/lib/telegram/telegram';
import { createDraftOrder } from '@/lib/order';
import type { Order } from '@/lib/types';

const order = (over: Partial<Order> = {}, info: Record<string, unknown> = {}): Order =>
    createDraftOrder({
        id: 'ORD-TG-1',
        items: [{ id: '139', code: '139', name: 'THAI GRILLED CHICKEN', price: 745, quantity: 2, total: 1490 } as never],
        customerInfo: { name: 'Amran', phone: '01857692587', deliveryType: 'pickup', ...info } as never,
        ...over,
    });

describe('escapeHtml', () => {
    it('neutralises markup so a name is shown, not interpreted', () => {
        // Telegram's HTML mode only knows a few tags, and anything tag-shaped is either
        // swallowed or rejects the whole message — which would lose the order notification.
        expect(escapeHtml('<b>Amran</b>')).toBe('&lt;b&gt;Amran&lt;/b&gt;');
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes ampersands first, so it does not double-escape its own output', () => {
        expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });
});

describe('formatOrderMessage - what the kitchen actually needs to act', () => {
    it('names the order, the guest and how much', () => {
        const text = formatOrderMessage(order());
        expect(text).toContain('ORD-TG-1');
        expect(text).toContain('Amran');
        expect(text).toContain('01857692587');
        expect(text).toContain('1490');
    });

    it('lists every line with its quantity and amount', () => {
        const text = formatOrderMessage(order());
        expect(text).toContain('2x THAI GRILLED CHICKEN');
    });

    it('shows the address and distance for a delivery, and neither for a pickup', () => {
        const delivery = formatOrderMessage(order({}, {
            deliveryType: 'delivery', address: 'House 12, Road 5', distance: 2.4,
        }));
        expect(delivery).toContain('House 12, Road 5');
        expect(delivery).toContain('2.40 km');

        const pickup = formatOrderMessage(order());
        expect(pickup).not.toContain('Distance');
    });

    it('escapes guest-supplied text rather than letting it become markup', () => {
        const text = formatOrderMessage(order({}, {
            deliveryType: 'delivery', address: '<b>not</b> my house', distance: 1,
        }));
        expect(text).toContain('&lt;b&gt;not&lt;/b&gt;');
        expect(text).not.toContain('<b>not</b>');
    });

    it('carries a special instruction, which is often the whole point of the order', () => {
        const text = formatOrderMessage(createDraftOrder({
            id: 'ORD-TG-2',
            items: [{
                id: '139', code: '139', name: 'THAI GRILLED CHICKEN', price: 745, quantity: 1,
                total: 745, specialInstructions: 'extra spicy, no peanuts',
            } as never],
            customerInfo: { name: 'Amran', phone: '01857692587', deliveryType: 'pickup' } as never,
        }));
        expect(text).toContain('extra spicy, no peanuts');
    });

    it('surfaces remembered preferences, which is what an allergy depends on', () => {
        const text = formatOrderMessage(order({}, { preferences: ['allergic to peanuts'] }));
        expect(text).toContain('allergic to peanuts');
    });

    it('reports payment state rather than assuming it', () => {
        expect(formatOrderMessage(order())).toContain('Due on collection');
        // createDraftOrder always sets 'pending', so a paid order has to be built directly —
        // the notification has to reflect whatever the order actually says.
        const paid: Order = { ...order(), paymentStatus: 'paid' };
        expect(formatOrderMessage(paid)).toContain('Paid');
    });

    it('stays readable when optional fields are missing', () => {
        const sparse = formatOrderMessage(createDraftOrder({
            id: 'ORD-TG-3',
            items: [{ id: '1', code: '1', name: 'SOUP', price: 100, quantity: 1, total: 100 } as never],
            customerInfo: { name: '', phone: '', deliveryType: 'pickup' } as never,
        }));
        expect(sparse).toContain('ORD-TG-3');
        expect(sparse).not.toContain('undefined');
        expect(sparse).not.toContain('null');
    });
});
