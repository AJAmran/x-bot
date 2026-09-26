/**
 * lib/recommend.ts — cart-aware recommendations.
 *
 * WHY THIS IS LOCAL CODE AND NOT A PROMPT: suggestions are the single most frequent AI call in
 * an ordering flow, and the free Gemini tier allows only a handful of requests per minute for
 * the whole project. Every rule here is deterministic, explainable and testable, so it costs
 * zero API calls, returns instantly, and works in demo mode with no API key at all. The model
 * is still the thing that handles conversation; this is the part that does not need it.
 *
 * Design rules:
 *   1. Never suggest something already in the basket.
 *   2. Never suggest something the guest has told us they cannot eat.
 *   3. Every suggestion carries a human-readable reason, so the waiter can justify it.
 *   4. If a suggestion exists that would clear the delivery minimum, prioritise that.
 */

import { MENU_INDEX, lookupByCode } from './menuIndex';
import { MIN_ORDER_AMOUNT } from './constants';
import { calculateTotals } from './order';
import type { MenuItem, Order } from './types';

export interface Suggestion {
    code: string;
    name: string;
    price: number;
    /** Short, quotable justification — the waiter can read this out loud. */
    reason: string;
}

/** Menu sections, used to reason about what the basket is missing. */
const APPETIZER_SECTIONS = new Set(['appetizers', 'soups']);
const MAIN_SECTIONS = new Set(['main-dishes', 'grilled', 'fish', 'rice-noodles', 'chef-special']);
const VEGETABLE_SECTIONS = new Set(['vegetable', 'vegetarian']);

const isDrink = (entry: { categoryId: string }) => entry.categoryId === 'beverages';
const isStarter = (entry: { categoryId: string; subcategoryId?: string }) =>
    entry.categoryId === 'chinese' && !!entry.subcategoryId && APPETIZER_SECTIONS.has(entry.subcategoryId);
const isMain = (entry: { categoryId: string; subcategoryId?: string }) =>
    entry.categoryId === 'bangla'
    || (entry.categoryId === 'chinese' && !!entry.subcategoryId && MAIN_SECTIONS.has(entry.subcategoryId));

const hasTag = (item: MenuItem, tag: string) => item.tags.includes(tag);

/**
 * What the guest has told us, translated into hard filters. The menu only carries the tags
 * S/N/H/V/D, so this can honour a stated preference for no-prawn, no-nuts or vegetarian — and
 * nothing more. A full allergen matrix would need better data; see README Limitations.
 */
interface DietaryRules {
    avoidTags: string[];
    vegetarianOnly: boolean;
}

export function readDietaryRules(order: Order | null): DietaryRules {
    const stated = (order?.customerInfo?.preferences ?? []).join(' ').toLowerCase();
    const avoidTags: string[] = [];
    if (/no prawn|no shrimp|shellfish|allergic to prawn/.test(stated)) avoidTags.push('S');
    if (/no nut|allergic to nut|peanut/.test(stated)) avoidTags.push('N');
    return { avoidTags, vegetarianOnly: /vegetarian|\bveg\b|no meat/.test(stated) };
}

function isAllowed(item: MenuItem, rules: DietaryRules): boolean {
    if (rules.avoidTags.some(tag => hasTag(item, tag))) return false;
    if (rules.vegetarianOnly && hasTag(item, 'S')) return false;
    return true;
}

/** Candidate items from a menu section, cheapest last so ordering is stable. */
function candidatesIn(
    predicate: (entry: (typeof MENU_INDEX)[number]) => boolean,
    rules: DietaryRules,
    excluded: Set<string>,
    pool: typeof MENU_INDEX
): MenuItem[] {
    return pool
        .filter(entry => predicate(entry) && !excluded.has(entry.item.code))
        .map(entry => entry.item)
        .filter(item => isAllowed(item, rules))
        .sort((a, b) => a.price - b.price);
}

/** Most-popular item in a section, used when we are pairing rather than topping up. */
function popularIn(
    predicate: (entry: (typeof MENU_INDEX)[number]) => boolean,
    rules: DietaryRules,
    excluded: Set<string>
): MenuItem | undefined {
    const matching = MENU_INDEX.filter(entry => predicate(entry) && !excluded.has(entry.item.code) && isAllowed(entry.item, rules));
    const popular = matching.filter(entry => entry.item.popular);
    const pool = popular.length > 0 ? popular : matching;
    return pool.sort((a, b) => a.item.price - b.item.price)[0]?.item;
}

/**
 * Suggest up to `limit` additions for the current basket. Returns an empty list for an empty
 * basket — there is nothing to pair with yet, and suggesting food to someone who has not
 * started ordering is noise.
 */
export function suggestForCart(order: Order | null, limit = 2): Suggestion[] {
    const items = order?.items ?? [];
    if (items.length === 0) return [];

    const rules = readDietaryRules(order);
    const excluded = new Set(items.map(item => item.code));
    const totals = calculateTotals(items, {
        deliveryType: order?.customerInfo?.deliveryType,
        distanceKm: order?.customerInfo?.distance,
    });

    const suggestions: Suggestion[] = [];
    const push = (item: MenuItem | undefined, reason: string) => {
        if (!item || suggestions.length >= limit) return;
        if (excluded.has(item.code)) return;
        suggestions.push({ code: item.code, name: item.name, price: item.price, reason });
    };

    // 1. Close the gap to free delivery. This is the highest-value nudge in the whole flow, so
    //    it goes first — but only once the basket is worth topping up in the first place.
    const isDelivery = order?.customerInfo?.deliveryType === 'delivery';
    if (isDelivery && totals.subtotal < MIN_ORDER_AMOUNT) {
        const affordable = candidatesIn(() => true, rules, excluded, MENU_INDEX)
            .filter(item => item.price <= MIN_ORDER_AMOUNT - totals.subtotal);
        const best = affordable[affordable.length - 1];
        push(best, `৳${MIN_ORDER_AMOUNT - totals.subtotal} more and delivery is on us`);
    }

    // 2. Something to drink alongside a spicy main.
    const hasDrink = items.some(item => {
        const entry = lookupByCode(item.code);
        return !!entry && isDrink(entry);
    });
    const hasSpicyMain = items.some(item => {
        const entry = lookupByCode(item.code);
        return !!entry && isMain(entry) && (entry.item.spice_level ?? 0) >= 3;
    });
    if (hasSpicyMain && !hasDrink) {
        push(popularIn(entry => isDrink(entry) && entry.item.cold === true, rules, excluded), 'Cools things down alongside the heat');
    }

    // 3. A starter to open with, once there is a main course on the table.
    const alreadyHasMain = items.some(item => {
        const entry = lookupByCode(item.code);
        return !!entry && isMain(entry);
    });
    const hasStarter = items.some(item => {
        const entry = lookupByCode(item.code);
        return !!entry && isStarter(entry);
    });
    if (alreadyHasMain && !hasStarter) {
        push(popularIn(entry => isStarter(entry), rules, excluded), 'A light starter to begin with');
    }

    // 4. A vegetable side, only when the basket has no vegetables at all.
    const hasVegetable = items.some(item => {
        const entry = lookupByCode(item.code);
        return !!entry && VEGETABLE_SECTIONS.has(entry.subcategoryId ?? '');
    });
    if (!hasVegetable && suggestions.length < limit) {
        push(popularIn(entry => VEGETABLE_SECTIONS.has(entry.subcategoryId ?? ''), rules, excluded), 'Balances out the menu');
    }

    return suggestions.slice(0, limit);
}

/**
 * "Same as last time" support. Returns the items of a previous order, skipping anything that
 * is no longer on the menu.
 */
export function itemsFromPreviousOrder(previous: Order | null): MenuItem[] {
    if (!previous) return [];
    return previous.items
        .map(item => lookupByCode(item.code)?.item)
        .filter((item): item is MenuItem => item !== undefined);
}
