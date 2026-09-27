/**
 * End-to-end walk of the order flow, exercising the same calls the chat cards make in the same
 * order. The cards themselves are React and cannot be driven without a DOM, so this covers the
 * part that decides whether an order is *allowed* and what it *costs* — which is where the
 * real defects have been.
 */

import { describe, it, expect } from 'vitest';
import {
    createDraftOrder,
    finalizeOrder,
    firstIssue,
    lineTotalOf,
    needsCheckoutCard,
    orderConfirmedMessage,
    validateOrder,
} from '../order';
import { MIN_ORDER_AMOUNT, MAX_DELIVERY_RANGE } from '../constants';
import type { CartItem, CustomerInfo, Order } from '../types';

const CHICKEN: CartItem = { id: '139', code: '139', name: 'THAI GRILLED CHICKEN', price: 745, quantity: 2, total: 1490 };
const SOUP: CartItem = { id: '123', code: '123', name: 'THAI HOT SOUP (TOM YAAM)', price: 320, quantity: 2, total: 640 };

/** The stepper maths from the basket card. */
const applyQuantity = (items: CartItem[], code: string, next: number): CartItem[] =>
    items
        .map(line => {
            if (line.code !== code) return line;
            const quantity = Math.max(0, Math.trunc(next));
            return { ...line, quantity, total: lineTotalOf(line.price, quantity) };
        })
        .filter(line => line.quantity > 0);

const withInfo = (order: Order | null, info: Partial<CustomerInfo>): Order =>
    createDraftOrder({
        items: order?.items ?? [],
        customerInfo: { name: '', phone: '', deliveryType: 'pickup', ...info },
    });

describe('order flow: a guest orders for pickup', () => {
    let order: Order | null = null;

    it('1. adding a dish builds a draft with the right money', () => {
        order = createDraftOrder({ items: [CHICKEN] });
        expect(order.items).toHaveLength(1);
        expect(order.subtotal).toBe(1490);
        expect(order.total).toBe(1490);
    });

    it('2. the basket card can raise and lower a quantity', () => {
        order = createDraftOrder({ items: applyQuantity(order!.items, '139', 3) });
        expect(order.items[0].quantity).toBe(3);
        expect(order.items[0].total).toBe(2235);
        expect(order.subtotal).toBe(2235);
    });

    it('3. a stepper to zero removes the line rather than leaving a free one', () => {
        order = createDraftOrder({ items: applyQuantity(order!.items, '139', 0) });
        expect(order.items).toHaveLength(0);
        expect(order.subtotal).toBe(0);
    });

    it('4. re-adding rebuilds a complete, valid draft', () => {
        order = createDraftOrder({ items: [CHICKEN, SOUP] });
        expect(order.subtotal).toBe(1490 + 640);
        expect(order.id).toBeTruthy();
    });

    it('5. checkout is refused while the guest is unnamed', () => {
        order = withInfo(order, { deliveryType: 'pickup' });
        const check = validateOrder(order);
        expect(check.valid).toBe(false);
        expect(check.issues.map(i => i.code)).toContain('missing_name');
    });

    it('6. a bad phone is caught before payment, not after', () => {
        order = withInfo(order, { name: 'Ayesha Rahman', phone: '01712' });
        const check = validateOrder(order);
        expect(check.issues.map(i => i.code)).toContain('invalid_phone');
    });

    it('7. a valid guest passes the pickup gate', () => {
        order = withInfo(order, { name: 'Ayesha Rahman', phone: '01712345678' });
        const check = validateOrder(order);
        expect(check.issues.map(i => i.code)).not.toContain('missing_name');
        expect(check.issues.map(i => i.code)).not.toContain('invalid_phone');
        expect(check.valid).toBe(true);
    });

    it('8. placing the order yields a priced receipt, collected as cash', () => {
        const placed = finalizeOrder(order!, 'confirmed');
        expect(placed.status).toBe('confirmed');
        expect(placed.total).toBe(order!.total);
        expect(placed.paymentMethod).toBe('cod');
        const text = orderConfirmedMessage(placed);
        expect(text).toMatch(/Total: .?2130/);
    });
});

describe('order flow: delivery gates', () => {
    const items = [CHICKEN, SOUP];

    it('is accepted on a typed address, with no pin', () => {
        // The guest gives the address in their own words; that is the whole requirement now.
        const order = withInfo(createDraftOrder({ items }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery', address: 'House 12, Road 5',
        });
        expect(validateOrder(order).valid).toBe(true);
    });

    it('is still refused with no address at all', () => {
        const order = withInfo(createDraftOrder({ items }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery',
        });
        expect(validateOrder(order).issues.map(i => i.code)).toContain('missing_address');
    });

    it('is refused outside the delivery radius when a pin shows it is too far', () => {
        const order = withInfo(createDraftOrder({ items }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery', address: 'Uttara, Dhaka',
            locationVerified: true, distance: MAX_DELIVERY_RANGE + 1,
        });
        expect(validateOrder(order).issues.map(i => i.code)).toContain('outside_delivery_zone');
    });

    it('is refused below the delivery minimum even once pinned and close by', () => {
        const cheap: CartItem = { id: '123', code: '123', name: 'THAI HOT SOUP', price: 100, quantity: 1, total: 100 };
        const order = withInfo(createDraftOrder({ items: [cheap] }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery',
            locationVerified: true, distance: 1, address: 'House 12, Road 5, Dhanmondi',
        });
        expect(validateOrder(order).issues.map(i => i.code)).toContain('below_minimum_order');
    });

    it('passes once pinned, in range and over the minimum', () => {
        const order = withInfo(createDraftOrder({ items }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery',
            locationVerified: true, distance: 2.4, address: 'House 12, Road 5, Dhanmondi',
        });
        const check = validateOrder(order);
        expect(check.issues.map(i => i.code)).toEqual([]);
        expect(check.valid).toBe(true);
    });

    it('tells the guest the single most useful blocker first', () => {
        const order = withInfo(createDraftOrder({ items: [SOUP] }), {
            name: '', phone: '', deliveryType: 'delivery',
        });
        expect(firstIssue(validateOrder(order))?.code).toBeTruthy();
    });
});

describe('order flow: the chat can change the order mid-checkout', () => {
    /*
     * The guest reaches the payment card, then keeps typing. This is why the card path re-checks
     * at the point of no return instead of trusting a check from several interactions earlier.
     */
    const atPayment: Order = withInfo(createDraftOrder({ items: [CHICKEN] }), {
        name: 'Ayesha', phone: '01712345678', deliveryType: 'pickup',
    });

    it('a late line that breaks the rules is caught before the order is finalised', () => {
        expect(validateOrder(atPayment).valid).toBe(true);

        // The waiter empties the basket while the payment card is open.
        const emptied = createDraftOrder({ items: [], customerInfo: atPayment.customerInfo });
        expect(validateOrder(emptied).valid).toBe(false);
        expect(validateOrder(emptied).issues.map(i => i.code)).toContain('empty_cart');
    });

    it('a late switch to delivery without an address is caught too', () => {
        const switched = withInfo(atPayment, { deliveryType: 'delivery' });
        expect(validateOrder(switched).issues.map(i => i.code)).toContain('missing_address');
    });

    it('re-derives line totals, so a line cannot disagree with the subtotal', () => {
        /*
         * `calculateTotals` has always derived the subtotal from `price * quantity` rather than
         * from the stored line totals, which left the guest able to see a line claiming one
         * figure and a subtotal claiming another. Both now come from the same arithmetic.
         */
        const stale = [{ ...CHICKEN, total: 1 }];
        const redrawn = createDraftOrder({ items: stale, customerInfo: atPayment.customerInfo });
        expect(redrawn.items[0].total).toBe(1490);
        expect(redrawn.subtotal).toBe(1490);
    });

    it('leaves a bad quantity for the validator to reject, rather than fixing it quietly', () => {
        /*
         * The counterpart to the total normalisation: coercing a fractional quantity here would
         * hide it from `validateOrder`, which deliberately treats one as a failure rather than
         * something to repair. Repair belongs in the parser (toolArgs clamps) and detection
         * belongs to the validator.
         */
        const odd = createDraftOrder({ items: [{ ...CHICKEN, quantity: 2.7 }] });
        expect(odd.items[0].quantity).toBe(2.7);
        expect(validateOrder(odd).issues.map(i => i.code)).toContain('invalid_items');
    });

    it('documents that the price itself is not re-verified against the menu', () => {
        /*
         * Honest about the remaining limitation: the menu is bundled to the browser and this
         * project has no backend, so `price` cannot be re-resolved here. Harmless while payment
         * is simulated; it is the first thing to fix if a real gateway is ever connected. The
         * chat path is the safer of the two already, because it looks the price up by code via
         * `findMenuItemByCode` before it ever reaches a draft.
         */
        const fromTamperedPrice = createDraftOrder({ items: [{ ...CHICKEN, price: 1, total: 1 }] });
        expect(fromTamperedPrice.subtotal).toBe(2);
    });
});

describe('order flow: minimum order value is what the copy says', () => {
    it('a delivery order under the minimum is blocked and names the figure', () => {
        const order = withInfo(createDraftOrder({ items: [SOUP] }), {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery',
            locationVerified: true, distance: 1, address: 'House 12, Road 5, Dhanmondi',
        });
        const issue = firstIssue(validateOrder(order));
        expect(order.subtotal).toBeLessThan(MIN_ORDER_AMOUNT);
        expect(issue?.message).toContain(String(MIN_ORDER_AMOUNT));
    });
});

describe('order flow: collection method is never assumed', () => {
    /*
     * Observed live: a guest ordered, was asked only for a name and a mobile, and the order went
     * through. Nobody had mentioned delivery or collection, and `calculateTotals` quietly
     * defaults an absent value to pickup — so a guest expecting delivery would have been
     * switched to collection without ever being asked.
     */
    const items = [CHICKEN];

    it('is refused when the guest has not said either way', () => {
        const order = createDraftOrder({ items, customerInfo: { name: 'Amran', phone: '01857692587' } as never });
        expect(validateOrder(order).issues.map(i => i.code)).toContain('missing_delivery_type');
    });

    it('is satisfied by an explicit pickup', () => {
        const order = withInfo(createDraftOrder({ items }), { name: 'Amran', phone: '01857692587', deliveryType: 'pickup' });
        expect(validateOrder(order).issues.map(i => i.code)).not.toContain('missing_delivery_type');
        expect(validateOrder(order).valid).toBe(true);
    });

    it('is satisfied by an explicit delivery, with the rest of the delivery rules still applying', () => {
        const order = withInfo(createDraftOrder({ items }), { name: 'Amran', phone: '01857692587', deliveryType: 'delivery' });
        // Delivery still needs an address and the minimum spend; the new check does not paper over them.
        const codes = validateOrder(order).issues.map(i => i.code);
        expect(codes).not.toContain('missing_delivery_type');
        expect(codes).toContain('missing_address');
    });

    it('names the question the guest still has to answer', () => {
        const order = createDraftOrder({ items, customerInfo: { name: 'Amran', phone: '01857692587' } as never });
        expect(firstIssue(validateOrder(order))?.message).toMatch(/delivered, or collected/i);
    });
});
describe('needsCheckoutCard - the thread must never dead-end', () => {
    /*
     * Observed live: a guest said "Amran, 01857692587, delivery nity chai" and was told the
     * details were saved. Nothing else happened. `confirm` is correctly refused because no map
     * pin exists, and the thread never surfaced the map — so the guest simply could not order.
     * These pin the hand-off that closes it.
     */
    const items = [CHICKEN];
    const full = (over: Partial<CustomerInfo> = {}) => withInfo(createDraftOrder({ items }), {
        name: 'Amran', phone: '01857692587', deliveryType: 'delivery', ...over,
    });

    it('hands over once the thread has everything except a map pin', () => {
        expect(needsCheckoutCard(full())).toBe(true);
    });

    it('hands over when the guest is outside the delivery radius', () => {
        expect(needsCheckoutCard(full({ locationVerified: true, distance: MAX_DELIVERY_RANGE + 2 }))).toBe(true);
    });

    it('does not hand over while the thread still has a question to ask', () => {
        // No name yet: asking in the thread is right, and a card would be premature.
        expect(needsCheckoutCard(withInfo(createDraftOrder({ items }), { phone: '01857692587', deliveryType: 'delivery' }))).toBe(false);
        // No items at all — there is nothing to check out.
        const empty = withInfo(createDraftOrder({ items: [] }), {
            name: 'Amran', phone: '01857692587', deliveryType: 'delivery',
        });
        expect(needsCheckoutCard(empty)).toBe(false);
    });

    it('does not hand over when the order is already placeable', () => {
        // A complete pickup needs no card: the thread can confirm it directly.
        expect(needsCheckoutCard(full({ deliveryType: 'pickup' }))).toBe(false);
    });

    it('keeps asking rather than guessing when the guest has not said how they want it', () => {
        // Name and number given, but never "delivery" or "pickup". Recording a default here
        // would promise a collection order and the wrong fee behind the guest's back.
        // Built directly rather than via `withInfo`, which supplies a pickup default.
        const undecided = createDraftOrder({
            items,
            customerInfo: { name: 'Amran', phone: '01857692587' },
        });
        expect(undecided.customerInfo?.deliveryType).toBeUndefined();
        expect(validateOrder(undecided).issues.map(i => i.code)).toContain('missing_delivery_type');
        expect(needsCheckoutCard(undecided)).toBe(false);
    });

    it('does not hand over for a delivery that is fully pinned and in range', () => {
        const ready = full({ address: 'House 12, Road 5', locationVerified: true, distance: 2 });
        expect(validateOrder(ready).valid).toBe(true);
        expect(needsCheckoutCard(ready)).toBe(false);
    });

    it('does not hand over for no order', () => {
        expect(needsCheckoutCard(null)).toBe(false);
    });

    it('still lets the thread handle a below-minimum delivery', () => {
        // Adding another dish is a thread action, so the card would be the wrong place to fix it.
        const cheap: CartItem = { id: '123', code: '123', name: 'THAI HOT SOUP', price: 100, quantity: 1, total: 100 };
        const order = full({ locationVerified: true, distance: 1 });
        const small = createDraftOrder({ items: [cheap], customerInfo: order.customerInfo });
        expect(validateOrder(small).issues.map(i => i.code)).toContain('below_minimum_order');
        expect(needsCheckoutCard(small)).toBe(false);
    });
});