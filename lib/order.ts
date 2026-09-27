/**
 * lib/order.ts — the order domain.
 *
 * Pure functions only: no React, no I/O, no localStorage, no Gemini. Everything here is
 * deterministic apart from `createDraftOrder`/`finalizeOrder`, whose id and timestamp can be
 * injected for tests.
 *
 * This module is the single source of truth for:
 *   - building a *complete* Order (never spread a possibly-null one — that bug shipped
 *     `Total: ৳undefined` to customers),
 *   - order arithmetic (subtotal / fee / total / item count),
 *   - business rules (BD phone format, ৳1000 delivery minimum, 5km delivery radius).
 *
 * It is consumed by BOTH the checkout UI and (from Step 2) the Gemini server action, so a
 * malicious or hallucinated tool call cannot produce an order the UI would have rejected.
 */

import { DELIVERY_FEE, MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT, generateOrderId } from './constants';
import type {
    CartItem,
    CustomerInfo,
    DeliveryType,
    Order,
    OrderTotals,
    OrderValidationCode,
    OrderValidationIssue,
    OrderValidationResult,
} from './types';

/**
 * Bangladeshi mobile numbers: 11 digits starting 01[3-9], with an optional +88 / 88 prefix.
 * Spaces and dashes are stripped before matching so "01712-345 678" is accepted.
 */
export const BD_PHONE_REGEX = /^(?:\+88|88)?(01[3-9]\d{8})$/;

export function normalizeBdPhone(raw: string): string {
    return raw.replace(/[\s-]/g, '');
}

export function isValidBdPhone(raw: string | undefined | null): boolean {
    if (!raw) return false;
    return BD_PHONE_REGEX.test(normalizeBdPhone(raw));
}

/** Derived from price x quantity, never read from `CartItem.total`, which travels via the client. */

export function lineTotalOf(price: number, quantity: number): number {
    const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
    const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
    return safePrice * safeQuantity;
}

export function lineTotal(item: CartItem): number {
    return lineTotalOf(item.price, item.quantity);
}

export interface TotalsOptions {
    deliveryType?: DeliveryType;
    distanceKm?: number;
}

/** Cheap and side-effect free, so it is safe to call inside a `useMemo` on every render. */
export function calculateTotals(items: CartItem[] | null | undefined, options: TotalsOptions = {}): OrderTotals {
    const list = items ?? [];
    const { deliveryType = 'pickup', distanceKm } = options;
    const isDelivery = deliveryType === 'delivery';

    const subtotal = list.reduce((sum, item) => sum + lineTotal(item), 0);
    const totalItems = list.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
    const deliveryFee = isDelivery ? DELIVERY_FEE : 0;

    return {
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        totalItems,
        // The ৳1000 minimum is a *delivery* rule — pickup has none.
        isMinOrderMet: isDelivery ? subtotal >= MIN_ORDER_AMOUNT : true,
        isDistanceValid: isDelivery ? distanceKm === undefined || distanceKm <= MAX_DELIVERY_RANGE : true,
        amountToMinOrder: Math.max(0, MIN_ORDER_AMOUNT - subtotal),
    };
}

export interface DraftOrderInput {
    items?: CartItem[] | null;
    customerInfo?: CustomerInfo;
    /** Reuse an existing id to keep a draft stable across edits. */
    id?: string;
    createdAt?: Date;
    status?: Order['status'];
}

/** Builds a fully-formed Order. Never spread a possibly-null order: `{...null}` loses the total. */
export function createDraftOrder(input: DraftOrderInput = {}): Order {
    /*
     * Re-derive every line total from price x quantity before anything reads it, so the figure
     * shown against a dish cannot disagree with the subtotal printed beside it.
     *
     * Only the total is touched. A fractional or negative quantity is left alone: `validateOrder`
     * treats that as a failure rather than something to quietly fix, and coercing it here would
     * hide the bad input from the check meant to catch it.
     */
    const items = (input.items ?? []).map(item => ({
        ...item,
        total: lineTotalOf(item.price, item.quantity),
    }));

    const customerInfo = input.customerInfo;
    const totals = calculateTotals(items, {
        deliveryType: customerInfo?.deliveryType,
        distanceKm: customerInfo?.distance,
    });

    return {
        id: input.id || generateOrderId(),
        items,
        customerInfo,
        status: input.status ?? 'draft',
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        total: totals.total,
        createdAt: input.createdAt ?? new Date(),
        paymentStatus: 'pending',
    };
}

/** The receipt body. One function so the chat and card paths cannot print different totals. */
export function orderConfirmedMessage(order: Order): string {
    return `Order Confirmed! ID: **${order.id}**. Total: ৳${order.total}`;
}

/** Blockers whose fix is "add more food", which is a thread action rather than a form's. */
const NEEDS_MORE_DISHES = new Set<OrderValidationCode>(['empty_cart', 'invalid_items', 'below_minimum_order']);

/**
 * True when the thread has what it needs and the order still cannot be placed, so the checkout
 * card should open.
 *
 * The gate is the three answers that make a card the natural next step: who the guest is, how to
 * reach them, and how they want it. Until those are known the thread keeps asking, because a
 * question is less work than a form. Everything after that is the card's job.
 */
export function needsCheckoutCard(order: Order | null): boolean {
    if (!order) return false;

    const info = order.customerInfo;
    const essentialsKnown = order.items.length > 0
        && Boolean(info?.name?.trim())
        && Boolean(info?.phone?.trim())
        && (info?.deliveryType === 'delivery' || info?.deliveryType === 'pickup');
    if (!essentialsKnown) return false;

    const codes = validateOrder(order).issues.map(issue => issue.code);
    // Nothing outstanding means the thread can confirm on its own.
    if (codes.length === 0) return false;
    return !codes.some(code => NEEDS_MORE_DISHES.has(code));
}

/**
 * Marks the order as placed. Cash on delivery is the only method, so it is set here rather than
 * accepted from a caller, and `paymentStatus` stays `pending` until the rider has the cash.
 */
export function finalizeOrder(order: Order, status: Order['status'] = 'confirmed'): Order {
    return {
        ...createDraftOrder({
            items: order.items,
            customerInfo: order.customerInfo,
            id: order.id || generateOrderId(),
            createdAt: order.createdAt,
            status,
        }),
        paymentMethod: 'cod',
        paymentStatus: 'pending',
    };
}

function issue(code: OrderValidationIssue['code'], message: string): OrderValidationIssue {
    return { code, message };
}

/**
 * The authoritative business-rule gate. Called by the checkout UI *and* by the server
 * before an AI-driven `confirm` is honoured.
 *
 * Security note: totals are recomputed from the line items and the customer's phone/location
 * are treated as untrusted input, because this function is also reached with data that came
 * from the model rather than from our own form.
 */
export function validateOrder(order: Order | null | undefined): OrderValidationResult {
    const problems: OrderValidationIssue[] = [];

    if (!order) {
        problems.push(issue('empty_cart', 'Your basket is empty. Please add something to your order first.'));
        return { valid: false, issues: [problems[0]] };
    }

    const items = order.items ?? [];
    if (items.length === 0) {
        problems.push(issue('empty_cart', 'Your basket is empty. Please add something to your order first.'));
    }

    const badItem = items.find(
        (item) => !Number.isFinite(item.price) || item.price < 0 || !Number.isInteger(item.quantity) || item.quantity < 1
    );
    if (badItem) {
        problems.push(issue('invalid_items', `"${badItem.name}" has an invalid quantity or price. Please add it again.`));
    }

    const info = order.customerInfo;

    if (!info?.name?.trim()) {
        problems.push(issue('missing_name', 'May I have your name, Sir/Ma\'am?'));
    }

    if (!info?.phone?.trim()) {
        problems.push(issue('missing_phone', 'May I have your mobile number, Sir/Ma\'am?'));
    } else if (!isValidBdPhone(info.phone)) {
        problems.push(issue('invalid_phone', 'Please provide a valid 11-digit BD mobile number (e.g. 01712345678).'));
    }

    // Delivery or pickup has to be an actual answer. `calculateTotals` falls back to pickup when
    // the field is absent, so without this an order the guest never discussed collections for
    // would quietly become a collection.
    if (info?.deliveryType !== 'delivery' && info?.deliveryType !== 'pickup') {
        problems.push(issue('missing_delivery_type', 'Would you like this delivered, or collected Sir/Ma\'am?'));
    }

    if (info?.deliveryType === 'delivery') {
        if (!info.address?.trim()) {
            problems.push(issue('missing_address', 'Delivery address required.'));
        }

        /*
         * The typed address is what the rider follows, so it is the only requirement. The map is
         * an extra: a pin gives us a real distance to check against the radius, and an unpinned
         * order is not blocked for lacking one. Only the map can set a distance.
         */
        if (typeof info.distance === 'number' && Number.isFinite(info.distance) && info.distance > MAX_DELIVERY_RANGE) {
            problems.push(issue('outside_delivery_zone', `Outside delivery zone (${MAX_DELIVERY_RANGE}km)`));
        }

        const { subtotal } = calculateTotals(items, { deliveryType: 'delivery', distanceKm: info.distance });
        if (subtotal < MIN_ORDER_AMOUNT) {
            problems.push(issue('below_minimum_order', `Minimum ৳${MIN_ORDER_AMOUNT} for delivery`));
        }
    }

    const [first, ...rest] = problems;
    if (!first) return { valid: true, issues: [] };
    return { valid: false, issues: [first, ...rest] };
}

/** Convenience for UI toasts: the highest-priority blocking reason, if any. */
export function firstIssue(result: OrderValidationResult): OrderValidationIssue | undefined {
    return result.valid ? undefined : result.issues[0];
}


