'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The current time, re-reading on an interval, without the hydration mismatch that
 * `useState(() => new Date())` guarantees.
 *
 * The problem is specific and unavoidable: the page is statically prerendered, so the server has
 * no idea what time it is where the visitor is, and a Date rendered during SSR would bake the
 * build machine's clock into the HTML. The usual dodge is "render a placeholder, then set state in
 * an effect" — but a synchronous `setState` inside an effect is a cascading render, which this
 * repo's lint rules (rightly) refuse, and it paints a wrong-then-correct answer.
 *
 * So the clock comes from `useSyncExternalStore`, which is built for exactly this: the server
 * snapshot and the first client snapshot agree, and React re-reads only when the subscription
 * says the value changed.
 *
 * The snapshot is cached per minute rather than being a fresh `Date` on every call, because
 * `useSyncExternalStore` compares snapshots by identity — returning a new object each time would
 * loop forever.
 */

let cachedBucket = -1;
let cachedDate = new Date(0);

function minuteSnapshot(): Date {
    const bucket = Math.floor(Date.now() / 60_000);
    if (bucket !== cachedBucket) {
        cachedBucket = bucket;
        cachedDate = new Date();
    }
    return cachedDate;
}

/** A fixed instant for the server render, so markup matches on hydration. */
const EPOCH = new Date(0);

export function useNow(intervalMs = 60_000): Date {
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            const timer = window.setInterval(onStoreChange, intervalMs);
            // A laptop that was asleep missed every interval; re-read the moment it is looked at.
            window.addEventListener('focus', onStoreChange);
            return () => {
                window.clearInterval(timer);
                window.removeEventListener('focus', onStoreChange);
            };
        },
        [intervalMs],
    );

    return useSyncExternalStore(subscribe, minuteSnapshot, () => EPOCH);
}

/** True only once the client has produced a real time, so callers can skip a "loading" pose. */
export function useHasClock(now: Date): boolean {
    return useMemo(() => now.getTime() !== EPOCH.getTime(), [now]);
}
