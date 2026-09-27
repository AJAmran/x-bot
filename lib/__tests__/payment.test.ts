import { describe, it, expect } from 'vitest';
import { createDraftOrder, finalizeOrder, validateOrder } from '../order';
import type { CartItem, CustomerInfo } from '../types';

const item: CartItem = {
    id: '221', code: '221', name: 'THAI SPECIAL FRIED RICE', price: 610, quantity: 1, total: 610,
};

const draft = () => createDraftOrder({
    items: [item],
    customerInfo: { name: 'Amran', phone: '01857692587', deliveryType: 'pickup' },
});

/*
 * The restaurant is cash on delivery, so most of what used to be tested here is gone: there is
 * no Luhn check, no expiry rule, no wallet number, and no authorisation to simulate. What
 * matters now is the thing that could actually go wrong — an order being recorded as paid, or as
 * paid by card, by any route.
 */
describe('payment: cash on delivery is the only method', () => {
    it('records the order as cash on delivery, not paid', () => {
        const placed = finalizeOrder(draft());
        expect(placed.paymentMethod).toBe('cod');
        // Pending until the rider has the cash: nothing authorises it server-side.
        expect(placed.paymentStatus).toBe('pending');
    });

    it('records cash on delivery for a delivery order too, with an address', () => {
        const placed = finalizeOrder(createDraftOrder({
            items: [item],
            customerInfo: {
                name: 'Amran',
                phone: '01857692587',
                deliveryType: 'delivery',
                address: 'House 12, Road 5, Dhanmondi',
            },
        }));
        expect(placed.paymentMethod).toBe('cod');
        expect(placed.paymentStatus).toBe('pending');
        expect(placed.total).toBe(610);
    });

    it('leaves no place for a card number, reference or gateway code on the order', () => {
        const placed = finalizeOrder(draft()) as unknown as Record<string, unknown>;
        expect(placed.paymentReference).toBeUndefined();
        expect(placed.cardNumber).toBeUndefined();
        expect(placed.authorizationCode).toBeUndefined();
    });

});

describe('delivery needs an address, not a pin', () => {
    const delivered = (over: Partial<CustomerInfo> = {}) => createDraftOrder({
        items: [{ ...item, quantity: 3, total: 1830 }],
        customerInfo: {
            name: 'Amran',
            phone: '01857692587',
            deliveryType: 'delivery',
            address: 'House 12, Road 5, Dhanmondi',
            ...over,
        },
    });

    it('accepts a typed address with no map pin at all', () => {
        const result = validateOrder(delivered());
        expect(result.valid).toBe(true);
    });

    it('still refuses a delivery with no address', () => {
        const result = validateOrder(delivered({ address: '  ' }));
        expect(result.valid).toBe(false);
        expect(result.issues.map(i => i.code)).toContain('missing_address');
    });

    it('accepts a typed address at the edge of the radius without a pin', () => {
        expect(validateOrder(delivered()).valid).toBe(true);
    });

    it('blocks an address we can measure and know is too far', () => {
        const far = validateOrder(delivered({ distance: 9, locationVerified: true }));
        expect(far.valid).toBe(false);
        expect(far.issues.map(i => i.code)).toContain('outside_delivery_zone');
    });

    it('accepts a pinned address inside the radius', () => {
        expect(validateOrder(delivered({ distance: 1.2, locationVerified: true })).valid).toBe(true);
    });

    it('does not treat an unknown distance as a failure', () => {
        // We could not measure it, which is not the same as refusing it.
        const result = validateOrder(delivered({ distance: undefined, locationVerified: false }));
        expect(result.valid).toBe(true);
    });
});
