import { ChatMessage, AIResponse, Order, OrderAction } from "./types";
import { RESTAURANT_DATA } from "./constants";
import { DISTINCTIVE_TOKENS, mentionsItemCode, subcategoriesOf, tokenize } from "./menuIndex";
import { findMenuItemByCode } from "./menuIndex";

/**
 * Fast local intent parser: answers navigation, contact and hours questions without calling the
 * model, which saves latency and, on a free-tier key, quota.
 *
 * The risk with a fast path is that it hijacks real orders, so:
 *   1. anything that looks like ordering intent, or names a dish we sell, is handed to Gemini;
 *   2. generic words ("open", "close", "time", "call") only count when corroborated, while
 *      unambiguous ones ("address", "hours") stand alone;
 *   3. short verbs are matched as whole words, because substring matching made "add" fire on
 *      "address" and killed the contact branch.
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

const NAVIGATION_VERBS = ['show', 'open', 'list', 'menu', 'browse', 'go to', 'see', 'display', 'view', 'available', 'what do you have', 'do you have', 'do you serve'];

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
     * Places the order with the server, which prices it from its own copy of the menu and
     * re-checks every rule before the kitchen is told anything.
     *
     * The server returns the order it will actually cook, which can differ from the one sent: a
     * dish code we do not sell is dropped and a tampered price is replaced. The caller adopts that
     * order so the guest's basket, receipt and kitchen ticket all agree.
     */
    placeOrder: async (order: Order): Promise<{ placed: boolean; order?: Order; reason?: string }> => {
        try {
            const reply = await fetch('/api/place-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order }),
            });
            const payload: unknown = await reply.json().catch(() => null);
            const result = (typeof payload === 'object' && payload !== null ? payload : {}) as {
                order?: unknown; error?: unknown; detail?: unknown;
            };

            const canonical = result.order;
            if (reply.ok && canonical && typeof canonical === 'object') {
                return { placed: true, order: canonical as Order };
            }
            return {
                placed: false,
                reason: typeof result.detail === 'string'
                    ? result.detail
                    : typeof result.error === 'string' ? result.error : `http_${reply.status}`,
            };
        } catch {
            return { placed: false, reason: 'unreachable' };
        }
    },


    /**
     * Asks the conversational waiter for a reply.
     *
     * A plain fetch rather than a direct call into lib/engine: the engine holds the Gemini SDK
     * and the API key, and importing it here would pass `apiKey: undefined` to the browser.
     *
     * The body is read even on a non-2xx status, because the engine reports rate limits and
     * upstream failures as a normal reply carrying `meta.error` plus user-facing copy. Throwing
     * those away would replace a real message from the waiter with a generic toast.
     */

  askWaiter: async (history: ChatMessage[], order: Order | null): Promise<AIResponse> => {
    const reply = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, order }),
    });

    const payload: unknown = await reply.json().catch(() => null);

    if (typeof payload !== 'object' || payload === null || typeof (payload as AIResponse).text !== 'string') {
      // No usable body: a proxy error page, an offline failure, or a rejected request.
      throw new Error(`Waiter unavailable (${reply.status})`);
    }

    return payload as AIResponse;
  },

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

    // 0b. The customer named a dish we sell or quoted an item code. "Fish and chips please" is an
    //     order even though it contains the subcategory name "fish".
    if (referencesADish(raw) || mentionsItemCode(raw)) return null;

    // A. Navigation to the basket
    if (has(...CHECKOUT_STRONG)) {
      return { text: "Here is your basket summary.", orderAction: { action: 'checkout' } };
    }

    // B. Contact / location details
    if (has(...CONTACT_STRONG) || (has(...CONTACT_WEAK) && has(...CONTACT_CORROBORATOR))) {
      const r = RESTAURANT_DATA.restaurant;
      return { text: `**${r.name}**\n${r.contact.address}\n\n**Phone:** ${r.contact.phone}` };
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
        text: `**Opening Hours**\n\n**Lunch:** ${h.lunch}\n**Dinner:** ${h.dinner}\n\n${openDays.length >= 7 ? 'We are open every day!' : `Open ${openDays.join(', ')}.`}`
      };
    }

    // D. Menu navigation. A section name counts only when the message asks to see it or is that
    //    name, so "fish and chips please" does not become a menu jump.

    const wantsNavigation = has(...NAVIGATION_VERBS);

    /**
     * Section names are matched on word boundaries, and a guest pluralises them: "soups" for
     * "Soup", "appetizers" for "Appetizer & Starter". A trailing "es" is dropped too, which is
     * the ordinary plural of a word already ending in "r".
     */
    const singularise = (word: string) => word.replace(/e?s$/, '');
    const mentions = (name: string) => {
        const target = name.toLowerCase();
        if (normalizedText.includes(` ${target} `)) return true;
        // "soup" should match "soups", so compare the guest's words in singular form too.
        return wordsOf(normalizedText).some(word => singularise(word) === singularise(target));
    };
    const isOnlyName = (name: string) => {
        const target = name.toLowerCase();
        const stripped = normalizedText
            .replace(new RegExp(`\\b(${EQUIVALENCE_FILLER.join('|')})\\b`, 'g'), ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (stripped === target) return true;
        // Everything the guest said reduces to this one section name, plurals aside.
        const guest = wordsOf(stripped);
        return guest.length > 0 && guest.every(word => singularise(word) === singularise(target));
    };

    for (const category of RESTAURANT_DATA.menu.categories) {
      // Match on the id too: people type "beverages" far more often than "Beverage & Desserts".
      const label = [category.name, category.id].find(name => mentions(name) || isOnlyName(name));
      if (label && (wantsNavigation || isOnlyName(label))) {
        return { text: `Here is the **${category.name}** collection for you.`, orderAction: { action: 'browse_menu', category_id: category.id } };
      }
    }

    for (const category of RESTAURANT_DATA.menu.categories) {
      for (const sub of subcategoriesOf(category)) {
        const label = [sub.name, sub.id].find(name => mentions(name) || isOnlyName(name));
        if (label && (wantsNavigation || isOnlyName(label))) {
          return { text: `Here is the **${sub.name}** section for you.`, orderAction: { action: 'browse_menu', category_id: category.id, subcategory_id: sub.id } };
        }
      }
    }

    // E. "show me the menu" with no section named.
    if (raw === 'menu' || raw === 'full menu' || (has('menu') && wantsNavigation)) {
      return { text: "Here is our full menu.", orderAction: { action: 'browse_menu' } };
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
