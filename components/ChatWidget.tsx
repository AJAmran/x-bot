'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Bot, Menu, ShoppingBag, Send, MessageSquare, X, Mic, MicOff, Clock as ClockIcon, Phone, Utensils, TriangleAlert, Sparkles, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { StorageService } from '@/lib/storageService';
import { RESTAURANT_DATA } from '@/lib/constants';
import { ChatMessage as ChatMessageType, Order, OrderAction } from '@/lib/types';
import { createDraftOrder, finalizeOrder, lineTotalOf } from '@/lib/order';
import { findMenuItemByCode } from '@/lib/menuIndex';
import { suggestForCart } from '@/lib/recommend';
import { useCart } from '@/lib/hooks/useCart';
import { useChat } from '@/lib/hooks/useChat';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { ChatMessage } from '@/components/ChatMessage';
import { ToastContainer, showToast } from '@/components/ToastContainer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getLogicResponse } from '@/lib/engine';
import { ChatService } from '@/lib/chatService';
import { OPEN_WIDGET_EVENT, type WidgetTab } from '@/lib/widgetBus';

// Dynamically import heavy components
const OrderWizard = dynamic(() => import('@/components/OrderWizard').then(mod => mod.OrderWizard), {
    ssr: false,
    loading: () => <div className="flex-1 flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
});

// The toast surface is no longer lazy — shadcn's Toaster is a thin provider and firing a
// toast no longer re-renders this component.

const PREDEFINED_QUESTIONS = [
    { label: 'Opening Hours', text: 'When are you open?', icon: <ClockIcon size={12} /> },
    { label: 'Contact Info', text: 'What is your address and phone number?', icon: <Phone size={12} /> },
    { label: 'Menu', text: 'Show me the full menu', icon: <Utensils size={12} /> },
];

/** The verbs that operate on basket lines, and how to report them to the customer. */
const ITEM_VERBS = new Set<OrderAction['action']>(['add', 'remove', 'set_quantity', 'set_notes']);
const VERB_LABELS: Record<string, string> = {
    add: 'Added',
    remove: 'Removed',
    set_quantity: 'Updated',
    set_notes: 'Noted',
};

/** Merge remembered facts, case-insensitively, so the memory block cannot grow without bound. */
const mergePreferences = (existing: string[] | undefined, incoming: string[]): string[] => {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const value of [...(existing ?? []), ...incoming]) {
        const trimmed = value.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(trimmed);
    }
    return merged.slice(0, 8);
};

interface ChatWidgetProps {
    initiallyOpen?: boolean;
    standalone?: boolean;
    /**
     * Injected by the server component entry points so the key itself never reaches the
     * client. False ⇒ demo mode: no Gemini calls at all, the local intent layer answers
     * instead, and the availability banner is shown.
     */
    aiConfigured?: boolean;
}

export const ChatWidget = memo(({ initiallyOpen = false, standalone = false, aiConfigured = true }: ChatWidgetProps) => {
    const [isOpen, setIsOpen] = useState(initiallyOpen);
    const [activeTab, setActiveTab] = useState<'chat' | 'menu' | 'cart'>('chat');
    const [input, setInput] = useState('');
    // Starts pessimistic only when we know the key is missing; otherwise a single failed
    // call flips it and a later success flips it back.
    const [aiDegraded, setAiDegraded] = useState(!aiConfigured);

    // Menu Category Context
    const [targetCategory, setTargetCategory] = useState<string>();
    const [targetSubCategory, setTargetSubCategory] = useState<string>();

    const { currentOrder, setCurrentOrder, totalItems, resetCart, updateOrder } = useCart(null);
    const { messages, isLoading, setIsLoading, addMessage, setFullHistory, setMessages } = useChat([]);

    /**
     * Cart-aware suggestions, computed locally on every basket change. Zero API calls, instant,
     * and it keeps working in demo mode — see lib/recommend.ts for why this is not a prompt.
     */
    const suggestions = useMemo(() => suggestForCart(currentOrder), [currentOrder]);

    /** Most recent completed order, powering the "same as last time" quick reply. */
    const [lastOrder, setLastOrder] = useState<Order | null>(null);

    const quickReplies = useMemo(() => {
        const base = [...PREDEFINED_QUESTIONS];
        if (lastOrder) {
            base.unshift({ label: 'Same as last time', text: 'same as last time', icon: <Sparkles size={12} /> });
        }
        return base;
    }, [lastOrder]);

    const [isListening, setIsListening] = useState(false);
    // The Web Speech API is still Chromium-only, so it is feature-detected and the mic is
    // disabled with an explanation rather than being a button that silently does nothing.
    const [voiceSupported, setVoiceSupported] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const logRef = useRef<HTMLDivElement>(null);

    /**
     * Keep the newest message in view. The log is `flex-col-reverse`, which flips the scroll
     * model: scrollTop 0 is the *visual bottom* where the newest message lives, not the top.
     * Setting scrollTop = 0 is therefore "scroll to latest" here — the intuitive value
     * (scrollHeight) would jump the user to the oldest message instead.
     */
    useEffect(() => {
        const log = logRef.current;
        if (!log) return;
        log.scrollTop = 0;
    }, [messages.length, isLoading]);

    // The panel only covers the viewport below `md`, which is what decides whether focus
    // should be trapped. Uses addEventListener rather than the removed addListener.
    const [isNarrowViewport, setIsNarrowViewport] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const sync = () => setIsNarrowViewport(query.matches);
        sync();
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, []);

    // Lets the landing page's "Open the live menu" button drive the widget, without either
    // component having to become a client component or share lifted state.
    useEffect(() => {
        const onRequestOpen = (event: Event) => {
            const tab = (event as CustomEvent<WidgetTab>).detail;
            setIsOpen(true);
            if (tab === 'chat' || tab === 'menu' || tab === 'cart') setActiveTab(tab);
        };
        window.addEventListener(OPEN_WIDGET_EVENT, onRequestOpen);
        return () => window.removeEventListener(OPEN_WIDGET_EVENT, onRequestOpen);
    }, []);

    // Voice Input Setup
    useEffect(() => {
        const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
        if (!Recognition) return;

        const recognition = new Recognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = event.results[0]?.[0]?.transcript;
            if (transcript) setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        };
        recognition.onerror = () => setIsListening(false);

        recognitionRef.current = recognition;
        setVoiceSupported(true);
    }, []);

    const toggleListening = () => {
        const recognition = recognitionRef.current;
        if (!recognition) return;
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
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
                content: `Assalamu Alaikum! Welcome to **${RESTAURANT_DATA.restaurant.name}**.\n\nI am **SeasonBot**, your personal waiter. How may I assist you with your dining experience?`,
                sender: 'ai',
                timestamp: new Date(),
                type: 'text'
            };
            setFullHistory([welcome]);
        }

        if (loadedOrder) setCurrentOrder(loadedOrder);

        const history = StorageService.loadOrderHistory();
        if (history.length > 0) setLastOrder(history[0]);
    }, [setCurrentOrder, setFullHistory, setMessages]);

    // `showToast` is now a module-level helper over shadcn's global toast manager, so it is
    // stable across renders and no longer a dependency of the callbacks below.

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

        // The four item verbs share a shape. Quantities arrive already clamped and codes
        // already validated by the server (lib/toolArgs.ts), but the lookup is done again here
        // because this function is also reachable from the local intent layer.
        if (ITEM_VERBS.has(action.action) && action.items) {
            const existingItems = currentOrder?.items ?? [];
            let nextItems = [...existingItems];
            const touched: string[] = [];
            const missing: string[] = [];
            const verb = action.action;

            action.items.forEach(orderItem => {
                const menuItem = findMenuItemByCode(orderItem.item_code);
                if (!menuItem) {
                    missing.push(String(orderItem.item_code));
                    return;
                }

                const index = nextItems.findIndex(i => i.code === menuItem.code);

                // "Make it spicier" / "no onions please" — replaces the note on the line.
                if (verb === 'set_notes') {
                    if (index < 0) {
                        missing.push(menuItem.name);
                        return;
                    }
                    nextItems = nextItems.map((item, i) =>
                        i === index ? { ...item, specialInstructions: orderItem.notes } : item
                    );
                    touched.push(menuItem.name);
                    return;
                }

                // "Make it three instead of two" — an absolute value, not a delta. Zero
                // removes the line, which is how a guest asks to drop something.
                if (verb === 'set_quantity') {
                    const target = Math.max(0, Math.trunc(orderItem.quantity ?? 0));
                    if (index < 0) {
                        if (target === 0) {
                            missing.push(menuItem.name);
                            return;
                        }
                        nextItems = [
                            ...nextItems,
                            {
                                id: menuItem.id,
                                code: menuItem.code,
                                name: menuItem.name,
                                price: menuItem.price,
                                quantity: target,
                                total: lineTotalOf(menuItem.price, target),
                            },
                        ];
                    } else if (target === 0) {
                        nextItems = nextItems.filter((_, i) => i !== index);
                    } else {
                        nextItems = nextItems.map((item, i) =>
                            i === index ? { ...item, quantity: target, total: lineTotalOf(item.price, target) } : item
                        );
                    }
                    touched.push(menuItem.name);
                    return;
                }

                if (verb === 'add') {
                    const quantity = Math.max(1, Math.trunc(orderItem.quantity ?? 1));
                    if (index >= 0) {
                        // Immutable update — never mutate an object held in state.
                        nextItems = nextItems.map((item, i) => {
                            if (i !== index) return item;
                            const merged = item.quantity + quantity;
                            return { ...item, quantity: merged, total: lineTotalOf(item.price, merged) };
                        });
                    } else {
                        nextItems = [
                            ...nextItems,
                            {
                                id: menuItem.id,
                                code: menuItem.code,
                                name: menuItem.name,
                                price: menuItem.price,
                                quantity,
                                total: lineTotalOf(menuItem.price, quantity),
                                specialInstructions: orderItem.notes,
                            },
                        ];
                    }
                    touched.push(menuItem.name);
                    return;
                }

                // remove: quantity 0 (or absent) means take the whole line out.
                if (index < 0) {
                    missing.push(menuItem.name);
                    return;
                }
                const existing = nextItems[index];
                const requested = orderItem.quantity ?? 0;
                const removeAll = requested <= 0;
                if (removeAll || existing.quantity <= requested) {
                    nextItems = nextItems.filter((_, i) => i !== index);
                } else {
                    const remaining = existing.quantity - requested;
                    nextItems = nextItems.map((item, i) =>
                        i === index ? { ...item, quantity: remaining, total: lineTotalOf(item.price, remaining) } : item
                    );
                }
                touched.push(menuItem.name);
            });

            if (touched.length > 0 || nextItems.length !== existingItems.length) {
                // Never spread a possibly-null order: `{...null}` yields `{}` and used to
                // persist an Order with no id/subtotal/total, which surfaced to customers
                // as "Total: ৳undefined". Always rebuild a complete draft.
                updateOrder(createDraftOrder({
                    items: nextItems,
                    customerInfo: currentOrder?.customerInfo,
                    id: currentOrder?.id,
                    createdAt: currentOrder?.createdAt
                }));
            }

            if (touched.length > 0) {
                showToast(`${VERB_LABELS[verb]}: ${touched.join(', ')}`, 'success');
            }
            if (missing.length > 0) {
                showToast(`Not in your basket: ${missing.join(', ')}`, 'error');
            }
        }

        if (action.action === 'update_info' && action.customer_details) {
            const previous = currentOrder?.customerInfo;
            const stated = action.customer_details.preferences ?? [];
            // Security: the model may capture the customer's details, but it may NOT assert
            // that a location was verified. `locationVerified` is only ever set by the map,
            // otherwise "add my address" alone would satisfy the 5km delivery check.
            updateOrder(createDraftOrder({
                items: currentOrder?.items ?? [],
                customerInfo: {
                    ...previous,
                    name: action.customer_details.name || previous?.name || '',
                    phone: action.customer_details.phone || previous?.phone || '',
                    address: action.customer_details.address || previous?.address || '',
                    deliveryType: action.customer_details.delivery_type ?? previous?.deliveryType ?? 'pickup',
                    preferredTime: action.customer_details.preferred_time || previous?.preferredTime || '',
                    // Remembered facts accumulate rather than replace, so the waiter does not
                    // "forget" an allergy the moment the guest mentions their name.
                    preferences: mergePreferences(previous?.preferences, stated),
                    locationVerified: previous?.locationVerified ?? false,
                },
                id: currentOrder?.id,
                createdAt: currentOrder?.createdAt
            }));
        }

        if (action.action === 'confirm') {
            if (currentOrder && currentOrder.items.length > 0) {
                // finalizeOrder re-derives the totals and guarantees an order id.
                const finishedOrder = finalizeOrder(currentOrder);
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
    }, [currentOrder, updateOrder, addMessage, resetCart]);

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
            // "Same as last time" is resolved locally from the saved order history: the model
            // cannot see it, and asking Gemini to reconstruct a past basket would cost a call
            // to produce something we already know exactly.
            if (ChatService.isReorderRequest(text)) {
                const reorder = ChatService.buildReorderAction(lastOrder);
                if (reorder) {
                    addMessage({
                        id: (Date.now() + 1).toString(),
                        content: `Certainly, Sir/Ma'am — here is your usual order again from **${lastOrder?.id}**.`,
                        sender: 'ai',
                        timestamp: new Date(),
                        type: 'text'
                    });
                    processOrderAction(reorder);
                    return;
                }
            }

            // Demo mode (no API key): answer from the local intent layer and never spend a
            // request. The menu, cart, map and checkout all keep working.
            if (!aiConfigured) {
                const localRes = await ChatService.getChatResponse([...messages, userMsg]);
                addMessage({
                    id: (Date.now() + 1).toString(),
                    content: localRes.text,
                    sender: 'ai',
                    timestamp: new Date(),
                    type: 'text'
                });
                if (localRes.orderAction) processOrderAction(localRes.orderAction);
                return;
            }

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

            const response = await getLogicResponse([...messages, userMsg], currentOrder);
            addMessage({
                id: (Date.now() + 1).toString(),
                content: response.text,
                sender: 'ai',
                timestamp: new Date(),
                type: 'text'
            });
            if (response.orderAction) processOrderAction(response.orderAction);

            // Drive the availability banner from the engine's error channel.
            if (response.meta?.error) {
                setAiDegraded(true);
            } else if (response.meta?.source === 'model') {
                setAiDegraded(false);
            }
        } catch (err) {
            console.error(err);
            setAiDegraded(true);
            showToast("Connection issue", "error");
        } finally {
            setIsLoading(false);
        }
    };

    // UI callback for a completed checkout (the domain transition lives in lib/order.ts).
    const handleOrderComplete = useCallback((order: Order) => {
        addMessage({
            id: Date.now().toString(),
            content: `Order Confirmed! ID: **${order.id}**`,
            sender: 'ai',
            timestamp: new Date(),
            type: 'order_update',
            metadata: { orderId: order.id }
        });
        // Remembered so "same as last time" works on the next visit. There is no backend in
        // this project — see README "Known Limitations".
        StorageService.saveCompletedOrder(order);
        setLastOrder(order);
        resetCart();
        setActiveTab('chat');
    }, [addMessage, resetCart]);

    /*
      `@container` is load-bearing, not decoration. This panel is a fixed 420px on desktop but
      a full-screen sheet on a phone, while `sm:`/`md:` measure the *viewport* — so on a large
      screen those variants fired inside a phone-wide panel and swapped in desktop furniture
      (an inline sort/filter row, wider padding) that did not fit. Everything inside the panel
      now queries the panel's own width instead, so the compact layout holds on a phone, a
      tablet and a desktop alike, and only the full-width standalone embed grows into it.

      The shell's own `md:` variants stay viewport-based on purpose: full-screen on a phone and
      a floating panel on a desktop is a viewport decision, not a container one.
    */
    const containerClasses = standalone
        ? "@container w-full h-full flex flex-col bg-white"
        : // h-[100dvh] rather than inset-0: on mobile the browser chrome collapses and
          // expands, and 100vh/inset-0 leaves the composer under the URL bar or floating above
          // the home indicator. dvh tracks the *visible* viewport, so it is always correct.
          "@container fixed inset-0 md:inset-auto md:bottom-24 md:right-8 w-full md:w-[420px] md:h-[720px] md:max-h-[calc(100vh-120px)] bg-white flex flex-col shadow-[0_40px_90px_-30px_rgba(15,23,42,0.55)] md:rounded-[2.5rem] overflow-hidden border border-white/20 z-50 animate-slide-up ring-8 ring-slate-900/[0.06]";

    /** Escape walks back out: leave a sub-tab first, then close the widget itself. */
    const handleEscape = useCallback(() => {
        if (activeTab !== 'chat') {
            setActiveTab('chat');
            return;
        }
        if (!standalone) setIsOpen(false);
    }, [activeTab, standalone]);

    // The panel is only modal when it covers the viewport (the /embed route, or the
    // full-screen mobile layout). See lib/hooks/useFocusTrap.ts for why trapping is
    // conditional rather than always on.
    const panelRef = useFocusTrap<HTMLElement>(isOpen || standalone, {
        trap: standalone || (isOpen && isNarrowViewport),
        onEscape: handleEscape,
    });

    return (
        <>
            {/* The trigger sits above the home indicator and clear of a landscape notch. */}
            {!standalone && !isOpen && (
                <div className="fixed z-[60] bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-[calc(1.5rem+env(safe-area-inset-right,0px))]">
                    <Button
                        type="button"
                        size="icon-lg"
                        onClick={() => setIsOpen(true)}
                        aria-label="Open the SeasonBot waiter"
                        aria-expanded={isOpen}
                        aria-controls="seasonbot-panel"
                        className="group relative size-16 rounded-full bg-gradient-to-br from-primary via-primary to-emerald-400 text-primary-foreground shadow-[0_10px_34px_-6px_oklch(0.841_0.238_128.85/0.65)] hover:scale-110 active:scale-95 transition-transform"
                    >
                        {/* Decorative only: the pulse/halo carry no meaning the label lacks. */}
                        <div className="absolute -inset-1.5 rounded-full bg-primary/30 blur-md animate-ping" aria-hidden="true"></div>
                        <div className="absolute -inset-3 rounded-full bg-primary/15 blur-xl" aria-hidden="true"></div>
                        <MessageSquare className="relative size-7 transition-transform group-hover:rotate-12 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]" fill="currentColor" aria-hidden="true" />
                        <div className="absolute top-0.5 right-0.5 size-5 bg-slate-900 rounded-full flex items-center justify-center ring-[3px] ring-white shadow-sm" aria-hidden="true">
                            <div className="size-1.5 bg-primary rounded-full animate-pulse"></div>
                        </div>
                    </Button>
                </div>
            )}

            {/*
              The trigger's aria-controls points at the id on this <main>. It used to sit on the
              single hand-rolled tabpanel; now that the three tabs own their own panels, the id
              belongs to the widget shell so the disclosure relationship still resolves.
            */}
            {(isOpen || standalone) && (
                <main id="seasonbot-panel" className={containerClasses} ref={panelRef}>
                    <ToastContainer />

                    <header className="relative shrink-0 z-20 overflow-hidden border-b border-white/5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-5 py-4 flex items-center justify-between">
                        {/* Lime bloom behind the avatar, so the bot reads as the light source. */}
                        <div className="absolute -top-16 -left-10 size-44 rounded-full bg-primary/25 blur-3xl" aria-hidden="true"></div>
                        <div className="relative flex items-center gap-3.5">
                            <div className="relative shrink-0">
                                <div className="absolute inset-0 bg-primary rounded-2xl blur-lg opacity-40" aria-hidden="true"></div>
                                <div className="relative size-11 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center text-primary-foreground shadow-[0_6px_20px_-6px_oklch(0.841_0.238_128.85/0.8)] ring-1 ring-white/20">
                                    <Bot size={22} strokeWidth={2.5} aria-hidden="true" />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <h1 className="font-heading text-[15px] font-extrabold text-white tracking-[0.02em] leading-none">Four Season</h1>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_oklch(0.841_0.238_128.85)] animate-pulse" aria-hidden="true"></span>
                                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">SeasonBot · Online</span>
                                </div>
                            </div>
                        </div>
                        {!standalone && (
                            <Button
                                type="button"
                                size="icon-lg"
                                variant="ghost"
                                onClick={() => setIsOpen(false)}
                                aria-label="Close the chat"
                                className="size-10 shrink-0 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white"
                            >
                                <X className="size-5" aria-hidden="true" />
                            </Button>
                        )}
                    </header>

                    {aiDegraded && (
                        <div role="status" className="flex items-start gap-2.5 shrink-0 z-10 border-b border-amber-400/20 bg-amber-950/70 px-4 py-2.5 backdrop-blur-xl">
                            <TriangleAlert size={15} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <p className="text-[11px] font-bold text-amber-100 leading-snug">
                                AI temporarily unavailable — browsing, cart and checkout still work.
                            </p>
                        </div>
                    )}

                    {/*
                      base-ui's Tabs owns the ARIA tabs pattern end to end: roving tabindex,
                      arrow/Home/End traversal and the tab-to-panel wiring. The hand-rolled nav
                      this replaces set the roles and roving tabindex by hand but had no key
                      handling, so the three tabs were individually reachable yet not traversable.
                    */}
                    <Tabs
                        value={activeTab}
                        onValueChange={(value) => setActiveTab(value as typeof activeTab)}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <TabsContent value="chat" className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-primary/[0.07]">
                            {/*
                              Messages dissolve into the header instead of being guillotined by
                              it. Sits above the scroller (z-10) and never takes pointer events.
                            */}
                            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-slate-50 to-transparent" aria-hidden="true" />
                            <div className="flex-1 flex flex-col h-full">
                                {/*
                                  role="log" + aria-live is what makes a screen reader announce
                                  the waiter's reply. Without it a blind user has no idea the bot
                                  answered — the single most important defect for a chat product.
                                */}
                                <div
                                    role="log"
                                    aria-live="polite"
                                    aria-relevant="additions"
                                    aria-label="Conversation with SeasonBot"
                                    ref={logRef}
                                    className="flex-1 overflow-y-auto px-3.5 pt-4 pb-3 @lg:px-4 no-scrollbar overscroll-contain flex flex-col-reverse"
                                >
                                    <div className="flex flex-col gap-2">
                                        {messages.map(m => <ChatMessage key={m.id} message={m} />)}
                                        {isLoading && (
                                            /*
                                              Three dots rather than skeleton blocks: it reads as
                                              "the waiter is writing" rather than "the layout is
                                              broken", and it does not resize when the real bubble
                                              lands. aria-hidden so the live region does not
                                              announce a placeholder.
                                            */
                                            <div
                                                className="flex items-end gap-2"
                                                aria-hidden="true"
                                            >
                                                {/* Must mirror ChatMessage's avatar and bubble metrics exactly, or it pops when the real message lands. */}
                                                <div className="size-8 rounded-[1.1rem] bg-gradient-to-br from-primary to-emerald-400 flex items-center justify-center shrink-0 shadow-[0_6px_18px_-8px_oklch(0.841_0.238_128.85/0.85)]">
                                                    <Bot className="size-3.5 text-primary-foreground" strokeWidth={2.5} />
                                                </div>
                                                <div className="bg-gradient-to-br from-white to-primary/[0.06] border border-slate-200/70 rounded-[1.6rem] rounded-tl-md px-4 py-3 shadow-[0_6px_24px_-14px_rgba(15,23,42,0.35)]">
                                                    <div className="flex items-center gap-1.5">
                                                        {[0, 150, 300].map(delay => (
                                                            <span
                                                                key={delay}
                                                                className="size-2 rounded-full bg-primary animate-pulse"
                                                                style={{ animationDelay: `${delay}ms` }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>
                                </div>

                                {/* safe-b-4 keeps the composer clear of the iOS home indicator. */}
                                <div className="p-4 bg-white/80 backdrop-blur-2xl border-t border-slate-200/60 relative z-20 safe-b-4">
                                    {suggestions.length > 0 && (
                                        <div className="mb-3" aria-label="Suggestions for your order">
                                            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 mb-1.5">
                                                <Sparkles size={11} className="text-primary-ink" aria-hidden="true" />
                                                You might also like
                                            </p>
                                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                                {suggestions.map(suggestion => (
                                                    <Button
                                                        key={suggestion.code}
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => handleSend(`Add ${suggestion.name}`)}
                                                        className="group h-auto min-h-11 shrink-0 flex-col items-start gap-0.5 rounded-xl border-slate-200 bg-gradient-to-br from-white to-primary/[0.06] px-3 py-2 text-left shadow-sm hover:border-primary/40 hover:from-white hover:to-primary/10 hover:shadow-[0_8px_20px_-10px_oklch(0.841_0.238_128.85/0.5)]"
                                                    >
                                                        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-tight text-slate-900">
                                                            <Plus className="size-2.5 text-primary-ink" strokeWidth={3} aria-hidden="true" />
                                                            {suggestion.name}
                                                        </span>
                                                        <span className="block text-[10px] font-bold text-slate-600">
                                                            ৳{suggestion.price} · {suggestion.reason}
                                                        </span>
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <ScrollChips label="Quick replies">
                                        {quickReplies.map((q, idx) => (
                                            <Button
                                                key={idx}
                                                type="button"
                                                variant="outline"
                                                onClick={() => handleSend(q.text)}
                                                className="h-10 shrink-0 gap-1.5 rounded-full border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-slate-600 shadow-sm transition-colors hover:border-primary-ink/40 hover:bg-primary/5 hover:text-primary-ink"
                                            >
                                                <span className="text-primary-ink" aria-hidden="true">{q.icon}</span>
                                                {q.label}
                                            </Button>
                                        ))}
                                    </ScrollChips>

                                    <div className="relative group">
                                        <div className="relative flex-1 rounded-[2rem] bg-white border border-slate-200 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)] transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/15 flex items-center overflow-hidden">
                                            <Field className="w-full flex-row items-center gap-0">
                                                <FieldLabel htmlFor="seasonbot-input" className="sr-only">Message SeasonBot</FieldLabel>
                                                <Input
                                                    id="seasonbot-input"
                                                    data-autofocus
                                                    type="text"
                                                    value={input}
                                                    onChange={(e) => setInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
                                                placeholder="How can SeasonBot help you?"
                                                autoComplete="off"
                                                className="h-auto w-full border-none bg-transparent py-5 pl-6 pr-24 text-sm font-bold focus-visible:ring-0 placeholder:text-slate-500"
                                            />
                                            </Field>
                                            <div className="absolute right-2 flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    size="icon-lg"
                                                    variant="ghost"
                                                    onClick={toggleListening}
                                                    disabled={!voiceSupported}
                                                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                                                    aria-pressed={isListening}
                                                    title={voiceSupported ? 'Speak your order' : 'Voice input is not supported in this browser'}
                                                    className={`size-11 rounded-full disabled:cursor-not-allowed ${isListening ? 'animate-pulse bg-red-50 text-red-500' : 'text-slate-500 hover:bg-primary/10 hover:text-primary-ink'}`}
                                                >
                                                    {isListening ? <MicOff className="size-[18px]" aria-hidden="true" /> : <Mic className="size-[18px]" aria-hidden="true" />}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="icon-lg"
                                                    onClick={() => handleSend(input)}
                                                    disabled={!input.trim() || isLoading}
                                                    aria-label="Send message"
                                                    className={`size-11 rounded-full transition-all ${input.trim()
                                                        ? 'bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground shadow-[0_6px_20px_-6px_oklch(0.841_0.238_128.85/0.8)] hover:scale-105'
                                                        : 'bg-slate-100 text-slate-400 shadow-none'}`}
                                                >
                                                    <Send className="size-[18px]" fill="currentColor" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="menu" className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
                            <OrderWizard
                                initialView="menu"
                                onClose={() => setActiveTab('chat')}
                                onSubmit={handleOrderComplete}
                                currentOrder={currentOrder}
                                onUpdateOrder={updateOrder}
                                initialCategoryId={targetCategory}
                                initialSubCategoryId={targetSubCategory}
                                showToast={showToast}
                                isTabMode
                            />
                        </TabsContent>

                        <TabsContent value="cart" className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50">
                            <OrderWizard
                                initialView="cart"
                                onClose={() => setActiveTab('chat')}
                                onSubmit={handleOrderComplete}
                                currentOrder={currentOrder}
                                onUpdateOrder={updateOrder}
                                showToast={showToast}
                                isTabMode
                            />
                        </TabsContent>

                        <TabsList
                            aria-label="SeasonBot sections"
                            // The base list no longer pins a height (see the note in
                            // components/ui/tabs.tsx), so this bar grows to fit its content. The
                            // vertical rhythm is therefore deliberately tight — an icon chip, a
                            // 4px gap and a single-line label — to keep it near 60px rather than
                            // eating the conversation above it.
                            className="relative h-auto w-full shrink-0 items-stretch justify-between gap-1 rounded-none border-t border-white/5 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-950 px-2.5 py-1.5 @lg:px-3 @lg:py-2 safe-b-2 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/50 before:to-transparent"
                        >
                            <TabTrigger value="chat" icon={<MessageSquare aria-hidden="true" />} label="Chat" />
                            <TabTrigger value="menu" icon={<Menu aria-hidden="true" />} label="Menu" />
                            <TabTrigger value="cart" icon={<ShoppingBag aria-hidden="true" />} label="Bag" badge={totalItems} />
                        </TabsList>
                    </Tabs>
                </main>
            )}
        </>
    );
});

ChatWidget.displayName = 'ChatWidget';

/**
 * A full-bleed row of chips that scrolls sideways, with a chevron at each edge.
 *
 * Two reasons it is built this way. The strip is inset by the composer's side padding, so
 * without the negative margin it stops short of the widget edge and leaves dead space; the
 * negative margin cancels that while inner padding keeps the first and last chip aligned. And
 * because the scrollbar is hidden, a row that overflows gives no hint that it scrolls at all —
 * hence the chevrons, which are real buttons so they stay keyboard reachable.
 *
 * Each chevron hides itself once its end of travel is reached, rather than scrolling into
 * nothing. `visibility: hidden` does the hiding, so a disabled arrow also drops out of the tab
 * order instead of leaving focus on something invisible.
 */
function ScrollChips({ label, children }: { label: string, children: React.ReactNode }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(false);

    const syncEdges = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        // Math.abs: some engines report scrollLeft as a negative offset.
        const travelled = Math.abs(track.scrollLeft);
        setAtStart(travelled <= 1);
        setAtEnd(travelled >= track.scrollWidth - track.clientWidth - 1);
    }, []);

    // Re-check after every render: remembering an order prepends a chip, which changes whether
    // there is anything left to scroll to.
    useEffect(syncEdges);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        track.addEventListener('scroll', syncEdges, { passive: true });
        // The panel is fluid, so the same row is scrollable at one width and not the next.
        const observer = new ResizeObserver(syncEdges);
        observer.observe(track);
        return () => {
            track.removeEventListener('scroll', syncEdges);
            observer.disconnect();
        };
    }, [syncEdges]);

    const nudge = (direction: -1 | 1) => {
        const track = trackRef.current;
        if (!track) return;
        track.scrollBy({ left: direction * Math.max(140, track.clientWidth * 0.7), behavior: 'smooth' });
    };

    return (
        <div className="relative -mx-4 mt-1 mb-3">
            <div
                ref={trackRef}
                aria-label={label}
                className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 no-scrollbar"
            >
                {children}
            </div>

            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => nudge(-1)}
                disabled={atStart}
                aria-label="Scroll quick replies left"
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur hover:text-primary-ink disabled:invisible"
            >
                <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => nudge(1)}
                disabled={atEnd}
                aria-label="Scroll quick replies right"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur hover:text-primary-ink disabled:invisible"
            >
                <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
        </div>
    );
}

/**
 * The bottom nav trigger. `TabsTrigger` supplies the ARIA tab semantics, the selected state
 * and focus ring; this only adds the icon-over-label layout and the bag counter.
 */
function TabTrigger({ value, icon, label, badge }: { value: 'chat' | 'menu' | 'cart', icon: React.ReactNode, label: string, badge?: number }) {
    return (
        <TabsTrigger
            value={value}
            // `flex-1` (inherited) is what gives the three tabs equal columns; the previous
            // fixed `w-24` fought it. `data-active:bg-*` must be restated because the base
            // trigger paints a white `bg-background` pill, which is invisible-to-ugly here.
            className="group/tab relative h-auto flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-slate-400 transition-colors duration-200 hover:bg-white/5 hover:text-white dark:hover:bg-white/10 dark:hover:text-foreground data-active:bg-primary/10 data-active:text-primary dark:data-active:bg-primary/15 data-active:shadow-none"
        >
            <span className="relative flex size-7 items-center justify-center rounded-xl transition-colors duration-200 group-data-active/tab:bg-primary/15 group-data-active/tab:shadow-[inset_0_0_0_1px_oklch(0.841_0.238_128.85/0.3)]">
                {icon}
                {/*
                  The counter is anchored to the icon, not to the trigger: at the trigger's own
                  top-right it floated ~40px away from a 16px glyph and overhung the bar's edge.
                  The ring matches the bar so it reads as a cut-out, and it inverts to dark-on-lime
                  when the tab is active, where a lime badge would vanish into the tint.
                */}
                {badge !== undefined && badge > 0 && (
                    <Badge className="absolute -right-2 -top-2 h-3.5 min-w-3.5 gap-0 border-0 bg-primary px-1 py-0 text-[8px] font-black leading-none text-primary-foreground tabular-nums ring-2 ring-slate-900 animate-bounce-short group-data-active/tab:bg-slate-950 group-data-active/tab:text-primary group-data-active/tab:ring-primary/40">
                        <span className="sr-only">{badge} items in bag</span>
                        <span aria-hidden="true">{badge}</span>
                    </Badge>
                )}
            </span>
            <span className="text-[10px] leading-none font-black uppercase tracking-widest">{label}</span>
        </TabsTrigger>
    );
}
