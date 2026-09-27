'use client';

import { Bike, MessageSquare, Wallet } from 'lucide-react';
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT, RESTAURANT_DATA } from '@/lib/constants';
import { itemsOf } from '@/lib/menuIndex';
import { requestOpenWidget } from '@/lib/widgetBus';
import { Button } from '@/components/ui/button';

/**
 * The three questions a first-time guest has, answered in the order they ask them. The steps are
 * read off the real rules rather than written as marketing: a guest who is told "we will not
 * confirm until it is right" and then hits a ৳1000 minimum at checkout feels misled, so the
 * minimum is named here, up front, where it can be planned around.
 */
const STEPS = [
    {
        icon: MessageSquare,
        title: 'Say what you want',
        body: 'Type it the way you would say it — "2ta grilled chicken ar ekta thai soup, delivery", or all in English. Names, codes and quantities all work; you do not need to know ours.',
    },
    {
        icon: Bike,
        title: 'Tell us where it goes',
        body: `Give your address in your own words and choose delivery or pickup. Delivery is ${MAX_DELIVERY_RANGE} km around Dhanmondi with a ৳${MIN_ORDER_AMOUNT} minimum, and the waiter checks it before the order is ever placed.`,
    },
    {
        icon: Wallet,
        title: 'Pay the rider',
        body: 'Cash on delivery, nothing to enter and nothing to sign for online. The kitchen gets your order the moment you confirm it, and you get a reference.',
    },
];

/** Counts come from the menu itself, so a section that grows does not need this file edited. */
function categorySummary() {
    return RESTAURANT_DATA.menu.categories
        .map(category => ({ id: category.id, name: category.name, count: itemsOf(category).length }))
        .filter(category => category.count > 0);
}

export function SiteSections() {
    const categories = categorySummary();

    return (
        <>
            {/* ------------------------------------------------------------ cuisines */}
            <section id="cuisines" className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20" aria-labelledby="cuisines-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-ink">On the menu</p>
                        <h2 id="cuisines-title" className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                            Three kitchens, one table
                        </h2>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => requestOpenWidget('menu')}
                        className="h-11 shrink-0 rounded-xl border-slate-200 bg-white px-5 text-[11px] font-black uppercase tracking-widest text-slate-900 hover:border-primary-ink/30"
                    >
                        See everything
                    </Button>
                </div>

                <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {categories.map(category => (
                        <li key={category.id}>
                            <button
                                type="button"
                                onClick={() => requestOpenWidget('menu')}
                                className="group h-full w-full rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-ink/30 hover:shadow-[0_20px_45px_-30px_rgba(15,23,42,0.5)]"
                            >
                                <span className="block h-1 w-8 rounded-full bg-gradient-to-r from-primary to-emerald-400" aria-hidden="true" />
                                <span className="mt-3 block font-heading text-base font-extrabold text-slate-900">
                                    {category.name}
                                </span>
                                <span className="mt-1 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                                    {category.count} dishes
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ------------------------------------------------------- how it works */}
            <section id="how" className="border-y border-slate-200/70 bg-white/60" aria-labelledby="how-title">
                <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-ink">How it works</p>
                    <h2 id="how-title" className="mt-2 max-w-2xl font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Order in a minute, without a call queue
                    </h2>

                    <ol className="mt-9 grid gap-4 md:grid-cols-3">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon;
                            return (
                                <li
                                    key={step.title}
                                    className="relative rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary-ink">
                                            <Icon size={19} aria-hidden="true" />
                                        </span>
                                        <span className="text-[11px] font-black uppercase tracking-widest tabular-nums text-slate-400">
                                            Step {index + 1}
                                        </span>
                                    </div>
                                    <h3 className="mt-3.5 font-heading text-lg font-extrabold text-slate-900">{step.title}</h3>
                                    <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-600">{step.body}</p>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </section>
        </>
    );
}
