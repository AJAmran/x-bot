import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RateLimitDecision } from '../rateLimit';

/**
 * The limiter holds module-level state, so every test gets a fresh copy of the module and a
 * controlled clock. Vitest is the first thing to make this straightforward — the logic was
 * previously only ever exercised by hand.
 */
const loadLimiter = async () => {
    vi.resetModules();
    return import('../rateLimit');
};

let clock: number;

beforeEach(() => {
    vi.useFakeTimers();
    clock = Date.parse('2026-01-01T12:00:00Z');
    vi.setSystemTime(clock);
});

afterEach(() => {
    vi.useRealTimers();
});

const allowed = (results: RateLimitDecision[]) => results.filter(r => r.allowed).length;

describe('consumeAiQuota — per client', () => {
    it('allows a short burst then throttles', async () => {
        const { consumeAiQuota, RATE_LIMITS } = await loadLimiter();
        const results = Array.from({ length: RATE_LIMITS.perClient.capacity + 3 }, () => consumeAiQuota('1.1.1.1'));

        expect(allowed(results)).toBe(RATE_LIMITS.perClient.capacity);
        expect(results.at(-1)).toMatchObject({ allowed: false, scope: 'client' });
    });

    it('gives every visitor their own bucket', async () => {
        const { consumeAiQuota, RATE_LIMITS } = await loadLimiter();
        for (let i = 0; i < RATE_LIMITS.perClient.capacity; i++) consumeAiQuota('1.1.1.1');

        expect(consumeAiQuota('1.1.1.1').allowed).toBe(false);
        expect(consumeAiQuota('2.2.2.2').allowed).toBe(true);
    });

    it('refills over time at the configured rate', async () => {
        const { consumeAiQuota, RATE_LIMITS } = await loadLimiter();
        for (let i = 0; i < RATE_LIMITS.perClient.capacity; i++) consumeAiQuota('1.1.1.1');
        expect(consumeAiQuota('1.1.1.1').allowed).toBe(false);

        await vi.advanceTimersByTimeAsync(20_000);
        expect(consumeAiQuota('1.1.1.1').allowed).toBe(true);
    });

    it('tells the caller how long to wait', async () => {
        const { consumeAiQuota, RATE_LIMITS } = await loadLimiter();
        for (let i = 0; i < RATE_LIMITS.perClient.capacity; i++) consumeAiQuota('1.1.1.1');

        const blocked = consumeAiQuota('1.1.1.1');
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
        expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    });
});

describe('consumeAiQuota — shared instance ceiling', () => {
    it('stops a burst from many clients exhausting the API key', async () => {
        const { consumeAiQuota, RATE_LIMITS } = await loadLimiter();
        const decisions = Array.from({ length: RATE_LIMITS.perClient.capacity * 8 }, (_, i) => consumeAiQuota(`10.0.0.${i}`));

        expect(allowed(decisions)).toBeLessThan(decisions.length);
        expect(decisions.some(d => !d.allowed && d.scope === 'instance')).toBe(true);
    });
});

describe('consumeAiQuota — daily budget', () => {
    it('is deliberately set below the reported free-tier RPD ceiling', async () => {
        const { RATE_LIMITS } = await loadLimiter();
        // Reported free tier for gemini-2.5-flash is ~250 RPD; we must degrade before Google
        // starts returning 429s to real visitors. Verify against AI Studio before changing.
        expect(RATE_LIMITS.dailyBudget).toBeLessThan(250);
    });

    it('blocks with a long retry hint once the budget is spent', async () => {
        const { consumeAiQuota } = await loadLimiter();

        // Step time forward between batches so the per-instance bucket keeps refilling —
        // otherwise the instance ceiling is hit long before the daily budget and the daily
        // branch is never reached.
        let dailyBlocked: RateLimitDecision | undefined;
        for (let i = 0; i < 500 && !dailyBlocked; i++) {
            const decision = consumeAiQuota(`10.0.${Math.floor(i / 250)}.${i % 250}`);
            if (!decision.allowed && decision.scope === 'daily') dailyBlocked = decision;
            await vi.advanceTimersByTimeAsync(10_000);
        }

        expect(dailyBlocked).toBeDefined();
        expect(dailyBlocked?.allowed).toBe(false);
        expect(dailyBlocked?.retryAfterSeconds).toBeGreaterThan(60);
    });

    it('resets the budget after a day has passed', async () => {
        const { consumeAiQuota } = await loadLimiter();
        expect(consumeAiQuota('1.1.1.1').allowed).toBe(true);

        await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
        expect(consumeAiQuota('1.1.1.1').allowed).toBe(true);
    });
});
