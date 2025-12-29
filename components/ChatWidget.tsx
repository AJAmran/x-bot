/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Bot, Menu, ShoppingBag, Send, MessageSquare, X, Mic, MicOff, Clock as ClockIcon, Phone, Utensils } from 'lucide-react';
import dynamic from 'next/dynamic';
import { StorageService } from '@/lib/storageService';
import { RESTAURANT_DATA } from '@/lib/constants';
import { ChatMessage as ChatMessageType, Order, OrderAction } from '@/lib/types';
import { useCart } from '@/lib/hooks/useCart';
import { useChat } from '@/lib/hooks/useChat';
import { ChatMessage } from '@/components/ChatMessage';
import { getGeminiResponse } from '@/lib/gemini';
import { ChatService } from '@/lib/chatService';

// Dynamically import heavy components
const OrderWizard = dynamic(() => import('@/components/OrderWizard').then(mod => mod.OrderWizard), {
    ssr: false,
    loading: () => <div className="flex-1 flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div></div>
});

const ToastContainer = dynamic(() => import('@/components/ToastContainer').then(mod => mod.ToastContainer), { ssr: false });

const PREDEFINED_QUESTIONS = [
    { label: 'Opening Hours', text: 'When are you open?', icon: <ClockIcon size={12} /> },
    { label: 'Contact Info', text: 'What is your address and phone number?', icon: <Phone size={12} /> },
    { label: 'Full Menu', text: 'Show me the full menu', icon: <Utensils size={12} /> },
];

interface ChatWidgetProps {
    initiallyOpen?: boolean;
    standalone?: boolean;
}

export const ChatWidget = memo(({ initiallyOpen = false, standalone = false }: ChatWidgetProps) => {
    const [isOpen, setIsOpen] = useState(initiallyOpen);
    const [activeTab, setActiveTab] = useState<'chat' | 'menu' | 'cart'>('chat');
    const [toasts, setToasts] = useState<any[]>([]);
    const [input, setInput] = useState('');

    // Menu Category Context
    const [targetCategory, setTargetCategory] = useState<string>();
    const [targetSubCategory, setTargetSubCategory] = useState<string>();

    const { currentOrder, setCurrentOrder, totalItems, resetCart, updateOrder } = useCart(null);
    const { messages, isLoading, setIsLoading, addMessage, setFullHistory, setMessages } = useChat([]);

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Voice Input Setup
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const recognition = new (window as any).webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) setInput(prev => prev ? `${prev} ${transcript}` : transcript);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleListening = () => {
        if (recognitionRef.current) {
            isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
        }
    };

    // --- Initial Load ---
    useEffect(() => {
        const loadedMessages = StorageService.loadChatSession();
        const loadedOrder = StorageService.loadOrderDraft();

        if (loadedMessages.length > 0) setMessages(loadedMessages);
        else {
            const welcome: ChatMessageType = {
                id: 'welcome',
                content: `Assalamu Alaikum! Welcome to **${RESTAURANT_DATA.restaurant.name}**.\n\nI am **SeasonBot**, your personal waiter. How can I help you today?`,
                sender: 'ai',
                timestamp: new Date(),
                type: 'text'
            };
            setFullHistory([welcome]);
        }

        if (loadedOrder) setCurrentOrder(loadedOrder);
    }, [setCurrentOrder, setFullHistory, setMessages]);

    const showToast = useCallback((message: string, type: any = 'success') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    const processOrderAction = useCallback(async (action: OrderAction) => {
        if (action.action === 'browse_menu') {
            setTargetCategory(action.category_id);
            setTargetSubCategory(action.subcategory_id);
            setActiveTab('menu');
            return;
        }

        if (action.action === 'checkout') {
            setActiveTab('cart');
            return;
        }

        if (action.action === 'add' && action.items) {
            const newItems = [...(currentOrder?.items || [])];
            const addedNames: string[] = [];

            action.items.forEach(orderItem => {
                let menuItem: any = null;
                RESTAURANT_DATA.menu.categories.forEach(cat => {
                    if (cat.items) {
                        const found = cat.items.find(i => i.code === orderItem.item_code);
                        if (found) menuItem = found;
                    }
                    if (!menuItem && cat.subcategories) {
                        cat.subcategories.forEach(sub => {
                            const found = sub.items.find(i => i.code === orderItem.item_code);
                            if (found) menuItem = found;
                        });
                    }
                });

                if (menuItem) {
                    const existing = newItems.find(i => i.code === orderItem.item_code);
                    if (existing) {
                        existing.quantity += orderItem.quantity;
                        existing.total = existing.quantity * existing.price;
                    } else {
                        newItems.push({
                            id: menuItem.id,
                            code: menuItem.code,
                            name: menuItem.name,
                            price: menuItem.price,
                            quantity: orderItem.quantity,
                            total: menuItem.price * orderItem.quantity,
                            specialInstructions: orderItem.notes
                        });
                    }
                    addedNames.push(menuItem.name);
                }
            });

            if (newItems.length > 0) {
                updateOrder({ ...currentOrder!, items: newItems });
                if (addedNames.length > 0) {
                    showToast(`Added: ${addedNames.join(', ')}`, 'success');
                }
            }
        }

        if (action.action === 'update_info' && action.customer_details) {
            updateOrder({
                ...currentOrder!,
                customerInfo: {
                    ...currentOrder?.customerInfo,
                    name: action.customer_details.name || currentOrder?.customerInfo?.name || '',
                    phone: action.customer_details.phone || currentOrder?.customerInfo?.phone || '',
                    address: action.customer_details.address || currentOrder?.customerInfo?.address || '',
                    deliveryType: action.customer_details.delivery_type as any || currentOrder?.customerInfo?.deliveryType || 'pickup',
                    preferredTime: action.customer_details.preferred_time || currentOrder?.customerInfo?.preferredTime || '',
                    locationVerified: !!action.customer_details.address,
                }
            } as Order);
        }

        if (action.action === 'confirm') {
            if (currentOrder && currentOrder.items.length > 0) {
                const finishedOrder = { ...currentOrder, status: 'confirmed' as const, id: `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}` };
                addMessage({
                    id: Date.now().toString(),
                    content: `Order Success! Your Order ID is **${finishedOrder.id}**. Total: ৳${finishedOrder.total}`,
                    sender: 'ai',
                    timestamp: new Date(),
                    type: 'order_update',
                    metadata: { orderId: finishedOrder.id }
                });
                resetCart();
                setActiveTab('chat');
                showToast("Order placed successfully!", 'success');
            }
        }
    }, [currentOrder, updateOrder, showToast, addMessage, resetCart]);

    const handleSend = async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMsg: ChatMessageType = {
            id: Date.now().toString(),
            content: text,
            sender: 'user',
            timestamp: new Date(),
            type: 'text'
        };

        addMessage(userMsg);
        setInput('');
        setIsLoading(true);

        try {
            const localRes = ChatService.checkStaticIntent(text);
            if (localRes) {
                addMessage({
                    id: (Date.now() + 1).toString(),
                    content: localRes.text,
                    sender: 'ai',
                    timestamp: new Date(),
                    type: 'text'
                });
                if (localRes.orderAction) processOrderAction(localRes.orderAction);
                setIsLoading(false);
                return;
            }

            const response = await getGeminiResponse([...messages, userMsg], currentOrder);
            addMessage({
                id: (Date.now() + 1).toString(),
                content: response.text,
                sender: 'ai',
                timestamp: new Date(),
                type: 'text'
            });
            if (response.orderAction) processOrderAction(response.orderAction);
        } catch (err) {
            console.error(err);
            showToast("Connection issue", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const finalizeOrder = (order: Order) => {
        addMessage({
            id: Date.now().toString(),
            content: `Order Confirmed! ID: **${order.id}**`,
            sender: 'ai',
            timestamp: new Date(),
            type: 'order_update',
            metadata: { orderId: order.id }
        });
        resetCart();
        setActiveTab('chat');
    };

    const containerClasses = standalone
        ? "w-full h-full flex flex-col bg-white"
        : "fixed inset-0 md:inset-auto md:bottom-24 md:right-8 w-full md:w-[420px] md:h-[720px] md:max-h-[calc(100vh-120px)] bg-white flex flex-col shadow-2xl md:rounded-[2.5rem] overflow-hidden border border-slate-200/50 z-50 animate-slide-up ring-8 ring-slate-900/[0.02]";

    return (
        <>
            {!standalone && !isOpen && (
                <div className="fixed bottom-6 right-6 z-[60]">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center text-white shadow-[0_8px_32px_rgba(234,88,12,0.4)] hover:scale-110 active:scale-95 transition-all duration-300 group relative"
                    >
                        <div className="absolute inset-0 rounded-full bg-brand-500 animate-ping opacity-20"></div>
                        <MessageSquare size={28} fill="currentColor" className="group-hover:rotate-12 transition-transform" />
                        <div className="absolute top-0 right-0 w-5 h-5 bg-slate-900 border-4 border-white rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse"></div>
                        </div>
                    </button>
                </div>
            )}

            {(isOpen || standalone) && (
                <main className={containerClasses}>
                    <ToastContainer toasts={toasts} removeToast={(id) => setToasts(t => t.filter(x => x.id !== id))} />

                    <header className={`bg-white/95 backdrop-blur-2xl px-6 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 z-20 ${standalone ? '' : ''}`}>
                        <div className="flex items-center gap-3.5">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-brand-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div className="relative w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl transform transition-transform group-hover:rotate-6">
                                    <Bot size={24} strokeWidth={2.5} />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="font-black text-[15px] text-slate-900 tracking-[0.05em] uppercase leading-none">Four Season</h1>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-pulse"></div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Now</span>
                                </div>
                            </div>
                        </div>
                        {!standalone && (
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-10 h-10 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all flex items-center justify-center border border-slate-100/50"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </header>

                    <div className="flex-1 relative overflow-hidden flex flex-col bg-slate-50/50">
                        {activeTab === 'chat' && (
                            <div className="flex-1 flex flex-col h-full">
                                <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2 custom-scrollbar no-scrollbar flex flex-col-reverse">
                                    <div className="flex flex-col">
                                        {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                                        {isLoading && (
                                            <div className="flex gap-4 px-6 py-4 animate-pulse">
                                                <div className="w-9 h-9 rounded-2xl bg-slate-100 border border-slate-200"></div>
                                                <div className="bg-slate-100 h-12 w-32 rounded-3xl rounded-tl-none"></div>
                                            </div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </div>

                                <div className="p-4 bg-white/50 backdrop-blur-lg border-t border-slate-100 relative z-20">
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-1 px-1 w-full">
                                        {PREDEFINED_QUESTIONS.map((q, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => handleSend(q.text)}
                                                className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-full text-[10px] font-black text-slate-500 whitespace-nowrap hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-all active:scale-95 uppercase tracking-widest"
                                            >
                                                <span className="opacity-70 text-brand-500">{q.icon}</span>
                                                {q.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative group">
                                        <div className="relative flex-1 shadow-premium rounded-[2rem] bg-white border border-slate-100 transition-all focus-within:ring-4 focus-within:ring-brand-500/10 flex items-center overflow-hidden">
                                            <input
                                                type="text"
                                                value={input}
                                                onChange={(e) => setInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                                                placeholder="Ask SeasonBot anything..."
                                                className="w-full bg-transparent border-none pl-6 pr-24 py-5 text-sm font-bold focus:outline-none placeholder:text-slate-300"
                                            />
                                            <div className="absolute right-2 flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={toggleListening}
                                                    className={`p-3 rounded-full transition-all duration-300 ${isListening ? 'bg-red-50 text-red-500 animate-pulse' : 'text-slate-300 hover:text-brand-500 hover:bg-slate-50'}`}
                                                >
                                                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                                                </button>
                                                <button
                                                    onClick={() => handleSend(input)}
                                                    disabled={!input.trim() || isLoading}
                                                    className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-95 ${input.trim() ? 'bg-brand-600 shadow-brand-500/30' : 'bg-slate-100 text-slate-300'}`}
                                                >
                                                    <Send size={18} fill="currentColor" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'menu' && (
                            <OrderWizard
                                initialView="menu"
                                onClose={() => setActiveTab('chat')}
                                onSubmit={finalizeOrder}
                                currentOrder={currentOrder}
                                onUpdateOrder={updateOrder}
                                initialCategoryId={targetCategory}
                                initialSubCategoryId={targetSubCategory}
                                showToast={showToast}
                                isTabMode
                            />
                        )}

                        {activeTab === 'cart' && (
                            <OrderWizard
                                initialView="cart"
                                onClose={() => setActiveTab('chat')}
                                onSubmit={finalizeOrder}
                                currentOrder={currentOrder}
                                onUpdateOrder={updateOrder}
                                showToast={showToast}
                                isTabMode
                            />
                        )}
                    </div>

                    <nav className="bg-white/90 backdrop-blur-2xl border-t border-slate-100 px-8 py-5 flex items-center justify-between shrink-0 z-30">
                        <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={20} />} label="Chat" />
                        <TabButton active={activeTab === 'menu'} onClick={() => setActiveTab('menu')} icon={<Menu size={20} />} label="Menu" />
                        <TabButton active={activeTab === 'cart'} onClick={() => setActiveTab('cart')} icon={<ShoppingBag size={20} />} label="Bag" badge={totalItems} />
                    </nav>
                </main>
            )}
        </>
    );
});

ChatWidget.displayName = 'ChatWidget';

function TabButton({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: any, label: string, badge?: number }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1.5 transition-all relative ${active ? 'text-brand-600 scale-110' : 'text-slate-300 hover:text-slate-500'}`}
        >
            <div className={`p-1 transition-all ${active ? 'bg-brand-50 rounded-xl' : ''}`}>
                {icon}
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
            {badge && badge > 0 && (
                <span className="absolute -top-1 right-0 bg-slate-900 text-white text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center border-2 border-white animate-bounce-short">{badge}</span>
            )}
        </button>
    );
}
