'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    AlertCircle, Banknote, Bike, ChevronLeft, Loader2,
    MapPin, Minus, Navigation, Phone as PhoneIcon, Plus, Store, User, X,
} from 'lucide-react';
import { RESTAURANT_DATA, MAX_DELIVERY_RANGE } from '@/lib/constants';
import { validateOrder, firstIssue, lineTotalOf } from '@/lib/order';
import { itemsOf } from '@/lib/menuIndex';
import type { CustomerInfo, MenuItem, Order } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MenuItemCard } from '@/components/wizard/MenuItemCard';

/**
 * The map is the one component here that cannot be server-rendered: react-leaflet touches
 * `window` while its module is being evaluated, so a static import fails the prerender of any
 * page that pulls this card in. The order wizard hit the same wall and solved it by loading
 * itself with `ssr: false`; with the wizard gone, the exemption moves to the map itself.
 */
const LocationMap = dynamic(() => import('@/components/wizard/LocationMap').then(m => m.LocationMap), {
    ssr: false,
    loading: () => (
        // Holds the map's exact footprint so the card does not jump when the tiles arrive.
        <div className="h-48 w-full animate-pulse rounded-2xl bg-slate-100" aria-hidden="true" />
    ),
});

/**
 * The interactive parts of ordering, rendered as cards inside the conversation.
 *
 * These cover the two things a conversation cannot do: browsing a 230-item catalogue legibly, and
 * placing a pin on a map. Everything else the waiter drives from the thread.
 */


/** Shared chrome so every card reads as the same object in the log. */
function CardShell({ title, subtitle, onClose, children, tone = 'light' }: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    tone?: 'light' | 'dark';
}) {
    return (
        <div className={`w-full overflow-hidden rounded-2xl border ${tone === 'dark'
            ? 'border-slate-800 bg-slate-950 text-white'
            : 'border-slate-200 bg-white shadow-[0_8px_28px_-16px_rgba(15,23,42,0.35)]'}`}>
            <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${tone === 'dark' ? 'border-white/10' : 'border-slate-100'}`}>
                <div className="min-w-0">
                    <h3 className={`font-heading text-[13px] font-extrabold leading-tight ${tone === 'dark' ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                    {subtitle && <p className={`mt-0.5 text-[11px] leading-snug ${tone === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>{subtitle}</p>}
                </div>
                <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={onClose}
                    aria-label={`Close ${title.toLowerCase()}`}
                    className={`-mr-1 shrink-0 rounded-full ${tone === 'dark' ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                >
                    <X className="size-4" aria-hidden="true" />
                </Button>
            </div>
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ menu card */

export function MenuPickerCard({ focusCategoryId, focusSubcategoryId, onAdd, cartCounts, onClose }: {
    focusCategoryId?: string;
    focusSubcategoryId?: string;
    onAdd: (item: MenuItem) => void;
    cartCounts: Map<string, number>;
    onClose: () => void;
}) {
    const categories = RESTAURANT_DATA.menu.categories;
    const [categoryId, setCategoryId] = useState(focusCategoryId ?? categories[0]?.id);
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(focusSubcategoryId);
    const [expanded, setExpanded] = useState(false);

    const category = categories.find(c => c.id === categoryId) ?? categories[0];

    /*
      A subcategory id only means something inside the category that owns it. Resolving it
      against the *current* category is what stops a stale id from silently widening the list
      back to the whole category.
    */
    const subcategory = category?.kind === 'nested'
        ? category.subcategories.find(s => s.id === subcategoryId)
        : undefined;

    const items = useMemo(() => {
        if (subcategory) return subcategory.items;
        if (category) return itemsOf(category);
        return [];
    }, [category, subcategory]);

    const heading = subcategory && category
        ? `${category.name} / ${subcategory.name}`
        : (category?.name ?? 'Menu');

    return (
        <CardShell
            title={heading}
            subtitle={items.length > 0 ? `${items.length} ${items.length === 1 ? 'dish' : 'dishes'} — tap to add` : undefined}
            onClose={onClose}
        >
            <div className="px-3 pt-3">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Menu categories">
                    {categories.map(cat => (
                        <Button
                            key={cat.id}
                            type="button"
                            variant="outline"
                            aria-pressed={categoryId === cat.id}
                            onClick={() => { setCategoryId(cat.id); setSubcategoryId(undefined); setExpanded(false); }}
                            className={`h-8 shrink-0 gap-1 whitespace-nowrap rounded-full px-3 text-[11px] font-bold transition-colors ${categoryId === cat.id
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-primary-ink/30 hover:bg-primary/5'}`}
                        >
                            <span aria-hidden="true">{cat.icon}</span> {cat.name}
                        </Button>
                    ))}
                </div>

                {/*
                  The way back out. Without it, arriving at "Soup" from the waiter is a
                  one-way door: the only way to see the rest of the category is to close the
                  card and ask again.
                */}
                {subcategory && category && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { setSubcategoryId(undefined); setExpanded(false); }}
                        className="mt-1.5 h-7 w-full rounded-full text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                    >
                        Show all of {category.name}
                    </Button>
                )}
            </div>

            <div className="p-3">
                {items.length === 0 ? (
                    <p className="py-6 text-center text-[12px] text-slate-500">Nothing in this section right now.</p>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {items.slice(0, expanded ? items.length : 6).map(item => (
                            <MenuItemCard key={item.id} item={item} onAdd={onAdd} count={cartCounts.get(item.code) ?? 0} />
                        ))}
                    </div>
                )}

                {items.length > 6 && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setExpanded(v => !v)}
                        className="mt-2 h-8 w-full rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                    >
                        {expanded ? 'Show less' : `Show all ${items.length} dishes`}
                    </Button>
                )}
            </div>
        </CardShell>
    );
}

/* ---------------------------------------------------------------- basket card */

export function BasketCard({ order, onQuantity, onCheckout, onClose }: {
    order: Order;
    onQuantity: (code: string, next: number) => void;
    onCheckout: () => void;
    onClose: () => void;
}) {
    return (
        <CardShell title="Your basket" subtitle={`${order.items.length} ${order.items.length === 1 ? 'item' : 'items'}`} onClose={onClose}>
            <div className="divide-y divide-slate-100">
                {order.items.map(line => (
                    <div key={line.code} className="flex items-center gap-2 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-bold text-slate-900">{line.name}</p>
                            {line.specialInstructions && (
                                <p className="truncate text-[10px] italic text-slate-500">{line.specialInstructions}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                size="icon-xs"
                                variant="outline"
                                onClick={() => onQuantity(line.code, line.quantity - 1)}
                                aria-label={line.quantity === 1 ? `Remove ${line.name}` : `One fewer ${line.name}`}
                                className="size-7 rounded-full border-slate-200 text-slate-600 hover:border-primary-ink/40 hover:bg-primary/5"
                            >
                                <Minus className="size-3.5" aria-hidden="true" />
                            </Button>
                            <span className="w-5 text-center text-[12px] font-black tabular-nums text-slate-900">{line.quantity}</span>
                            <Button
                                type="button"
                                size="icon-xs"
                                variant="outline"
                                onClick={() => onQuantity(line.code, line.quantity + 1)}
                                aria-label={`One more ${line.name}`}
                                className="size-7 rounded-full border-slate-200 text-slate-600 hover:border-primary-ink/40 hover:bg-primary/5"
                            >
                                <Plus className="size-3.5" aria-hidden="true" />
                            </Button>
                        </div>
                        <span className="w-16 shrink-0 text-right text-[12px] font-black tabular-nums text-primary-ink">৳{line.total}</span>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Subtotal</span>
                <span className="text-base font-black tabular-nums text-slate-900">৳{order.subtotal}</span>
            </div>

            <div className="p-3">
                <Button
                    type="button"
                    onClick={onCheckout}
                    className="h-11 w-full rounded-xl bg-gradient-to-br from-primary to-emerald-400 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-[0_10px_26px_-12px_oklch(0.841_0.238_128.85/0.85)] hover:brightness-105"
                >
                    Continue to checkout
                </Button>
            </div>
        </CardShell>
    );
}

/* -------------------------------------------------------------- checkout card */

export function CheckoutCard({ draft, onCustomerChange, onLocation, onContinue, onBack, onClose }: {
    draft: Order;
    onCustomerChange: (next: CustomerInfo) => void;
    onLocation: (lat: number, lng: number, distance: number, verified: boolean, address?: string) => void;
    onContinue: () => void;
    onBack: () => void;
    onClose: () => void;
}) {
    const info = draft.customerInfo;
    // The single source of truth for whether this order may proceed. Same validator the
    // checkout screen used, so the rules a guest is held to cannot drift between surfaces.
    const validation = validateOrder(draft);
    const blocking = validation.issues.map(i => i.code);
    const isDelivery = info?.deliveryType === 'delivery';
    const set = (patch: Partial<CustomerInfo>) => onCustomerChange({ ...(info as CustomerInfo), ...patch });

    return (
        <CardShell title="Checkout" subtitle="Almost there — just where it's going." onClose={onClose}>
            <div className="space-y-3 p-4">
                <div className="flex gap-1.5" role="group" aria-label="How would you like your order?">
                    {(['delivery', 'pickup'] as const).map(mode => {
                        const active = info?.deliveryType === mode;
                        const Icon = mode === 'delivery' ? Bike : Store;
                        return (
                            <Button
                                key={mode}
                                type="button"
                                variant="outline"
                                aria-pressed={active}
                                onClick={() => set({ deliveryType: mode })}
                                className={`h-10 flex-1 gap-1.5 rounded-xl text-[11px] font-bold transition-colors ${active
                                    ? 'border-primary bg-primary/10 text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary-ink/30'}`}
                            >
                                <Icon className={`size-4 ${active ? 'text-primary-ink' : ''}`} aria-hidden="true" />
                                {mode === 'delivery' ? 'Delivery' : 'Pickup'}
                            </Button>
                        );
                    })}
                </div>

                <Field className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-ink/40 focus-within:ring-4 focus-within:ring-primary/10">
                    <User className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div className="flex-1">
                        <FieldLabel htmlFor="chat-ck-name" className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Name</FieldLabel>
                        <Input
                            id="chat-ck-name"
                            name="name"
                            autoComplete="name"
                            placeholder="e.g. Ayesha Rahman"
                            value={info?.name ?? ''}
                            onChange={e => set({ name: e.target.value })}
                            className="h-auto border-none bg-transparent py-0 pl-0 text-[13px] font-bold text-slate-900 focus-visible:ring-0 placeholder:text-slate-400"
                        />
                    </div>
                </Field>

                <Field className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-ink/40 focus-within:ring-4 focus-within:ring-primary/10">
                    <PhoneIcon className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
                    <div className="flex-1">
                        <FieldLabel htmlFor="chat-ck-phone" className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Mobile</FieldLabel>
                        <Input
                            id="chat-ck-phone"
                            name="tel"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="01712345678"
                            value={info?.phone ?? ''}
                            onChange={e => set({ phone: e.target.value })}
                            className="h-auto border-none bg-transparent py-0 pl-0 text-[13px] font-bold text-slate-900 focus-visible:ring-0 placeholder:text-slate-400"
                        />
                    </div>
                </Field>

                {isDelivery && (
                    <>
                        <Field className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 focus-within:ring-4 focus-within:ring-primary/20">
                            <MapPin className="mt-1.5 size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                            <div className="flex-1">
                                <FieldLabel htmlFor="chat-ck-address" className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Street address</FieldLabel>
                                <Textarea
                                    id="chat-ck-address"
                                    name="address"
                                    autoComplete="street-address"
                                    placeholder="House, road, nearest landmark..."
                                    value={info?.address ?? ''}
                                    onChange={e => set({ address: e.target.value })}
                                    className="min-h-[48px] resize-none border-none bg-transparent py-0 pl-0 text-[13px] font-bold text-white placeholder:text-slate-500 focus-visible:ring-0"
                                />
                            </div>
                        </Field>

                        {/*
                          The address above is what the rider follows, and it is the only thing
                          delivery needs. The map is offered as an optional extra: dropping a pin
                          lets us measure the distance and warn if it is beyond our radius, but
                          an unpinned address is not held up.
                        */}
                        <LocationMap compact onLocationSelect={onLocation} initialDistance={info?.distance} />

                        <div className={`flex items-center gap-3 rounded-xl border p-3 ${!info?.locationVerified
                            ? 'border-slate-200 bg-slate-50'
                            : isWithinRange(info.distance)
                                ? 'border-green-200 bg-green-50'
                                : 'border-red-200 bg-red-50'}`}>
                            <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white ${!info?.locationVerified
                                ? 'bg-slate-400'
                                : isWithinRange(info.distance) ? 'bg-green-500' : 'bg-red-500'}`}>
                                {info?.locationVerified
                                    ? <Navigation className="size-4 rotate-45" />
                                    : <MapPin className="size-4" aria-hidden="true" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-[12px] font-black ${!info?.locationVerified
                                    ? 'text-slate-700'
                                    : isWithinRange(info.distance) ? 'text-green-900' : 'text-red-900'}`}>
                                    {info?.locationVerified
                                        ? `${info.distance?.toFixed(2)} km away`
                                        : 'Address noted'}
                                </p>
                                <p className={`text-[10px] leading-snug ${!info?.locationVerified
                                    ? 'text-slate-500'
                                    : isWithinRange(info.distance) ? 'text-green-700' : 'text-red-700'}`}>
                                    {info?.locationVerified
                                        ? isWithinRange(info.distance)
                                            ? `Within our ${MAX_DELIVERY_RANGE}km radius.`
                                            : `Outside our ${MAX_DELIVERY_RANGE}km radius — pickup only.`
                                        : 'Optional: drop a pin and we will check it is within our radius.'}
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {!validation.valid && (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-900">
                        <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                        {firstIssue(validation)?.message}
                    </p>
                )}

                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onBack}
                        className="h-11 shrink-0 rounded-xl border-slate-200 px-3 text-slate-600"
                    >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        <span className="sr-only">Back to the basket</span>
                    </Button>
                    <Button
                        type="button"
                        onClick={onContinue}
                        disabled={!validation.valid}
                        className={`h-11 flex-1 rounded-xl text-[11px] font-black uppercase tracking-widest ${validation.valid
                            ? 'bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground shadow-[0_10px_26px_-12px_oklch(0.841_0.238_128.85/0.85)] hover:brightness-105'
                            : 'bg-slate-200 text-slate-500 shadow-none hover:bg-slate-200'}`}
                    >
                        {blocking.includes('missing_delivery_type') ? 'DELIVERY OR PICKUP?'
                            : blocking.includes('missing_address') ? 'ADD YOUR ADDRESS'
                                : blocking.includes('below_minimum_order') ? 'BELOW MINIMUM ORDER'
                                    : blocking.includes('outside_delivery_zone') ? 'OUTSIDE DELIVERY ZONE'
                                        : 'REVIEW & PLACE ORDER'}
                    </Button>
                </div>
            </div>
        </CardShell>
    );
}

function isWithinRange(distance?: number): boolean {
    return distance !== undefined && distance <= MAX_DELIVERY_RANGE;
}


/* ------------------------------------------------- confirm & place (cash on delivery) */

export function PlaceOrderCard({ order, onPlace, placing, onBack, onClose }: {
    order: Order;
    onPlace: () => void;
    placing: boolean;
    onBack: () => void;
    onClose: () => void;
}) {
    const info = order.customerInfo;
    const isDelivery = info?.deliveryType === 'delivery';

    return (
        <CardShell title="Confirm order" subtitle={`৳${order.total} to pay`} onClose={onClose}>
            <div className="space-y-3 p-4">
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {order.items.map(item => (
                        <li key={item.code} className="flex items-baseline justify-between gap-3 px-3 py-2">
                            <span className="min-w-0 text-[12px] font-bold text-slate-800">
                                <span className="text-slate-400">{item.quantity}×</span> {item.name}
                            </span>
                            <span className="shrink-0 text-[12px] font-black text-slate-900">৳{lineTotalOf(item.price, item.quantity)}</span>
                        </li>
                    ))}
                </ul>

                <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px]">
                    <div className="flex justify-between font-bold text-slate-600">
                        <span>Subtotal</span><span>৳{order.subtotal}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-600">
                        <span>Delivery</span><span>{isDelivery ? `৳${order.deliveryFee}` : 'Pickup'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1 text-[13px] font-black text-slate-900">
                        <span>Total</span><span>৳{order.total}</span>
                    </div>
                </div>

                {isDelivery && info?.address?.trim() && (
                    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold leading-snug text-slate-700">
                        <MapPin className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="min-w-0 break-words">{info.address}</span>
                    </p>
                )}

                {/*
                  There is no payment step to choose from, so this is the whole of it: one
                  method, stated plainly, with the amount that changes hands. Nothing here is
                  entered, sent or stored, because cash on delivery has nothing to collect.
                */}
                <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Banknote className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-black text-slate-900">Cash on delivery</p>
                        <p className="text-[10px] leading-snug text-slate-600">
                            Pay the rider ৳{order.total} when the order arrives. No card needed.
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onBack}
                        disabled={placing}
                        className="h-11 shrink-0 rounded-xl border-slate-200 px-3 text-slate-600"
                    >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        <span className="sr-only">Back to checkout</span>
                    </Button>
                    <Button
                        type="button"
                        onClick={onPlace}
                        disabled={placing}
                        className="h-11 flex-1 rounded-xl bg-gradient-to-br from-primary to-emerald-400 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-[0_10px_26px_-12px_oklch(0.841_0.238_128.85/0.85)] hover:brightness-105 disabled:opacity-70"
                    >
                        {placing
                            ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Placing…</>
                            : <>Place order · ৳{order.total}</>}
                    </Button>
                </div>
            </div>
        </CardShell>
    );
}