import { ChatMessage, AIResponse, Order, OrderAction } from "./types";
import { RESTAURANT_DATA } from "./constants";
import { DISTINCTIVE_TOKENS, mentionsItemCode, subcategoriesOf, tokenize } from "./menuIndex";
import { findMenuItemByCode } from "./menuIndex";

/**
 * Fast local intent parser: answers navigation/contact/hours questions without calling the
 * model, which saves latency and — on a free-tier API key — quota.
 *
 * These lists used to be one flat `has(...)` per branch, which made the fast path hijack real
 * orders: "time to order the sizzling beef" matched the bare word `time` and returned opening
 * hours, and "I don't know where to start" matched `where` and returned the restaurant address.
 *
 * Three rules fix that class of bug:
 *   1. **Never answer an order with a canned reply.** The pre-filter below bails out to Gemini
 *      the moment the message looks like ordering intent or names a real dish.
 *   2. **STRONG/WEAK token pairs.** Generic words ("open", "close", "time", "call") only count
 *      when corroborated; unambiguous ones ("address", "hours") stand alone.
 *   3. **Whole-word matching for short verbs.** Substring matching made "add" fire on
 *      "address" — which silently killed the entire contact branch.
 */

/** Unambiguous ordering verbs, matched as whole words. */
const ORDER_WORDS = ['order', 'ordering', 'add', 'reserve', 'booking'];
/** Multi-word ordering phrases, matched as substrings (apostrophes are normalised first). */
const ORDER_PHRASES = ['place an order', "i'll have", 'i will have', "i'd like to order", 'i would like to order', 'give me', 'book a table', 'reserve a table'];

const CHECKOUT_STRONG = ['checkout', 'check out', 'finish', 'bill', 'payment', 'pay', 'cart', 'basket', 'bag'];
const CONTACT_STRONG = ['address', 'location', 'phone', 'contact', 'hotline', 'located', 'where are you', 'where is'];
/** WEAK tokens need corroboration before they mean anything. */
const CONTACT_WEAK = ['call', 'number'];
const CONTACT_CORROBORATOR = ['your', 'you', 'phone', 'contact', 'restaurant', 'place'];

const HOURS_STRONG = ['hour', 'hours', 'opening', 'schedule', 'timing', 'koytay', 'khola', 'bondho', 'khule', 'khulee'];
/** "open"/"close"/"time" are everyday words — they only mean hours with corroboration… */
const HOURS_WEAK = ['open', 'close', 'time'];
const HOURS_CORROBORATOR = ['what', 'when', 'today', 'tomorrow', 'now', 'till', 'until', 'still', 'currently', 'breakfast', 'lunch', 'dinner', 'serving'];
/** …or in a short question, where there is no room for an order to be hiding. */
const HOURS_SHORT_QUESTION_MAX_CHARS = 18;

const NAVIGATION_VERBS = ['show', 'open', 'list', 'menu', 'browse', 'go to', 'see', 'display', 'view', 'available', 'what do you have'];

/** Filler that carries no intent when comparing a message against a section name. */
const EQUIVALENCE_FILLER = ['please', 'show', 'me', 'the', 'a', 'an', 'food', 'dishes', 'dish', 'items', 'item', 'section', 'category', 'menu', 'pls', 'all'];

/** Curly apostrophes are normalised so "I’ll have" matches the ASCII phrases above. */
const normalize = (text: string) => ` ${text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9&']+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const wordsOf = (text: string) => text.match(/[a-z0-9']+/g) ?? [];

/**
 * Vocabulary the fast path owns. A dish name that happens to contain one of these words
 * ("ASIAN FISH BASKET", every "THAI CHINESE…" style name) must not make an ordinary
 * navigation question look like an order.
 */
const RESERVED_VOCABULARY = new Set(
    [
        ...ORDER_WORDS, ...ORDER_PHRASES, ...CHECKOUT_STRONG, ...CONTACT_STRONG, ...CONTACT_WEAK,
        ...HOURS_STRONG, ...HOURS_WEAK, ...NAVIGATION_VERBS,
            ...RESTAURANT_DATA.menu.categories.flatMap(category => [
            category.name,
            category.id,
            ...subcategoriesOf(category).flatMap(sub => [sub.name, sub.id]),
        ]),
    ].flatMap(phrase => tokenize(phrase))
);

/** True when the message names a specific dish that is not also part of our canned vocabulary. */
const referencesADish = (raw: string) =>
    tokenize(raw).some(token => DISTINCTIVE_TOKENS.has(token) && !RESERVED_VOCABULARY.has(token));

export const ChatService = {
  /**
   * Returns a canned reply only when confident, otherwise `null` so the message goes to Gemini.
   */
  checkStaticIntent: (text: string): AIResponse | null => {
    const normalizedText = normalize(text);
    const raw = normalizedText.trim();
    if (!raw) return null;

    const has = (...phrases: string[]) => phrases.some(phrase => raw.includes(phrase));
    const wordSet = new Set(wordsOf(raw));
    const hasWord = (...keywords: string[]) => keywords.some(keyword => wordSet.has(keyword));

    // 0. Ordering intent — the model can actually add items, so let it try.
    //    'i want' is deliberately absent: "I want to check out" must still reach checkout.
    if (hasWord(...ORDER_WORDS) || has(...ORDER_PHRASES)) return null;

    // 0b. The customer named a real dish or quoted a real item code. This is the reliable
    //     signal the old keyword lists never had: "fish and chips please" is an order even
    //     though it contains the subcategory name "fish".
    if (referencesADish(raw) || mentionsItemCode(raw)) return null;

    // A. Navigation to the basket
    if (has(...CHECKOUT_STRONG)) {
      return { text: "Opening your shopping bag summary. 🛒", orderAction: { action: 'checkout' } };
    }

    // B. Contact / location details
    if (has(...CONTACT_STRONG) || (has(...CONTACT_WEAK) && has(...CONTACT_CORROBORATOR))) {
      const r = RESTAURANT_DATA.restaurant;
      return { text: `📍 **${r.name}**\n${r.contact.address}\n\n📞 **Phone:** ${r.contact.phone}` };
    }

    // C. Opening hours — STRONG tokens, or WEAK ones corroborated / in a short question
    const isHoursQuery = has(...HOURS_STRONG)
      || (has(...HOURS_WEAK) && (has(...HOURS_CORROBORATOR) || raw.length <= HOURS_SHORT_QUESTION_MAX_CHARS));
    if (isHoursQuery) {
      const month = new Date().getMonth();
      const isWinter = month >= 9 || month <= 1;
      const h = isWinter ? RESTAURANT_DATA.restaurant.hours.season_oct_feb : RESTAURANT_DATA.restaurant.hours.season_mar_sep;
      const openDays = RESTAURANT_DATA.restaurant.hours.open_days;
      return {
        text: `🕰️ **Opening Hours**\n\n**Lunch:** ${h.lunch}\n**Dinner:** ${h.dinner}\n\n${openDays.length >= 7 ? 'We are open every day!' : `Open ${openDays.join(', ')}.`}`
      };
    }

    // D. Menu navigation. A section name only counts when the message asks to see it, or *is*
    //    that name — the old `raw.length < 25` heuristic turned any short sentence naming a
    //    section ("fish and chips please") into a menu jump.
    const wantsNavigation = has(...NAVIGATION_VERBS);
    const mentions = (name: string) => normalizedText.includes(` ${name.toLowerCase()} `);
    const isOnlyName = (name: string) =>
      normalizedText
        .replace(new RegExp(`\\b(${EQUIVALENCE_FILLER.join('|')})\\b`, 'g'), ' ')
        .replace(/\s+/g, ' ')
        .trim() === name.toLowerCase();

    for (const category of RESTAURANT_DATA.menu.categories) {
      // Match on the id too: people type "beverages" far more often than "Beverage & Desserts".
      const label = [category.name, category.id].find(name => mentions(name) || isOnlyName(name));
      if (label && (wantsNavigation || isOnlyName(label))) {
        return { text: `Opening the **${category.name}** collection. 📖`, orderAction: { action: 'browse_menu', category_id: category.id } };
      }
    }

    for (const category of RESTAURANT_DATA.menu.categories) {
      for (const sub of subcategoriesOf(category)) {
        const label = [sub.name, sub.id].find(name => mentions(name) || isOnlyName(name));
        if (label && (wantsNavigation || isOnlyName(label))) {
          return { text: `Opening the **${sub.name}** section for you. 📖`, orderAction: { action: 'browse_menu', category_id: category.id, subcategory_id: sub.id } };
        }
      }
    }

    // E. "show me the menu" with no section named.
    if (raw === 'menu' || raw === 'full menu' || (has('menu') && wantsNavigation)) {
      return { text: "Opening the full menu for you! 📖", orderAction: { action: 'browse_menu' } };
    }

    return null;
  },

  /**
   * Final fallback when the engine is unavailable — also the path a key-less demo takes, so
   * the widget still answers navigation questions without spending any quota.
   */
  getChatResponse: async (history: ChatMessage[]): Promise<AIResponse> => {
    const last = history[history.length - 1]?.content || "";
    const res = ChatService.checkStaticIntent(last);
    if (res) return res;

    return {
      text: "I'm not sure I understood. Would you like to see the menu?",
      orderAction: { action: 'browse_menu' }
    };
  },

  /**
   * "Same as last time" — a returning guest's most common request, and one the model cannot
   * answer on its own because the previous order lives in the browser, not in the
   * conversation. Resolved locally: deterministic, free, instant, and it works in demo mode.
   */
  isReorderRequest: (text: string): boolean => {
    const raw = text.toLowerCase().trim();
    return /\b(same as (last time|before|usual)|as (last time|before)|reorder|usual order|my usual)\b/.test(raw);
  },

  buildReorderAction: (previous: Order | null): OrderAction | null => {
    if (!previous || previous.items.length === 0) return null;

    // Skip anything that has since left the menu, and re-derive the rest from current prices.
    const items: NonNullable<OrderAction['items']> = [];
    for (const line of previous.items) {
      const menuItem = findMenuItemByCode(line.code);
      if (!menuItem || line.quantity <= 0) continue;
      items.push({
        item_code: menuItem.code,
        quantity: line.quantity,
        ...(line.specialInstructions ? { notes: line.specialInstructions } : {}),
      });
    }

    if (items.length === 0) return null;
    return { action: 'add', items };
  },
};
