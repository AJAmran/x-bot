import { describe, it, expect } from 'vitest';
import { parseManageOrderArgs } from '../toolArgs';

/**
 * Every case here is something a language model can plausibly emit. The parser is the trust
 * boundary between the model and the cart, so these assertions are the security tests.
 */
describe('parseManageOrderArgs — unusable payloads', () => {
    it.each([
        ['a string', 'add two soups'],
        ['null', null],
        ['undefined', undefined],
        ['a number', 42],
        ['an array', [{ action: 'add' }]],
        ['an object with no action', { items: [] }],
        ['an unknown verb', { action: 'delete_everything' }],
        ['a non-string action', { action: 7 }],
    ])('returns no action for %s', (_label, args) => {
        const parsed = parseManageOrderArgs(args);
        expect(parsed.action).toBeUndefined();
    });

    it('never throws, whatever it is handed', () => {
        const nasty = [[[[[1]]]], { action: { toString: () => 'add' } }, { action: 'add', items: { 0: null, length: 1 } }];
        for (const args of nasty) {
            expect(() => parseManageOrderArgs(args)).not.toThrow();
        }
    });
});

describe('parseManageOrderArgs — quantity clamping', () => {
    it('turns a non-positive or missing quantity into 1 on add', () => {
        for (const quantity of [-5, 0, 0.4, undefined, null, 'two']) {
            const parsed = parseManageOrderArgs({ action: 'add', items: [{ item_code: '101', quantity }] });
            expect(parsed.action?.items).toEqual([{ item_code: '101', quantity: 1 }]);
        }
    });

    it('caps an absurd quantity and tells the customer it did', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: [{ item_code: '101', quantity: 99999 }] });
        expect(parsed.action?.items?.[0]?.quantity).toBe(99);
        expect(parsed.clampedQuantity).toBe(true);
        expect(parsed.notices.join(' ')).toMatch(/only take 99/);
    });

    it('truncates a fractional quantity', () => {
        expect(parseManageOrderArgs({ action: 'add', items: [{ item_code: '101', quantity: 2.9 }] }).action?.items?.[0]?.quantity).toBe(2);
    });

    it('keeps a valid quantity and its notes untouched', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: [{ item_code: '101', quantity: 2, notes: '  Less spicy  ' }] });
        expect(parsed.action?.items).toEqual([{ item_code: '101', quantity: 2, notes: 'Less spicy' }]);
    });
});

describe('parseManageOrderArgs — item codes', () => {
    it('drops an invented code but keeps the valid items alongside it', () => {
        const parsed = parseManageOrderArgs({
            action: 'add',
            items: [{ item_code: '101', quantity: 1 }, { item_code: '99999', quantity: 3 }],
        });
        expect(parsed.action?.items).toEqual([{ item_code: '101', quantity: 1 }]);
        expect(parsed.unknownItemCodes).toEqual(['99999']);
        expect(parsed.notices.join(' ')).toMatch(/couldn't find "99999"/);
    });

    it('accepts a code sent as a number, uppercase, or padded with spaces', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: [{ item_code: 101, quantity: 1 }, { item_code: ' 150A ', quantity: 1 }] });
        expect(parsed.unknownItemCodes).toEqual([]);
        expect(parsed.action?.items?.map(i => i.item_code)).toEqual(['101', '150a']);
    });

    it('resolves formerly-colliding variant codes', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: [{ item_code: '150a', quantity: 1 }] });
        expect(parsed.action?.items).toEqual([{ item_code: '150a', quantity: 1 }]);
    });

    it('skips malformed entries but keeps the good ones', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: [null, 5, 'x', { item_code: '101', quantity: 1 }] });
        expect(parsed.action?.items).toEqual([{ item_code: '101', quantity: 1 }]);
    });

    it('returns no items when the payload is not an array', () => {
        expect(parseManageOrderArgs({ action: 'add', items: 'two soups' }).action?.items).toEqual([]);
    });

    it('bounds how much work one turn can ask for', () => {
        const parsed = parseManageOrderArgs({ action: 'add', items: Array.from({ length: 200 }, () => ({ item_code: '101', quantity: 1 })) });
        expect(parsed.action?.items?.length).toBe(25);
    });
});

describe('parseManageOrderArgs — remove semantics', () => {
    it('treats a missing or zero quantity as "remove the whole line"', () => {
        expect(parseManageOrderArgs({ action: 'remove', items: [{ item_code: '101' }] }).action?.items).toEqual([{ item_code: '101', quantity: 0 }]);
        expect(parseManageOrderArgs({ action: 'remove', items: [{ item_code: '101', quantity: 0 }] }).action?.items).toEqual([{ item_code: '101', quantity: 0 }]);
    });

    it('keeps a positive quantity so the caller can decrement', () => {
        expect(parseManageOrderArgs({ action: 'remove', items: [{ item_code: '101', quantity: 2 }] }).action?.items).toEqual([{ item_code: '101', quantity: 2 }]);
    });

    it('reports a code that is not on the menu instead of pretending to remove it', () => {
        const parsed = parseManageOrderArgs({ action: 'remove', items: [{ item_code: '00000' }] });
        expect(parsed.unknownItemCodes).toEqual(['00000']);
        expect(parsed.action?.items).toEqual([]);
    });
});

describe('parseManageOrderArgs — set_quantity ("make it three, not two")', () => {
    it('passes an absolute quantity through, not a delta', () => {
        expect(parseManageOrderArgs({ action: 'set_quantity', items: [{ item_code: '101', quantity: 3 }] }).action?.items)
            .toEqual([{ item_code: '101', quantity: 3 }]);
    });

    it('allows zero, which is how a guest asks to drop a line', () => {
        expect(parseManageOrderArgs({ action: 'set_quantity', items: [{ item_code: '101', quantity: 0 }] }).action?.items)
            .toEqual([{ item_code: '101', quantity: 0 }]);
    });

    it('drops an entry with no usable quantity rather than guessing', () => {
        expect(parseManageOrderArgs({ action: 'set_quantity', items: [{ item_code: '101' }] }).action?.items).toEqual([]);
    });

    it('never allows a negative quantity', () => {
        expect(parseManageOrderArgs({ action: 'set_quantity', items: [{ item_code: '101', quantity: -3 }] }).action?.items).toEqual([]);
    });

    it('caps an absurd quantity and says so', () => {
        const parsed = parseManageOrderArgs({ action: 'set_quantity', items: [{ item_code: '101', quantity: 5000 }] });
        expect(parsed.action?.items?.[0]?.quantity).toBe(99);
        expect(parsed.clampedQuantity).toBe(true);
    });
});

describe('parseManageOrderArgs — set_notes ("make it spicier")', () => {
    it('keeps the note and drops the quantity', () => {
        expect(parseManageOrderArgs({ action: 'set_notes', items: [{ item_code: '101', notes: 'Extra spicy' }] }).action?.items)
            .toEqual([{ item_code: '101', notes: 'Extra spicy' }]);
    });

    it('ignores a quantity that came along for the ride', () => {
        expect(parseManageOrderArgs({ action: 'set_notes', items: [{ item_code: '101', quantity: 4, notes: 'No onions' }] }).action?.items)
            .toEqual([{ item_code: '101', notes: 'No onions' }]);
    });

    it('drops an entry with no note — there would be nothing to apply', () => {
        expect(parseManageOrderArgs({ action: 'set_notes', items: [{ item_code: '101', quantity: 2 }] }).action?.items).toEqual([]);
    });
});

describe('parseManageOrderArgs — remembered preferences', () => {
    it('captures short facts worth remembering', () => {
        const parsed = parseManageOrderArgs({
            action: 'update_info',
            customer_details: { preferences: ['allergic to peanuts', 'prefers extra spicy'] },
        });
        expect(parsed.action?.customer_details?.preferences).toEqual(['allergic to peanuts', 'prefers extra spicy']);
    });

    it('drops blanks and non-strings', () => {
        const parsed = parseManageOrderArgs({
            action: 'update_info',
            customer_details: { preferences: ['  ', 'spicy', 42, null] },
        });
        expect(parsed.action?.customer_details?.preferences).toEqual(['spicy']);
    });

    it('caps how many facts can be stored', () => {
        const many = Array.from({ length: 40 }, (_, i) => `fact number ${i}`);
        const parsed = parseManageOrderArgs({ action: 'update_info', customer_details: { preferences: many } });
        expect(parsed.action?.customer_details?.preferences).toHaveLength(8);
    });

    it('rejects preferences that are not a list', () => {
        const parsed = parseManageOrderArgs({ action: 'update_info', customer_details: { preferences: 'allergic to nuts' } });
        expect(parsed.action?.customer_details?.preferences).toBeUndefined();
    });
});

describe('parseManageOrderArgs — browse_menu', () => {
    it('keeps a valid category and subcategory', () => {
        expect(parseManageOrderArgs({ action: 'browse_menu', category_id: 'chinese', subcategory_id: 'soups' }).action).toEqual({
            action: 'browse_menu',
            category_id: 'chinese',
            subcategory_id: 'soups',
        });
    });

    it('drops an unknown category and explains, rather than rendering a blank menu', () => {
        const parsed = parseManageOrderArgs({ action: 'browse_menu', category_id: 'pizza' });
        expect(parsed.action?.category_id).toBeUndefined();
        expect(parsed.notices.join(' ')).toMatch(/don't have a "pizza" section/);
    });

    it('drops an unknown subcategory silently', () => {
        const parsed = parseManageOrderArgs({ action: 'browse_menu', category_id: 'chinese', subcategory_id: 'wings' });
        expect(parsed.action?.subcategory_id).toBeUndefined();
    });
});

describe('parseManageOrderArgs — update_info', () => {
    it('keeps the fields it recognises and trims them', () => {
        const parsed = parseManageOrderArgs({
            action: 'update_info',
            customer_details: { name: '  Ayesha ', phone: ' 01712345678 ', delivery_type: 'delivery', preferred_time: ' 7pm ' },
        });
        expect(parsed.action?.customer_details).toEqual({
            name: 'Ayesha',
            phone: '01712345678',
            delivery_type: 'delivery',
            preferred_time: '7pm',
        });
    });

    it('rejects an impossible delivery type', () => {
        const parsed = parseManageOrderArgs({ action: 'update_info', customer_details: { name: 'Ayesha', delivery_type: 'teleport' } });
        expect(parsed.action?.customer_details).toEqual({ name: 'Ayesha' });
    });

    it('omits customer_details entirely when nothing usable was sent', () => {
        expect(parseManageOrderArgs({ action: 'update_info', customer_details: { name: '   ' } }).action).toEqual({ action: 'update_info' });
        expect(parseManageOrderArgs({ action: 'update_info' }).action).toEqual({ action: 'update_info' });
    });
});

describe('parseManageOrderArgs — pass-through actions', () => {
    it.each(['checkout', 'confirm'])('passes %s through untouched', action => {
        expect(parseManageOrderArgs({ action }).action).toEqual({ action });
    });

    it('discards unknown extra properties', () => {
        expect(parseManageOrderArgs({ action: 'checkout', isAdmin: true, role: 'root' }).action).toEqual({ action: 'checkout' });
    });
});
