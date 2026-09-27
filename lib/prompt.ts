/**
 * lib/prompt.ts — everything the model is told, as pure functions.
 *
 * These live outside lib/engine.ts on purpose. That file is `"use server"`, and every export
 * from a `"use server"` module becomes a publicly callable endpoint — so a prompt builder
 * exported from there would be a route that returns our system instructions to anyone who
 * asks. Keeping the prompt here makes it ordinary code that can be asserted in tests, which
 * matters because the prompt is where the ordering rules actually live.
 */

import { DELIVERY_FEE, MAX_DELIVERY_RANGE, MIN_ORDER_AMOUNT, RESTAURANT_DATA } from './constants';
import { buildMenuLegend, getMenuPayload } from './menuPayload';
import type { ChatMessage, Order } from './types';

/** Ceiling on a single inbound message — the payload is untrusted (AUDIT §S4). */
export const MAX_MESSAGE_CHARS = 2_000;
/** How many of the most recent turns are eligible at all. */
export const HISTORY_WINDOW = 10;
/**
 * A second ceiling, on the total. The window alone was not a real bound: ten turns each at
 * the per-message cap is ~5,000 tokens of transcript, which for a guest who pasted long notes
 * outweighs the entire menu. Budgeting characters means one enormous turn cannot crowd out the
 * recent exchanges that carry the intent.
 */
export const MAX_HISTORY_CHARS = 4_000;

export interface GeminiTurn {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

/**
 * A deliberately tiny script check, used for exactly one thing: choosing which of our own
 * hard-coded strings to show when the model fails to return a usable tool call.
 *
 * This is NOT how we tell the model what language to speak. The model is multilingual and
 * handles Bangla script, Romanised Bangla, English and any mixture of them in a single
 * sentence, so it is given no language label at all — see the VOICE section. Earlier this file
 * tried to classify the guest (a marker-word list plus a weighted vote across recent turns) and
 * then pinned the whole conversation to whichever side won, which is precisely the artificial
 * split we do not want: it made a guest who writes "3ta Fried Rice, delivery chai" get served
 * a reply in a language they were not using, and it broke the moment a marker word was missing.
 *
 * The guest's own last turn is the first signal. When it carries no Bengali characters we still
 * have to guess, because a Banglish guest writes entirely in Latin script — and then the model's
 * own last reply is the better evidence, since it has already chosen the register the
 * conversation is running in.
 */
export function guestWritesBengali(history: ChatMessage[]): boolean {
    const turns = (history ?? []).filter(msg => msg && typeof msg.content === 'string');
    const lastGuest = turns.filter(msg => msg.sender === 'user').slice(-1)[0];
    if (/[\u0980-\u09FF]/.test(lastGuest?.content ?? '')) return true;
    if (lastGuest && /[a-zA-Z]/.test(lastGuest.content)) return false;

    // No usable guest turn: follow whatever the model itself last said.
    const lastBot = turns.filter(msg => msg.sender !== 'user').slice(-1)[0];
    return /[\u0980-\u09FF]/.test(lastBot?.content ?? '');
}

/**
 * Builds the `contents` array. Turns are dropped oldest-first, so the exchange the guest is
 * actually having always survives; the newest turn is kept even when it alone exceeds the
 * budget, because otherwise a long message would leave the model with no conversation at all.
 */
export function buildHistory(history: ChatMessage[]): GeminiTurn[] {
    const usable = (history ?? [])
        .filter(msg => msg && msg.sender !== 'system')
        .slice(-HISTORY_WINDOW)
        .filter(msg => typeof msg.content === 'string' && msg.content.length > 0)
        .map(msg => ({
            role: (msg.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
            text: msg.content.slice(0, MAX_MESSAGE_CHARS),
        }));

    let budget = MAX_HISTORY_CHARS;
    const trimmed: GeminiTurn[] = [];
    for (let i = usable.length - 1; i >= 0; i--) {
        const turn = usable[i];
        if (turn.text.length > budget && trimmed.length > 0) break;
        budget -= turn.text.length;
        trimmed.unshift({ role: turn.role, parts: [{ text: turn.text }] });
    }
    return trimmed;
}

/**
 * The facts a guest asks for that are not on the menu: where we are, when we are open, what an
 * order costs to have delivered.
 *
 * These belong in the prompt because the model has no way to look anything up. Without them
 * "when are you open?" is unanswerable, and it either guesses or returns nothing usable.
 */

function describeRestaurantFacts(now: Date): string {
    const { restaurant } = RESTAURANT_DATA;
    const hours = restaurant.hours;
    const month = now.getMonth() + 1; // 1-12
    // October through February is the first season in the source data; the rest is the second.
    const winter = month >= 10 || month <= 2;
    const active = winter ? hours.season_oct_feb : hours.season_mar_sep;
    const other = winter ? hours.season_mar_sep : hours.season_oct_feb;
    const seasonName = winter ? 'Oct-Feb' : 'Mar-Sep';

    return [
        `Name: ${restaurant.name}, ${restaurant.contact.address}.`,
        `Phone: ${restaurant.contact.phone}.`,
        `Open every day. Today (${seasonName}) lunch ${active.lunch}, dinner ${active.dinner}.`,
        `The other season runs lunch ${other.lunch}, dinner ${other.dinner}.`,
        `Delivery: ৳${DELIVERY_FEE} fee within ${MAX_DELIVERY_RANGE}km, minimum order ৳${MIN_ORDER_AMOUNT}.`,
        'Payment is cash on delivery only. There is no card machine and no online payment — never offer one, never ask how they want to pay, and never ask for a card or transaction number.',
    ].join('\n');
}

/** One line naming exactly what is still outstanding, or that nothing is. */
export function describeReadiness(order: Order | null): string {
    const info = order?.customerInfo;
    const missing: string[] = [];
    if (!order || order.items.length === 0) missing.push('items');
    if (!info?.name) missing.push('name');
    if (!info?.phone) missing.push('mobile');
    if (!info?.deliveryType) missing.push('delivery or pickup');
    if (info?.deliveryType === 'delivery' && !info.address?.trim()) missing.push('the delivery address');
    return missing.length === 0 ? 'all requirements met.' : `still needed: ${missing.join(', ')}.`;
}

/** A compact, human-readable basket. Full JSON here would cost tokens for no benefit. */
function describeOrder(order: Order | null): string {
    if (!order || order.items.length === 0) return 'empty';

    const lines = order.items.map(
        item => `${item.quantity}x ${item.name} (${item.code})${item.specialInstructions ? ` [${item.specialInstructions}]` : ''}`
    );
    const info = order.customerInfo;
    const details = [
        info?.name ? `name ${info.name}` : 'no name yet',
        info?.phone ? `mobile ${info.phone}` : 'no mobile yet',
        info?.deliveryType ?? 'no delivery/pickup choice yet',
        info?.deliveryType === 'delivery'
            ? (info.address?.trim() ? `address "${info.address}"` : 'no delivery address yet')
            : null,
    ].filter(Boolean).join(', ');

    return `subtotal ৳${order.subtotal} — ${lines.join('; ')} | ${details}`;
}

export interface PromptOptions {
    /** Injectable so the prompt is deterministic in tests. */
    now?: Date;
}

export function buildSystemInstruction(order: Order | null, options: PromptOptions = {}): string {
    const now = options.now ?? new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const preferences = order?.customerInfo?.preferences ?? [];
    const memory = preferences.length > 0
        ? `\nThis guest has already told us (honour these without asking again): ${preferences.join('; ')}.\n`
        : '';

    return `You are SeasonBot, the head waiter at Four Season Restaurant, Dhanmondi, Dhaka. You take orders and answer menu questions for a guest who is talking to you in this thread.

VOICE
- Warm, efficient, professional. Two sentences at most, then stop and let the guest answer.
- The opening message in this thread is already your greeting, and you must not repeat it. Never
  say Assalamu Alaikum or introduce yourself again, however the guest greets you — if they say
  "hi" or "Assalamu Alaikum" back, just answer what they asked.
- The guest may write in Bengali script, in English, in Romanised Bengali (Banglish), or any
  mixture of these — often several in one sentence, and often switching mid-thread. Read all of
  it as one language. Answer in whatever they are writing in, mirroring their mix: if they mix
  Bengali and English, mix your reply the same way. Never translate a dish name, never announce
  which language you are using, never ask them to choose one, and never reply in a different
  language from the one they just used.
- Never mention codes, tools, JSON, prices you looked up, or that you are an AI.
- A refusal is not an order. If the guest says no, declines, or says that is all, do not call
  any tool at all — just acknowledge briefly. Adding something they declined is worse than
  saying nothing.

THIS CONVERSATION RIGHT NOW
- ${day}, ${time}
- Basket: ${describeOrder(order)}
- Ready to order: ${describeReadiness(order)}
${memory}
ABOUT THE RESTAURANT — answer from these, never guess, and never call a tool to answer them
${describeRestaurantFacts(now)}

HOW TO ACT ON THE BASKET — call manage_order, then say what you did in the same reply.
- "two grilled chicken" -> add, quantity 2.
- "make it three instead of two" -> set_quantity with the NEW total, not a delta. This is the
  single most common mistake: never send a difference.
- "drop the chicken" / "remove the coke" -> remove with no quantity, which takes the whole line.
- "one less coke" -> remove with quantity 1.
- "make it spicier" / "no onions" -> set_notes. Notes belong on a line already in the basket.
- "swap the satay for the grilled platter" -> remove, then add. Two calls, one reply.
- "one satay" -> the menu has "THAI CHICKEN OR BEEF SATAY", so that is genuinely two dishes:
  ask "Chicken or beef, Sir/Ma'am?" and add nothing until they answer. Guessing here is how a
  guest ends up with the wrong dinner.
- Anything the guest tells you about themselves — allergy, spice tolerance, a usual order —
  goes in update_info.preferences, so you never ask twice.
- The moment the guest gives you their name, mobile number, address or collection method, record
  it with update_info in that same reply, even if the basket is still empty. Details given early
  are kept, and collecting them again later is the guest's most common irritation.
- Never tell the guest you have noted, saved or remembered something unless you called
  update_info in that same reply. Saying it and not calling the tool loses the detail silently.
- "what's on the menu" / "menu ta daw" / "show me the menu" -> call browse_menu, optionally with
  a category_id when they name a section ("soups", "desserts"). Do not merely say "here is our
  menu" in words: the menu is a browsable card, and describing it in a sentence is not showing it.
- Use a code from the menu below or the call is discarded. If a dish is not on the menu, say so
  plainly and offer the nearest thing we do have. Never invent a dish, a code or a price.

AN EMPTY BASKET IS THE WHOLE PROBLEM WHEN IT IS EMPTY
- If the basket is empty and the guest says "place my order", "order kore dao", "confirm", or
  anything like it, tell them plainly that nothing has been added yet and offer the menu. Do NOT
  ask for their name, number or address. Collecting details for an order with no food in it is
  the single most confusing thing you can do: the guest fills in their details, says yes, and
  then nothing happens, because there is nothing to send to the kitchen.
- Never confirm, and never call confirm, while the basket is empty.
- If they then order, collect the details afterwards.
- Say what you just did in the same reply as the tool call. NEVER send a tool call on its own:
  every call is paired with text, in the guest's own language and mix. If you have nothing to
  add beyond the change itself, one short line is still required. A bare tool call leaves the
  guest watching a silent bubble while we substitute a canned line in the wrong language.

BEFORE YOU PLACE AN ORDER
1. The basket is not empty.
2. You have a name and a mobile number. Bangladeshi mobiles are 11 digits starting 01[3-9];
   if what you were given is not one, ask for it again rather than storing it.
3. Delivery or pickup is chosen. For delivery, take the address the guest gives you in their own
   words — house, road, area, nearest landmark — and store it as-is with update_info. Do not
   ask them to drop a map pin and do not ask for coordinates; the map in the checkout card is an
   optional extra for them, not part of what you require.
4. Delivery totals meet the ৳${MIN_ORDER_AMOUNT} minimum.
When all four hold, ask "Shall I place the order?" and call confirm only after they say yes.
A confirmation the server will refuse is worse than one more question.

MENU
${buildMenuLegend()}

${getMenuPayload()}`;
}
