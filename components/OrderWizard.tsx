'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, memo } from 'react';
import { X, ChevronLeft, ShoppingBag, Plus, Minus, Trash2, Search, Bike, Store, User, Phone as PhoneIcon, CheckCircle2, Navigation, AlertCircle, ArrowRight, MapPin, StickyNote, Receipt, Sparkles } from 'lucide-react';

import { RESTAURANT_DATA, MIN_ORDER_AMOUNT, MAX_DELIVERY_RANGE } from '@/lib/constants';
import { Order, CartItem, MenuItem, CustomerInfo } from '@/lib/types';
import { MenuItemCard } from './wizard/MenuItemCard';
import { LocationMap } from './wizard/LocationMap';

interface Props {
  onClose: () => void;
  onSubmit: (order: Order) => void;
  currentOrder: Order | null;
  onUpdateOrder: (order: Order) => void;
  initialView?: 'menu' | 'cart' | 'checkout';
  initialCategoryId?: string;
  initialSubCategoryId?: string;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isTabMode?: boolean;
}

const DEFAULT_DELIVERY_FEE = 0;
const EMPTY_CUSTOMER_INFO: CustomerInfo = { name: '', phone: '', deliveryType: 'pickup', address: '', locationVerified: false, distance: undefined };

export const OrderWizard: React.FC<Props> = ({
  onClose, onSubmit, currentOrder, onUpdateOrder,
  initialView = 'menu', initialCategoryId, initialSubCategoryId,
  showToast, isTabMode = false
}) => {
  const [view, setView] = useState<'menu' | 'cart' | 'checkout' | 'success'>(initialView);
  const [activeCategory, setActiveCategory] = useState<string>(initialCategoryId || RESTAURANT_DATA.menu.categories[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [cartItems, setCartItems] = useState<CartItem[]>(currentOrder?.items || []);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>(currentOrder?.customerInfo || EMPTY_CUSTOMER_INFO);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  // Track if we've initialized to prevent re-syncing
  const initializedRef = useRef(false);

  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);

  // One-time initialization from currentOrder prop
  useEffect(() => {
    if (!initializedRef.current && currentOrder) {
      setCartItems(currentOrder.items || []);
      setCustomerInfo(currentOrder.customerInfo || EMPTY_CUSTOMER_INFO);
      initializedRef.current = true;
    }
  }, [currentOrder]);

  // Sync category if prop changes
  useEffect(() => {
    if (initialCategoryId) setActiveCategory(initialCategoryId);
  }, [initialCategoryId]);

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

  const { subtotal, deliveryFee, total, totalItems, isMinOrderMet, isDistanceValid } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => sum + item.total, 0);
    const fee = customerInfo.deliveryType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;

    // Minimum order check: only for delivery
    const minOrderMet = customerInfo.deliveryType === 'delivery' ? sub >= MIN_ORDER_AMOUNT : true;

    // Distance binding: only for delivery, must be within MAX_DELIVERY_RANGE (5km)
    const distanceValid = customerInfo.deliveryType === 'delivery'
      ? (customerInfo.distance === undefined || customerInfo.distance <= MAX_DELIVERY_RANGE)
      : true;

    return {
      subtotal: sub,
      deliveryFee: fee,
      total: sub + fee,
      totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0),
      isMinOrderMet: minOrderMet,
      isDistanceValid: distanceValid
    };
  }, [cartItems, customerInfo.deliveryType, customerInfo.distance]);

  // Debounced update to parent - only when local state changes
  const updateTimeoutRef = useRef<any>(null);
  useEffect(() => {
    if (view === 'success' || !initializedRef.current) return;

    // Clear previous timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Debounce updates to parent
    updateTimeoutRef.current = setTimeout(() => {
      onUpdateOrder({
        id: currentOrder?.id || '',
        items: cartItems,
        customerInfo,
        status: 'draft',
        subtotal,
        deliveryFee,
        total,
        createdAt: currentOrder?.createdAt || new Date(),
        paymentStatus: 'pending'
      });
    }, 100);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [cartItems, customerInfo, subtotal, deliveryFee, total, view]);

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
      { id: 'success', label: 'Finish', icon: <CheckCircle2 size={12} /> }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === view);

    return (
      <div className="px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 z-0"></div>
          <div
            className="absolute top-1/2 left-0 h-0.5 bg-brand-500 -translate-y-1/2 z-0 transition-all duration-500"
            style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
          ></div>

          {steps.map((step, idx) => {
            const isActive = view === step.id;
            const isCompleted = currentStepIndex > idx;

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${isActive ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/20 scale-110' :
                  isCompleted ? 'bg-white border-brand-500 text-brand-500' :
                    'bg-white border-slate-200 text-slate-400'
                  }`}>
                  {isCompleted ? <CheckCircle2 size={16} /> : step.icon}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-tighter mt-2 transition-colors duration-300 ${isActive ? 'text-slate-900' : 'text-slate-400'
                  }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleCheckoutSubmit = () => {
    const bdPhoneRegex = /^(?:\+88|88)?(01[3-9]\d{8})$/;
    if (!bdPhoneRegex.test(customerInfo.phone.replace(/[\s-]/g, ''))) {
      showToast("Please provide a valid BD mobile number", 'error');
      return;
    }
    if (customerInfo.deliveryType === 'delivery') {
      if (!customerInfo.address) { showToast("Delivery address required", 'error'); return; }
      if (!customerInfo.locationVerified) { showToast("Please pin location on map", 'error'); return; }
      if (!isMinOrderMet) { showToast(`Minimum ৳${MIN_ORDER_AMOUNT} for delivery`, 'error'); return; }
      if (!isDistanceValid) { showToast(`Outside delivery zone (${MAX_DELIVERY_RANGE}km)`, 'error'); return; }
    }
    const finalOrder: Order = {
      id: currentOrder?.id || `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      items: cartItems,
      customerInfo,
      status: 'confirmed',
      subtotal,
      deliveryFee,
      total,
      createdAt: currentOrder?.createdAt || new Date(),
      paymentStatus: 'pending'
    };
    setLastOrder(finalOrder);
    onSubmit(finalOrder);
    setView('success');
  };

  const menuItemsForSearch = useMemo(() => {
    let items: MenuItem[] = [];
    RESTAURANT_DATA.menu.categories.forEach(cat => {
      if (cat.items) items.push(...cat.items);
      if (cat.subcategories) cat.subcategories.forEach(sub => items.push(...sub.items));
    });
    return items;
  }, []);

  const renderMenu = () => {
    const category = RESTAURANT_DATA.menu.categories.find(c => c.id === activeCategory);
    const displayItems = deferredSearchQuery
      ? menuItemsForSearch.filter(item =>
        item.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(deferredSearchQuery.toLowerCase()) ||
        item.code.includes(deferredSearchQuery)
      )
      : [];

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="bg-white sticky top-0 z-20 shadow-sm border-b border-slate-100">
          {!isTabMode && (
            <div className="px-4 py-2 flex justify-between items-center border-b border-slate-50">
              <span className="text-xs font-bold text-slate-400">Order Online</span>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
          )}
          {renderStepper()}
          <div className="p-4 pb-2">
            <div className="relative group">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search menu..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-100 border-transparent focus:bg-white border focus:border-brand-500 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none transition-all" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
            </div>
          </div>
          {!searchQuery && (
            <div className="px-4 pb-3 overflow-x-auto no-scrollbar flex gap-2" ref={categoryScrollRef}>
              {RESTAURANT_DATA.menu.categories.map(cat => (
                <button key={cat.id} data-category-id={cat.id} onClick={() => setActiveCategory(cat.id)} className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-bold transition-all border shadow-sm flex items-center gap-1.5 active:scale-95 ${activeCategory === cat.id ? 'bg-slate-900 text-white border-slate-900 shadow-slate-500/20' : 'bg-white text-slate-600 border-slate-200'}`}>
                  <span>{cat.icon}</span> {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 pb-24 overflow-y-auto flex-1 scroll-smooth" ref={menuListRef}>
          {searchQuery ? (
            <div className="grid grid-cols-2 gap-3">{displayItems.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>
          ) : category ? (
            <div className="space-y-6">
              {category.minimum_order && <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-3 text-amber-800 text-xs"><AlertCircle size={16} className="shrink-0" /> Minimum order: {category.minimum_order} {category.minimum_order_unit}</div>}

              {category.subcategories ? category.subcategories.map(sub => (
                <div key={sub.id} id={`subcategory-${sub.id}`} className="scroll-mt-32">
                  <div className="flex items-center gap-2 mb-3 pl-1">
                    <div className="h-4 w-1 bg-brand-500 rounded-full"></div>
                    <h4 className="font-bold text-slate-800 text-sm">{sub.name}</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">{sub.items.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>
                </div>
              )) : <div className="grid grid-cols-2 gap-3">{category.items?.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart} count={cartItems.find(i => i.code === item.code)?.quantity || 0} />)}</div>}
            </div>
          ) : null}
        </div>

        {totalItems > 0 && view === 'menu' && (
          <div className="p-4 absolute bottom-0 left-0 right-0 z-10">
            <button
              onClick={() => setView('cart')}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-xl flex items-center justify-between px-6 active:scale-95 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <ShoppingBag size={18} />
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] opacity-70 uppercase tracking-widest">View Cart</span>
                  <span className="text-xs font-black">{totalItems} Items</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">৳{subtotal}</span>
                <ArrowRight size={16} />
              </div>
            </button>
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
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={24} className="opacity-50" />
            </div>
            <p className="font-medium text-sm">Your cart is empty</p>
            <button onClick={() => setView('menu')} className="mt-4 text-white bg-brand-600 px-6 py-2 rounded-full font-bold text-xs shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform">Start Ordering</button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cartItems.map(item => (
                <div key={item.code} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex gap-3 relative overflow-hidden animate-fade-in">
                  <div className="flex flex-col items-center justify-between bg-slate-50 rounded-lg w-8 py-1 shrink-0 border border-slate-100">
                    <button onClick={() => updateQuantity(item.code, 1)} className="p-1 hover:text-brand-600 transition-colors"><Plus size={10} strokeWidth={3} /></button>
                    <span className="text-xs font-bold text-slate-800">{item.quantity}</span>
                    <button onClick={() => item.quantity === 1 ? removeFromCart(item.code) : updateQuantity(item.code, -1)} className={`p-1 transition-colors ${item.quantity === 1 ? 'text-red-400 hover:text-red-600' : 'hover:text-brand-600'}`}>
                      {item.quantity === 1 ? <Trash2 size={10} /> : <Minus size={10} strokeWidth={3} />}
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-black text-[13.5px] text-slate-900 leading-tight pr-2 uppercase tracking-tight">{item.name}</h4>
                      <span className="font-black text-[14px] text-brand-600 whitespace-nowrap">৳{item.total}</span>
                    </div>
                    <div className="relative mt-1">
                      <StickyNote size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Add notes..."
                        value={item.specialInstructions || ''}
                        onChange={(e) => updateItemNote(item.code, e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-md text-[10px] py-1.5 pl-6 pr-2 focus:outline-none focus:border-brand-200 transition-all text-slate-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 pl-1">Payment Summary</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm text-slate-500 font-medium"><span>Subtotal</span><span className="text-slate-900">৳{subtotal}</span></div>
                <div className="flex justify-between text-sm text-slate-500 font-medium"><span>Delivery Fee</span><span className="text-slate-900">{customerInfo.deliveryType === 'delivery' ? 'Calculated later' : '৳0'}</span></div>
                <div className="border-t border-dashed border-slate-200 my-4"></div>
                <div className="flex justify-between items-center text-lg font-black text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-brand-600">৳{subtotal}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-3">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Delivery Policy</h4>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Bike size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">Minimum ৳{MIN_ORDER_AMOUNT} for Home Delivery</p>
                    <p className="text-[9px] text-slate-500">Free delivery within 5km radius</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                    <Store size={14} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-700">No Minimum for Pickup</p>
                    <p className="text-[9px] text-slate-500">Collect from our Dhanmondi kitchen</p>
                  </div>
                </div>
              </div>

              {subtotal < MIN_ORDER_AMOUNT && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start mt-4">
                  <div className="bg-amber-100 p-2 rounded-xl text-amber-600"><AlertCircle size={20} /></div>
                  <div className="flex-1">
                    <p className="text-xs text-amber-900 font-black uppercase tracking-wider">Delivery Notice</p>
                    <p className="text-[10px] text-amber-700 font-medium mt-1 leading-relaxed">Your current subtotal is ৳{subtotal}. Add items worth ৳{MIN_ORDER_AMOUNT - subtotal} more if you want Home Delivery.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="bg-white/80 backdrop-blur-md border-t border-slate-100 p-4 absolute bottom-0 left-0 right-0 z-30 pb-8 md:pb-4">
          <button
            onClick={() => setView('checkout')}
            className="w-full bg-slate-900 text-white py-4.5 rounded-2xl font-black shadow-2xl shadow-slate-900/30 flex items-center justify-between px-8 hover:scale-[1.02] active:scale-[0.98] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-xl group-hover:bg-brand-500 transition-colors">
                <ArrowRight size={18} />
              </div>
              <span className="uppercase tracking-widest text-xs">Review Details</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">৳{subtotal}</span>
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
            </div>
          </button>
        </div>
      )}
    </div>
  );

  const renderCheckout = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="p-4 flex items-center gap-2">
          <button onClick={() => setView('cart')} className="p-1 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft size={20} /></button>
          <h2 className="font-bold text-lg text-slate-900">Checkout</h2>
        </div>
        {renderStepper()}
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6">

        <div className="bg-slate-200/50 p-1.5 rounded-2xl flex relative h-14">
          <div
            className={`absolute top-1.5 bottom-1.5 w-[48.5%] bg-white rounded-xl shadow-lg transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${customerInfo.deliveryType === 'delivery' ? 'left-1.5' : 'left-[50%]'}`}
          ></div>
          {['delivery', 'pickup'].map(t => (
            <button
              key={t}
              onClick={() => setCustomerInfo(prev => ({ ...prev, deliveryType: t as any }))}
              className={`flex-1 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] relative z-10 flex items-center justify-center gap-2 transition-all duration-300 ${customerInfo.deliveryType === t ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {t === 'delivery' ? <Bike size={14} className={customerInfo.deliveryType === t ? 'text-brand-500' : ''} /> : <Store size={14} className={customerInfo.deliveryType === t ? 'text-brand-500' : ''} />} {t}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest pl-2">Customer Profile</h3>
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-4 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100/50 transition-all group">
              <User size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <div className="flex-1">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</span>
                <input type="text" placeholder="e.g. John Doe" value={customerInfo.name} onChange={e => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))} className="bg-transparent w-full text-[14px] outline-none font-bold text-slate-900 placeholder:text-slate-300 mt-0.5" />
              </div>
            </div>
            <div className="flex items-center gap-4 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100/50 transition-all group">
              <PhoneIcon size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <div className="flex-1">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile Number</span>
                <input type="tel" placeholder="+880 1XXX-XXXXXX" value={customerInfo.phone} onChange={e => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))} className="bg-transparent w-full text-[14px] outline-none font-bold text-slate-900 placeholder:text-slate-300 mt-0.5" />
              </div>
            </div>
          </div>
        </div>

        {customerInfo.deliveryType === 'delivery' && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest pl-2">Delivery Intelligence</h3>
            <div className="flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-500 bg-slate-50 border-slate-200">
              <div className="flex items-start gap-3 bg-slate-950 px-4 py-3 rounded-2xl border border-slate-800 transition-all group shadow-inner">
                <MapPin size={18} className="text-brand-500 mt-1 shrink-0" />
                <div className="flex-1">
                  <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Street Address</span>
                  <textarea
                    placeholder="Describe your house, road and landmark..."
                    value={customerInfo.address}
                    onChange={e => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                    className="bg-transparent w-full text-[14px] outline-none font-bold text-white placeholder:text-slate-700 resize-none min-h-[60px]"
                  />
                </div>
              </div>

              {customerInfo.addressSuggestion && customerInfo.addressSuggestion !== customerInfo.address && (
                <div className="bg-brand-50 border border-brand-100 p-3 rounded-xl flex flex-col gap-2 animate-fade-in">
                  <div className="flex items-center gap-2 text-[10px] font-black text-brand-600 uppercase tracking-widest">
                    <Sparkles size={12} /> Suggested Address
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{customerInfo.addressSuggestion}</p>
                  <button
                    onClick={() => setCustomerInfo(prev => ({ ...prev, address: prev.addressSuggestion || '' }))}
                    className="text-[10px] font-black text-brand-600 bg-white border border-brand-200 py-1.5 rounded-lg hover:bg-brand-600 hover:text-white transition-all uppercase tracking-tighter"
                  >
                    Use Suggestion
                  </button>
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
                  <span className="flex items-center gap-1.5 text-[9px] font-black text-green-600 bg-white shadow-sm px-3 py-1 rounded-full border border-green-100">
                    <CheckCircle2 size={12} /> SECURED
                  </span>
                )}
                {customerInfo.locationVerified && !isDistanceValid && (
                  <span className="flex items-center gap-1.5 text-[9px] font-black text-red-600 bg-white shadow-sm px-3 py-1 rounded-full border border-red-100">
                    <AlertCircle size={12} /> RESTRICTED
                  </span>
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
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"></div>
                    <span className="uppercase tracking-widest">Digital Coordinates</span>
                  </div>
                  <span className="text-[10px] font-mono font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200/50">
                    {customerInfo.lat.toFixed(5)}, {customerInfo.lng.toFixed(5)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/20 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-brand-500/30 transition-all duration-700"></div>
          <div className="relative z-10 flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Grand Total</span>
              <div className="text-3xl font-black text-white flex items-baseline gap-1">
                <span className="text-brand-500 text-sm">৳</span>{total}
              </div>
            </div>
            <div className="text-right">
              <span className="block text-slate-400 text-[9px] font-bold uppercase">Estimated Time</span>
              <span className="text-white text-xs font-black">45-60 MINS</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleCheckoutSubmit}
          disabled={
            !customerInfo.name ||
            !customerInfo.phone ||
            !isMinOrderMet ||
            !isDistanceValid ||
            (customerInfo.deliveryType === 'delivery' && (!customerInfo.address || !customerInfo.locationVerified))
          }
          className="w-full bg-brand-600 text-white py-5 rounded-[2rem] font-black disabled:opacity-30 disabled:grayscale shadow-2xl shadow-brand-500/30 text-sm flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all transform border-b-4 border-brand-800"
        >
          {customerInfo.deliveryType === 'delivery' && !isDistanceValid
            ? 'OUTSIDE DELIVERY ZONE'
            : customerInfo.deliveryType === 'delivery' && !isMinOrderMet
              ? `MIN. ৳${MIN_ORDER_AMOUNT} REQUIRED`
              : 'PLACE ORDER NOW'} <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col h-full bg-slate-950 items-center justify-center p-8 text-center animate-fade-in relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-20 left-10 w-40 h-40 bg-brand-500 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-20 right-10 w-60 h-60 bg-blue-500 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 space-y-8 max-w-sm">
        <div className="relative inline-block">
          <div className="absolute inset-0 bg-brand-500 rounded-full blur-2xl opacity-40 animate-pulse"></div>
          <div className="relative bg-white text-brand-600 w-24 h-24 rounded-full flex items-center justify-center shadow-2xl border-4 border-brand-100 animate-scale-in">
            <CheckCircle2 size={48} strokeWidth={3} />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tight leading-tight">Order Received!</h2>
          <p className="text-slate-400 text-sm font-medium px-4">Your delicious feast is being prepared by our master chefs at Four Season.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Order ID</span>
            <span className="text-brand-400 font-mono font-bold text-xs">{lastOrder?.id}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <div className="text-left">
              <span className="block text-slate-500 text-[9px] font-black uppercase tracking-widest">Total Price</span>
              <span className="text-white font-black text-lg">৳{lastOrder?.total}</span>
            </div>
            <div className="text-right">
              <span className="block text-slate-500 text-[9px] font-black uppercase tracking-widest">Service</span>
              <span className="text-white font-black uppercase text-xs">{lastOrder?.customerInfo?.deliveryType}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={onClose}
            className="w-full bg-white text-slate-950 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            Continue Chat
          </button>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">4seasons Dhanmondi • Since 2007</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden shadow-glass">
      {view === 'menu' ? renderMenu() : view === 'cart' ? renderCart() : view === 'checkout' ? renderCheckout() : renderSuccess()}
    </div>
  );
};
