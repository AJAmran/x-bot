import { describe, it, expect } from 'vitest';
import { priceOrderFromWire } from '../placeOrder';
import { findMenuItemByCode } from '../menuIndex';
import { MIN_ORDER_AMOUNT } from '../constants';

/**
 * This is the security boundary. Everything the browser says about an order is a claim; these
 * tests exist so that a change to pricing, quantity handling or validation cannot quietly let a
 * tampered payload through.
 */

const RICE = findMenuItemByCode('221')!;      // 610
const SOUP = findMenuItemByCode('123')!;       // 780

const wire = (over: Record<string, unknown> = {}) => ({
    id: 'ORD-TEST1',
    items: [{ code: '221', quantity: 2, price: 1, name: 'anything the client likes', total: 2 }],
    customerInfo: { name: 'Amran', phone: '01857692587', deliveryType: 'pickup' },
    ...over,
});

describe('priceOrderFromWire - prices come from the menu, not the payload', () => {
    it('replaces a tampered price with the real one', () => {
        const result = priceOrderFromWire(wire());
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // The payload claimed ৳1; the kitchen is told ৳610.
        expect(result.order.items[0].price).toBe(RICE.price);
        expect(result.order.subtotal).toBe(RICE.price * 2);
        expect(result.order.total).toBe(RICE.price * 2);
    });

    it('replaces a tampered dish name with the name on the menu', () => {
        const result = priceOrderFromWire(wire());
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.items[0].name).toBe(RICE.name);
    });

    it('ignores a tampered subtotal and total entirely', () => {
        const result = priceOrderFromWire(wire({ subtotal: 0, total: 0, deliveryFee: 0 }));
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.total).toBe(RICE.price * 2);
    });

    it('forces cash on delivery regardless of what the client claims', () => {
        const result = priceOrderFromWire(wire({ paymentMethod: 'card', paymentStatus: 'paid' }));
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.paymentMethod).toBe('cod');
        expect(result.order.paymentStatus).toBe('pending');
    });
});

describe('priceOrderFromWire - quantities are clamped, not trusted', () => {
    const withQuantity = (quantity: unknown) =>
        priceOrderFromWire(wire({ items: [{ code: '221', quantity }] }));

    it('rounds a fractional quantity down to a whole dish', () => {
        const result = withQuantity(2.9);
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.items[0].quantity).toBe(2);
    });

    it('raises a zero or negative quantity to one rather than sending a free line', () => {
        for (const quantity of [0, -5]) {
            const result = withQuantity(quantity);
            if (!result.ok) throw new Error('expected a priced order');
            expect(result.order.items[0].quantity).toBe(1);
        }
    });

    it('caps an absurd quantity', () => {
        const result = withQuantity(100_000);
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.items[0].quantity).toBe(99);
    });

    it('treats a missing or unparseable quantity as one', () => {
        for (const quantity of [undefined, 'lots', null, {}]) {
            const result = withQuantity(quantity);
            if (!result.ok) throw new Error('expected a priced order');
            expect(result.order.items[0].quantity).toBe(1);
        }
    });
});

describe('priceOrderFromWire - unknown dishes are dropped and reported', () => {
    it('drops a code we do not sell and says so', () => {
        const result = priceOrderFromWire(wire({
            items: [
                { code: '221', quantity: 1 },
                { code: 'FREE-BARTHDAY', quantity: 1 },
            ],
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.order.items).toHaveLength(1);
        expect(result.dropped).toEqual(['FREE-BARTHDAY']);
    });

    it('refuses an order made entirely of codes we do not sell', () => {
        const result = priceOrderFromWire(wire({ items: [{ code: 'NOPE', quantity: 1 }] }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('empty');
    });

    it('refuses an order with no items at all', () => {
        expect(priceOrderFromWire(wire({ items: [] })).ok).toBe(false);
    });

    it('refuses something that is not an order', () => {
        expect(priceOrderFromWire(null).ok).toBe(false);
        expect(priceOrderFromWire('place my order').ok).toBe(false);
    });
});

describe('priceOrderFromWire - the business rules still apply', () => {
    it('refuses a delivery with no address', () => {
        const result = priceOrderFromWire(wire({
            customerInfo: { name: 'Amran', phone: '01857692587', deliveryType: 'delivery' },
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('invalid');
        expect(result.detail).toMatch(/address/i);
    });

    it('accepts a delivery with a typed address and no map pin', () => {
        const result = priceOrderFromWire(wire({
            items: [{ code: '221', quantity: 2 }],
            customerInfo: {
                name: 'Amran', phone: '01857692587', deliveryType: 'delivery',
                address: 'House 12, Road 5, Dhanmondi',
            },
        }));
        expect(result.ok).toBe(true);
    });

    it('refuses a delivery under the minimum', () => {
        const cheapest = findMenuItemByCode('395');
        const result = priceOrderFromWire(wire({
            items: [{ code: cheapest?.code ?? '395', quantity: 1 }],
            customerInfo: {
                name: 'Amran', phone: '01857692587', deliveryType: 'delivery',
                address: 'House 12, Road 5, Dhanmondi',
            },
        }));
        // Whatever this dish costs, one of them cannot clear a ৳1000 minimum.
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.detail).toMatch(new RegExp(String(MIN_ORDER_AMOUNT)));
    });

    it('refuses an invalid mobile number', () => {
        const result = priceOrderFromWire(wire({
            customerInfo: { name: 'Amran', phone: '12345', deliveryType: 'pickup' },
        }));
        expect(result.ok).toBe(false);
    });

    it('discards a distance the client tried to assert, in both directions', () => {
        /*
         * A client claiming 40km is asking to be refused and one claiming 0.1km is asking to be
         * believed. Neither is allowed to assert a distance, so the field is dropped rather than
         * honoured: the order stands on its typed address and the kitchen judges the range. The
         * important assertion is that neither value reaches the order.
         */
        const claim = (distance: number) => priceOrderFromWire(wire({
            customerInfo: {
                name: 'Amran', phone: '01857692587', deliveryType: 'delivery',
                address: 'Dhanmondi', distance, locationVerified: true,
            },
        }));

        for (const distance of [40, 0.1]) {
            const result = claim(distance);
            if (!result.ok) throw new Error('the address is valid, so this must be accepted');
            expect(result.order.customerInfo?.distance).toBeUndefined();
            expect(result.order.customerInfo?.locationVerified).toBe(false);
        }
    });
});

describe('priceOrderFromWire - text fields are bounded', () => {
    it('truncates an absurdly long name rather than passing it on', () => {
        const result = priceOrderFromWire(wire({
            customerInfo: { name: 'x'.repeat(5000), phone: '01857692587', deliveryType: 'pickup' },
        }));
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.customerInfo?.name.length).toBeLessThanOrEqual(200);
    });

    it('ignores preferences that are not strings', () => {
        const result = priceOrderFromWire(wire({
            customerInfo: {
                name: 'Amran', phone: '01857692587', deliveryType: 'pickup',
                preferences: ['no chilli', 42, null, { a: 1 }],
            },
        }));
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.customerInfo?.preferences).toEqual(['no chilli']);
    });

    it('keeps a multi-line order working', () => {
        const result = priceOrderFromWire(wire({
            items: [{ code: '221', quantity: 2 }, { code: '123', quantity: 1 }],
        }));
        if (!result.ok) throw new Error('expected a priced order');
        expect(result.order.total).toBe(RICE.price * 2 + SOUP.price);
    });
});
