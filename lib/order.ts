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
    OrderValidationIssue,
    OrderValidationResult,
    PaymentDetails,
    PaymentMethod,
    PaymentValidationCode,
    PaymentValidationIssue,
    PaymentValidationResult,
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

/**
 * A line total is always derived from quantity × price rather than read from
 * `CartItem.total`, because that value travels through the client and can be tampered with.
 */
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

/**
 * Order arithmetic. Kept intentionally cheap and side-effect free so it can run inside a
 * `useMemo` on every render without measurable cost.
 */
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

/**
 * Builds a fully-formed Order. Always returns every required field, so no caller ever has
 * to spread a possibly-null order (`{...null}` silently produced orders with no total).
 */
export function createDraftOrder(input: DraftOrderInput = {}): Order {
    const items = input.items ?? [];
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

/**
 * Draft → confirmed. Re-derives the totals from the line items (never trusts the stored
 * subtotal) and guarantees the order carries an id, since the receipt shows it to the
 * customer and to the kitchen.
 */
export function finalizeOrder(order: Order, status: Order['status'] = 'confirmed', payment?: PaymentOutcome): Order {
    return {
        ...createDraftOrder({
            items: order.items,
            customerInfo: order.customerInfo,
            id: order.id || generateOrderId(),
            createdAt: order.createdAt,
            status,
        }),
        paymentStatus: payment?.status ?? 'pending',
        ...(payment ? { paymentMethod: payment.method } : {}),
        ...(payment?.reference ? { paymentReference: payment.reference } : {}),
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

    if (info?.deliveryType === 'delivery') {
        if (!info.address?.trim()) {
            problems.push(issue('missing_address', 'Delivery address required.'));
        }

        // Strict here (unlike OrderTotals.isDistanceValid): an unknown distance is NOT a
        // pass. locationVerified is only ever set by the map, so this cannot be asserted
        // by the model.
        if (info.locationVerified !== true || typeof info.distance !== 'number' || !Number.isFinite(info.distance)) {
            problems.push(issue('location_unverified', 'Please pin location on map'));
        } else if (info.distance > MAX_DELIVERY_RANGE) {
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

// ---------------------------------------------------------------------------
// Payment (simulated)
// ---------------------------------------------------------------------------

/**
 * Luhn checksum — the same check every card scheme uses. Implementing it properly (rather
 * than "16 digits and done") is what makes the mock behave like the real thing, and it gives
 * us a genuinely correct validation rule to test.
 */
export function luhnCheck(rawNumber: string): boolean {
    const digits = rawNumber.replace(/\D/g, '');
    if (digits.length < 12) return false;

    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let value = digits.charCodeAt(i) - 48;
        if (double) {
            value *= 2;
            if (value > 9) value -= 9;
        }
        sum += value;
        double = !double;
    }
    return sum % 10 === 0;
}

export function maskCardNumber(rawNumber: string): string {
    const digits = rawNumber.replace(/\D/g, '');
    if (digits.length < 4) return digits;
    return `•••• •••• •••• ${digits.slice(-4)}`;
}

/** MM/YY, and not in the past. `now` is injectable so this is testable. */
function isValidExpiry(rawExpiry: string, now: Date): boolean {
    const match = rawExpiry.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!match) return false;

    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    if (month < 1 || month > 12) return false;

    // Valid through the last instant of the stated month.
    const expiresAt = new Date(year, month, 1);
    return expiresAt > now;
}

function paymentIssue(code: PaymentValidationCode, message: string): PaymentValidationIssue {
    return { code, message };
}

/**
 * Validates the payment fields for the chosen method. Cash on Delivery has nothing to check.
 * The rules mirror what a real PSP would enforce, so swapping in a live gateway later only
 * means replacing the authorisation call, not the validation.
 */
export function validatePaymentDetails(
    method: PaymentMethod,
    details: PaymentDetails,
    now: Date = new Date()
): PaymentValidationResult {
    if (method === 'cod') return { valid: true, issues: [] };

    const problems: PaymentValidationIssue[] = [];

    if (method === 'card') {
        const cardNumber = details.cardNumber ?? '';
        if (!luhnCheck(cardNumber)) {
            problems.push(paymentIssue('card_number_invalid', 'That card number does not look valid. Please check and try again.'));
        }
        if (!isValidExpiry(details.expiry ?? '', now)) {
            problems.push(paymentIssue('card_expiry_invalid', 'Please enter a valid future expiry date as MM/YY.'));
        }
        const cvc = (details.cvc ?? '').replace(/\D/g, '');
        if (!/^\d{3,4}$/.test(cvc)) {
            problems.push(paymentIssue('card_cvc_invalid', 'The security code should be 3 or 4 digits.'));
        }
    }

    if (method === 'mobile_banking') {
        if (!isValidBdPhone(details.walletNumber)) {
            problems.push(paymentIssue('wallet_number_invalid', 'Please enter the 11-digit mobile number linked to your wallet.'));
        }
    }

    const [first, ...rest] = problems;
    if (!first) return { valid: true, issues: [] };
    return { valid: false, issues: [first, ...rest] };
}

export interface PaymentOutcome {
    method: PaymentMethod;
    status: Order['paymentStatus'];
    /** Only card/mobile produce a reference; COD is collected later. */
    reference?: string;
}

/**
 * A fake authorisation code. Deliberately not a real-looking PSP token — the prefix says
 * what it is, so a screenshot of the receipt cannot be mistaken for a live transaction.
 */
export function simulateAuthorization(method: PaymentMethod): PaymentOutcome {
    if (method === 'cod') return { method, status: 'pending' };

    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return { method, status: 'paid', reference: `SIM-${suffix}` };
}
