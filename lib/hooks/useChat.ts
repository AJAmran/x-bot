'use client';

import { useState, useCallback } from 'react';
import { ChatMessage } from '../types';
import { StorageService } from '../storageService';

export function useChat(initialMessages: ChatMessage[]) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [isLoading, setIsLoading] = useState(false);

    const addMessage = useCallback((msg: ChatMessage) => {
        setMessages(prev => {
            const updated = [...prev, msg];
            StorageService.saveChatSession(updated);
            return updated;
        });
    }, []);

    const setFullHistory = useCallback((history: ChatMessage[]) => {
        setMessages(history);
        StorageService.saveChatSession(history);
    }, []);

    return {
        messages,
        setMessages, // For initial load
        isLoading,
        setIsLoading,
        addMessage,
        setFullHistory
    };
}
