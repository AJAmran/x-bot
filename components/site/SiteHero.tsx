'use client';

import { ArrowRight, MessageSquare, UtensilsCrossed } from 'lucide-react';
import { MAX_DELIVERY_RANGE } from '@/lib/constants';
import { findMenuItemByCode } from '@/lib/menuIndex';
import { requestOpenWidget } from '@/lib/widgetBus';
import { Button } from '@/components/ui/button';
import { OpenStatusPill } from '@/components/site/VisitDetails';

/**
 * The hero answers three questions in the order a hungry visitor asks them: are you open, what
 * do you have, and how do I order. Opening status is live rather than a static string, the menu
 * is one tap away, and ordering opens the waiter in the page — no second page to navigate to.
 */
export function SiteHero() {

    return (
        <section className="relative overflow-hidden" aria-labelledby="hero-title">
            {/* Painted once, on the server: scenery, not content, and never over a click. */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div className="absolute -top-40 left-[6%] size-[460px] rounded-full bg-primary/20 blur-[110px]" />
                <div className="absolute -top-32 right-[4%] size-[420px] rounded-full bg-emerald-300/20 blur-[110px]" />
                <div className="absolute top-64 left-1/3 size-[320px] rounded-full bg-lime-200/25 blur-[100px]" />
            </div>

            <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
                <div>
                    <OpenStatusPill />

                    <h1
                        id="hero-title"
                        className="mt-5 font-heading text-[2.4rem] font-extrabold leading-[0.95] tracking-tight text-slate-900 sm:text-6xl"
                    >
                        Thai, Chinese
                        <br />
                        and Bangla food,
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-ink to-emerald-700">
                            ordered by chat.
                        </span>
                    </h1>

                    <p className="mt-5 max-w-xl text-[15px] font-medium leading-relaxed text-slate-600 sm:text-lg">
                        A Dhanmondi kitchen since 2007, delivering within {MAX_DELIVERY_RANGE} km and settling in
                        cash when it reaches your door. Order the way you talk — Bangla, English, or a mix of both.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                            type="button"
                            onClick={() => requestOpenWidget('chat')}
                            className="group h-14 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 px-7 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-[0_18px_40px_-16px_oklch(0.841_0.238_128.85/0.9)] hover:brightness-105"
                        >
                            <MessageSquare className="size-4" aria-hidden="true" />
                            Start my order
                            <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => requestOpenWidget('menu')}
                            className="h-14 rounded-2xl border-slate-200 bg-white/80 px-7 text-xs font-black uppercase tracking-widest text-slate-900 backdrop-blur hover:border-primary-ink/30 hover:bg-white"
                        >
                            <UtensilsCrossed className="size-4 text-primary-ink" aria-hidden="true" />
                            Browse the menu
                        </Button>
                    </div>

                    <dl className="mt-10 grid max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80">
                        {[
                            { value: String(239), label: 'Dishes' },
                            { value: `${MAX_DELIVERY_RANGE} km`, label: 'Delivery radius' },
                            { value: 'Cash', label: 'On delivery' },
                        ].map(stat => (
                            <div key={stat.label} className="bg-white/90 px-4 py-4">
                                <dt className="sr-only">{stat.label}</dt>
                                <dd>
                                    <span className="block font-heading text-xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-2xl">
                                        {stat.value}
                                    </span>
                                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        {stat.label}
                                    </span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {/*
                  A real menu excerpt, not a stock photograph. Every dish, price and code here is
                  read from the same data the waiter orders from, so the page cannot drift out of
                  date or advertise something we stopped selling — and it loads with no image
                  request, which is why the hero is instant on a phone.
                */}
                <div id="dishes" className="relative scroll-mt-20">
                    <div className="rounded-[2rem] border border-slate-200/80 bg-white/80 p-5 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-ink">
                                    Kitchen favourites
                                </p>
                                <h2 className="mt-1 font-heading text-lg font-extrabold tracking-tight text-slate-900">
                                    What Dhanmondi orders
                                </h2>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary-ink">
                                Cash on delivery
                            </span>
                        </div>

                        <ul className="mt-5 space-y-2">
                            {favourites.map(dish => (
                                <li key={dish.code}>
                                    <button
                                        type="button"
                                        onClick={() => requestOpenWidget('chat', `${dish.title} (${dish.code})`)}
                                        className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition-colors hover:border-primary-ink/30 hover:bg-primary/[0.04]"
                                    >
                                        {/* A typographic tile: no photograph can honestly claim to be
                                            this specific dish, so we do not pretend. */}
                                        <span
                                            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 font-heading text-sm font-extrabold text-primary"
                                            aria-hidden="true"
                                        >
                                            {dish.code}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-extrabold text-slate-900">
                                                {dish.title}
                                            </span>
                                            <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                                                {dish.note}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span className="block text-[13px] font-black tabular-nums text-slate-900">
                                                ৳{dish.price}
                                            </span>
                                            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-primary-ink opacity-0 transition-opacity group-hover:opacity-100">
                                                Add
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <p className="mt-4 text-[11px] font-medium leading-relaxed text-slate-500">
                            Tap any dish to start an order with it.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

interface Favourite {
    code: string;
    title: string;
    note: string;
    price: number;
}

/**
 * Hand-picked rather than derived from a `popular` flag. Those flags mark 40% of the menu as
 * popular, which on a page means "nothing is" — a short list of specific dishes reads as a
 * recommendation, where a long one reads as an inventory dump.
 *
 * The codes are the source of truth, not the copy: name and price are looked up at render, so a
 * price change on the menu updates this page and this card can never advertise a dish we no
 * longer sell or quote a price the waiter will contradict.
 */
const FAVOURITE_CODES = ['221', '123', '144', '254', '901'] as const;

const FAVOURITE_NOTES: Record<string, string> = {
    '221': 'Prawn, egg & sliced chicken',
    '123': 'The one everybody orders first',
    '144': 'Chilli tomato sauce',
    '254': 'Chicken, prawn & egg',
    '901': 'To finish',
};

const favourites = FAVOURITE_CODES
    .map(code => {
        const item = findMenuItemByCode(code);
        if (!item) return null;
        return {
            code: String(item.code),
            title: titleCase(item.name),
            note: FAVOURITE_NOTES[String(item.code)] ?? 'House favourite',
            price: item.price,
        };
    })
    .filter((dish): dish is Favourite => dish !== null);

/** Menu names are stored in caps for the codes to be readable in a tool call; display is title case. */
function titleCase(name: string): string {
    return name
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase())
        .replace(/\bTom\sYaam\b/i, 'Tom Yaam')
        .replace(/\bNew\sYork's\b/i, "New York's");
}
