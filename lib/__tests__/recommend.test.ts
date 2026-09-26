import { describe, it, expect } from 'vitest';
import { suggestForCart, readDietaryRules, itemsFromPreviousOrder } from '../recommend';
import { lookupByCode, findMenuItemByCode, MENU_INDEX } from '../menuIndex';
import { createDraftOrder } from '../order';
import { MIN_ORDER_AMOUNT } from '../constants';
import type { CartItem, CustomerInfo, Order } from '../types';

const line = (code: string, quantity = 1): CartItem => {
  const item = findMenuItemByCode(code)!;
  return { id: item.id, code: item.code, name: item.name, price: item.price, quantity, total: item.price * quantity };
};

const orderWith = (items: CartItem[], customerInfo?: Partial<CustomerInfo>): Order =>
  createDraftOrder({ items, customerInfo: { name: 'Guest', phone: '01712345678', deliveryType: 'pickup', ...customerInfo } });

/** A hot main: SIZZLING BEEF, spice_level 3, in the main-dishes section. */
const SPICY_MAIN = line('192');
const DRINK = line('351');
const STARTER = line('101');
const CHEAP = line('232'); // steamed rice, ৳340

describe('readDietaryRules', () => {
  it('is empty for a guest who has told us nothing', () => {
    expect(readDietaryRules(null)).toEqual({ avoidTags: [], vegetarianOnly: false });
  });

  it('reads a stated prawn allergy into the shellfish tag', () => {
    const rules = readDietaryRules(orderWith([line('101')], { preferences: ['allergic to prawns'] }));
    expect(rules.avoidTags).toContain('S');
  });

  it('reads a stated nut allergy into the nuts tag', () => {
    const rules = readDietaryRules(orderWith([line('101')], { preferences: ['No nuts please, peanut allergy'] }));
    expect(rules.avoidTags).toContain('N');
  });

  it('reads a vegetarian preference', () => {
    expect(readDietaryRules(orderWith([], { preferences: ['vegetarian'] })).vegetarianOnly).toBe(true);
  });
});

describe('suggestForCart — restraint', () => {
  it('suggests nothing for an empty basket', () => {
    expect(suggestForCart(null)).toEqual([]);
    expect(suggestForCart(orderWith([]))).toEqual([]);
  });

  it('never suggests something already in the basket', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN, DRINK, STARTER]));
    const codes = new Set([SPICY_MAIN.code, DRINK.code, STARTER.code]);
    for (const suggestion of suggestions) {
      expect(codes.has(suggestion.code), `${suggestion.name} was already ordered`).toBe(false);
    }
  });

  it('respects the requested limit', () => {
    expect(suggestForCart(orderWith([SPICY_MAIN]), 1)).toHaveLength(1);
  });
});

describe('suggestForCart — pairing', () => {
  it('offers a cold drink alongside a spicy main', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN]));
    expect(suggestions.some(s => s.reason.includes('heat'))).toBe(true);
  });

  it('does not offer a drink when one is already ordered', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN, DRINK]));
    expect(suggestions.some(s => s.reason.includes('heat'))).toBe(false);
  });

  it('offers a starter once there is a main course', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN]));
    expect(suggestions.some(s => s.reason.includes('starter'))).toBe(true);
  });

  it('does not offer a starter when the guest already has one', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN, STARTER]));
    expect(suggestions.some(s => s.reason.includes('starter'))).toBe(false);
  });

  it('always explains itself', () => {
    for (const suggestion of suggestForCart(orderWith([SPICY_MAIN]))) {
      expect(suggestion.reason.length).toBeGreaterThan(5);
      expect(suggestion.name).toBeTruthy();
      expect(suggestion.price).toBeGreaterThan(0);
    }
  });
});

describe('suggestForCart — the free-delivery nudge', () => {
  it('is prioritised for a delivery basket under the minimum', () => {
    const suggestions = suggestForCart(orderWith([CHEAP], { deliveryType: 'delivery' }), 2);
    expect(suggestions[0]?.reason).toMatch(new RegExp(`৳${MIN_ORDER_AMOUNT - CHEAP.price} more`));
  });

  it('only offers an item the guest can actually afford towards the minimum', () => {
    const suggestions = suggestForCart(orderWith([CHEAP], { deliveryType: 'delivery' }), 1);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.price).toBeLessThanOrEqual(MIN_ORDER_AMOUNT - CHEAP.price);
  });

  it('stops nudging once the minimum is met', () => {
    const big = line('192', 2); // ৳1830
    const suggestions = suggestForCart(orderWith([big], { deliveryType: 'delivery' }));
    expect(suggestions.some(s => s.reason.includes('delivery is on us'))).toBe(false);
  });

  it('does not nudge a pickup basket — there is no delivery to save', () => {
    const suggestions = suggestForCart(orderWith([CHEAP], { deliveryType: 'pickup' }));
    expect(suggestions.some(s => s.reason.includes('delivery is on us'))).toBe(false);
  });
});

describe('suggestForCart — dietary safety', () => {
  it('never suggests a prawn dish to a guest who said they are allergic', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN], { preferences: ['allergic to prawns'] }));
    for (const suggestion of suggestions) {
      const item = findMenuItemByCode(suggestion.code)!;
      expect(item.tags, `${item.name} contains shellfish`).not.toContain('S');
    }
  });

  it('never suggests a nut dish to a guest with a nut allergy', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN], { preferences: ['no nuts'] }));
    for (const suggestion of suggestions) {
      expect(findMenuItemByCode(suggestion.code)!.tags).not.toContain('N');
    }
  });

  it('avoids shellfish for a vegetarian guest', () => {
    const suggestions = suggestForCart(orderWith([SPICY_MAIN], { preferences: ['vegetarian'] }));
    for (const suggestion of suggestions) {
      expect(findMenuItemByCode(suggestion.code)!.tags).not.toContain('S');
    }
  });
});

describe('itemsFromPreviousOrder', () => {
  it('returns nothing without a previous order', () => {
    expect(itemsFromPreviousOrder(null)).toEqual([]);
  });

  it('re-resolves the previous items against the current menu', () => {
    const previous = orderWith([SPICY_MAIN, CHEAP]);
    expect(itemsFromPreviousOrder(previous).map(item => item.code).sort()).toEqual(['192', '232']);
  });

  it('drops items that are no longer on the menu', () => {
    // Built literally: a code that is not on the menu any more.
    const retired: CartItem = { id: 'old-1', code: '999', name: 'RETIRED DISH', price: 500, quantity: 1, total: 500 };
    const stale = orderWith([line('192'), retired]);
    expect(itemsFromPreviousOrder(stale).map(item => item.code)).toEqual(['192']);
  });
});

describe('menu index locations', () => {
  it('knows which section an item belongs to', () => {
    expect(lookupByCode('101')).toMatchObject({ categoryId: 'chinese', subcategoryId: 'appetizers' });
    expect(lookupByCode('192')).toMatchObject({ categoryId: 'chinese', subcategoryId: 'main-dishes' });
    expect(lookupByCode('351')).toMatchObject({ categoryId: 'beverages' });
    expect(lookupByCode('232')).toMatchObject({ categoryId: 'chinese', subcategoryId: 'rice-noodles' });
  });

  it('indexes every item exactly once', () => {
    const codes = MENU_INDEX.map(entry => entry.item.code);
    expect(codes.length).toBe(239);
    expect(new Set(codes).size).toBe(239);
  });
});
