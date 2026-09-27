import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { RESTAURANT_DATA } from '@/lib/constants';
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT } from '@/lib/constants';

/**
 * Server-rendered on purpose: the footer is the one part of a restaurant page that should be in
 * the HTML for a crawler, a screen reader and a no-JS visitor, and it needs nothing from the
 * browser to be correct.
 */
export function SiteFooter() {
    const { restaurant } = RESTAURANT_DATA;
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-slate-200/70 bg-white/60">
            <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                        <div className="flex items-center gap-2.5">
                            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-400 font-heading text-sm font-extrabold text-primary-foreground">
                                4S
                            </span>
                            <span className="font-heading text-[15px] font-extrabold tracking-tight text-slate-900">
                                {restaurant.name}
                            </span>
                        </div>
                        <p className="mt-3 max-w-sm text-[13px] font-medium leading-relaxed text-slate-600">
                            {restaurant.description}
                        </p>
                        <p className="mt-3 text-[12px] font-bold italic text-slate-500">{restaurant.slogan}</p>
                    </div>

                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Visit</h2>
                        <address className="mt-3 space-y-2.5 not-italic">
                            <p className="flex items-start gap-2 text-[13px] font-medium leading-snug text-slate-600">
                                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                                {restaurant.contact.address}
                            </p>
                            <a
                                href={`tel:${restaurant.contact.phone.replace(/\s+/g, '')}`}
                                className="flex items-center gap-2 text-[13px] font-bold text-slate-700 hover:text-primary-ink"
                            >
                                <Phone className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                                {restaurant.contact.phone}
                            </a>
                            <a
                                href={`mailto:${restaurant.contact.email}`}
                                className="flex items-center gap-2 text-[13px] font-bold text-slate-700 hover:text-primary-ink"
                            >
                                <Mail className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                                {restaurant.contact.email}
                            </a>
                        </address>
                    </div>

                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Ordering</h2>
                        <ul className="mt-3 space-y-2 text-[13px] font-medium text-slate-600">
                            <li className="flex items-center gap-2">
                                <Clock className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
                                Open every day, lunch and dinner
                            </li>
                            <li>Delivery within {MAX_DELIVERY_RANGE} km of Dhanmondi</li>
                            <li>Minimum {`৳${MIN_ORDER_AMOUNT}`} for delivery</li>
                            <li className="font-bold text-slate-800">Cash on delivery only</li>
                        </ul>
                    </div>
                </div>

                <div className="mt-10 flex flex-col gap-3 border-t border-slate-200/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        © {year} {restaurant.name} · Trade licence {restaurant.additional_info.trade_license}
                    </p>
                    <div className="flex items-center gap-4">
                        {/* The widget is a product; its full-screen page and install snippet belong
                            in the footer, not in the path of a guest trying to order dinner. */}
                        <a href="/embed" className="text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900">
                            Widget
                        </a>
                        <a
                            href={`mailto:${restaurant.contact.email}`}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900"
                        >
                            <Mail className="size-3" aria-hidden="true" />
                            Contact
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
