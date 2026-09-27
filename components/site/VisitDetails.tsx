'use client';

import { Clock, MapPin, Phone } from 'lucide-react';
import { RESTAURANT_DATA } from '@/lib/constants';
import { describeStatus, formattedWindows, openStatusAt } from '@/lib/hours';
import { useHasClock, useNow } from '@/lib/hooks/useNow';
import { cn } from '@/lib/utils';

/**
 * The first thing a visitor checks and the one thing a static page cannot know: whether we are
 * serving right now. Rendered from the visitor's own clock via `useNow`, so it is right in their
 * timezone rather than the build machine's, and it corrects itself if the page is left open
 * across a sitting boundary.
 */
export function OpenStatusPill({ className }: { className?: string }) {
    const now = useNow();
    const hasClock = useHasClock(now);

    if (!hasClock) {
        // Deliberately quiet rather than a confident guess: claiming "Open" and being wrong is
        // worse than a beat of "Checking…", because a guest may have left home already.
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-[11px] font-bold text-slate-400',
                    className,
                )}
            >
                <Clock className="size-3.5" aria-hidden="true" />
                <span>Checking opening hours…</span>
            </span>
        );
    }

    const status = openStatusAt(now);
    return (
        <span
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold',
                status.open
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900',
                className,
            )}
        >
            {/*
              A dot plus words, never colour alone. This is the state a guest plans their evening
              around, and the amber/green pair is exactly where colour-only signalling fails.
            */}
            <span
                className={cn('size-2 shrink-0 rounded-full', status.open ? 'bg-green-500' : 'bg-amber-500')}
                aria-hidden="true"
            />
            <span>{describeStatus(status)}</span>
        </span>
    );
}

/** Address, phone and today's sittings. The facts, no frills — this is what people came for. */
export function VisitDetails() {
    const { restaurant } = RESTAURANT_DATA;
    const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${restaurant.name} ${restaurant.contact.address}`,
    )}`;
    const tel = `tel:${restaurant.contact.phone.replace(/\s+/g, '')}`;

    return (
        <div className="grid gap-4 sm:grid-cols-3">
            <a
                href={directions}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-ink/30 hover:bg-primary/[0.03]"
            >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
                    <MapPin className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Find us</span>
                    <span className="mt-1 block text-[13px] font-bold leading-snug text-slate-800 group-hover:text-slate-900">
                        {restaurant.contact.address}
                    </span>
                </span>
            </a>

            <a
                href={tel}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-ink/30 hover:bg-primary/[0.03]"
            >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
                    <Phone className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Call us</span>
                    <span className="mt-1 block text-[13px] font-bold text-slate-800 group-hover:text-slate-900">
                        {restaurant.contact.phone}
                    </span>
                </span>
            </a>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
                    <Clock className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Open daily</span>
                    <TodayWindows />
                </span>
            </div>
        </div>
    );
}

/** Today's sittings, which change with the season — so they are read on the client, not baked in. */
function TodayWindows() {
    const now = useNow();
    const hasClock = useHasClock(now);
    if (!hasClock) return <span className="mt-1 block text-[13px] font-bold text-slate-400">—</span>;

    return (
        <dl className="mt-1 space-y-0.5">
            {formattedWindows(now).map(row => (
                <div key={row.sitting} className="flex gap-2 text-[13px] font-bold text-slate-800">
                    <dt className="w-14 shrink-0 text-slate-500">{row.sitting}</dt>
                    <dd className="tabular-nums">{row.range}</dd>
                </div>
            ))}
        </dl>
    );
}
