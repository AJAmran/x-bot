import { ChatMessage, AIResponse, MenuItem } from "./types";
import { RESTAURANT_DATA } from "./constants";

/**
 * Pre-processed list of all menu items for efficient searching.
 * Initialized once at module load.
 */
const ALL_MENU_ITEMS: MenuItem[] = (() => {
  const items: MenuItem[] = [];
  RESTAURANT_DATA.menu.categories.forEach(cat => {
    if (cat.items) items.push(...cat.items);
    if (cat.subcategories) {
      cat.subcategories.forEach(sub => items.push(...sub.items));
    }
  });
  return items;
})();

const STOP_WORDS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'may', 'might', 'must', 'me', 'my', 'i', 'we', 'you', 'it', 'this', 'that', 'show', 'give', 'want', 'need', 'add', 'please', 'full', 'dish']);

/**
 * Calculates a relevance score for a query against a target string.
 * Uses optimized string matching and word boundary checks.
 */
const calculateRelevanceScore = (query: string, target: string): number => {
  const qClean = query.toLowerCase().replace(/[^\w\s]/g, '');
  const tClean = target.toLowerCase();

  if (!qClean) return 0;

  // Exact substring match (high priority)
  if (tClean.includes(qClean)) return 5;

  const queryWords = qClean.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  if (queryWords.length === 0) return 0;

  let score = 0;
  for (const word of queryWords) {
    if (tClean === word) {
      score += 4;
    } else if (new RegExp(`\\b${word}\\b`).test(tClean)) {
      score += 2;
    } else if (tClean.includes(word) && word.length > 4) {
      score += 0.5;
    }
  }

  return score;
};

export const ChatService = {
  /**
   * Fast local intent parser. Handles navigation, contact info, and simple ordering
   * without calling the LLM, saving time and API costs.
   */
  checkStaticIntent: (text: string): AIResponse | null => {
    const raw = text.toLowerCase().trim();
    const has = (...keywords: string[]) => keywords.some(k => raw.includes(k));

    // A. Navigation
    if (has('checkout', 'finish', 'bill', 'payment', 'cart', 'bag')) {
      return { text: "Opening your shopping bag summary. 🛒", orderAction: { action: 'checkout' } };
    }

    if (has('location', 'address', 'where', 'phone', 'contact', 'call', 'number', 'hotline')) {
      const r = RESTAURANT_DATA.restaurant;
      return { text: `📍 **${r.name}**\n${r.contact.address}\n\n📞 **Phone:** ${r.contact.phone}` };
    }

    if (has('hour', 'time', 'open', 'close', 'schedule', 'koytay', 'khola', 'bondho')) {
      const isWinter = new Date().getMonth() >= 9 || new Date().getMonth() <= 1;
      const h = isWinter ? RESTAURANT_DATA.restaurant.hours.season_oct_feb : RESTAURANT_DATA.restaurant.hours.season_mar_sep;
      return { text: `🕰️ **Opening Hours**\n\n**Lunch:** ${h.lunch}\n**Dinner:** ${h.dinner}\n\nWe are open every day!` };
    }

    // Explicit Menu Request (Category/Subcategory)
    const categoryMatch = RESTAURANT_DATA.menu.categories.find(c => raw.includes(c.name.toLowerCase()));

    // Check subcategories
    let subCategoryMatch: { id: string, name: string, parentId: string } | null = null;
    for (const cat of RESTAURANT_DATA.menu.categories) {
      if (cat.subcategories) {
        const foundSub = cat.subcategories.find(sub => raw.includes(sub.name.toLowerCase()) || raw.includes(sub.id));
        if (foundSub) {
          subCategoryMatch = { id: foundSub.id, name: foundSub.name, parentId: cat.id };
          break;
        }
      }
    }

    if (subCategoryMatch && (has('show', 'open', 'list', 'menu', 'browse', 'go to', 'see') || raw.length < 25)) {
      return {
        text: `Opening the **${subCategoryMatch.name}** section for you. 📖`,
        orderAction: {
          action: 'browse_menu',
          category_id: subCategoryMatch.parentId,
          subcategory_id: subCategoryMatch.id
        }
      };
    }

    if (categoryMatch && (has('show', 'open', 'list', 'menu', 'browse', 'go to', 'see') || raw.length < 25)) {
      return {
        text: `Opening the **${categoryMatch.name}** collection. 📖`,
        orderAction: { action: 'browse_menu', category_id: categoryMatch.id }
      };
    }

    if (raw === 'menu' || raw === 'full menu' || (has('menu') && has('show', 'open', 'see', 'view', 'list', 'browse', 'start'))) {
      return { text: "Opening the full menu for you! 📖", orderAction: { action: 'browse_menu' } };
    }

    // Ordering is handled by Gemini for better conversational flow
    return null;
  },

  /**
   * Final fallback if Gemini AI is unavailable.
   */
  getChatResponse: async (history: ChatMessage[]): Promise<AIResponse> => {
    const last = history[history.length - 1]?.content || "";
    const res = ChatService.checkStaticIntent(last);
    if (res) return res;

    return {
      text: "I'm not sure I understood. Would you like to see the menu?",
      orderAction: { action: 'browse_menu' }
    };
  }
};
