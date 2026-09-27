import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram/telegram';

/**
 * A manual smoke test for the Telegram sender. It is NOT a demo feature and it is not safe to ship
 * enabled: as originally written it was a public `GET` with no body, no secret and no rate limit,
 * which meant anyone who guessed the URL — or any crawler that followed a link — could make the
 * restaurant's bot post a message. Free, repeatable, and impossible to rate-limit away.
 *
 * So it is now inert unless `TELEGRAM_TEST_SECRET` is set *and* the caller presents it. On a
 * normal deployment the variable is absent and the route answers 404, which is the same response
 * as a route that does not exist.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const expected = process.env.TELEGRAM_TEST_SECRET?.trim();
    if (!expected) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const presented = request.headers.get('x-telegram-test-secret') ?? '';
    // Constant-time-ish: a plain !== leaks length and prefix through timing, and this endpoint is
    // the one place a secret is actually compared.
    const ok = presented.length === expected.length
        && [...presented].every((char, index) => char === expected[index]);
    if (!ok) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    try {
        await sendTelegramMessage('🍽️ X Group Restaurant\n\nTelegram integration is working successfully! ✅');
        return NextResponse.json({ success: true, message: 'Telegram message sent successfully' });
    } catch (error) {
        console.error('Telegram error:', error);
        return NextResponse.json({ success: false, message: 'Failed to send Telegram message' }, { status: 500 });
    }
}
