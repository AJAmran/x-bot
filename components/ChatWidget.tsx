'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Bot, ShoppingBag, Send, MessageSquare, X, Mic, MicOff, Clock as ClockIcon, Phone, Utensils, TriangleAlert, Sparkles, Plus, ChevronLeft, ChevronRight, RotateCcw, Bike, Store, Check } from 'lucide-react';
import { StorageService } from '@/lib/storageService';
import { RESTAURANT_DATA } from '@/lib/constants';
import { ChatMessage as ChatMessageType, CustomerInfo, Order, OrderAction } from '@/lib/types';
import { createDraftOrder, finalizeOrder, firstIssue, lineTotalOf, needsCheckoutCard, orderConfirmedMessage, validateOrder } from '@/lib/order';
import { findMenuItemByCode } from '@/lib/menuIndex';
import { suggestForCart } from '@/lib/recommend';
import { useCart } from '@/lib/hooks/useCart';
import { useChat } from '@/lib/hooks/useChat';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { ChatMessage } from '@/components/ChatMessage';
import { BasketCard, CheckoutCard, MenuPickerCard, PlaceOrderCard } from '@/components/chat/OrderCards';
import { ToastContainer, showToast } from '@/components/ToastContainer';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ChatService } from '@/lib/chatService';
import { OPEN_WIDGET_EVENT, type OpenWidgetDetail } from '@/lib/widgetBus';

// The toast surface is no longer lazy — shadcn's Toaster is a thin provider and firing a
// toast no longer re-renders this component.

const PREDEFINED_QUESTIONS = [
    { label: 'Opening Hours', text: 'When are you open?', icon: <ClockIcon size={12} /> },
    { label: 'Contact Info', text: 'What is your address and phone number?', icon: <Phone size={12} /> },
    { label: 'Menu', text: 'Show me the full menu', icon: <Utensils size={12} /> },
];

/**
 * Chips that depend on where the guest actually is, so the fastest way forward is always one tap.
 *
 * The static questions above are fine as a floor, but a guest who has just been asked "delivery or
 * pickup?" should not have to type the answer when the answer is a button. Each branch below
 * answers the one question the order is actually blocked on, in the order the waiter asks it.
 */
function contextualReplies(order: Order | null, messages: ChatMessageType[]): typeof PREDEFINED_QUESTIONS {
    const hasItems = (order?.items.length ?? 0) > 0;
    const info = order?.customerInfo;
    const askedSomething = [...messages].reverse().some(
        message => message.sender === 'ai' && message.content.trim().endsWith('?'),
    );

    // An empty basket is the hard stop: nothing else can be offered until there is food in it.
    if (!hasItems) {
        return [{ label: 'Show me the menu', text: 'Show me the full menu', icon: <Utensils size={12} /> }];
    }

    const undecided = info?.deliveryType !== 'delivery' && info?.deliveryType !== 'pickup';
    if (undecided) {
        return [
            { label: 'Delivery', text: 'Delivery please', icon: <Bike size={12} /> },
            { label: 'Pickup', text: 'I will collect it', icon: <Store size={12} /> },
        ];
    }

    if (order && validateOrder(order).valid) {
        return [{ label: 'Place my order', text: 'Place my order', icon: <Check size={12} /> }];
    }

    // A delivery that still needs an address: the checkout card is already opening for this, so
    // offer the information questions rather than pretending the order can be placed.
    if (info?.deliveryType === 'delivery' && !info.address?.trim()) {
        return [{ label: 'Delivery info', text: 'What is the delivery charge and area?', icon: <Bike size={12} /> }];
    }

    // Otherwise the guest is mid-flow with nothing to decide: only suggest questions once the
    // waiter has actually asked one, so the row is not a permanent strip of noise.
    return askedSomething ? [] : PREDEFINED_QUESTIONS;
}


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
    const [input, setInput] = useState('');
    const composerRef = useRef<HTMLInputElement>(null);
    // Starts pessimistic only when we know the key is missing; otherwise a single failed
    // call flips it and a later success flips it back.
    const [aiDegraded, setAiDegraded] = useState(!aiConfigured);
    /** The last message that failed, so the guest can resend it instead of retyping it. */
    const [retryableText, setRetryableText] = useState<string | null>(null);
    /** First tap of "start over" arms it; the second commits and this resets. */
    const [clearArmed, setClearArmed] = useState(false);

    /**
     * The conversation is the only surface; these stages are the two things chat cannot do —
     * read a 230-item catalogue legibly, and pin a location. The card is transient UI pinned to
     * the end of the thread rather than a stored message, so it can never come back stale.
     */
    const [stage, setStage] = useState<'none' | 'menu' | 'basket' | 'checkout' | 'payment'>('none');
    const [focusCategoryId, setFocusCategoryId] = useState<string | undefined>();
    const [focusSubcategoryId, setFocusSubcategoryId] = useState<string | undefined>();
    const [placingOrder, setPlacingOrder] = useState(false);

    const { currentOrder, setCurrentOrder, totalItems, resetCart, updateOrder } = useCart(null);
    const { messages, isLoading, setIsLoading, addMessage, setFullHistory, setMessages } = useChat([]);

    /** Item code -> quantity, so every card can show what is already in the basket. */
    const cartCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const line of currentOrder?.items ?? []) counts.set(line.code, line.quantity);
        return counts;
    }, [currentOrder]);

    const closeCard = useCallback(() => setStage('none'), []);


    /**
     * Cart-aware suggestions, computed locally on every basket change. Zero API calls, instant,
     * and it keeps working in demo mode — see lib/recommend.ts for why this is not a prompt.
     */
    const suggestions = useMemo(() => suggestForCart(currentOrder), [currentOrder]);

    /** Most recent completed order, powering the "same as last time" quick reply. */
    const [lastOrder, setLastOrder] = useState<Order | null>(null);

    const quickReplies = useMemo(() => {
        // Contextual first, then the evergreen questions, de-duplicated by what they would send.
        // A returning guest's "same as last time" outranks both, because for them it is the
        // shortest path to a full basket.
        const base = [...contextualReplies(currentOrder, messages)];
        if (lastOrder) {
            base.unshift({ label: 'Same as last time', text: 'same as last time', icon: <Sparkles size={12} /> });
        }
        for (const fallback of PREDEFINED_QUESTIONS) {
            if (base.length >= 4) break;
            if (base.some(reply => reply.text === fallback.text)) continue;
            base.push(fallback);
        }
        return base;
    }, [currentOrder, messages, lastOrder]);

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

    // Lets a page button drive the widget, without either component having to become a client
    // component or share lifted state. The tab argument survives as the card it now opens, so a
    // call to 'menu' still lands the guest on the menu rather than on an empty conversation. A
    // `prefill` is dropped into the composer and focused, never sent: the guest must still choose
    // to send it, and it must be visible so they can see what they are about to order.
    useEffect(() => {
        const onRequestOpen = (event: Event) => {
            const { tab, prefill } = (event as CustomEvent<OpenWidgetDetail>).detail ?? { tab: 'chat' as const };
            setIsOpen(true);
            if (prefill) {
                setInput(prefill);
                // The composer is mounted once the panel is open; focus it so the guest can send
                // straight away. rAF because the panel animates in and the node is not laid out
                // in the same tick as the state change.
                requestAnimationFrame(() => composerRef.current?.focus());
            }
            if (tab === 'menu') setStage('menu');
            else if (tab === 'cart') setStage(totalItems > 0 ? 'basket' : 'none');
        };
        window.addEventListener(OPEN_WIDGET_EVENT, onRequestOpen);
        return () => window.removeEventListener(OPEN_WIDGET_EVENT, onRequestOpen);
    }, [totalItems]);

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

    /**
     * The single point where an order becomes real. Both routes in — the guest saying "place my
     * order" in the thread, and the confirm card — finish here.
     *
     * Server-authoritative: the order is posted to /api/place-order, which prices it from its own
     * menu and re-checks every rule, and the guest is confirmed against the order the server will
     * cook. If that call fails the basket is left intact, because confirming an order the kitchen
     * never heard about is the one failure this app cannot have.
     */
    const handleOrderComplete = useCallback(async (order: Order) => {
        setPlacingOrder(true);
        const result = await ChatService.placeOrder(order);
        setPlacingOrder(false);

        if (!result.placed || !result.order) {
            addMessage({
                id: Date.now().toString(),
                content: `I could not place that order${result.reason ? ` (${result.reason})` : ''}. Your basket is exactly as you left it — please try again in a moment.`,
                sender: 'ai',
                timestamp: new Date(),
                type: 'text',
            });
            showToast('Order not placed', 'error');
            return;
        }

        const placed = result.order;
        addMessage({
            id: Date.now().toString(),
            content: orderConfirmedMessage(placed),
            sender: 'ai',
            timestamp: new Date(),
            type: 'order_update',
            metadata: { orderId: placed.id },
        });
        StorageService.saveCompletedOrder(placed);
        setLastOrder(placed);
        resetCart();
        setStage('none');
    }, [addMessage, resetCart]);

    const processOrderAction = useCallback(async (action: OrderAction) => {
        if (action.action === 'browse_menu') {
            // Both ids matter. A guest who asks for "soups" means the Soup subcategory, and
            // forwarding only the category used to open the card on the whole of Chinese —
            // salads and satay under a promise of soup.
            setFocusCategoryId(action.category_id);
            setFocusSubcategoryId(action.subcategory_id);
            setStage('menu');
            return;
        }

        if (action.action === 'checkout') {
            setStage(totalItems > 0 ? 'checkout' : 'basket');
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
            const next = createDraftOrder({
                items: currentOrder?.items ?? [],
                customerInfo: {
                    ...previous,
                    name: action.customer_details.name || previous?.name || '',
                    phone: action.customer_details.phone || previous?.phone || '',
                    address: action.customer_details.address || previous?.address || '',
                    deliveryType: action.customer_details.delivery_type ?? previous?.deliveryType,
                    preferredTime: action.customer_details.preferred_time || previous?.preferredTime || '',
                    // Remembered facts accumulate rather than replace, so the waiter does not
                    // "forget" an allergy the moment the guest mentions their name.
                    preferences: mergePreferences(previous?.preferences, stated),
                    locationVerified: previous?.locationVerified ?? false,
                },
                id: currentOrder?.id,
                createdAt: currentOrder?.createdAt
            });
            updateOrder(next);

            /*
              Hand over to the card once the thread has nothing left to ask. This is the fix for
              a dead end: a guest who gave their name, number and "delivery" was told "details
              saved" and then nothing happened, because `confirm` is correctly refused without a
              map pin and the thread never showed the map. Judged on the *next* order rather than
              `currentOrder`, which is still the previous one at this point in the render.
            */
            if (needsCheckoutCard(next)) setStage('checkout');
        }

        if (action.action === 'confirm') {
            if (currentOrder && currentOrder.items.length > 0) {
                // The engine already gates `confirm` on validateOrder, so by the time this
                // runs the order is one the server would have accepted.
                handleOrderComplete(finalizeOrder(currentOrder));
                showToast("Order placed successfully!", 'success');
            }
        }
    }, [currentOrder, updateOrder, totalItems, handleOrderComplete]);

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

            /*
              Goes through the server route, never the engine directly. The engine holds the
              Gemini SDK and reads GEMINI_API_KEY, and only NEXT_PUBLIC_* vars reach a client
              bundle — so calling it from here resolved the key to undefined, every request
              threw, and the widget quietly fell back to the local intent layer, which can open
              the menu but cannot add a dish. The route is also what keeps the key private.
            */
            const response = await ChatService.askWaiter([...messages, userMsg], currentOrder);
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
            // Only a genuine failure arms the retry; a successful turn clears it, so the button can
            // never appear next to a reply that already landed.
            setRetryableText(response.meta?.error ? text : null);
        } catch (err) {
            console.error(err);
            setAiDegraded(true);
            setRetryableText(text);
            showToast("Connection issue", "error");
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Re-sends the last message that failed. A guest whose "place my order" came back as an
     * apology would otherwise have to retype it, with the basket that made it meaningful still on
     * screen but no longer in mind.
     *
     * Not memoised: it closes over `handleSend`, which reads live order state, and wrapping
     * either in `useCallback` means restating a dependency list where a stale entry would quietly
     * resend the wrong thing.
     */
    const retryLastMessage = () => {
        if (retryableText) handleSend(retryableText);
    };


    /**
     * Starting over. Two taps by design: the first arms the button and the second commits, and the
     * arming lapses after a few seconds so a stray click cannot sit primed indefinitely.
     *
     * It clears the conversation, the basket, the draft and the armed state, and puts the opening
     * greeting back — the same thing a first-time visitor sees, which is the point of the gesture.
     */
    const handleClearConversation = useCallback(() => {
        if (!clearArmed) {
            setClearArmed(true);
            showToast('Tap the button again to clear this conversation', 'info');
            return;
        }

        setMessages([{
            id: 'welcome',
            content: `Assalamu Alaikum! Welcome to **${RESTAURANT_DATA.restaurant.name}**.\n\nI am **SeasonBot**, your personal waiter. How may I assist you with your dining experience?`,
            sender: 'ai',
            timestamp: new Date(),
            type: 'text',
        }]);
        // resetCart, not updateOrder(null): it also clears the persisted draft, so a reload after
        // starting over does not resurrect the basket that was just discarded.
        resetCart();
        setStage('none');
        setInput('');
        setRetryableText(null);
        setClearArmed(false);
        setLastOrder(null);
        showToast('New conversation started', 'success');
    }, [clearArmed, setMessages, resetCart]);

    /*


    /** Basket edits from the card steppers. Zero removes the line, matching the chat verbs. */
    const changeQuantity = useCallback((code: string, next: number) => {
        const items = (currentOrder?.items ?? [])
            .map(line => {
                if (line.code !== code) return line;
                const quantity = Math.max(0, Math.trunc(next));
                return { ...line, quantity, total: lineTotalOf(line.price, quantity) };
            })
            .filter(line => line.quantity > 0);

        updateOrder(createDraftOrder({
            items,
            customerInfo: currentOrder?.customerInfo,
            id: currentOrder?.id,
            createdAt: currentOrder?.createdAt,
        }));

        // Removing the last line would otherwise leave an open basket card reading "0 items"
        // with a live "Continue to checkout" that can only fail. Back to the thread instead.
        if (items.length === 0) setStage(stage === 'basket' ? 'none' : stage);
    }, [currentOrder, updateOrder, stage]);

    const patchCustomerInfo = useCallback((next: CustomerInfo) => {
        updateOrder(createDraftOrder({
            items: currentOrder?.items ?? [],
            customerInfo: next,
            id: currentOrder?.id,
            createdAt: currentOrder?.createdAt,
        }));
    }, [currentOrder, updateOrder]);

    /**
     * The map is the only thing that may mark a location verified — the model is barred from
     * doing so, which is what stops a guest being told their address is serviceable when the
     * kitchen cannot deliver there. See the note in the checkout card.
     */
    const handleLocationSelect = useCallback((
        lat: number, lng: number, distance: number, verified: boolean, suggestedAddress?: string
    ) => {
        const previous = currentOrder?.customerInfo as CustomerInfo | undefined;
        const shouldAdoptAddress = Boolean(suggestedAddress)
            && (!previous?.address || previous.address === previous.addressSuggestion);

        patchCustomerInfo({
            ...(previous ?? { name: '', phone: '', deliveryType: 'delivery' as const }),
            lat, lng, distance, locationVerified: verified,
            ...(suggestedAddress ? { addressSuggestion: suggestedAddress } : {}),
            ...(shouldAdoptAddress ? { address: suggestedAddress } : {}),
        });
    }, [currentOrder, patchCustomerInfo]);

    /**
     * SIMULATED authorisation, unchanged in substance from the checkout screen: validate the
     * fields a real PSP would check, pause so the demo reads like a transaction, then finalise.
     * A production build must move this to the server and only mark an order paid on a real
     * gateway response — see README "Known Limitations".
     */
    const placeOrder = useCallback(async () => {
        if (!currentOrder) return;

        // The card already gates on this, but the chat stays live while a card is open: the
        // waiter can add a line, or the guest can ask it to change how the order is collected,
        // between reaching the confirm step and pressing the button. Re-check at the point of no
        // return rather than trusting a check that may be several interactions old. The server
        // checks it again when the order is posted.
        const orderCheck = validateOrder(currentOrder);
        if (!orderCheck.valid) {
            showToast(firstIssue(orderCheck)?.message ?? 'Please review your order details.', 'error');
            setStage('checkout');
            return;
        }

        await handleOrderComplete(finalizeOrder(currentOrder, 'confirmed'));
    }, [currentOrder, handleOrderComplete]);

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

    /** Escape walks back out: dismiss an open card first, then close the widget itself. */
    const handleEscape = useCallback(() => {
        if (stage !== 'none') {
            setStage('none');
            return;
        }
        if (!standalone) setIsOpen(false);
    }, [stage, standalone]);

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
                            <div className="flex shrink-0 items-center gap-1.5">
                                {/*
                                  Starting over throws away a conversation and a basket, so it asks
                                  twice rather than once. A confirmation dialog would be heavier
                                  than the action deserves, and a single click is how a guest
                                  loses an order they had already built.
                                */}
                                <Button
                                    type="button"
                                    size="icon-lg"
                                    variant="ghost"
                                    onClick={handleClearConversation}
                                    aria-label={clearArmed ? 'Tap again to clear the conversation' : 'Start a new conversation'}
                                    className={`size-10 shrink-0 rounded-xl border text-slate-300 hover:bg-white/15 hover:text-white ${
                                        clearArmed ? 'border-red-400/50 bg-red-500/20 text-red-200' : 'border-white/10 bg-white/5'
                                    }`}
                                >
                                    {clearArmed ? <TriangleAlert size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
                                </Button>
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
                            </div>
                        )}
                    </header>

                    {aiDegraded && (
                        <div role="status" className="flex items-start gap-2.5 shrink-0 z-10 border-b border-amber-400/20 bg-amber-950/70 px-4 py-2.5 backdrop-blur-xl">
                            <TriangleAlert size={15} className="text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <p className="text-[11px] font-bold text-amber-100 leading-snug">
                                AI temporarily unavailable — browsing, cart and checkout still work.
                            </p>
                            {/* The banner alone leaves the guest with nothing to do but wait. */}
                            {retryableText && !isLoading && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={retryLastMessage}
                                    className="ml-auto h-7 shrink-0 rounded-lg border-amber-300/30 bg-amber-300/10 px-2.5 text-[10px] font-black uppercase tracking-widest text-amber-100 hover:bg-amber-300/20"
                                >
                                    <RotateCcw className="size-3" aria-hidden="true" />
                                    Retry
                                </Button>
                            )}
                        </div>
                    )}

                    {/*
                      One column, no tab bar. The three tabs (Chat / Menu / Bag) existed only to
                      reach screens the waiter can now drive from the thread, and carrying them
                      meant a guest had to leave the conversation to finish what they had already
                      said in it.
                    */}
                    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-slate-50 via-white to-primary/[0.07]">
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

                                    {/*
                                      The active card rides at the end of the thread, the same
                                      place the typing dots do, so it reads as the waiter's next
                                      move rather than as a screen that replaced the chat.
                                    */}
                                    {stage !== 'none' && currentOrder !== undefined && (
                                        <div className="px-1 pt-1">
                                            {stage === 'menu' && (
                                                <MenuPickerCard
                                                    /*
                                                      Keyed on the requested section so closing
                                                      the card and asking for a different one
                                                      mounts a fresh component. Without it React
                                                      reuses the instance and the new request
                                                      arrives pre-filtered by the old one.
                                                    */
                                                    key={`${focusCategoryId ?? 'all'}/${focusSubcategoryId ?? 'all'}`}
                                                    focusCategoryId={focusCategoryId}
                                                    focusSubcategoryId={focusSubcategoryId}
                                                    cartCounts={cartCounts}
                                                    onAdd={item => processOrderAction({
                                                        action: 'add',
                                                        items: [{ item_code: item.code, quantity: 1 }],
                                                    })}
                                                    onClose={closeCard}
                                                />
                                            )}
                                            {stage === 'basket' && currentOrder && (
                                                <BasketCard
                                                    order={currentOrder}
                                                    onQuantity={changeQuantity}
                                                    onCheckout={() => setStage('checkout')}
                                                    onClose={closeCard}
                                                />
                                            )}
                                            {stage === 'checkout' && currentOrder && (
                                                <CheckoutCard
                                                    draft={currentOrder}
                                                    onCustomerChange={patchCustomerInfo}
                                                    onLocation={handleLocationSelect}
                                                    onContinue={() => setStage('payment')}
                                                    onBack={() => setStage('basket')}
                                                    onClose={closeCard}
                                                />
                                            )}
                                            {stage === 'payment' && currentOrder && (
                                                <PlaceOrderCard
                                                    order={currentOrder}
                                                    onPlace={placeOrder}
                                                    placing={placingOrder}
                                                    onBack={() => setStage('checkout')}
                                                    onClose={closeCard}
                                                />
                                            )}
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                                {/* safe-b-4 keeps the composer clear of the iOS home indicator. */}
                                <div className="p-4 bg-white/80 backdrop-blur-2xl border-t border-slate-200/60 relative z-20 safe-b-4">
                                    {/*
                                      Replaces the Bag tab. A running total has to stay visible
                                      while the guest is still talking, otherwise the only way
                                      to see what they had ordered was to go and look.
                                    */}
                                    {currentOrder && currentOrder.items.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setStage(stage === 'basket' ? 'none' : 'basket')}
                                            aria-expanded={stage === 'basket'}
                                            className="mb-2.5 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary-ink/30 hover:bg-primary/5"
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-ink">
                                                <ShoppingBag className="size-4" aria-hidden="true" />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[11px] font-black text-slate-900">
                                                    {currentOrder.items.length} {currentOrder.items.length === 1 ? 'item' : 'items'} in your basket
                                                </span>
                                                <span className="block truncate text-[10px] text-slate-500">
                                                    {currentOrder.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-[13px] font-black tabular-nums text-primary-ink">৳{currentOrder.subtotal}</span>
                                        </button>
                                    )}

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
                                                    ref={composerRef}
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
                        </div>
                </main>
            )}
        </>
    );
});

ChatWidget.displayName = 'ChatWidget';

/**
 * A full-bleed row of chips that scrolls sideways, with a chevron at each edge.
 *
 * The negative margin cancels the composer's inset padding so the strip reaches the widget edge
 * while the first and last chips stay aligned. The chevrons exist because the scrollbar is hidden,
 * and an overflowing row would otherwise give no hint that it scrolls. Each chevron hides itself
 * at the end of its travel, using `visibility` so a disabled arrow also leaves the tab order.
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
