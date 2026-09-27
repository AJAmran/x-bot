import Link from 'next/link';
import { Home, Utensils } from 'lucide-react';
import { RESTAURANT_DATA } from '@/lib/constants';
import { buttonVariants } from '@/components/ui/button';

export const metadata = {
    title: 'Page not found · Four Season Restaurant',
};

export default function NotFound() {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-primary/[0.06] px-5 text-center">
            <p className="font-heading text-7xl font-extrabold tracking-tight text-slate-900 sm:text-8xl">404</p>
            <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                That page is not on the menu
            </h1>
            <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-slate-600">
                The link may be old, or the page may have moved. The menu, the opening hours and the
                waiter are all still where you left them.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/" className={`${buttonVariants()} h-12 rounded-xl px-6 text-[11px] font-black uppercase tracking-widest`}>
                    <Home className="size-4" aria-hidden="true" />
                    Back to the restaurant
                </Link>
                <a
                    href={`tel:${RESTAURANT_DATA.restaurant.contact.phone.replace(/\s+/g, '')}`}
                    className={`${buttonVariants({ variant: 'outline' })} h-12 rounded-xl border-slate-200 bg-white px-6 text-[11px] font-black uppercase tracking-widest`}
                >
                    <Utensils className="size-4 text-primary-ink" aria-hidden="true" />
                    Call {RESTAURANT_DATA.restaurant.contact.phone}
                </a>
            </div>
        </main>
    );
}
