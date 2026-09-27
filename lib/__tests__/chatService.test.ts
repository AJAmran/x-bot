import { describe, it, expect } from 'vitest';
import { ChatService } from '../chatService';
import { RESTAURANT_DATA } from '../constants';
import { createDraftOrder } from '../order';
import type { ChatMessage } from '../types';

const intentOf = (text: string) => ChatService.checkStaticIntent(text)?.orderAction?.action ?? null;
const actionOf = (text: string) => ChatService.checkStaticIntent(text)?.orderAction;
const replyOf = (text: string) => ChatService.checkStaticIntent(text)?.text ?? '';

describe('the fast path must never hijack an order', () => {
    // Each of these returned a confidently wrong canned answer before the boundary was fixed.
    it.each([
        ['time to order the sizzling beef', 'matched the bare word "time" and returned opening hours'],
        ["I don't know where to start", 'matched "where" and returned the restaurant address'],
        ['fish and chips please', 'matched the "fish" subcategory and opened the menu instead of adding the dish'],
        ['how much time to cook the chicken?', 'matched "time" and returned opening hours'],
        ['what time to cook the pomfret', 'matched "time" and returned opening hours'],
        ['remove the sizzling beef from my order', 'mentions "order" and would have been treated as checkout'],
        ['I want to order 2 tom yam soup', 'a real order'],
        ['add to bag', '"add" is an ordering verb, so it outranks the "bag" navigation keyword'],
    ])('defers "%s"', text => {
        expect(intentOf(text)).toBeNull();
    });

    it.each([
        'recommend something for two',
        'what is your signature dish?',
        'do you have Jain options?',
        'I am allergic to peanuts',
        'can I change the spice level?',
        'I want to place an order for delivery',
        "I'd like to order the grilled chicken",
        'add two mojitos',
        'reserve a table for 4',
        'what is the price of the lobster?',
        'hello',
        'thank you',
        '',
    ])('defers "%s" to the model', text => {
        expect(ChatService.checkStaticIntent(text)).toBeNull();
    });

    it('does not treat "I want" alone as an order — checkout must still work', () => {
        expect(intentOf('I want to check out')).toBe('checkout');
    });
});

describe('opening hours', () => {
    it.each([
        'When are you open?',
        'what time do you open',
        'opening hours',
        'are you open',
        'closing time',
        'koytay koto',
        'bondho',
        'lunch time?',
    ])('answers "%s" with the hours', text => {
        expect(replyOf(text)).toMatch(/Opening Hours/);
    });

    it('states the real lunch and dinner windows from the data', () => {
        // Asserted against the data rather than a literal, because which season is used
        // depends on the month the suite happens to run in.
        const { season_oct_feb, season_mar_sep } = RESTAURANT_DATA.restaurant.hours;
        expect(replyOf('opening hours')).toMatch(/\*\*Lunch:\*\*\s*12:00/);
        expect([season_oct_feb.dinner, season_mar_sep.dinner].some(dinner => replyOf('opening hours').includes(dinner))).toBe(true);
    });

    it('derives "open every day" from the data rather than hardcoding it', () => {
        expect(replyOf('opening hours')).toMatch(/open every day/i);
    });
});

describe('contact details', () => {
    it.each([
        'What is your address and phone number?',
        'where are you located',
        'where is the restaurant',
        'your phone number',
        'hotline?',
        'location',
    ])('answers "%s" with the address', text => {
        expect(replyOf(text)).toMatch(/Satmasjid Road/);
    });

    it('includes the phone number', () => {
        expect(replyOf('hotline?')).toMatch(/01755636264/);
    });
});

describe('basket navigation', () => {
    it.each(['I want to check out', 'show me my basket', 'final bill please', 'payment', 'my cart'])(
        'sends "%s" to the basket',
        text => {
            expect(intentOf(text)).toBe('checkout');
        }
    );
});

describe('menu navigation', () => {
    it('opens the full menu', () => {
        expect(intentOf('menu')).toBe('browse_menu');
        expect(actionOf('Show me the full menu')).toEqual({ action: 'browse_menu' });
    });

    it('opens a named category, with or without a navigation verb', () => {
        expect(actionOf('show me the chinese menu')).toEqual({ action: 'browse_menu', category_id: 'chinese' });
        expect(actionOf('chinese')).toEqual({ action: 'browse_menu', category_id: 'chinese' });
        expect(actionOf('chinese food')).toEqual({ action: 'browse_menu', category_id: 'chinese' });
    });

    it('treats "open the chinese menu" as navigation, not opening hours', () => {
        // "open" is both an hours word and a navigation word; the corroboration rule keeps
        // this on the menu side.
        expect(actionOf('open the chinese menu')).toEqual({ action: 'browse_menu', category_id: 'chinese' });
    });

    it('matches a category by id as well as display name', () => {
        expect(actionOf('what do you have in beverages')).toEqual({ action: 'browse_menu', category_id: 'beverages' });
    });

    it('opens a named subcategory', () => {
        expect(actionOf('soup')).toEqual({ action: 'browse_menu', category_id: 'chinese', subcategory_id: 'soups' });
        expect(actionOf('show me the soups')).toEqual({ action: 'browse_menu', category_id: 'chinese', subcategory_id: 'soups' });
    });

    it('scans to a subcategory section', () => {
        expect(actionOf('show me the soups')?.subcategory_id).toBe('soups');
    });
});

describe('reorder — "same as last time"', () => {
    const previous = createDraftOrder({
        items: [
            { id: '139', code: '139', name: 'THAI GRILLED CHICKEN', quantity: 2, price: 865, total: 1730 },
            { id: '232', code: '232', name: 'STEAMED RICE', quantity: 1, price: 340, total: 340, specialInstructions: 'plain' },
        ],
    });

    it.each(['same as last time', 'Same as last time', 'my usual order', 'reorder please', 'as before'])(
        'recognises "%s"',
        text => {
            expect(ChatService.isReorderRequest(text)).toBe(true);
        }
    );

    it.each(['I want the grilled chicken', 'what is on the menu?', 'add another rice'])(
        'does not mistake "%s" for a reorder',
        text => {
            expect(ChatService.isReorderRequest(text)).toBe(false);
        }
    );

    it('rebuilds the previous basket as an add action', () => {
        expect(ChatService.buildReorderAction(previous)).toEqual({
            action: 'add',
            items: [
                { item_code: '139', quantity: 2 },
                { item_code: '232', quantity: 1, notes: 'plain' },
            ],
        });
    });

    it('returns nothing without a previous order, so the model can take over', () => {
        expect(ChatService.buildReorderAction(null)).toBeNull();
    });

    it('skips a line that has left the menu', () => {
        const stale = createDraftOrder({
            items: [
                { id: '139', code: '139', name: 'THAI GRILLED CHICKEN', quantity: 1, price: 865, total: 865 },
                { id: 'x', code: '999', name: 'RETIRED', quantity: 1, price: 100, total: 100 },
            ],
        });
        expect(ChatService.buildReorderAction(stale)?.items).toEqual([{ item_code: '139', quantity: 1 }]);
    });
});

describe('getChatResponse — the key-less demo path', () => {
    const userMessage = (content: string): ChatMessage => ({
        id: 'test',
        content,
        sender: 'user',
        timestamp: new Date(),
        type: 'text',
    });

    it('still answers navigation questions with no API key configured', async () => {
        const response = await ChatService.getChatResponse([userMessage('what is your address')]);
        expect(response.text).toMatch(/Satmasjid Road/);
    });

    it('falls back to offering the menu for anything it cannot answer', async () => {
        const response = await ChatService.getChatResponse([userMessage('recommend something')]);
        expect(response.orderAction?.action).toBe('browse_menu');
    });

    it('does not throw on an empty history', async () => {
        await expect(ChatService.getChatResponse([])).resolves.toBeTruthy();
    });
});

describe('section navigation carries a usable target', () => {
    /*
     * A guest asking for "soups" was shown the whole of Chinese. The reply said "here is the
     * Soup section" while the action it returned named only a category, so the card fell back
     * to the first category and rendered salads. Both halves of the contract are asserted
     * here: the text and the action have to agree.
     */
    const soup = RESTAURANT_DATA.menu.categories
        .flatMap(c => (c.kind === 'nested' ? c.subcategories : []))
        .find(s => /soup/i.test(s.name));

    it('the data actually has a soup subcategory to ask for', () => {
        expect(soup, 'fixture assumes a Soup subcategory exists').toBeDefined();
    });

    it.each([
        ['soup', /soup/i],
        ['show me the soups please', /soup/i],
        ['what soups do you have?', /soup/i],
    ])('%s resolves to a subcategory, not just a category', (input) => {
        const res = ChatService.checkStaticIntent(input);
        expect(res, `"${input}" was not understood locally`).not.toBeNull();
        expect(res!.orderAction?.action).toBe('browse_menu');
        expect(res!.orderAction?.subcategory_id, 'subcategory_id was dropped').toBe(soup!.id);
    });

    it('promises the section it actually opens', () => {
        const res = ChatService.checkStaticIntent('soup menu');
        expect(res!.text.toLowerCase()).toContain('soup');
    });
});

describe('guest-facing copy is free of emoji', () => {
    /*
     * These strings are rendered into a business transaction, and several had picked up
     * encoding damage on the way into the file. Asserting the absence is the only way to stop
     * it creeping back in.
     */
    const prompts = [
        'soup', 'show me the menu', 'full menu', 'menu',
        'checkout', 'my bag', 'opening hours', 'where are you', 'phone number', 'call you',
    ];

    it.each(prompts)('"%s" replies without emoji', (input) => {
        const res = ChatService.checkStaticIntent(input);
        if (!res) return;
        expect(res.text, `emoji or mojibake in reply to "${input}"`).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{FFFD}]/u);
    });
});