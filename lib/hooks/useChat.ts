'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChatMessage } from '../types';
import { StorageService } from '../storageService';

export function useChat(initialMessages: ChatMessage[]) {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [isLoading, setIsLoading] = useState(false);

    // Persist as an effect, not inside the updater: React state updaters must stay pure
    // (they may be invoked more than once) and writing to localStorage during render-commit
    // is unsafe under concurrent rendering.
    useEffect(() => {
        StorageService.saveChatSession(messages);
    }, [messages]);

    const addMessage = useCallback((msg: ChatMessage) => {
        setMessages(prev => [...prev, msg]);
    }, []);

    const setFullHistory = useCallback((history: ChatMessage[]) => {
        setMessages(history);
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
