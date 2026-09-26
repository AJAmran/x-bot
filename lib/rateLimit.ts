/**
 * lib/rateLimit.ts — in-memory token buckets for the Gemini server action.
 *
 * WHY IN-MEMORY: this project is zero-cost by design (Vercel Hobby + the Gemini free tier),
 * so there is no Redis/Upstash. The trade-off, documented in the README Limitations section:
 * state lives in a single serverless instance and resets on cold start or redeploy, so this
 * is a *best-effort* guard — not a hard global quota.
 *
 * WHAT IT ACTUALLY PROTECTS: Next.js already rejects cross-origin server-action calls by
 * validating the Origin/Host headers, so the realistic abuse vector is a visitor scripting
 * the endpoint from their own console (or a runaway retry loop). A per-client bucket stops
 * that; the per-instance bucket keeps one warm lambda from eating the whole API quota.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Tuned against the Gemini free tier for `gemini-2.5-flash`.
 *
 * VERIFY THESE: Google's rate-limit docs describe the *mechanism* (per-project RPM / input
 * TPM / RPD, a 429 when any one is breached, RPD resetting at midnight Pacific) but do not
 * publish a static per-model table — they direct you to the Rate Limit page in AI Studio.
 * A secondary source reports 10 RPM / 250 RPD / 250k TPM for gemini-2.5-flash as of March
 * 2026. Check your own AI Studio quota page and adjust these three numbers to match.
 */
export const RATE_LIMITS = {
    /** Per visitor. A human sends a message every ~3-5s, so 3/min sustained is generous. */
    perClient: { capacity: 5, refillPerMinute: 3 },
    /** Per warm instance — protects the shared API key. */
    perInstance: { capacity: 10, refillPerMinute: 6 },
    /**
     * Soft daily ceiling, deliberately below the reported 250 RPD so that our own limiter
     * degrades gracefully *before* Google starts returning 429s to real visitors.
     */
    dailyBudget: 180,
} as const;

export type RateLimitScope = 'client' | 'instance' | 'daily';

export interface RateLimitDecision {
    allowed: boolean;
    scope: RateLimitScope;
    /** Seconds until this caller may try again. 0 when allowed. */
    retryAfterSeconds: number;
}

interface Bucket {
    tokens: number;
    updatedAt: number;
}

const clientBuckets = new Map<string, Bucket>();
const instanceBucket: Bucket = { tokens: RATE_LIMITS.perInstance.capacity, updatedAt: Date.now() };
let dailyUsed = 0;
let dailyWindowStart = Date.now();

/** Lazy refill — no timers, no background work, just arithmetic on elapsed time. */
function refill(bucket: Bucket, capacity: number, refillPerMinute: number, now: number): void {
    const elapsedMs = now - bucket.updatedAt;
    if (elapsedMs <= 0) return;
    bucket.tokens = Math.min(capacity, bucket.tokens + (elapsedMs / MINUTE_MS) * refillPerMinute);
    bucket.updatedAt = now;
}

/** Seconds until a bucket holds at least one token again. */
function secondsUntilToken(bucket: Bucket, refillPerMinute: number): number {
    if (refillPerMinute <= 0) return 60;
    return Math.max(1, Math.ceil(((1 - bucket.tokens) / refillPerMinute) * 60));
}

/** Keep the client map from growing without bound on a long-lived instance. */
function pruneStaleBuckets(now: number): void {
    if (clientBuckets.size <= 500) return;
    const cutoff = now - 10 * MINUTE_MS;
    for (const [key, bucket] of clientBuckets) {
        if (bucket.updatedAt < cutoff) clientBuckets.delete(key);
    }
}

/**
 * Attempt to spend one AI call. Call this *before* touching the Gemini SDK.
 */
export function consumeAiQuota(clientId: string): RateLimitDecision {
    const now = Date.now();

    if (now - dailyWindowStart >= DAY_MS) {
        dailyWindowStart = now;
        dailyUsed = 0;
    }
    if (dailyUsed >= RATE_LIMITS.dailyBudget) {
        return {
            allowed: false,
            scope: 'daily',
            retryAfterSeconds: Math.ceil((dailyWindowStart + DAY_MS - now) / 1000),
        };
    }

    refill(instanceBucket, RATE_LIMITS.perInstance.capacity, RATE_LIMITS.perInstance.refillPerMinute, now);
    if (instanceBucket.tokens < 1) {
        return {
            allowed: false,
            scope: 'instance',
            retryAfterSeconds: secondsUntilToken(instanceBucket, RATE_LIMITS.perInstance.refillPerMinute),
        };
    }

    let bucket = clientBuckets.get(clientId);
    if (!bucket) {
        bucket = { tokens: RATE_LIMITS.perClient.capacity, updatedAt: now };
        clientBuckets.set(clientId, bucket);
    }
    refill(bucket, RATE_LIMITS.perClient.capacity, RATE_LIMITS.perClient.refillPerMinute, now);
    if (bucket.tokens < 1) {
        return {
            allowed: false,
            scope: 'client',
            retryAfterSeconds: secondsUntilToken(bucket, RATE_LIMITS.perClient.refillPerMinute),
        };
    }

    bucket.tokens -= 1;
    instanceBucket.tokens -= 1;
    dailyUsed += 1;
    pruneStaleBuckets(now);

    return { allowed: true, scope: 'client', retryAfterSeconds: 0 };
}
