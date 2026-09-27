import type { Metadata } from 'next';
import { ChatWidget } from '@/components/ChatWidget';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteHero } from '@/components/site/SiteHero';
import { SiteSections } from '@/components/site/SiteSections';
import { VisitDetails } from '@/components/site/VisitDetails';
import { MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT, RESTAURANT_DATA } from '@/lib/constants';

/*
 * Server Component. Only the pieces that need a browser carry "use client" — the header, the
 * live opening hours, anything with a click — so the copy, the dish names and the prices are
 * delivered as HTML instead of being assembled in the client bundle.
 *
 * The API key is read here to tell the widget whether the waiter is configured, which is what
 * keeps the key itself on the server.
 *
 * NOTE: because the page is statically prerendered, that boolean is baked in at BUILD time —
 * changing GEMINI_API_KEY on Vercel requires a redeploy. See README "Known Limitations".
 */

const { restaurant } = RESTAURANT_DATA;

const DESCRIPTION =
    'Thai, Chinese and Bangla restaurant in Dhanmondi, Dhaka since 2007. Order by chat in Bangla or English, '
    + `delivered within ${MAX_DELIVERY_RANGE} km, minimum ৳${MIN_ORDER_AMOUNT}, cash on delivery.`;

export const metadata: Metadata = {
    title: `${restaurant.name} — Dhanmondi, Dhaka`,
    description: DESCRIPTION,
    openGraph: {
        title: `${restaurant.name} — Dhanmondi, Dhaka`,
        description: DESCRIPTION,
        type: 'website',
        locale: 'en_BD',
    },
};

/**
 * Restaurant structured data, so a search result can show the address, hours and price range
 * rather than only a title. Data for a crawler, never something a visitor sees — which is why it
 * is a script tag and not markup.
 */
function RestaurantJsonLd() {
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        name: restaurant.name,
        description: restaurant.description,
        servesCuisine: ['Thai', 'Chinese', 'Bengali'],
        telephone: restaurant.contact.phone,
        email: restaurant.contact.email,
        address: {
            '@type': 'PostalAddress',
            streetAddress: restaurant.contact.address,
            addressLocality: 'Dhaka',
            addressCountry: 'BD',
        },
        geo: {
            '@type': 'GeoCoordinates',
            latitude: restaurant.location.lat,
            longitude: restaurant.location.lng,
        },
        openingHoursSpecification: [
            {
                '@type': 'OpeningHoursSpecification',
                opens: '12:00',
                closes: '15:30',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            },
            {
                '@type': 'OpeningHoursSpecification',
                opens: '18:30',
                closes: '22:30',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            },
        ],
        acceptsReservations: 'False',
    };

    return (
        <script
            type="application/ld+json"
            // A literal "</script>" anywhere in the JSON would close the tag early and break the
            // page, so every "<" is escaped rather than trusted.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
        />
    );
}

export default function Home() {
    return (
        <div id="top" className="relative min-h-dvh overflow-x-hidden bg-gradient-to-b from-slate-50 via-white to-primary/[0.06]">
            <RestaurantJsonLd />

            <SiteHeader />

            <main>
                <SiteHero />
                <SiteSections />

                <section
                    id="visit"
                    className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20"
                    aria-labelledby="visit-title"
                >
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-ink">Visit us</p>
                    <h2 id="visit-title" className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                        Dhanmondi, Dhaka
                    </h2>
                    <div className="mt-8">
                        <VisitDetails />
                    </div>
                </section>
            </main>

            <SiteFooter />

            <ChatWidget aiConfigured={Boolean(process.env.GEMINI_API_KEY?.trim())} />
        </div>
    );
}
