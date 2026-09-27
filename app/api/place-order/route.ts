import { NextResponse } from 'next/server';
import { sendOrderToTelegram } from '@/lib/telegram/telegram';
import { priceOrderFromWire } from '@/lib/placeOrder';
import { consumeNotifyQuota } from '@/lib/rateLimit';

/**
 * Places an order. The chat runs in the browser, so this endpoint is the only thing standing
 * between a modified client and the kitchen's Telegram chat — the pricing and rule checks live in
 * `lib/placeOrder.ts` so they can be tested directly.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    // Same-origin. Not authentication, but it stops another site's form from posting through a
    // visitor's browser.
    const origin = request.headers.get('origin');
    if (origin) {
        try {
            if (new URL(origin).host !== new URL(request.url).host) {
                return NextResponse.json({ error: 'forbidden' }, { status: 403 });
            }
        } catch {
            return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        }
    }

    // A person places one order. Anything faster from one address is a script.
    const clientId = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const decision = consumeNotifyQuota(clientId);
    if (!decision.allowed) {
        return NextResponse.json(
            { error: 'rate_limited' },
            { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds), 'Cache-Control': 'no-store' } },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'bad_request', detail: 'Body must be JSON.' }, { status: 400 });
    }

    const payload = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const priced = priceOrderFromWire(payload.order ?? payload);

    if (!priced.ok) {
        const status = priced.reason === 'empty' ? 400 : 422;
        return NextResponse.json(
            { error: priced.reason, detail: priced.detail },
            { status, headers: { 'Cache-Control': 'no-store' } },
        );
    }

    const { order, dropped } = priced;
    const result = await sendOrderToTelegram(order);

    // An unconfigured bot token is a normal state, not a failure: the order stands and the
    // kitchen gets it by other means. 202 lets the client record that without treating the order
    // as lost.
    const status = result.delivered ? 200 : result.reason === 'not_configured' ? 202 : 502;

    return NextResponse.json(
        {
            order,
            notified: result.delivered,
            ...(dropped.length ? { dropped } : {}),
            ...(result.reason ? { reason: result.reason } : {}),
        },
        { status, headers: { 'Cache-Control': 'no-store' } },
    );
}
