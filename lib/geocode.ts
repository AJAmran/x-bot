"use server";

/**
 * lib/geocode.ts — server-side reverse-geocoding proxy for OpenStreetMap Nominatim.
 *
 * WHY A PROXY: Nominatim's usage policy requires an identifying User-Agent, caps traffic at
 * one request per second, and explicitly discourages calling it directly from browser
 * JavaScript. The widget previously did exactly that — one raw `fetch` per marker drop from
 * the client, no cache, no User-Agent — which is both a policy violation and a
 * rate-limit-shaped outage waiting to happen on a public demo.
 *
 * Free tier by design: Nominatim is free, so the budget here is politeness (throttle +
 * cache), not money. Everything is in-memory and per-instance; see README Limitations.
 *
 * Graceful degradation is deliberate: any failure returns `null` and the map still works.
 * A missing street address is a degraded form field, never a broken checkout.
 */

const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
/** Identifying User-Agent as required by the Nominatim usage policy. */
const USER_AGENT = 'SeasonBot/2.0 (Four Season Restaurant ordering demo; +https://github.com/AJAmran/x-bot)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
/** Policy ceiling is 1 request/second; stay just under it. */
const MIN_REQUEST_INTERVAL_MS = 1_100;
const UPSTREAM_TIMEOUT_MS = 8_000;

const cache = new Map<string, { address: string; expiresAt: number }>();
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** ~1m precision is plenty for an address string and keeps the cache useful. */
function cacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function readCache(key: string): string | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
        cache.delete(key);
        return null;
    }
    return hit.address;
}

function writeCache(key: string, address: string): void {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { address, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve a coordinate to a human-readable address, or `null` if it cannot be resolved.
 * All arguments are untrusted (they arrive from the browser).
 */
export async function reverseGeocode(lat: unknown, lng: unknown): Promise<string | null> {
    const latitude = typeof lat === 'number' && Number.isFinite(lat) ? lat : null;
    const longitude = typeof lng === 'number' && Number.isFinite(lng) ? lng : null;
    if (latitude === null || longitude === null) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

    const key = cacheKey(latitude, longitude);
    const cached = readCache(key);
    if (cached) return cached;

    // Enforce the global one-request-per-second floor across concurrent visitors.
    const sinceLast = Date.now() - lastRequestAt;
    if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - sinceLast);
    }
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
        const url = `${REVERSE_URL}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=0`;
        const response = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            signal: controller.signal,
            cache: 'no-store',
        });

        if (!response.ok) {
            console.error(`[geocode] Nominatim responded ${response.status}`);
            return null;
        }

        const payload: unknown = await response.json();
        const displayName =
            typeof payload === 'object' && payload !== null && 'display_name' in payload
                ? (payload as { display_name?: unknown }).display_name
                : undefined;

        if (typeof displayName !== 'string' || displayName.length === 0) return null;
        writeCache(key, displayName);
        return displayName;
    } catch (error) {
        console.error('[geocode] reverse geocode failed', error);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}
