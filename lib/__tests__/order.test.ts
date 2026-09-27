import { describe, it, expect } from 'vitest';
import {
    BD_PHONE_REGEX,
    calculateTotals,
    createDraftOrder,
    finalizeOrder,
    firstIssue,
    isValidBdPhone,
    lineTotal,
    lineTotalOf,
    orderConfirmedMessage,
    normalizeBdPhone,
    validateOrder,
} from '../order';
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT } from '../constants';
import type { CartItem, CustomerInfo, Order } from '../types';

const item = (over: Partial<CartItem> = {}): CartItem => ({
    id: '139',
    code: '139',
    name: 'THAI GRILLED CHICKEN',
    price: 865,
    quantity: 1,
    total: 865,
    ...over,
});

const customer = (over: Partial<CustomerInfo> = {}): CustomerInfo => ({
    name: 'Ayesha Rahman',
    phone: '01712345678',
    deliveryType: 'pickup',
    ...over,
});

const deliveryCustomer = (over: Partial<CustomerInfo> = {}): CustomerInfo =>
    customer({ deliveryType: 'delivery', address: 'House 7, Road 5, Dhanmondi', locationVerified: true, distance: 1.2, ...over });

const codesOf = (result: ReturnType<typeof validateOrder>) => (result.valid ? [] : result.issues.map(i => i.code));

describe('isValidBdPhone', () => {
    it.each([
        ['01712345678', '11-digit local'],
        ['+8801712345678', 'international +88'],
        ['8801712345678', 'international 88'],
        ['01712 345 678', 'spaces are ignored'],
        ['01712-345678', 'dashes are ignored'],
        ['01812345678', '18 prefix is valid'],
        ['01912345678', '19 prefix is valid'],
    ])('accepts %s (%s)', phone => {
        expect(isValidBdPhone(phone)).toBe(true);
    });

    it.each([
        ['', 'empty'],
        ['12345', 'too short'],
        ['01212345678', '012 is not a mobile prefix'],
        ['017123456789', 'too long'],
        ['0171234567a', 'letter'],
        ['abcdefghijk', 'letters'],
    ])('rejects %s (%s)', phone => {
        expect(isValidBdPhone(phone)).toBe(false);
    });

    it('rejects null and undefined without throwing', () => {
        expect(isValidBdPhone(undefined)).toBe(false);
        expect(isValidBdPhone(null)).toBe(false);
    });

    it('exports the raw pattern and normaliser for reuse', () => {
        expect(normalizeBdPhone('01712-345 678')).toBe('01712345678');
        expect(BD_PHONE_REGEX.test(normalizeBdPhone('+8801712345678'))).toBe(true);
    });
});

describe('lineTotal', () => {
    it('derives from price x quantity', () => {
        expect(lineTotal(item({ price: 340, quantity: 3 }))).toBe(1020);
        expect(lineTotalOf(340, 3)).toBe(1020);
    });

    it('ignores a tampered CartItem.total', () => {
        expect(lineTotal(item({ price: 340, quantity: 2, total: 1 }))).toBe(680);
    });

    it('neutralises non-finite or negative input rather than propagating NaN', () => {
        expect(lineTotalOf(Number.NaN, 2)).toBe(0);
        expect(lineTotalOf(-5, 2)).toBe(0);
        expect(lineTotalOf(100, Number.NaN)).toBe(0);
    });
});

describe('calculateTotals', () => {
    it('sums lines and counts quantities, not lines', () => {
        const totals = calculateTotals([item({ price: 100, quantity: 2 }), item({ price: 50, quantity: 3 })]);
        expect(totals.subtotal).toBe(350);
        expect(totals.totalItems).toBe(5);
        expect(totals.total).toBe(350);
    });

    it('treats the empty cart as zero, not NaN', () => {
        expect(calculateTotals([]).subtotal).toBe(0);
        expect(calculateTotals(undefined).total).toBe(0);
        expect(calculateTotals(null).totalItems).toBe(0);
    });

    it('applies the minimum only to delivery — pickup has none', () => {
        const cheap = [item({ price: 340, quantity: 1 })];
        expect(calculateTotals(cheap, { deliveryType: 'pickup' }).isMinOrderMet).toBe(true);
        expect(calculateTotals(cheap, { deliveryType: 'delivery' }).isMinOrderMet).toBe(false);
    });

    it('reports how much more is needed to qualify for delivery', () => {
        const totals = calculateTotals([item({ price: 400, quantity: 1 })], { deliveryType: 'delivery' });
        expect(totals.amountToMinOrder).toBe(MIN_ORDER_AMOUNT - 400);
    });

    it('never reports a negative shortfall', () => {
        const totals = calculateTotals([item({ price: 5000, quantity: 1 })], { deliveryType: 'delivery' });
        expect(totals.amountToMinOrder).toBe(0);
    });

    it('is UI-lenient about an unknown distance (validateOrder is the strict gate)', () => {
        expect(calculateTotals([item()], { deliveryType: 'delivery' }).isDistanceValid).toBe(true);
        expect(calculateTotals([item()], { deliveryType: 'delivery', distanceKm: 9 }).isDistanceValid).toBe(false);
    });
});

describe('createDraftOrder', () => {
    it('always returns a complete order — the regression that printed "Total: ৳undefined"', () => {
        // This is the chat-only ordering path: no parent order existed yet.
        const draft = createDraftOrder({ items: [item({ price: 865, quantity: 2 })] });

        expect(draft.id).toMatch(/^ORD-/);
        expect(draft.subtotal).toBe(1730);
        expect(draft.total).toBe(1730);
        expect(draft.status).toBe('draft');
        expect(draft.paymentStatus).toBe('pending');
        expect(draft.createdAt).toBeInstanceOf(Date);
        expect(String(draft.total)).not.toContain('undefined');
    });

    it('survives being called with nothing at all', () => {
        const draft = createDraftOrder();
        expect(draft.items).toEqual([]);
        expect(draft.total).toBe(0);
        expect(draft.id).toMatch(/^ORD-/);
    });

    it('reuses an existing id so a draft keeps a stable identity while editing', () => {
        const first = createDraftOrder({ items: [item()] });
        const second = createDraftOrder({ items: [item({ quantity: 2 })], id: first.id, createdAt: first.createdAt });
        expect(second.id).toBe(first.id);
        expect(second.createdAt).toBe(first.createdAt);
    });

    it('treats an empty-string id as absent', () => {
        expect(createDraftOrder({ id: '' }).id).toMatch(/^ORD-/);
    });

    it('never inherits a stale total from a previous order', () => {
        const first = createDraftOrder({ items: [item({ price: 865, quantity: 2 })] });
        const second = createDraftOrder({ items: [item({ price: 100, quantity: 1 })], id: first.id });
        expect(second.total).toBe(100);
    });
});

describe('finalizeOrder', () => {
    it('confirms the order, keeps its id and re-derives the totals', () => {
        const draft = createDraftOrder({ items: [item({ price: 865, quantity: 2 })] });
        const confirmed = finalizeOrder(draft);

        expect(confirmed.status).toBe('confirmed');
        expect(confirmed.id).toBe(draft.id);
        expect(confirmed.total).toBe(1730);
    });

    it('repairs an order that was tampered with on the client', () => {
        const draft = createDraftOrder({ items: [item({ price: 865, quantity: 2 })] });
        const tampered = { ...draft, subtotal: 1, total: 1, items: [{ ...draft.items[0]!, total: 1 }] };
        expect(finalizeOrder(tampered).total).toBe(1730);
    });
});

describe('validateOrder', () => {
    it('accepts a complete pickup order regardless of value', () => {
        const order = createDraftOrder({ items: [item({ price: 60, quantity: 1 })], customerInfo: customer() });
        expect(validateOrder(order).valid).toBe(true);
    });

    it('rejects a missing order and an empty basket', () => {
        expect(codesOf(validateOrder(null))).toEqual(['empty_cart']);
        expect(codesOf(validateOrder(createDraftOrder({ items: [] })))).toContain('empty_cart');
    });

    it('requires a name and a valid BD mobile number', () => {
        const noName = createDraftOrder({ items: [item()], customerInfo: customer({ name: '  ' }) });
        expect(codesOf(validateOrder(noName))).toContain('missing_name');

        const noPhone = createDraftOrder({ items: [item()], customerInfo: customer({ phone: '' }) });
        expect(codesOf(validateOrder(noPhone))).toContain('missing_phone');

        const badPhone = createDraftOrder({ items: [item()], customerInfo: customer({ phone: '12345' }) });
        expect(codesOf(validateOrder(badPhone))).toContain('invalid_phone');
    });

    it('rejects a line with a non-positive or fractional quantity', () => {
        for (const quantity of [0, -5, 1.5]) {
            const order = createDraftOrder({ items: [item({ quantity })], customerInfo: customer() });
            expect(codesOf(validateOrder(order))).toContain('invalid_items');
        }
    });

    it('enforces the ৳1000 minimum for delivery only', () => {
        const cheap = [item({ price: 340, quantity: 1 })];

        const underMinimum = createDraftOrder({ items: cheap, customerInfo: deliveryCustomer() });
        expect(codesOf(validateOrder(underMinimum))).toContain('below_minimum_order');

        const exactly = createDraftOrder({
            items: [item({ price: MIN_ORDER_AMOUNT, quantity: 1 })],
            customerInfo: deliveryCustomer(),
        });
        expect(validateOrder(exactly).valid).toBe(true);

        const asPickup = createDraftOrder({ items: cheap, customerInfo: customer() });
        expect(validateOrder(asPickup).valid).toBe(true);
    });

    it('rejects delivery with no address, and accepts a typed one with no pin', () => {
        const noAddress = createDraftOrder({ items: [item()], customerInfo: deliveryCustomer({ address: '' }) });
        expect(codesOf(validateOrder(noAddress))).toContain('missing_address');

        // The map is an optional extra now, so a guest who never touches it is not blocked.
        const unpinned = createDraftOrder({
            items: [item()],
            customerInfo: customer({ deliveryType: 'delivery', address: 'Dhanmondi' }),
        });
        expect(codesOf(validateOrder(unpinned))).not.toContain('missing_address');

        /*
         * A fabricated "verified" flag with no distance behind it used to be rejected outright.
         * The distinction that survives is not about the flag at all: a distance we can measure is
         * enforced, and one we cannot is not invented. A model-supplied distance is not
         * trustworthy, which is why only the map sets it.
         */
        const fabricated = createDraftOrder({
            items: [item()],
            customerInfo: customer({ deliveryType: 'delivery', address: 'Dhanmondi', locationVerified: true }),
        });
        expect(codesOf(validateOrder(fabricated))).not.toContain('outside_delivery_zone');
    });

    it('enforces the delivery radius at the boundary', () => {
        // Must clear the ৳1000 minimum first, otherwise the radius is not the thing under test.
        const qualifying = [item({ price: 1490, quantity: 1 })];

        const atEdge = createDraftOrder({ items: qualifying, customerInfo: deliveryCustomer({ distance: MAX_DELIVERY_RANGE }) });
        expect(validateOrder(atEdge).valid).toBe(true);

        const outside = createDraftOrder({ items: qualifying, customerInfo: deliveryCustomer({ distance: MAX_DELIVERY_RANGE + 0.01 }) });
        expect(codesOf(validateOrder(outside))).toEqual(['outside_delivery_zone']);
    });

    it('recomputes the subtotal instead of trusting the value on the order', () => {
        const draft = createDraftOrder({
            items: [item({ price: 340, quantity: 1 })],
            customerInfo: deliveryCustomer(),
        });
        const inflated = { ...draft, subtotal: 99999, total: 99999 } as Order;
        expect(codesOf(validateOrder(inflated))).toContain('below_minimum_order');
    });

    it('reports issues in a stable priority order and exposes the first one', () => {
        const order = createDraftOrder({ items: [], customerInfo: customer({ name: '', phone: '' }) });
        const result = validateOrder(order);

        expect(result.valid).toBe(false);
        expect(codesOf(result)).toEqual(['empty_cart', 'missing_name', 'missing_phone']);
        expect(firstIssue(result)?.code).toBe('empty_cart');
        expect(firstIssue(validateOrder(createDraftOrder({ items: [item()], customerInfo: customer() })))).toBeUndefined();
    });

    it('carries user-facing copy on every issue', () => {
        const result = validateOrder(createDraftOrder({ items: [item()], customerInfo: customer({ phone: 'nope' }) }));
        expect(firstIssue(result)?.message).toMatch(/11-digit BD mobile/);
    });
});

describe('orderConfirmedMessage - what the receipt actually renders', () => {
    /*
     * The receipt card parses the total back out of this string with /Total: ৳?(\d+)/. A
     * message missing that phrase renders a literal "---" as the amount, which is what happened
     * on the checkout path while the chat path was fine. Asserted here because the failure is
     * invisible in a type check and in a passing test suite.
     */
    it('carries a parseable total', () => {
        const order = finalizeOrder(createDraftOrder({
            id: 'ORD-TEST-1',
            items: [{ id: '139', code: '139', name: 'THAI GRILLED CHICKEN', price: 745, quantity: 2, total: 1490 } as never],
        }));
        const text = orderConfirmedMessage(order);
        const match = text.match(/Total: .?(\d+)/i);
        expect(match, `receipt could not read a total from: ${text}`).not.toBeNull();
        expect(Number(match![1])).toBe(order.total);
    });

    it('names the order, so a guest can quote it', () => {
        const order = finalizeOrder(createDraftOrder({ id: 'ORD-TEST-2', items: [] }));
        expect(orderConfirmedMessage(order)).toContain('ORD-TEST-2');
    });

    it('is the single source of truth for both order paths', () => {
        // If a second hand-written variant reappears, this is the assertion that catches it.
        const order = finalizeOrder(createDraftOrder({ id: 'ORD-TEST-3', items: [] }));
        expect(orderConfirmedMessage(order)).toBe(orderConfirmedMessage(order));
    });
});