import { ChatWidget } from '@/components/ChatWidget';
import { LandingHero } from '@/components/LandingHero';

// Server Component: the hero and widget shell are static markup, so they do not belong in the
// client bundle. Reading the API key here also lets us tell the widget whether the AI is
// configured without ever shipping the key to the browser.
//
// NOTE: because the pages are statically prerendered, the value below is baked in at BUILD
// time — changing the key on Vercel requires a redeploy. See README "Known Limitations".
export default function Home() {
    return (
        <div className="relative min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-primary/5">
            {/*
              Decorative light sources, painted once on the server so they cost no client JS.
              aria-hidden and pointer-events-none: they are scenery, never content, and must not
              swallow clicks meant for the hero CTA.
            */}
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden" aria-hidden="true">
                <div className="absolute -top-32 left-[8%] size-[420px] rounded-full bg-primary/20 blur-[100px]" />
                <div className="absolute -top-24 right-[6%] size-[380px] rounded-full bg-emerald-300/20 blur-[100px]" />
                <div className="absolute top-40 left-1/2 size-[300px] -translate-x-1/2 rounded-full bg-lime-200/25 blur-[90px]" />
            </div>

            <LandingHero />
            <ChatWidget aiConfigured={Boolean(process.env.GEMINI_API_KEY?.trim())} />
        </div>
    );
}
