'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself. Because it
 * replaces the document, it must render its own <html>/<body> and cannot use the
 * layout's font or metadata — hence the system font stack below.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error('[app] global render error', error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif' }}>
                <div style={{ minHeight: '100dvh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ maxWidth: 440, textAlign: 'center' }}>
                        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
                            SeasonBot needs a moment
                        </h1>
                        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
                            The page failed to load properly. Reloading usually fixes it.
                        </p>
                        <button
                            onClick={reset}
                            style={{
                                marginTop: 24, background: '#ea580c', color: '#fff', border: 0,
                                borderRadius: 12, padding: '14px 28px', fontWeight: 800, fontSize: 12,
                                letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
                            }}
                        >
                            Reload SeasonBot
                        </button>
                        {error.digest && (
                            <p style={{ color: '#475569', fontSize: 11, fontFamily: 'ui-monospace, monospace', marginTop: 20 }}>
                                ref: {error.digest}
                            </p>
                        )}
                    </div>
                </div>
            </body>
        </html>
    );
}
