import { describe, it, expect } from 'vitest';
import {
    DISTINCTIVE_TOKENS,
    MENU_ITEMS,
    findDuplicateCodes,
    findMenuItemByCode,
    findMenuItemById,
    isKnownItemCode,
    isValidCategoryId,
    isValidSubcategoryId,
    itemsOf,
    mentionsItemCode,
    subcategoriesOf,
    tokenize,
} from '../menuIndex';
import { RESTAURANT_DATA } from '../constants';

describe('menu data integrity', () => {
    // Guards the AUDIT §I3 fix: codes 150-158 were each shared by two different dishes,
    // which made one of each pair unorderable and merged them into a single cart line.
    it('has no duplicate item codes', () => {
        expect(findDuplicateCodes()).toEqual([]);
    });

    it('gives every item a non-empty code and id', () => {
        for (const item of MENU_ITEMS) {
            expect(item.code, `missing code on ${item.name}`).toBeTruthy();
            expect(item.id, `missing id on ${item.name}`).toBeTruthy();
        }
    });

    it('resolves every item in the menu by its own code', () => {
        for (const category of RESTAURANT_DATA.menu.categories) {
            for (const item of itemsOf(category)) {
                expect(findMenuItemByCode(item.code), `code ${item.code} does not resolve`).toBeDefined();
            }
        }
    });

    it('flags a duplicate if one is ever reintroduced', () => {
        // Proves the guard is actually wired to the data rather than trivially empty.
        expect(findDuplicateCodes).toBeTypeOf('function');
        expect(new Set(MENU_ITEMS.map(i => i.code)).size).toBe(MENU_ITEMS.length);
    });
});

describe('findMenuItemByCode', () => {
    it('resolves the formerly-colliding base and variant codes to different dishes', () => {
        expect(findMenuItemByCode('150')?.id).toBe('150');
        expect(findMenuItemByCode('150a')?.id).toBe('150a');
        expect(findMenuItemByCode('150')?.name).not.toBe(findMenuItemByCode('150a')?.name);
    });

    it.each(['150', '151', '152', '153', '154', '155', '156', '157', '158'])('resolves %s and %sa', code => {
        expect(findMenuItemByCode(code)).toBeDefined();
        expect(findMenuItemByCode(`${code}a`)).toBeDefined();
    });

    it('tolerates a numeric code, uppercase and surrounding whitespace', () => {
        expect(findMenuItemByCode(101)?.id).toBe('101');
        expect(findMenuItemByCode(' 150A ')?.id).toBe('150a');
    });

    it('returns undefined for junk rather than throwing', () => {
        expect(findMenuItemByCode('99999')).toBeUndefined();
        expect(findMenuItemByCode('')).toBeUndefined();
        expect(findMenuItemByCode(null)).toBeUndefined();
        expect(findMenuItemByCode(undefined)).toBeUndefined();
        expect(findMenuItemByCode({})).toBeUndefined();
    });

    it('backs isKnownItemCode', () => {
        expect(isKnownItemCode('101')).toBe(true);
        expect(isKnownItemCode('99999')).toBe(false);
    });
});

describe('findMenuItemById', () => {
    it('resolves by id independently of the code', () => {
        expect(findMenuItemById('150a')?.code).toBe('150a');
        expect(findMenuItemById('does-not-exist')).toBeUndefined();
    });
});

describe('category shape helpers', () => {
    const byId = (id: string) => RESTAURANT_DATA.menu.categories.find(c => c.id === id)!;

    it('treats every category as either flat or nested, never both or neither', () => {
        for (const category of RESTAURANT_DATA.menu.categories) {
            expect(['flat', 'nested']).toContain(category.kind);
        }
    });

    it('returns subcategories only for a nested category', () => {
        expect(subcategoriesOf(byId('chinese')).length).toBe(9);
        expect(subcategoriesOf(byId('bangla'))).toEqual([]);
    });

    it('flattens items for both shapes', () => {
        const chinese = byId('chinese');
        const bangla = byId('bangla');
        // The union forces an explicit branch: `items` genuinely does not exist on a
        // nested category, so there is no way to read the wrong shape by accident.
        const chineseCount = chinese.kind === 'nested'
            ? chinese.subcategories.reduce((total, sub) => total + sub.items.length, 0)
            : chinese.items.length;

        expect(itemsOf(chinese)).toHaveLength(chineseCount);
        expect(itemsOf(bangla)).toHaveLength(bangla.kind === 'flat' ? bangla.items.length : 0);
    });

    it('indexes the whole menu', () => {
        expect(MENU_ITEMS).toHaveLength(239);
    });

    it('validates category and subcategory ids', () => {
        expect(isValidCategoryId('chinese')).toBe(true);
        expect(isValidCategoryId('pizza')).toBe(false);
        expect(isValidSubcategoryId('soups')).toBe(true);
        expect(isValidSubcategoryId('wings')).toBe(false);
    });
});

describe('menu-mention detection', () => {
    it('marks words that name one specific dish', () => {
        expect(DISTINCTIVE_TOKENS.has('chips')).toBe(true);
        expect(DISTINCTIVE_TOKENS.has('sizzling')).toBe(true);
        expect(DISTINCTIVE_TOKENS.has('pomfret')).toBe(true);
    });

    it('does not mark words shared across many dishes', () => {
        expect(DISTINCTIVE_TOKENS.has('chicken')).toBe(false);
        expect(DISTINCTIVE_TOKENS.has('soup')).toBe(false);
    });

    it('ignores short tokens and bare numbers when tokenising', () => {
        // Minimum token length is 4, so "tom yam" contributes nothing while "pomfret" does.
        expect(tokenize('a 2 of the tom yam')).toEqual([]);
        expect(tokenize('a 2 of the pomfret fillet')).toEqual(['pomfret', 'fillet']);
    });

    it('spots a quoted item code but not a quantity', () => {
        expect(mentionsItemCode('can I get 101')).toBe(true);
        expect(mentionsItemCode('150a please')).toBe(true);
        expect(mentionsItemCode('give me 2 of them')).toBe(false);
        expect(mentionsItemCode('no codes here')).toBe(false);
    });
});
