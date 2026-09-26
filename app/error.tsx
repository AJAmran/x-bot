'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, TriangleAlert, Home } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * Route-level error boundary. Without this, any throw inside ChatWidget/OrderWizard
 * unmounts the whole app — a white page on `/` and a blank iframe on `/embed`, which is
 * the worst possible first impression for a portfolio demo.
 *
 * Next.js only renders this when a segment throws; `reset()` re-renders it in place.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error('[app] render error', error);
    }, [error]);

    return (
        <div className="min-h-dvh bg-slate-950 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-md text-center space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 text-primary-ink border border-primary/20">
                    <TriangleAlert size={30} strokeWidth={2.2} />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-black text-white tracking-tight">Something went wrong</h1>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        Our waiter lost his place for a moment. Your basket is saved in this browser — try again, and it will pick up where it left off.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                        type="button"
                        onClick={reset}
                        className="h-11 rounded-xl px-6 font-semibold tracking-widest uppercase"
                    >
                        <RotateCcw /> Try again
                    </Button>
                    <Link
                        href="/"
                        className={buttonVariants({
                            variant: 'outline',
                            className: 'h-11 rounded-xl border-white/10 bg-transparent px-6 font-semibold tracking-widest uppercase text-slate-200 hover:bg-white/10 hover:text-white',
                        })}
                    >
                        <Home /> Back home
                    </Link>
                </div>

                {error.digest && (
                    <p className="text-[10px] font-mono text-slate-600 pt-2">ref: {error.digest}</p>
                )}
            </div>
        </div>
    );
}
