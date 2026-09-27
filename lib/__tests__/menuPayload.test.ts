/**
 * The menu payload is the largest single input the model receives, so its size is a
 * regression risk with no test around it: a field added to the data would silently inflate
 * every request. These tests pin both the budget and the facts that must survive.
 */

import { describe, it, expect } from 'vitest';
import { RESTAURANT_DATA } from '@/lib/constants';
import { buildMenuLegend, buildMenuPayload, getMenuPayload } from '@/lib/menuPayload';
import { itemsOf } from '@/lib/menuIndex';

/** Rough tokens. Deliberately the pessimistic 4-chars-per-token divisor. */
const tokens = (text: string) => Math.ceil(text.length / 4);

describe('menu payload', () => {
    const payload = buildMenuPayload();
    const allItems = RESTAURANT_DATA.menu.categories.flatMap(c => itemsOf(c));

    it('stays within the token budget the waiter was designed around', () => {
        // Was ~13,100 with JSON.stringify. The budget is what keeps a routine turn cheap
        // enough to run on a free tier; failing loudly here is the point of the test.
        expect(tokens(payload)).toBeLessThan(6_000);
    });

    it('is dramatically smaller than serialising the menu as JSON', () => {
        const asJson = JSON.stringify(RESTAURANT_DATA.menu);
        expect(payload.length).toBeLessThan(asJson.length * 0.5);
    });

    it('carries every dish exactly once', () => {
        // Codes are not uniformly numeric — the range 150a-158a is alphanumeric — so the
        // matcher has to accept letters. A `\d+` pattern here silently under-counted by 9.
        const codes = payload.match(/^[A-Za-z0-9]+ \|/gm) ?? [];
        expect(codes.length).toBe(allItems.length);
    });

    it('keeps the code, name and price of every dish', () => {
        // The three fields the model cannot work without: it must emit a real code, and it
        // must be able to answer a price question.
        for (const item of allItems) {
            expect(payload).toContain(`${item.code} | ${item.name} | ${item.price}`);
        }
    });

    it('keeps a description for every dish, truncated', () => {
        for (const item of allItems) {
            const line = payload.split('\n').find(l => l.startsWith(`${item.code} |`));
            expect(line, `no line for ${item.code}`).toBeDefined();
            const description = item.description.slice(0, 90).trim();
            expect(line).toContain(description);
        }
    });
    it('keeps dietary tags, which is what makes an allergy answerable', () => {
        const prawnCocktail = RESTAURANT_DATA.menu.categories
            .flatMap(c => itemsOf(c))
            .find(i => (i.tags ?? []).includes('V'));
        expect(prawnCocktail, 'fixture should include a vegetarian dish').toBeDefined();
        const line = payload.split('\n').find(l => l.startsWith(`${prawnCocktail!.code} |`));
        expect(line).toContain('V');
    });

    it('drops only what the model cannot act on', () => {
        // Image URLs are the single largest waste; the model cannot fetch them.
        expect(payload).not.toContain('images.unsplash.com');
        // `currency` is "BDT" on every row while the header already declares the unit.
        expect(payload).not.toContain('BDT');
    });

    it('never leaves an empty field as a bare separator', () => {
        for (const line of payload.split('\n')) {
            if (line.startsWith('#') || !line.trim()) continue;
            expect(line).not.toMatch(/\|\s*\|\s*$/);
        }
    });

    it('documents the tag legend, including the ones that carry allergy risk', () => {
        const legend = buildMenuLegend();
        // "N" is contains nuts and "D" is contains dairy — guessing either is a real hazard.
        expect(legend).toContain('N=Contains Nuts');
        expect(legend).toContain('D=Contains Dairy');
        expect(legend).toContain('V=Vegetarian');
    });

    it('caches the serialised payload per instance', () => {
        expect(getMenuPayload()).toBe(getMenuPayload());
        expect(getMenuPayload()).toBe(payload);
    });
});
