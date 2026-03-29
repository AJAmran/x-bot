import { ChatMessage, AIResponse } from "./types";
import { RESTAURANT_DATA } from "./constants";

export const ChatService = {
  /**
   * Fast local intent parser. Handles navigation, contact info, and simple ordering
   * without calling the core engine, saving time and API costs.
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

    // Ordering is handled by SeasonCore for better conversational flow
    return null;
  },

  /**
   * Final fallback if SeasonCore is unavailable.
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
