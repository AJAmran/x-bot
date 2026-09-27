/**
 * lib/menuPayload.ts — the menu, in the cheapest form that still answers questions.
 *
 * The whole catalogue is sent on every turn, so this is the largest lever on cost and latency.
 * Measured over the real 239-item menu: `JSON.stringify(menu)` is 52,388 chars (~13,100 tokens),
 * this format ~20,000 (~5,000). Everything the model could act on survives — code, name, price,
 * dietary tag, description. What goes is only what it could never use: image URLs, a `currency`
 * field that is "BDT" on all 239 items, an `id` mirroring `code`, and serving metadata.
 *
 * Descriptions are truncated rather than dropped. Dropping them saves ~1,900 tokens more but
 * measurably hurts menu Q&A: the description is what lets the waiter answer "what's in the X?"
 * and offer the nearest dish when a guest names something we do not stock. 90 characters covers
 * the longest description in the data (129) closely enough to keep that reasoning.
 */

import { RESTAURANT_DATA } from './constants';
import type { Category, MenuItem } from './types';

/** Longest description we send. The data's own maximum is 129. */
const MAX_DESC_CHARS = 90;

function formatItem(item: MenuItem): string {
    // A dish with no tags and no description must not render as `101 | NAME | 745 |  | `.
    const tail = [
        (item.tags ?? []).join(','),
        (item.description ?? '').slice(0, MAX_DESC_CHARS).trim(),
    ].filter(part => part.length > 0);
    return [item.code, item.name, String(item.price), ...tail].join(' | ');
}

function section(title: string, items: MenuItem[]): string[] {
    return [`## ${title}`, ...items.map(formatItem)];
}

function serializeCategory(category: Category): string[] {
    if (category.kind === 'nested') {
        return [
            `# ${category.name}`,
            ...category.subcategories.flatMap(sub => (sub.items?.length ? section(sub.name, sub.items) : [])),
        ];
    }
    return section(`# ${category.name}`, category.items);
}

/**
 * Explains the format once per request rather than trusting the model to infer it. Cheaper
 * than per-item JSON punctuation and far more reliable to parse. The tag legend is not
 * decoration: "N" means contains nuts and "D" means contains dairy, and a guest with an
 * allergy is exactly the case where a guessed tag does harm.
 */
export function buildMenuLegend(): string {
    const tags = Object.entries(RESTAURANT_DATA.menu.tags_legend)
        .map(([tag, meaning]) => `${tag}=${meaning}`)
        .join(', ');
    return [
        'One line per dish: code | name | price in BDT | dietary tags | description.',
        `Dietary tags: ${tags}.`,
        'Only ever use a code that appears below. Never invent one.',
    ].join('\n');
}

/** Pure, so it can be asserted in tests without a model call. */
export function buildMenuPayload(): string {
    return RESTAURANT_DATA.menu.categories.flatMap(serializeCategory).join('\n');
}

/**
 * Serialised once per server instance rather than per request. The menu is a build-time
 * constant, so rebuilding ~20 KB on every turn was pure waste on a busy instance.
 */
let cached: string | undefined;

export function getMenuPayload(): string {
    if (cached === undefined) cached = buildMenuPayload();
    return cached;
}
