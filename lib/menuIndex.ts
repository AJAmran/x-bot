/**
 * lib/menuIndex.ts — lookup indexes over the static menu, built once at module load.
 *
 * The menu is a Category -> (Subcategory) -> MenuItem tree, which made every consumer
 * hand-roll the same walk with optional chaining. These indexes remove that question
 * entirely and give O(1) validation of model-supplied item codes.
 */

import { RESTAURANT_DATA } from './constants';
import type { Category, MenuItem, Subcategory } from './types';

/**
 * Narrowing helper for the flat/nested union. Every consumer used to hand-roll
 * `category.subcategories ?? []`, which is exactly the kind of optional chaining that hides
 * a data-shape bug until runtime.
 */
export function subcategoriesOf(category: Category): Subcategory[] {
    return category.kind === 'nested' ? category.subcategories : [];
}

export function itemsOf(category: Category): MenuItem[] {
    return category.kind === 'flat' ? category.items : subcategoriesOf(category).flatMap(sub => sub.items);
}

function collectItems(): MenuItem[] {
    return RESTAURANT_DATA.menu.categories.flatMap(itemsOf);
}

const ALL_ITEMS = collectItems();

/**
 * An item plus where it sits in the tree. The recommendation engine needs the location to
 * tell a starter from a main course from a drink, which the item itself does not record.
 */
export interface IndexedMenuItem {
    item: MenuItem;
    categoryId: string;
    subcategoryId?: string;
}

const INDEX: readonly IndexedMenuItem[] = RESTAURANT_DATA.menu.categories.flatMap(category =>
    category.kind === 'flat'
        ? category.items.map(item => ({ item, categoryId: category.id }))
        : category.subcategories.map(sub => ({
            categoryId: category.id,
            subcategoryId: sub.id,
            items: sub.items,
        })).flatMap(group => group.items.map(item => ({ item, categoryId: group.categoryId, subcategoryId: group.subcategoryId })))
);

const byCode = new Map<string, IndexedMenuItem>();
const byId = new Map<string, IndexedMenuItem>();
for (const entry of INDEX) {
    const code = String(entry.item.code ?? '').trim().toLowerCase();
    if (code && !byCode.has(code)) byCode.set(code, entry);
    if (entry.item.id && !byId.has(entry.item.id)) byId.set(entry.item.id, entry);
}

/** Every menu item with its category/subcategory, in menu order. */
export const MENU_INDEX: readonly IndexedMenuItem[] = INDEX;

/**
 * Codes that appear on more than one dish. The source data used to reuse `150`–`158` across
 * the plain and "a" variants of a dish, which made those items unorderable (the AI orders by
 * code and could only ever reach the first match) and merged distinct dishes into one cart
 * line. It is fixed in the data; this diagnostic exists so a regression is caught by a test
 * in Step 7 rather than by a confused customer.
 */
export function findDuplicateCodes(): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of ALL_ITEMS) {
        const code = String(item.code ?? '').trim();
        if (!code) continue;
        if (seen.has(code)) duplicates.add(code);
        seen.add(code);
    }
    return [...duplicates];
}

const categoryIds = new Set<string>(RESTAURANT_DATA.menu.categories.map(c => c.id));
const subcategoryIds = new Set<string>(RESTAURANT_DATA.menu.categories.flatMap(c => subcategoriesOf(c).map(s => s.id)));

/**
 * Section lookups, indexed by everything a caller might plausibly send.
 *
 * A model asked for `category_id` answers with the section's *display* name about as often as
 * its id — a live run sent "Chinese" where the id is "chinese", which an exact, case-sensitive
 * check rejected, so the guest was told "I don't have a Chinese section" about a section that
 * plainly exists. Resolving the near-misses turns a wrong-but-close answer into a right one
 * instead of throwing it away, which is the whole point of repairing model output.
 */
const slug = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, '-');

const categoryAliases = new Map<string, string>();
for (const category of RESTAURANT_DATA.menu.categories) {
    for (const alias of [category.id, category.name]) categoryAliases.set(slug(alias), category.id);
}

const subcategoryAliases = new Map<string, string>();
for (const category of RESTAURANT_DATA.menu.categories) {
    for (const sub of subcategoriesOf(category)) {
        for (const alias of [sub.id, sub.name]) subcategoryAliases.set(slug(alias), sub.id);
    }
}

/** The real category id for whatever the caller sent, or undefined if it is not a section. */
export function resolveCategoryId(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return categoryAliases.get(slug(value)) ?? (categoryIds.has(value) ? value : undefined);
}

/** As `resolveCategoryId`, for subcategories. */
export function resolveSubcategoryId(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return subcategoryAliases.get(slug(value)) ?? (subcategoryIds.has(value) ? value : undefined);
}

/** Every menu item, flattened. Order matches the categories in the source data. */
export const MENU_ITEMS: readonly MenuItem[] = ALL_ITEMS;

/** Accepts a code as a string or a number — models emit both. Case-insensitive, since the
 *  dish names are uppercase and a model may echo "150A" rather than "150a". */
function toCode(value: unknown): string | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
        const code = String(value).trim().toLowerCase();
        return code.length > 0 ? code : undefined;
    }
    return undefined;
}

export function findMenuItemByCode(value: unknown): MenuItem | undefined {
    return lookupByCode(value)?.item;
}

export function findMenuItemById(value: unknown): MenuItem | undefined {
    return typeof value === 'string' ? byId.get(value)?.item : undefined;
}

/** Full index entry (item + location) for a code. */
export function lookupByCode(value: unknown): IndexedMenuItem | undefined {
    const code = toCode(value);
    return code ? byCode.get(code) : undefined;
}

export function isKnownItemCode(value: unknown): boolean {
    return findMenuItemByCode(value) !== undefined;
}

export function isValidCategoryId(value: unknown): boolean {
    return typeof value === 'string' && categoryIds.has(value);
}

export function isValidSubcategoryId(value: unknown): boolean {
    return typeof value === 'string' && subcategoryIds.has(value);
}

// ---------------------------------------------------------------------------
// "Is the customer talking about actual food?" — used by the local intent layer
// to avoid answering an order with a canned reply.
// ---------------------------------------------------------------------------

const TOKEN_MIN_LENGTH = 4;
/**
 * A word appearing in more than this many dish names is too generic to signal a specific
 * order ("chicken" is in ~60 dishes, "chinese" in all of them), so it is not distinctive.
 */
const MAX_TOKEN_FREQUENCY = 6;
const TOKEN_SPLIT = /[^a-z0-9]+/;

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(TOKEN_SPLIT)
        .filter(token => token.length >= TOKEN_MIN_LENGTH && !/^\d+$/.test(token));
}

function buildDistinctiveTokens(): Set<string> {
    const frequency = new Map<string, number>();
    for (const item of ALL_ITEMS) {
        for (const token of new Set(tokenize(item.name))) {
            frequency.set(token, (frequency.get(token) ?? 0) + 1);
        }
    }
    return new Set(
        [...frequency.entries()]
            .filter(([, count]) => count <= MAX_TOKEN_FREQUENCY)
            .map(([token]) => token)
    );
}

/** Words that name one specific dish rather than a whole section of the menu. */
export const DISTINCTIVE_TOKENS: ReadonlySet<string> = buildDistinctiveTokens();

/**
 * NOTE: whether a distinctive word is *evidence of an order* is a policy decision, not menu
 * knowledge — some dish names contain words the app also uses for navigation ("ASIAN FISH
 * BASKET"). That judgement lives in lib/chatService.ts, which subtracts its own reserved
 * vocabulary from this set.
 */

/** True when the message quotes an item code such as "101". */
export function mentionsItemCode(text: string): boolean {
    const candidates = text.match(/\b\d{1,4}[a-z]?\b/gi) ?? [];
    return candidates.some(candidate => byCode.has(candidate.trim().toLowerCase()));
}
