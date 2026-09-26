'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { X, ChevronLeft, ShoppingBag, Plus, Minus, Trash2, Search, Bike, Store, User, Phone as PhoneIcon, CheckCircle2, Navigation, AlertCircle, ArrowRight, MapPin, StickyNote, Receipt, Sparkles, CreditCard, Wallet, Banknote, ShieldCheck, Loader2 } from 'lucide-react';

import { RESTAURANT_DATA, MIN_ORDER_AMOUNT, PAYMENT_METHODS, PAYMENT_AUTH_DELAY_MS, PAYMENT_SIMULATED_NOTICE, DEMO_CARD_NUMBER } from '@/lib/constants';
import { createDraftOrder, calculateTotals, finalizeOrder, firstIssue, lineTotal, validateOrder, validatePaymentDetails, maskCardNumber, simulateAuthorization } from '@/lib/order';
import { Order, CartItem, MenuItem, CustomerInfo, PaymentDetails, PaymentMethod } from '@/lib/types';
import { MenuItemCard } from './wizard/MenuItemCard';
import { LocationMap } from './wizard/LocationMap';
import { MenuFilters, type SortOption } from './wizard/MenuFilters';
import { itemsOf } from '@/lib/menuIndex';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const PAYMENT_ICONS = { cash: Banknote, card: CreditCard, wallet: Wallet } as const;

/**
 * Shown when a search or a filter combination matches nothing. Without this the grid would
 * just be blank, which reads as a bug rather than as "no results".
 */
function EmptyMenuState({
    searching = false,
    filterCount,
    onClearFilters,
    onClearSearch,
}: {
    searching?: boolean;
    filterCount: number;
    onClearFilters: () => void;
    onClearSearch?: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Search size={22} aria-hidden="true" />
            </div>
            <p className="text-sm font-bold text-slate-700">
                {searching ? 'Nothing matched that search' : 'No dishes match those filters'}
            </p>
            <p className="max-w-xs text-xs text-slate-500">
                {searching
                    ? 'Check the spelling, or search by dish code such as M-101.'
                    : 'Try switching a filter off to see the rest of this category.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                {onClearSearch && (
                    <Button type="button" variant="outline" onClick={onClearSearch} className="h-10 rounded-xl px-4 text-xs font-bold">
                        Clear search
                    </Button>
                )}
                {filterCount > 0 && (
                    <Button type="button" onClick={onClearFilters} className="h-10 rounded-xl px-4 text-xs font-bold">
                        Clear {filterCount} filter{filterCount > 1 ? 's' : ''}
                    </Button>
                )}
            </div>
        </div>
    );
}

interface Props {
  onClose: () => void;
  onSubmit: (order: Order) => void;
  currentOrder: Order | null;
  onUpdateOrder: (order: Order) => void;
  initialView?: 'menu' | 'cart' | 'checkout' | 'payment';
  initialCategoryId?: string;
  initialSubCategoryId?: string;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isTabMode?: boolean;
}

const EMPTY_CUSTOMER_INFO: CustomerInfo = { name: '', phone: '', deliveryType: 'pickup', address: '', locationVerified: false, distance: undefined };

export const OrderWizard: React.FC<Props> = ({
  onClose, onSubmit, currentOrder, onUpdateOrder,
  initialView = 'menu', initialCategoryId, initialSubCategoryId,
  showToast, isTabMode = false
}) => {
  const [view, setView] = useState<'menu' | 'cart' | 'checkout' | 'payment' | 'success'>(initialView);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategoryId || RESTAURANT_DATA.menu.categories[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [menuSort, setMenuSort] = useState<SortOption>('recommended');
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [popularOnly, setPopularOnly] = useState(false);
  // Seeded from the parent's order with a lazy initialiser. This used to be a mount effect
  // guarded by a ref, which meant one render with an empty basket and a lint suppression for
  // the cascading setState — the initialiser does the same job with neither problem.
  const [cartItems, setCartItems] = useState<CartItem[]>(currentOrder?.items || []);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(currentOrder?.customerInfo || EMPTY_CUSTOMER_INFO);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  // Simulated payment state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({});
  const [authorizing, setAuthorizing] = useState(false);
  const authTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Whether local state was seeded from a real parent order. Until it was, the wizard must
   * not push a draft back up, or simply opening the menu tab would overwrite the parent's
   * order with an empty one (and the model would see an empty basket instead of "Empty Cart").
   */
  const seededFromOrderRef = useRef(currentOrder !== null);

  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);

  // Adjust state during render (React's documented pattern for a changed prop) rather than
  // in an effect, so a `browse_menu` action from the model can retarget the open category.
  const [lastCategoryProp, setLastCategoryProp] = useState(initialCategoryId);
  if (initialCategoryId && initialCategoryId !== lastCategoryProp) {
    setLastCategoryProp(initialCategoryId);
    setActiveCategory(initialCategoryId);
  }

  // Handle auto-scroll to subcategory if provided
  useEffect(() => {
    if (view === 'menu' && initialSubCategoryId && menuListRef.current) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`subcategory-${initialSubCategoryId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialSubCategoryId, view, activeCategory]);

  // The canonical draft: one complete Order built from local state. It feeds the debounced
  // sync to the parent, the CTA's enabled/label logic and validateOrder — previously these
  // were three hand-maintained copies of the same maths.
  const draftOrder = useMemo<Order>(() => createDraftOrder({
    items: cartItems,
    customerInfo,
    id: currentOrder?.id || undefined,
    createdAt: currentOrder?.createdAt
  }), [cartItems, customerInfo, currentOrder?.id, currentOrder?.createdAt]);

  const { subtotal, total, totalItems, isMinOrderMet, isDistanceValid, amountToMinOrder } = useMemo(
    () => calculateTotals(cartItems, {
      deliveryType: customerInfo.deliveryType,
      distanceKm: customerInfo.distance
    }),
    [cartItems, customerInfo.deliveryType, customerInfo.distance]
  );

  // Authoritative gate — the same function the server uses before accepting an order.
  const validation = validateOrder(draftOrder);
  const blockingCodes = validation.valid ? [] : validation.issues.map(i => i.code);

  // Debounced update to parent - only when local state changes
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (view === 'success' || !seededFromOrderRef.current) return;

    // Clear previous timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Debounce updates to parent (quantity +/- and the notes/address fields fire per keystroke)
    updateTimeoutRef.current = setTimeout(() => {
      onUpdateOrder(draftOrder);
    }, 100);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [draftOrder, view, onUpdateOrder]);

  useEffect(() => {
    if (categoryScrollRef.current) {
      const activeBtn = categoryScrollRef.current.querySelector(`[data-category-id="${activeCategory}"]`);
      if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeCategory]);

  const addToCart = useCallback((item: MenuItem) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.code === item.code);
      if (existing) return prev.map(i => i.code === item.code ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } : i);
      return [...prev, { id: item.id, code: item.code, name: item.name, quantity: 1, price: item.price, total: item.price }];
    });
    showToast(`Added ${item.name} to cart`, 'success');
  }, [showToast]);

  const updateQuantity = useCallback((code: string, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.code === code) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty, total: newQty * i.price };
      }
      return i;
    }));
  }, []);

  const updateItemNote = useCallback((code: string, note: string) => {
    setCartItems(prev => prev.map(i => i.code === code ? { ...i, specialInstructions: note } : i));
  }, []);

  const removeFromCart = useCallback((code: string) => {
    setCartItems(prev => prev.filter(i => i.code !== code));
    showToast("Item removed from cart", 'info');
  }, [showToast]);

  const handleLocationSelect = useCallback((lat: number, lng: number, dist: number, verified: boolean, suggestedAddress?: string) => {
    setCustomerInfo(prev => {
      const updates: Partial<CustomerInfo> = { lat, lng, distance: dist, locationVerified: verified };

      if (suggestedAddress) {
        updates.addressSuggestion = suggestedAddress;
        // If address is empty OR it exactly matches the previous suggestion,
        // we keep them in sync. If user manually edited, we stop auto-updating.
        if (!prev.address || prev.address === prev.addressSuggestion) {
          updates.address = suggestedAddress;
        }
      }

      const hasChanges =
        prev.lat !== lat ||
        prev.lng !== lng ||
        prev.distance !== dist ||
        prev.locationVerified !== verified ||
        (suggestedAddress && suggestedAddress !== prev.addressSuggestion);

      if (!hasChanges) return prev;
      return { ...prev, ...updates };
    });
  }, []);

  const renderStepper = () => {
    const steps = [
      { id: 'menu', label: 'Menu', icon: <Search size={12} /> },
      { id: 'cart', label: 'Review', icon: <ShoppingBag size={12} /> },
      { id: 'checkout', label: 'Details', icon: <User size={12} /> },
      { id: 'payment', label: 'Pay', icon: <CreditCard size={12} /> },
      { id: 'success', label: 'Done', icon: <CheckCircle2 size={12} /> }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === view);

    return (
      // A visual progress bar. The current step is exposed with aria-current="step" below,
      // so it is not read as unlabelled circles. Sized for a 320px phone: five steps have to
      // share ~59px each, so the container padding and the dots step down below `sm`.
      //
      // In tab mode the captions go to the accessibility tree only. The widget's own tab bar
      // already carries Menu and Bag, so printing both sets of captions stacked two competing
      // navigation rows above the food; the dots still show how far through checkout you are.
      <div className={`px-3 @lg:px-6 bg-white border-b border-slate-100 ${isTabMode ? 'py-2.5' : 'py-4'}`}>
        <ol className="flex items-center justify-between relative list-none p-0 m-0">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 z-0" aria-hidden="true"></div>
          <div
            className="absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 z-0 transition-all duration-500"
            style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
            aria-hidden="true"
          ></div>

          {steps.map((step, idx) => {
            const isActive = view === step.id;
            const isCompleted = currentStepIndex > idx;

            return (
              <li key={step.id} className="relative z-10 flex flex-col items-center min-w-0">
                <div
                  aria-current={isActive ? 'step' : undefined}
                  className={`w-7 h-7 @lg:w-8 @lg:h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${isActive ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110' :
                    isCompleted ? 'bg-white border-primary text-primary-ink' :
                      'bg-white border-slate-200 text-slate-500'
                    }`}
                >
                  {isCompleted ? <CheckCircle2 size={14} className="@lg:hidden" aria-hidden="true" /> : <span className="sr-only">Step {idx + 1}: </span>}
                  {!isCompleted && step.icon}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tighter mt-2 transition-colors duration-300 truncate max-w-full ${isTabMode ? 'sr-only' : ''} ${isActive ? 'text-slate-900' : 'text-slate-500'
                  }`}>
                  {step.label}
                </span>
                {isActive && <span className="sr-only">(current step)</span>}
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  const handleCheckoutSubmit = () => {
    // One gate, one set of messages — shared with the server so the AI cannot talk a
    // customer past a rule the form enforces.
    const result = validateOrder(draftOrder);
    if (!result.valid) {
      showToast(firstIssue(result)?.message ?? 'Please review your order details.', 'error');
      return;
    }
    setView('payment');
  };

  /**
   * SIMULATED authorisation. There is no gateway: this validates the fields with the rules a
   * PSP would apply, then waits a fixed moment so the demo reads like a real transaction.
   * A production version must move this to the server and only mark the order paid on a real
   * gateway response — see README "Known Limitations".
   */
  const handlePaymentSubmit = () => {
    const result = validatePaymentDetails(paymentMethod, paymentDetails);
    if (!result.valid) {
      showToast(result.issues[0].message, 'error');
      return;
    }

    setAuthorizing(true);
    authTimer.current = setTimeout(() => {
      const outcome = simulateAuthorization(paymentMethod);
      const finalOrder = finalizeOrder(draftOrder, 'confirmed', outcome);
      setAuthorizing(false);
      setLastOrder(finalOrder);
      onSubmit(finalOrder);
      setView('success');
    }, PAYMENT_AUTH_DELAY_MS[paymentMethod]);
  };

  useEffect(() => () => {
    if (authTimer.current) clearTimeout(authTimer.current);
  }, []);

  const menuItemsForSearch = useMemo(
    () => RESTAURANT_DATA.menu.categories.flatMap(category => itemsOf(category)),
    []
  );

  /**
   * Sort and filter are applied to whichever list is on screen, so they behave identically
   * whether the user is browsing a category or reading search results.
   */
  const applyMenuControls = useCallback((items: MenuItem[]): MenuItem[] => {
    const filtered = items.filter(item => {
      if (vegetarianOnly && !item.tags?.includes('V')) return false;
      if (popularOnly && !item.popular) return false;
      return true;
    });

    const sorted = [...filtered];
    if (menuSort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (menuSort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (menuSort === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => Number(Boolean(b.popular)) - Number(Boolean(a.popular)));
    return sorted;
  }, [menuSort, vegetarianOnly, popularOnly]);

  const renderMenu = () => {
    const category = RESTAURANT_DATA.menu.categories.find(c => c.id === activeCategory);
    const searchResults = deferredSearchQuery
      ? menuItemsForSearch.filter(item =>
        item.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
        item.code.includes(deferredSearchQuery)
      )
      : [];
    const displayItems = applyMenuControls(searchResults);
    const activeFilterCount = Number(vegetarianOnly) + Number(popularOnly);

    /**
     * Dishes the current category and filters actually leave on screen. Deliberately not a
     * memo: this is a plain render helper, not a component, and the count mirrors the branch
     * structure below exactly — `displayItems` on the search path, the summed subcategories
     * otherwise — so the number can never disagree with the list beside it.
     */
    const visibleDishCount = searchQuery
        ? displayItems.length
        : category
            ? (category.kind === 'nested'
                ? category.subcategories.reduce((total, sub) => total + applyMenuControls(sub.items).length, 0)
                : applyMenuControls(category.items).length)
            : 0;

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="bg-white sticky top-0 z-20 shadow-sm border-b border-slate-100">
          {!isTabMode && (
            <div className="px-4 py-2 flex justify-between items-center border-b border-slate-50">
              <span className="text-xs font-bold text-slate-500">Order Online</span>
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                onClick={onClose}
                aria-label="Close the menu"
                className="-ml-2 size-10 rounded-full text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="size-[18px]" aria-hidden="true" />
              </Button>
            </div>
          )}
          {renderStepper()}
          <div className="px-4 pt-3 pb-2">
            <Field className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
              <FieldLabel htmlFor="menu-search" className="sr-only">Search the menu</FieldLabel>
              <Input
                id="menu-search"
                type="search"
                placeholder="Search dishes or codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                /*
                  Three fixes over the previous version. The base Input carries a fixed short
                  height, so the vertical padding that used to be here never grew the field — it
                  just squeezed the text into a content box too shallow for it, and left the
                  clear button taller than the field itself. Hence an explicit height and
                  horizontal-only padding, with the button sized to nest inside it. And
                  appearance-none on the cancel pseudo-element drops the browser's own clear
                  affordance, which otherwise renders inside the field beside ours.
                */
                className="h-10 rounded-xl border-transparent bg-slate-100 pl-10 pr-10 font-medium focus-visible:border-primary/40 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {searchQuery && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear the menu search"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </Field>
          </div>
          {!searchQuery && (
            <div className="px-4 pb-2.5 overflow-x-auto no-scrollbar flex gap-2" ref={categoryScrollRef} role="group" aria-label="Menu categories">
              {RESTAURANT_DATA.menu.categories.map(cat => (
                <Button
                  key={cat.id}
                  type="button"
                  variant="outline"
                  aria-pressed={activeCategory === cat.id}
                  data-category-id={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[11px] font-bold shadow-sm transition-colors ${activeCategory === cat.id
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary-ink/30 hover:bg-primary/5 hover:text-primary-ink'}`}
                >
                  <span aria-hidden="true">{cat.icon}</span> {cat.name}
                </Button>
              ))}
            </div>
          )}

          <MenuFilters
            sort={menuSort}
            onSortChange={setMenuSort}
            vegetarianOnly={vegetarianOnly}
            onVegetarianOnlyChange={setVegetarianOnly}
            popularOnly={popularOnly}
            onPopularOnlyChange={setPopularOnly}
            resultCount={visibleDishCount}
          />
        </div>

        <div className="p-3 @lg:p-4 pb-20 overflow-y-auto flex-1 scroll-smooth overscroll-contain" ref={menuListRef}>
          {searchQuery ? (
            displayItems.length === 0 ? (
              <EmptyMenuState
                  searching
                  filterCount={activeFilterCount}
                  onClearFilters={() => { setVegetarianOnly(false); setPopularOnly(false); }}
                  onClearSearch={() => setSearchQuery('')}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">{displayItems.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>
            )
          ) : category ? (
            <div className="space-y-5">
              {category.minimum_order && <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 text-amber-800 text-xs"><AlertCircle size={16} className="shrink-0" /> Minimum order: {category.minimum_order} {category.minimum_order_unit}</div>}

              {category.kind === 'nested' ? category.subcategories.map(sub => {
                const visible = applyMenuControls(sub.items);
                if (visible.length === 0) return null;
                return (
                <div key={sub.id} id={`subcategory-${sub.id}`} className="scroll-mt-32">
                  <div className="flex items-center gap-2 mb-2.5 pl-1">
                    <div className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-emerald-400"></div>
                    <h4 className="font-heading font-extrabold text-slate-800 text-sm">{sub.name}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">{visible.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>
                </div>
                );
              }) : (() => {
                const visible = applyMenuControls(category.items);
                if (visible.length === 0) {
                  return (
                    <EmptyMenuState
                        filterCount={activeFilterCount}
                        onClearFilters={() => { setVegetarianOnly(false); setPopularOnly(false); }}
                    />
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-2">{visible.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>
                );
              })()}
            </div>
          ) : null}
        </div>

        {totalItems > 0 && view === 'menu' && (
          <div className="p-3 absolute bottom-0 left-0 right-0 z-10 safe-b-2">
            <Button
              type="button"
              onClick={() => setView('cart')}
              className="group h-auto w-full justify-between rounded-2xl bg-gradient-to-br from-primary to-emerald-400 px-5 py-3.5 font-bold text-primary-foreground shadow-[0_16px_36px_-14px_oklch(0.841_0.238_128.85/0.85)] hover:brightness-105"
            >
              <span className="flex items-center gap-3">
                <span className="rounded-lg bg-primary-foreground/15 p-2">
                  <ShoppingBag />
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] uppercase tracking-widest opacity-70">View Cart</span>
                  <span className="text-xs font-black">{totalItems} Items</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold">৳{subtotal}</span>
                <ArrowRight />
              </span>
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderCart = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="p-4 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2"><Receipt size={20} /> Your Bill</h2>
          <span className="text-xs font-bold bg-slate-100 px-2 py-1 rounded text-slate-600">{cartItems.length} items</span>
        </div>
        {renderStepper()}
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-5">
        {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={24} className="opacity-50" />
            </div>
            <p className="font-medium text-sm">Your cart is empty</p>
            <Button type="button" onClick={() => setView('menu')} className="mt-4 h-10 rounded-full px-6 text-xs font-bold shadow-lg">
              Start Ordering
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cartItems.map(item => (
                <div key={item.code} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex gap-3 relative overflow-hidden animate-fade-in">
                  {/*
                    The old stepper was a 32px-wide column of ~18px buttons — below the 24px
                    WCAG 2.5.8 floor and unusable with a thumb. This is a horizontal row with
                    36px targets that grows to 40px from `sm` up, and the quantity is a real
                    <output> so it is announced when it changes.
                  */}
                  <div className="flex flex-col items-stretch justify-center bg-slate-50 rounded-xl w-[7.5rem] shrink-0 border border-slate-100 overflow-hidden">
                    <div className="flex items-center">
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="ghost"
                        onClick={() => item.quantity === 1 ? removeFromCart(item.code) : updateQuantity(item.code, -1)}
                        aria-label={item.quantity === 1 ? `Remove ${item.name} from your basket` : `Remove one ${item.name}`}
                        className={`h-9 w-9 shrink-0 @lg:h-10 @lg:w-10 ${item.quantity === 1 ? 'text-red-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-600 hover:text-primary-ink'}`}
                      >
                        {item.quantity === 1 ? <Trash2 className="size-3" strokeWidth={2.5} aria-hidden="true" /> : <Minus className="size-3" strokeWidth={3} aria-hidden="true" />}
                      </Button>
                      <output
                        aria-label={`Quantity ${item.quantity}`}
                        className="flex-1 text-center text-sm font-black text-slate-900 tabular-nums select-none"
                      >
                        {item.quantity}
                      </output>
                      <Button
                        type="button"
                        size="icon-lg"
                        variant="ghost"
                        onClick={() => updateQuantity(item.code, 1)}
                        aria-label={`Add one more ${item.name}`}
                        className="h-9 w-9 shrink-0 text-primary-ink hover:bg-primary/10 @lg:h-10 @lg:w-10"
                      >
                        <Plus className="size-3" strokeWidth={3} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-black text-[13.5px] text-slate-900 leading-tight pr-2 uppercase tracking-tight">{item.name}</h4>
                      <span className="font-black text-[14px] text-primary-ink whitespace-nowrap">৳{lineTotal(item)}</span>
                    </div>
                    <div className="relative mt-1">
                      <StickyNote className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={10} aria-hidden="true" />
                      <Input
                        type="text"
                        aria-label={`Special instructions for ${item.name}`}
                        placeholder="Add notes..."
                        value={item.specialInstructions || ''}
                        onChange={(e) => updateItemNote(item.code, e.target.value)}
                        className="h-auto rounded-md border-slate-100 bg-slate-50 py-1.5 pl-6 pr-2 text-[10px] text-slate-600 focus-visible:border-primary/40"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 pl-1">Payment Summary</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm text-slate-500 font-medium"><span>Subtotal</span><span className="text-slate-900">৳{subtotal}</span></div>
                <div className="flex justify-between text-sm text-slate-500 font-medium"><span>Delivery Fee</span><span className="text-slate-900">{customerInfo.deliveryType === 'delivery' ? 'Calculated later' : '৳0'}</span></div>
                <Separator className="my-4 border-dashed border-slate-200" />
                <div className="flex justify-between items-center text-lg font-black text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-primary-ink">৳{subtotal}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-3">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Delivery Policy</h4>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Bike size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Minimum ৳{MIN_ORDER_AMOUNT} for Home Delivery</p>
                    <p className="text-[10px] text-slate-500">Free delivery within 5km radius</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                    <Store size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">No Minimum for Pickup</p>
                    <p className="text-[10px] text-slate-500">Collect from our Dhanmondi kitchen</p>
                  </div>
                </div>
              </div>

              {subtotal < MIN_ORDER_AMOUNT && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start mt-4">
                  <div className="bg-amber-100 p-2 rounded-xl text-amber-600"><AlertCircle size={20} /></div>
                  <div className="flex-1">
                    <p className="text-xs text-amber-900 font-black uppercase tracking-wider">Delivery Notice</p>
                    <p className="text-[10px] text-amber-700 font-medium mt-1 leading-relaxed">Your current subtotal is ৳{subtotal}. Add items worth ৳{amountToMinOrder} more if you want Home Delivery.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        /* The safe-area utility replaces what was a hard-coded mobile-only bottom padding: the
           space now comes from the real device inset, so the bar clears both the home indicator
           and desktop. (Utility names are spelled out rather than written literally here, since
           Tailwind extracts class-shaped text from comments and would keep them in the bundle.) */
        <div className="bg-white/80 backdrop-blur-md border-t border-slate-100 p-3 @lg:p-4 absolute bottom-0 left-0 right-0 z-30 safe-b-4">
          <Button
            type="button"
            onClick={() => setView('checkout')}
            className="group h-auto w-full justify-between rounded-2xl bg-slate-900 px-8 py-4.5 font-black text-white shadow-2xl shadow-slate-900/30 hover:bg-slate-800"
          >
            <span className="flex items-center gap-3">
              <span className="rounded-xl bg-white/10 p-2 transition-colors group-hover:bg-primary">
                <ArrowRight />
              </span>
              <span className="text-xs uppercase tracking-widest">Review Details</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-sm">৳{subtotal}</span>
              <ArrowRight className="-translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </span>
          </Button>
        </div>
      )}
    </div>
  );

  const renderCheckout = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="p-4 flex items-center gap-2">
          <Button type="button" size="icon-lg" variant="ghost" onClick={() => setView('cart')} aria-label="Back to your basket" className="-ml-2 size-10 rounded-full text-slate-600 hover:bg-slate-100">
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h2 className="font-bold text-lg text-slate-900">Checkout</h2>
        </div>
        {renderStepper()}
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6">

        <div className="bg-slate-200/50 p-1.5 rounded-2xl flex relative h-14" role="group" aria-label="How would you like your order?">
          <div
            className={`absolute top-1.5 bottom-1.5 w-[48.5%] bg-white rounded-xl shadow-lg transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${customerInfo.deliveryType === 'delivery' ? 'left-1.5' : 'left-[50%]'}`}
            aria-hidden="true"
          ></div>
          {(['delivery', 'pickup'] as const).map(t => (
            <Button
              key={t}
              type="button"
              variant="ghost"
              aria-pressed={customerInfo.deliveryType === t}
              onClick={() => setCustomerInfo(prev => ({ ...prev, deliveryType: t }))}
              className={`h-auto flex-1 gap-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-transparent ${customerInfo.deliveryType === t ? 'text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}
            >
              {t === 'delivery'
                ? <Bike className={customerInfo.deliveryType === t ? 'text-primary-ink' : ''} aria-hidden="true" />
                : <Store className={customerInfo.deliveryType === t ? 'text-primary-ink' : ''} aria-hidden="true" />}
              {t === 'delivery' ? 'Home delivery' : 'Pickup'}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest pl-2">Customer Profile</h3>
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <Field className="flex-row items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
              <User className="shrink-0 text-slate-500" size={18} aria-hidden="true" />
              <div className="flex-1">
                <FieldLabel htmlFor="checkout-name" className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name</FieldLabel>
                <Input
                  id="checkout-name"
                  name="name"
                  autoComplete="name"
                  type="text"
                  placeholder="e.g. Ayesha Rahman"
                  value={customerInfo.name}
                  onChange={e => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                  className="h-auto border-none bg-transparent py-0 pl-0 text-[14px] font-bold text-slate-900 focus-visible:ring-0 placeholder:text-slate-500"
                />
              </div>
            </Field>
            <Field className="flex-row items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
              <PhoneIcon className="mt-2 shrink-0 text-slate-500" size={18} aria-hidden="true" />
              <div className="flex-1">
                <FieldLabel htmlFor="checkout-phone" className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Mobile Number</FieldLabel>
                <Input
                  id="checkout-phone"
                  name="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  type="tel"
                  placeholder="+880 1XXX-XXXXXX"
                  value={customerInfo.phone}
                  onChange={e => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                  aria-describedby="checkout-phone-hint"
                  className="h-auto border-none bg-transparent py-0 pl-0 text-[14px] font-bold text-slate-900 focus-visible:ring-0 placeholder:text-slate-500"
                />
                <FieldDescription id="checkout-phone-hint" className="mt-0.5 text-[10px] text-slate-500">An 11-digit Bangladeshi mobile number, e.g. 01712345678</FieldDescription>
              </div>
            </Field>
          </div>
        </div>

        {customerInfo.deliveryType === 'delivery' && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest pl-2">Delivery Intelligence</h3>
            <div className="flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-500 bg-slate-50 border-slate-200">
              <div className="flex items-start gap-3 bg-slate-950 px-4 py-3 rounded-2xl border border-slate-800 transition-all group shadow-inner">
                <MapPin size={18} className="text-primary-ink mt-1 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <FieldLabel htmlFor="checkout-address" className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-300">Street Address</FieldLabel>
                  <Textarea
                    id="checkout-address"
                    name="address"
                    autoComplete="street-address"
                    placeholder="Describe your house, road and landmark..."
                    value={customerInfo.address}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                    className="min-h-[60px] resize-none border-none bg-transparent py-0 pl-0 text-[14px] font-bold text-white placeholder:text-slate-400 focus-visible:ring-0"
                  />
                </div>
              </div>

              {customerInfo.addressSuggestion && customerInfo.addressSuggestion !== customerInfo.address && (
                <div className="bg-primary/5 border border-primary/20 p-3 rounded-xl flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-center gap-2 text-[10px] font-black text-primary-ink uppercase tracking-widest">
                    <Sparkles size={12} /> Suggested Address
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{customerInfo.addressSuggestion}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCustomerInfo(prev => ({ ...prev, address: prev.addressSuggestion || '' }))}
                    className="h-8 self-start rounded-lg border-primary/20 bg-white px-3 text-[10px] font-black uppercase tracking-tighter text-primary-ink hover:bg-primary hover:text-primary-foreground"
                  >
                    Use Suggestion
                  </Button>
                </div>
              )}
            </div>

            <LocationMap
              onLocationSelect={handleLocationSelect}
              initialDistance={customerInfo.distance}
            />

            <div className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-500 ${customerInfo.locationVerified
              ? isDistanceValid ? 'bg-green-50/50 border-green-100 shadow-sm shadow-green-100/50' : 'bg-red-50/50 border-red-100 animate-pulse'
              : 'bg-amber-50/50 border-amber-100 shadow-sm shadow-amber-100/50'
              }`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${customerInfo.locationVerified ? isDistanceValid ? 'text-green-600' : 'text-red-600' : 'text-amber-600'}`}>
                  Location Intelligence
                </span>
                {customerInfo.locationVerified && isDistanceValid && (
                  <Badge variant="secondary" className="border border-green-100 bg-white text-[10px] font-black text-green-600 shadow-sm">
                    <CheckCircle2 /> SECURED
                  </Badge>
                )}
                {customerInfo.locationVerified && !isDistanceValid && (
                  <Badge variant="destructive" className="border border-red-100 bg-white text-[10px] font-black shadow-sm">
                    <AlertCircle /> RESTRICTED
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${customerInfo.locationVerified ? isDistanceValid ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'}`}>
                  {customerInfo.locationVerified ? <Navigation size={22} className="rotate-45" /> : <AlertCircle size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-black tracking-tight ${customerInfo.locationVerified ? isDistanceValid ? 'text-green-900' : 'text-red-900' : 'text-amber-900'}`}>
                    {customerInfo.distance !== undefined
                      ? `${customerInfo.distance.toFixed(2)} km from Kitchen`
                      : 'Calibrating GPS...'}
                  </p>
                  <p className={`text-[10px] font-medium opacity-80 mt-0.5 ${customerInfo.locationVerified ? isDistanceValid ? 'text-green-700' : 'text-red-700' : 'text-amber-700'}`}>
                    {customerInfo.locationVerified
                      ? isDistanceValid ? 'Optimal route detected for swift delivery.' : `Outside 5km radius. Delivery not available.`
                      : 'Please drag the pin to a serviceable location.'}
                  </p>
                </div>
              </div>

              {!isMinOrderMet && customerInfo.deliveryType === 'delivery' && (
                <div className="mt-2 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500" />
                  <p className="text-[10px] font-bold text-red-700">Minimum ৳{MIN_ORDER_AMOUNT} required (Current: ৳{subtotal})</p>
                </div>
              )}

              {customerInfo.lat && customerInfo.lng && (
                <div className="flex items-center justify-between mt-1 pt-3 border-t border-slate-200/50">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"></div>
                    <span className="uppercase tracking-widest">Digital Coordinates</span>
                  </div>
                  <Badge variant="outline" className="rounded-lg border-slate-200/50 bg-slate-100 px-3 py-1 font-mono text-[10px] font-black text-slate-600">
                    {customerInfo.lat.toFixed(5)}, {customerInfo.lng.toFixed(5)}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}

        <Card className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 py-6 text-white ring-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full -mr-16 -mt-16 blur-3xl transition-all duration-700 group-hover:bg-primary/30"></div>
          <CardContent className="relative z-10 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Grand Total</span>
              <div className="text-3xl font-black text-white flex items-baseline gap-1">
                <span className="text-primary-ink text-sm">৳</span>{total}
              </div>
            </div>
            <div className="text-right">
              <span className="block text-slate-400 text-[10px] font-bold uppercase">Estimated Time</span>
              <span className="text-white text-xs font-black">45-60 MINS</span>
            </div>
          </CardContent>
        </Card>

        <Button
          type="button"
          onClick={handleCheckoutSubmit}
          disabled={!validation.valid}
          className="h-auto w-full rounded-[2rem] py-5 text-sm font-black shadow-2xl"
        >
          {blockingCodes.includes('outside_delivery_zone') ? 'OUTSIDE DELIVERY ZONE'
            : blockingCodes.includes('location_unverified') ? 'PIN YOUR LOCATION'
              : blockingCodes.includes('below_minimum_order') ? `MIN. ৳${MIN_ORDER_AMOUNT} REQUIRED`
                : 'PLACE ORDER NOW'} <ArrowRight className="size-5" />
        </Button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-8 text-center animate-fade-in relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-20 left-10 w-40 h-40 bg-primary rounded-full blur-[100px]"></div>
        <div className="absolute bottom-20 right-10 w-60 h-60 bg-blue-500 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 space-y-8 max-w-sm">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-primary rounded-full blur-2xl opacity-40 animate-pulse"></div>
          <div className="relative bg-white text-primary-ink w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border-4 border-primary/20 animate-scale-in">
            <CheckCircle2 size={48} strokeWidth={3} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tight leading-tight">Order Received!</h2>
          <p className="text-slate-400 text-sm font-medium px-4">Your delicious feast is being prepared by our master chefs at Four Season.</p>
        </div>

        <Card className="space-y-4 rounded-3xl border-slate-800 bg-slate-900 py-6 text-white ring-0 shadow-2xl">
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Order ID</span>
              <span className="text-primary-ink font-mono font-bold text-xs">{lastOrder?.id}</span>
            </div>
          <div className="flex justify-between items-center pt-2">
            <div className="text-left">
              <span className="block text-slate-500 text-[10px] font-black uppercase tracking-widest">Total Price</span>
              <span className="text-white font-black text-lg">৳{lastOrder?.total}</span>
            </div>
            <div className="text-right">
              <span className="block text-slate-500 text-[10px] font-black uppercase tracking-widest">Service</span>
              <span className="text-white font-black uppercase text-xs">{lastOrder?.customerInfo?.deliveryType}</span>
            </div>
          </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              <div className="text-left">
                <span className="block text-slate-500 text-[10px] font-black uppercase tracking-widest">Payment</span>
                <span className="text-white font-black text-xs">
                  {PAYMENT_METHODS.find(m => m.id === lastOrder?.paymentMethod)?.label ?? '—'}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-slate-500 text-[10px] font-black uppercase tracking-widest">Status</span>
                <span className={`font-black uppercase text-xs ${lastOrder?.paymentStatus === 'paid' ? 'text-green-400' : 'text-amber-400'}`}>
                  {lastOrder?.paymentStatus === 'paid' ? 'Paid (simulated)' : 'Due on delivery'}
                </span>
              </div>
            </div>
            {lastOrder?.paymentReference && (
              <p className="text-[10px] text-slate-500 font-mono pt-3 border-t border-slate-800">
                Auth ref: {lastOrder.paymentReference}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Button
            type="button"
            onClick={onClose}
            className="h-auto w-full rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-widest text-slate-950 shadow-xl hover:bg-slate-100"
          >
            Continue Chat
          </Button>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">4seasons Dhanmondi • Since 2007</p>
        </div>
      </div>
    </div>
  );

  const renderPayment = () => {
    const selected = PAYMENT_METHODS.find(method => method.id === paymentMethod)!;

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
          <div className="p-4 flex items-center gap-2">
            <Button type="button" size="icon-lg" variant="ghost" onClick={() => setView('checkout')} aria-label="Back to your details" className="-ml-2 size-10 rounded-full text-slate-600 hover:bg-slate-100">
              <ChevronLeft className="size-5" aria-hidden="true" />
            </Button>
            <h2 className="font-bold text-lg text-slate-900">Payment</h2>
          </div>
          {renderStepper()}
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-32 space-y-5">
          {/* Honesty first: this is the most important text on the screen. */}
          <p className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold leading-snug rounded-2xl px-4 py-3">
            <ShieldCheck size={16} className="shrink-0 mt-px text-amber-600" aria-hidden="true" />
            {PAYMENT_SIMULATED_NOTICE}
          </p>

          <FieldSet className="space-y-2">
            <FieldLegend className="mb-2 pl-2 text-[10px] font-black uppercase tracking-widest text-slate-900">How would you like to pay?</FieldLegend>
            {PAYMENT_METHODS.map(method => {
              const Icon = PAYMENT_ICONS[method.icon];
              const isSelected = paymentMethod === method.id;
              return (
                /*
                  A FieldLabel wrapping a real radio input: base-ui's RadioGroup is not in the
                  installed set, and a native radio inside a label gives the same keyboard and
                  screen-reader behaviour (arrow keys, single tab stop) that a custom widget
                  would have to reimplement. The visible dot is decorative only.
                */
                <FieldLabel
                  key={method.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${isSelected
                      ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={method.id}
                    checked={isSelected}
                    onChange={() => setPaymentMethod(method.id)}
                    className="sr-only"
                  />
                  <span className={`shrink-0 rounded-xl p-2.5 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-black text-slate-900">{method.label}</span>
                    <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-600">{method.blurb}</span>
                  </span>
                  <span aria-hidden="true" className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-primary' : 'border-slate-300'}`}>
                    {isSelected && <span className="size-2.5 rounded-full bg-primary" />}
                  </span>
                </FieldLabel>
              );
            })}
          </FieldSet>

          {paymentMethod === 'card' && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <Field>
                  <FieldLabel htmlFor="pay-card" className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Card Number</FieldLabel>
                  <Input
                    id="pay-card"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder={DEMO_CARD_NUMBER}
                    value={paymentDetails.cardNumber ?? ''}
                    onChange={e => setPaymentDetails(d => ({ ...d, cardNumber: e.target.value }))}
                    className="h-11 rounded-xl border-slate-100 bg-slate-50 font-mono font-bold text-slate-900"
                  />
                  <FieldDescription className="mt-1.5 text-[10px] text-slate-500">
                    Demo hint: use {DEMO_CARD_NUMBER}
                    {paymentDetails.cardNumber && (
                      <span className="mt-0.5 block font-mono text-slate-600">
                        Will charge {maskCardNumber(paymentDetails.cardNumber)}
                      </span>
                    )}
                  </FieldDescription>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="pay-expiry" className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Expiry</FieldLabel>
                    <Input
                      id="pay-expiry"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={paymentDetails.expiry ?? ''}
                      onChange={e => setPaymentDetails(d => ({ ...d, expiry: e.target.value }))}
                      className="h-11 rounded-xl border-slate-100 bg-slate-50 font-bold text-slate-900"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pay-cvc" className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">CVC</FieldLabel>
                    <Input
                      id="pay-cvc"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      value={paymentDetails.cvc ?? ''}
                      onChange={e => setPaymentDetails(d => ({ ...d, cvc: e.target.value }))}
                      className="h-11 rounded-xl border-slate-100 bg-slate-50 font-bold text-slate-900"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'mobile_banking' && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <Field>
                  <FieldLabel htmlFor="pay-wallet" className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Mobile Wallet Number</FieldLabel>
                  <Input
                    id="pay-wallet"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="01712345678"
                    value={paymentDetails.walletNumber ?? ''}
                    onChange={e => setPaymentDetails(d => ({ ...d, walletNumber: e.target.value }))}
                    className="h-11 rounded-xl border-slate-100 bg-slate-50 font-bold text-slate-900"
                  />
                  <FieldDescription className="mt-1.5 text-[10px] text-slate-500">The 11-digit number linked to your bKash, Nagad or Rocket account.</FieldDescription>
                </Field>
              </div>
            </div>
          )}

          <Card className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 py-6 text-white ring-0 shadow-2xl">
            <CardContent className="relative z-10 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Amount Due</span>
                <div className="text-3xl font-black text-white flex items-baseline gap-1">
                  <span className="text-primary-ink text-sm">৳</span>{total}
                </div>
              </div>
              <div className="text-right">
                <span className="block text-slate-400 text-[10px] font-bold uppercase">Paying with</span>
                <span className="text-white text-xs font-black">{selected.label}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white/80 backdrop-blur-md border-t border-slate-100 p-3 @lg:p-4 absolute bottom-0 left-0 right-0 z-30 safe-b-4">
          <Button
            type="button"
            onClick={handlePaymentSubmit}
            disabled={authorizing}
            aria-busy={authorizing}
            className="h-auto w-full rounded-2xl py-4.5 font-black shadow-2xl"
          >
            {authorizing ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Authorising…
              </>
            ) : (
              <>
                {paymentMethod === 'cod' ? 'Place Order' : `Pay ৳${total}`}
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden shadow-glass">
      {view === 'menu' ? renderMenu()
        : view === 'cart' ? renderCart()
          : view === 'checkout' ? renderCheckout()
            : view === 'payment' ? renderPayment()
              : renderSuccess()}
    </div>
  );
};
