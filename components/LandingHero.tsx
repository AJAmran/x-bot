'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
    ArrowRight, Check, ChevronRight, Copy, MessageSquare, ShieldCheck,
    Sparkles, MapPin, CreditCard, Quote,
} from 'lucide-react';
import { RESTAURANT_DATA } from '@/lib/constants';
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT } from '@/lib/constants';
import { requestOpenWidget } from '@/lib/widgetBus';
import { Button } from '@/components/ui/button';

/**
 * The snippet is built from `window.location.origin`, but this component is server-rendered and
 * the page is statically prerendered, so there is no request context to read an origin from.
 * Deciding it at module scope made the first client render disagree with the server HTML and
 * threw a hydration mismatch; instead the origin is resolved after mount (see `origin` below),
 * and until then both sides render the same placeholder.
 */
const PLACEHOLDER_ORIGIN = 'https://your-domain.com';

const buildSnippet = (origin: string) => `<script src="${origin}/embed.js"><\/script>`;

const HOW_IT_WORKS = [
    {
        icon: MessageSquare,
        title: 'Just ask',
        body: 'Type or speak naturally. "Two grilled chicken, a cold drink, and make one of them well done."',
    },
    {
        icon: ShieldCheck,
        title: 'We check the rules',
        body: `Nothing is confirmed until the order clears our rules — the ${MAX_DELIVERY_RANGE}km delivery radius and the ৳${MIN_ORDER_AMOUNT} minimum — and every one of those checks runs on the server.`,
    },
    {
        icon: CreditCard,
        title: 'Pay your way',
        body: 'Cash on delivery, card or mobile banking. Choose at checkout and get an order reference instantly.',
    },
];

export function LandingHero() {
    const [copied, setCopied] = useState(false);
    /**
     * The origin is read with `useSyncExternalStore` rather than `useState` + `useEffect`. The
     * page is statically prerendered, so the server has no request context to read an origin
     * from; this hook exists for that case — it serves the placeholder for SSR *and* for the
     * hydrating client, then the real origin afterwards, so the first client render already
     * agrees with the server HTML. Setting state in an effect instead would render the wrong
     * value once, then correct it, which is both a wasted pass and a hydration mismatch.
     */
    const origin = useSyncExternalStore(
        () => () => { /* the origin never changes, so there is nothing to subscribe to */ },
        () => window.location.origin,
        () => PLACEHOLDER_ORIGIN,
    );

    const embedSnippet = useMemo(() => buildSnippet(origin), [origin]);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2200);
        return () => clearTimeout(timer);
    }, [copied]);

    const copySnippet = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(embedSnippet);
            setCopied(true);
        } catch {
            // Clipboard blocked (insecure context or denied permission) — select it instead
            // so the visitor can still copy manually.
            const node = document.getElementById('embed-snippet');
            if (node) {
                const range = document.createRange();
                range.selectNodeContents(node);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        }
    }, [embedSnippet]);

    return (
        <div className="w-full">
            {/* ---------------------------------------------------------------- hero */}
            <section className="max-w-7xl mx-auto px-5 sm:px-6 pt-10 sm:pt-16 lg:pt-24 pb-10 sm:pb-14 flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 bg-white/70 backdrop-blur-xl border border-primary/25 px-4 py-2 rounded-full mb-6 sm:mb-8 shadow-[0_8px_30px_-12px_oklch(0.841_0.238_128.85/0.5)]">
                    <span className="size-2 bg-primary rounded-full animate-pulse" aria-hidden="true" />
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-slate-600">
                        SeasonBot v2.0 Core
                    </span>
                </div>

                {/*
                  The gradient word runs through `primary-ink`, not `primary`. A gradient
                  heading still has to clear 3:1 as large text, and the brand lime measures
                  ~1.5:1 on this near-white page — the second stop is darkened for the same reason.
                */}
                <h1 className="text-[2.6rem] leading-[0.92] sm:text-6xl md:text-7xl font-heading font-extrabold text-slate-900 tracking-tight mb-5 sm:mb-6 max-w-4xl">
                    The future of<br className="hidden sm:block" />{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-ink to-emerald-700">
                        conversational
                    </span>{' '}
                    dining.
                </h1>

                <p className="max-w-2xl text-[15px] sm:text-lg text-slate-500 font-medium leading-relaxed mb-8 sm:mb-10 px-2">
                    A head waiter that never puts you on hold. Real-time ordering, a delivery
                    radius it will not bend, and an order it will not confirm until it is actually right.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full sm:w-auto sm:max-w-md">
                    <Button
                        type="button"
                        onClick={() => requestOpenWidget('menu')}
                        className="group min-h-14 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 px-7 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-[0_18px_40px_-16px_oklch(0.841_0.238_128.85/0.9)] hover:brightness-105 sm:px-8 sm:gap-3"
                    >
                        Open the live menu
                        <ChevronRight className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={copySnippet}
                        className="group min-h-14 rounded-2xl border-slate-200 bg-white/80 backdrop-blur px-7 text-xs font-black uppercase tracking-widest text-slate-900 hover:border-primary-ink/30 hover:bg-white sm:px-8"
                    >
                        {copied
                            ? <><Check className="text-green-600" aria-hidden="true" /> Copied</>
                            : <><Copy className="text-slate-400 transition-colors group-hover:text-primary-ink" aria-hidden="true" /> Embed on your site</>}
                    </Button>
                </div>

                {/* ------------------------------------------------------- stat strip */}
                <dl className="mt-10 sm:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200/70 rounded-2xl overflow-hidden border border-slate-200/70 w-full max-w-3xl">
                    {[
                        { value: '239', label: 'Dishes on the menu' },
                        { value: '3', label: 'Cuisines' },
                        { value: `${MAX_DELIVERY_RANGE} km`, label: 'Delivery radius' },
                        { value: '2007', label: 'Serving Dhanmondi since' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-white/80 backdrop-blur px-4 py-5 sm:py-6">
                            <dt className="sr-only">{stat.label}</dt>
                            <dd>
                                <span className="block h-1 w-8 rounded-full bg-gradient-to-r from-primary to-emerald-400 mb-2.5" aria-hidden="true" />
                                <span className="block text-2xl sm:text-3xl font-heading font-extrabold text-slate-900 tabular-nums tracking-tight">
                                    {stat.value}
                                </span>
                                <span className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-slate-500 mt-1.5">
                                    {stat.label}
                                </span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>

            {/* ------------------------------------------------------ how it works */}
            <section className="max-w-7xl mx-auto px-5 sm:px-6 pb-12 sm:pb-16" aria-labelledby="how-it-works">
                <h2 id="how-it-works" className="sr-only">How SeasonBot works</h2>
                <ol className="grid gap-3 sm:gap-4 md:grid-cols-3">
                    {HOW_IT_WORKS.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <li
                                key={step.title}
                                className="group relative bg-gradient-to-b from-white to-primary/[0.04] rounded-3xl border border-slate-200/80 p-5 sm:p-6 shadow-sm hover:shadow-[0_20px_45px_-24px_rgba(15,23,42,0.45)] hover:-translate-y-0.5 hover:border-primary-ink/30 transition-all duration-300"
                            >
                                <div className="flex items-center gap-3 mb-3.5">
                                    {/* Icon chip flips to a lime gradient on hover, and the glyph
                                        then switches to the dark brand ink — white on lime would
                                        be ~1.3:1. */}
                                    <span className="size-11 rounded-2xl bg-primary/10 text-primary-ink flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-emerald-400 group-hover:text-primary-foreground">
                                        <Icon size={19} aria-hidden="true" />
                                    </span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 tabular-nums">
                                        0{index + 1}
                                    </span>
                                </div>
                                <h3 className="text-base sm:text-lg font-heading font-extrabold text-slate-900 mb-1.5">{step.title}</h3>
                                <p className="text-[13px] sm:text-sm text-slate-600 leading-relaxed font-medium">{step.body}</p>
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* --------------------------------------------------------- embed card */}
            <section className="max-w-7xl mx-auto px-5 sm:px-6 pb-16 sm:pb-24" aria-labelledby="embed-heading">
                <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 sm:p-9 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.6)] ring-1 ring-primary/20 relative overflow-hidden">
                    <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" aria-hidden="true" />
                    <div className="absolute -bottom-28 -left-20 size-72 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" aria-hidden="true" />
                    <div className="relative">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                            <div>
                                <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">
                                    <Sparkles size={12} aria-hidden="true" /> Drop-in integration
                                </p>
                                <h2 id="embed-heading" className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
                                    One script tag. That is the whole install.
                                </h2>
                                <p className="text-sm text-slate-300 mt-2 max-w-lg leading-relaxed font-medium">
                                    Drop it into any site and SeasonBot appears as a floating waiter.
                                    Or open{' '}
                                    <a href="/embed" className="text-primary underline underline-offset-4 hover:text-primary/80 font-bold">
                                        the standalone widget
                                    </a>{' '}
                                    to see it full-screen.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={copySnippet}
                                className="min-h-12 shrink-0 rounded-xl border-white/10 bg-white/10 px-6 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/20 hover:text-white"
                            >
                                {copied
                                    ? <><Check className="text-green-400" aria-hidden="true" /> Copied</>
                                    : <><Copy aria-hidden="true" /> Copy snippet</>}
                            </Button>
                        </div>

                        <pre className="overflow-x-auto rounded-2xl bg-black/40 border border-white/10 p-4 text-[12px] sm:text-[13px] leading-relaxed">
                            <code id="embed-snippet" className="font-mono text-slate-200 whitespace-nowrap">
                                {embedSnippet}
                            </code>
                        </pre>

                        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-bold text-slate-300">
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin size={13} className="text-primary" aria-hidden="true" />
                                {RESTAURANT_DATA.restaurant.name}, {RESTAURANT_DATA.restaurant.contact.address.split(',').slice(-2).join(',').trim()}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <ArrowRight size={13} className="text-primary" aria-hidden="true" />
                                No API key required to try it
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* -------------------------------------------------------------- footer */}
            <footer className="border-t border-slate-200/70">
                <div className="max-w-7xl mx-auto px-5 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        {RESTAURANT_DATA.restaurant.name} · Dhanmondi, Dhaka
                    </p>
                    <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        <Quote size={12} aria-hidden="true" />
                        {RESTAURANT_DATA.restaurant.slogan}
                    </p>
                </div>
            </footer>
        </div>
    );
}
