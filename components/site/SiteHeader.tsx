'use client';

import { useEffect, useState } from 'react';
import { Menu, MessageSquare, X } from 'lucide-react';
import { requestOpenWidget } from '@/lib/widgetBus';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const LINKS = [
    { href: '#dishes', label: 'Dishes' },
    { href: '#cuisines', label: 'Cuisines' },
    { href: '#how', label: 'How it works' },
    { href: '#visit', label: 'Visit' },
];

/**
 * A restaurant's front door, not a product page: the name, the way in, and the hours. The chat
 * is the ordering channel, so "Order now" opens the waiter rather than linking somewhere else —
 * a visitor who has to hunt for the order button is a visitor who leaves.
 */
export function SiteHeader() {
    const [scrolled, setScrolled] = useState(false);
    const [navOpen, setNavOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // A menu left open behind a scrolled page is a dead overlay on a phone, so any scroll closes it.
    useEffect(() => {
        if (!navOpen) return;
        const close = () => setNavOpen(false);
        window.addEventListener('scroll', close, { passive: true });
        return () => window.removeEventListener('scroll', close);
    }, [navOpen]);

    return (
        <header
            className={cn(
                'sticky top-0 z-50 transition-all duration-300',
                scrolled
                    ? 'border-b border-slate-200/80 bg-white/85 backdrop-blur-xl'
                    : 'border-b border-transparent bg-transparent',
            )}
        >
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
                <a href="#top" className="flex items-center gap-2.5 rounded-lg">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 font-heading text-sm font-extrabold text-primary-foreground shadow-[0_6px_18px_-8px_oklch(0.841_0.238_128.85/0.9)]">
                        4S
                    </span>
                    <span className="leading-none">
                        <span className="block font-heading text-[15px] font-extrabold tracking-tight text-slate-900">
                            Four Season
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            Dhanmondi, Dhaka
                        </span>
                    </span>
                </a>

                {/* The nav is a real list, not a row of divs: it is one of the few places a
                    keyboard user needs to tab through, and a menu button needs a menu. */}
                <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                    {LINKS.map(link => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="rounded-lg px-3 py-2 text-[13px] font-bold text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        onClick={() => requestOpenWidget('chat')}
                        className="hidden h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-400 px-4 text-[11px] font-black uppercase tracking-widest text-primary-foreground shadow-[0_10px_26px_-12px_oklch(0.841_0.238_128.85/0.9)] hover:brightness-105 sm:inline-flex"
                    >
                        <MessageSquare className="size-4" aria-hidden="true" />
                        Order now
                    </Button>

                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setNavOpen(open => !open)}
                        aria-expanded={navOpen}
                        aria-controls="site-nav"
                        aria-label={navOpen ? 'Close menu' : 'Open menu'}
                        className="size-10 rounded-xl text-slate-700 hover:bg-white/70 md:hidden"
                    >
                        {navOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
                    </Button>
                </div>
            </div>

            {navOpen && (
                <nav
                    id="site-nav"
                    aria-label="Main"
                    className="border-t border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur-xl md:hidden"
                >
                    <ul className="flex flex-col">
                        {LINKS.map(link => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    onClick={() => setNavOpen(false)}
                                    className="block rounded-lg px-2 py-3 text-sm font-bold text-slate-700"
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                        <li>
                            <Button
                                type="button"
                                onClick={() => {
                                    setNavOpen(false);
                                    requestOpenWidget('chat');
                                }}
                                className="mt-2 h-12 w-full rounded-xl bg-gradient-to-br from-primary to-emerald-400 text-[11px] font-black uppercase tracking-widest text-primary-foreground"
                            >
                                <MessageSquare className="size-4" aria-hidden="true" />
                                Order now
                            </Button>
                        </li>
                    </ul>
                </nav>
            )}
        </header>
    );
}
