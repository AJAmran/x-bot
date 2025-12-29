/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatMessage, Order } from './types';

const CHAT_KEY = 'fourseason_chat_v1';
const ORDER_KEY = 'fourseason_order_draft';

export const StorageService = {
  saveChatSession: (messages: ChatMessage[]) => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save chat', e);
    }
  },

  loadChatSession: (): ChatMessage[] => {
    try {
      const data = localStorage.getItem(CHAT_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects
      return parsed.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      }));
    } catch (e) {
      console.error('Failed to load chat', e);
      return [];
    }
  },

  saveOrderDraft: (order: Order) => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } catch (e) {
      console.error('Failed to save order draft', e);
    }
  },

  loadOrderDraft: (): Order | null => {
    try {
      const data = localStorage.getItem(ORDER_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date()
      };
    } catch (e) {
      console.error('Failed to load order draft', e);
      return null;
    }
  },

  clearOrderDraft: () => {
    localStorage.removeItem(ORDER_KEY);
  },

  clearSession: () => {
    localStorage.removeItem(CHAT_KEY);
    localStorage.removeItem(ORDER_KEY);
  }
};