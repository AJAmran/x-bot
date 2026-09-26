/**
 * lib/toolArgs.ts — runtime validation for the `manage_order` tool call.
 *
 * The Gemini SDK types `functionCall.args` as `Record<string, unknown>`, so model output
 * arrives completely untyped. Previously it was cast straight to `OrderAction`, which meant
 * a hallucinated `item_code` was silently dropped and `quantity: -5` produced a
 * negative-total cart line. Everything the model sends is now treated as a *request* that
 * has to survive this parser before the application will act on it.
 *
 * Design notes:
 *  - Manual guards rather than a schema library: the payload has six fixed shapes, this
 *    module is ~150 lines, and it keeps the client bundle free of another dependency. If
 *    the tool surface grows, swapping the internals for zod would not change the signature.
 *  - Unfixable data (an invented item code) is dropped and reported back to the customer in
 *    `notices`. Because the server's reply becomes part of the conversation history, the
 *    model reads its own correction on the next turn — no extra API call, which matters on
 *    a free tier with a per-project RPD ceiling.
 *  - Fixable data (a zero/negative/absent quantity) is repaired rather than rejected.
 */

import { findMenuItemByCode, isValidCategoryId, isValidSubcategoryId } from './menuIndex';
import type { DeliveryType, OrderAction, OrderToolItem } from './types';

/** Guard rails so one hallucinated turn cannot ask for an unbounded amount of work. */
const MAX_ITEMS_PER_CALL = 25;
const MAX_QUANTITY_PER_ITEM = 99;
const MAX_TEXT_LENGTH = 200;
const MAX_PREFERENCES = 8;

const ACTIONS = ['add', 'remove', 'set_quantity', 'set_notes', 'checkout', 'update_info', 'confirm', 'browse_menu'] as const;
type ActionName = (typeof ACTIONS)[number];

function isAction(value: unknown): value is ActionName {
    return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.trim().slice(0, MAX_TEXT_LENGTH);
    return text.length > 0 ? text : undefined;
}

function toQuantity(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.trunc(value);
}

export interface ParsedToolCall {
    /** Undefined when the action name itself is unusable. */
    action: OrderAction | undefined;
    /** Item codes the model invented that are not on the menu. */
    unknownItemCodes: string[];
    /** Corrections to surface to the customer, already phrased in the waiter's voice. */
    notices: string[];
    /** True when a quantity was clamped rather than honoured as sent. */
    clampedQuantity: boolean;
}

function unknownCodeNotice(codes: string[]): string {
    const list = codes.map(c => `"${c}"`).join(', ');
    return `I couldn't find ${list} on our menu, Sir/Ma'am — please pick from the menu list.`;
}

function parseItems(
    raw: unknown,
    mode: 'add' | 'remove' | 'set_quantity' | 'set_notes',
    unknownItemCodes: string[],
    result: { clamped: boolean }
): OrderToolItem[] {
    if (!Array.isArray(raw)) return [];

    const items: OrderToolItem[] = [];
    for (const entry of raw.slice(0, MAX_ITEMS_PER_CALL)) {
        if (!isRecord(entry)) continue;

        const menuItem = findMenuItemByCode(entry.item_code);
        if (!menuItem) {
            // Invented or mistyped code — report it instead of silently doing nothing.
            const code = cleanText(entry.item_code);
            if (code) unknownItemCodes.push(code);
            continue;
        }

        const notes = cleanText(entry.notes);
        const sent = toQuantity(entry.quantity);

        if (mode === 'add') {
            // Default to 1 when the model omits it, and never allow <= 0 on an add:
            // removal has its own verb, and a negative line total is never valid.
            let quantity = sent === null || sent < 1 ? 1 : sent;
            if (quantity > MAX_QUANTITY_PER_ITEM) {
                quantity = MAX_QUANTITY_PER_ITEM;
                result.clamped = true;
            }
            items.push({ item_code: menuItem.code, quantity, ...(notes ? { notes } : {}) });
        } else if (mode === 'set_quantity') {
            // "Make it three instead of two" — an absolute value, not a delta. 0 is allowed and
            // means "take it off the order", which is how a guest asks to remove something
            // without using the remove verb.
            if (sent === null || sent < 0) continue;
            const quantity = Math.min(sent, MAX_QUANTITY_PER_ITEM);
            if (sent > MAX_QUANTITY_PER_ITEM) result.clamped = true;
            items.push({ item_code: menuItem.code, quantity, ...(notes ? { notes } : {}) });
        } else if (mode === 'set_notes') {
            // A note with no quantity, e.g. "make it spicier" / "no onions please".
            if (!notes) continue;
            items.push({ item_code: menuItem.code, notes });
        } else {
            // For `remove`, a missing/zero quantity means "take the whole line out".
            const quantity = sent === null || sent <= 0 ? 0 : Math.min(sent, MAX_QUANTITY_PER_ITEM);
            items.push({ item_code: menuItem.code, quantity, ...(notes ? { notes } : {}) });
        }

        if (items.length >= MAX_ITEMS_PER_CALL) break;
    }
    return items;
}

function parseCustomerDetails(raw: unknown): OrderAction['customer_details'] {
    if (!isRecord(raw)) return undefined;
    const details: NonNullable<OrderAction['customer_details']> = {};

    const name = cleanText(raw.name);
    if (name) details.name = name;
    const phone = cleanText(raw.phone);
    if (phone) details.phone = phone;
    const address = cleanText(raw.address);
    if (address) details.address = address;
    const preferredTime = cleanText(raw.preferred_time);
    if (preferredTime) details.preferred_time = preferredTime;
    if (raw.delivery_type === 'pickup' || raw.delivery_type === 'delivery') {
        details.delivery_type = raw.delivery_type satisfies DeliveryType;
    }

    // Discrete facts worth remembering (allergies, spice tolerance, a usual order). Kept as a
    // short list so the memory block in the system instruction stays small.
    if (Array.isArray(raw.preferences)) {
        const preferences = raw.preferences
            .map(cleanText)
            .filter((value): value is string => Boolean(value))
            .slice(0, MAX_PREFERENCES);
        if (preferences.length > 0) details.preferences = preferences;
    }

    return Object.keys(details).length > 0 ? details : undefined;
}

/**
 * Parse and repair one `manage_order` call. Never throws — an unusable payload comes back
 * as `action: undefined` with the reason in `notices`.
 */
export function parseManageOrderArgs(args: unknown): ParsedToolCall {
    const unknownItemCodes: string[] = [];
    const notices: string[] = [];
    const flags = { clamped: false };

    if (!isRecord(args) || !isAction(args.action)) return { action: undefined, unknownItemCodes, notices, clampedQuantity: false };

    switch (args.action) {
        case 'add':
        case 'remove':
        case 'set_quantity':
        case 'set_notes': {
            const items = parseItems(args.items, args.action, unknownItemCodes, flags);
            if (unknownItemCodes.length > 0) notices.push(unknownCodeNotice(unknownItemCodes));
            if (flags.clamped) {
                notices.push(`For a single order I can only take ${MAX_QUANTITY_PER_ITEM} servings of an item, Sir/Ma'am.`);
            }
            return {
                action: { action: args.action, items },
                unknownItemCodes,
                notices,
                clampedQuantity: flags.clamped,
            };
        }

        case 'browse_menu': {
            const action: OrderAction = { action: 'browse_menu' };
            const categoryId = cleanText(args.category_id);
            const subcategoryId = cleanText(args.subcategory_id);

            if (categoryId && isValidCategoryId(categoryId)) {
                action.category_id = categoryId;
            } else if (categoryId) {
                // An unknown id would leave the menu tab blank, so fall back to the full menu.
                notices.push(`I don't have a "${categoryId}" section — let me show you the full menu instead.`);
            }
            if (subcategoryId && isValidSubcategoryId(subcategoryId)) {
                action.subcategory_id = subcategoryId;
            }
            return { action, unknownItemCodes, notices, clampedQuantity: false };
        }

        case 'update_info': {
            const customer_details = parseCustomerDetails(args.customer_details);
            return {
                action: { action: 'update_info', ...(customer_details ? { customer_details } : {}) },
                unknownItemCodes,
                notices,
                clampedQuantity: false,
            };
        }

        default:
            return { action: { action: args.action }, unknownItemCodes, notices, clampedQuantity: false };
    }
}
