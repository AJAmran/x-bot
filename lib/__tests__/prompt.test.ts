/**
 * The prompt and the context window are the only place the ordering rules are written down.
 * A regression here is silent — the model still answers, just wrongly — so these assert the
 * things that must never be lost, rather than the exact wording.
 *
 * These functions live in lib/prompt.ts rather than lib/engine.ts because that file is
 * `"use server"`: anything exported from it becomes a public endpoint.
 */

import { describe, it, expect } from 'vitest';
import {
    buildHistory,
    buildSystemInstruction,
    describeReadiness,
    guestWritesBengali,
    MAX_HISTORY_CHARS,
    MAX_MESSAGE_CHARS,
    HISTORY_WINDOW,
} from '@/lib/prompt';
import { createDraftOrder } from '@/lib/order';
import { MIN_ORDER_AMOUNT, MAX_DELIVERY_RANGE } from '@/lib/constants';
import type { ChatMessage, CustomerInfo, Order } from '@/lib/types';

const FIXED_NOW = new Date('2026-03-04T14:30:00Z');

function turn(content: string, sender: ChatMessage['sender'] = 'user'): ChatMessage {
    return { id: content, content, sender, timestamp: FIXED_NOW, type: 'text' };
}

/** One real line so "basket has items" is genuinely satisfied. */
const ONE_ITEM = [
    { id: '139', code: '139', name: 'THAI GRILLED CHICKEN', price: 745, quantity: 2, total: 1490 },
] as unknown as Order['items'];

function orderWith(items: Order['items'] = ONE_ITEM, info: Partial<CustomerInfo> = {}, id = 'ORD-TEST'): Order {
    return createDraftOrder({
        id,
        items,
        customerInfo: {
            name: '', phone: '', deliveryType: 'pickup', ...info,
        },
    });
}

describe('buildHistory - context window', () => {
    it('maps user and model turns and drops system turns', () => {
        const built = buildHistory([
            turn('hello', 'user'),
            turn('Assalamu Alaikum', 'ai'),
            turn('internal note', 'system'),
            turn('two grilled chicken', 'user'),
        ]);
        expect(built.map(t => t.role)).toEqual(['user', 'model', 'user']);
        expect(built[0].parts[0].text).toBe('hello');
    });

    it('keeps only the most recent turns', () => {
        const built = buildHistory(Array.from({ length: 25 }, (_, i) => turn(`m${i}`, i % 2 ? 'ai' : 'user')));
        expect(built.length).toBeLessThanOrEqual(HISTORY_WINDOW);
        // The newest turn must survive.
        expect(built[built.length - 1].parts[0].text).toBe('m24');
    });

    it('caps a single oversized message', () => {
        const built = buildHistory([turn('x'.repeat(MAX_MESSAGE_CHARS * 3))]);
        expect(built[0].parts[0].text).toHaveLength(MAX_MESSAGE_CHARS);
    });

    it('bounds the total transcript, not just the message count', () => {
        // Ten turns at the per-message cap is ~5,000 tokens of transcript, which would
        // outweigh the whole menu. This is the ceiling that actually bounds a request.
        const built = buildHistory(Array.from({ length: 10 }, () => turn('y'.repeat(MAX_MESSAGE_CHARS))));
        const total = built.reduce((sum, t) => sum + t.parts[0].text.length, 0);
        expect(total).toBeLessThanOrEqual(MAX_HISTORY_CHARS + MAX_MESSAGE_CHARS);
        expect(built.length).toBeGreaterThan(0);
    });

    it('keeps the newest turn when one message dominates the window', () => {
        const built = buildHistory([
            turn('short earlier turn'),
            turn('z'.repeat(MAX_MESSAGE_CHARS * 5)),
        ]);
        // The oversized turn is capped, not dropped, and the total still respects the budget.
        expect(built[built.length - 1].parts[0].text).toHaveLength(MAX_MESSAGE_CHARS);
        const total = built.reduce((sum, t) => sum + t.parts[0].text.length, 0);
        expect(total).toBeLessThanOrEqual(MAX_HISTORY_CHARS);
    });

    it('never drops the newest turn, whatever it contains', () => {
        expect(buildHistory([turn('a'.repeat(MAX_MESSAGE_CHARS))])).toHaveLength(1);
    });

    it('keeps the per-message cap below the total budget', () => {
        /*
         * The "always keep the newest turn" guard in buildHistory is defensive rather than
         * reachable today, precisely because a capped message can never fill the whole
         * budget. This test fails loudly if someone retunes the two constants and makes that
         * guard load-bearing again without thinking about it.
         */
        expect(MAX_MESSAGE_CHARS).toBeLessThan(MAX_HISTORY_CHARS);
    });

    it('survives junk without throwing', () => {
        const built = buildHistory([
            { content: '', sender: 'user' } as unknown as ChatMessage,
            { sender: 'user' } as unknown as ChatMessage,
            undefined as unknown as ChatMessage,
        ]);
        expect(built).toEqual([]);
    });

    it('returns empty for no history, which the engine treats as a fresh greeting', () => {
        expect(buildHistory([])).toEqual([]);
    });
});

describe('describeReadiness - what is still outstanding', () => {
    it('says everything is missing for an empty order', () => {
        const line = describeReadiness(null);
        expect(line).toMatch(/items/);
        expect(line).toMatch(/name/);
        expect(line).toMatch(/mobile/);
    });

    it('does not demand a location for a pickup', () => {
        const line = describeReadiness(orderWith(ONE_ITEM, { name: 'Ayesha', phone: '01712345678' }));
        expect(line).toBe('all requirements met.');
    });

    it('asks for the delivery address, and never for a pin', () => {
        const noAddress = describeReadiness(orderWith(ONE_ITEM, {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery',
        }));
        expect(noAddress).toMatch(/the delivery address/);
        expect(noAddress).not.toMatch(/pin/i);

        const ready = describeReadiness(orderWith(ONE_ITEM, {
            name: 'Ayesha', phone: '01712345678', deliveryType: 'delivery', address: 'House 12, Road 5',
        }));
        expect(ready).toBe('all requirements met.');
    });
});

describe('buildSystemInstruction - the rules the waiter runs on', () => {
    const empty = buildSystemInstruction(null, { now: FIXED_NOW });
    const withOrder = buildSystemInstruction(
        orderWith(ONE_ITEM, { name: 'Ayesha', phone: '01712345678', deliveryType: 'pickup' }),
        { now: FIXED_NOW },
    );

    it('states the delivery rules as real numbers, not placeholders', () => {
        expect(empty).toContain(`৳${MIN_ORDER_AMOUNT}`);
        expect(empty).toContain(`${MAX_DELIVERY_RANGE}km`);
    });

    it('warns the model off the mistake it actually makes', () => {
        // set_quantity as a delta instead of an absolute total is the failure this prompt
        // exists to prevent, so it is called out by name.
        expect(empty).toMatch(/NEW total, not a delta/);
    });

    it('bars inventing codes, which the parser would discard anyway', () => {
        expect(empty).toMatch(/Never invent a dish, a code or a price/);
    });

    it('names the ambiguity that actually happens, rather than an abstract rule', () => {
        /*
         * A live run showed the model adding "CHICKEN OR BEEF SATAY" to a bare "one satay"
         * despite a generic "ask if ambiguous" rule. The concrete example is what fixed it.
         */
        expect(empty).toMatch(/CHICKEN OR BEEF SATAY/);
        expect(empty).toMatch(/add nothing until they answer/);
    });

    it('requires the reply to describe the tool call', () => {
        // A tool call with no text leaves a silent bubble; this makes that an explicit fault.
        expect(empty).toMatch(/Say what you just did/);
    });

    it('tells the model to take the address as given and never invent coordinates', () => {
        // The server still refuses a distance the model made up, because only the map sets one.
        expect(empty).toMatch(/do not ask for coordinates/);
        expect(empty).not.toMatch(/never confirm a location yourself/i);
    });

    it('never greets again, because the thread already opened with one', () => {
        // Observed live: the seeded welcome was followed by "hi" and the bot answered with a
        // second "Assalamu Alaikum", so the guest was greeted twice in ten seconds.
        expect(empty).toMatch(/already your greeting/);
        expect(empty).toMatch(/must not repeat it/);
        expect(empty).not.toMatch(/Greet once/);
    });

    it('carries the live basket into the prompt', () => {
        expect(withOrder).toContain('THAI GRILLED CHICKEN');
        expect(withOrder).toContain('2x');
        expect(withOrder).toContain('Ayesha');
        expect(withOrder).toContain('all requirements met.');
    });

    it('replays remembered preferences so the waiter does not ask twice', () => {
        const remembered = buildSystemInstruction(
            orderWith(ONE_ITEM, { name: 'A', phone: '01712345678', preferences: ['allergic to peanuts'] }),
            { now: FIXED_NOW },
        );
        expect(remembered).toContain('allergic to peanuts');
    });

    it('includes the menu and its format legend', () => {
        expect(empty).toContain('One line per dish');
        expect(empty).toContain('THAI GRILLED CHICKEN');
    });

    it('embeds the dietary tags that carry allergy risk', () => {
        // If these are lost, an allergy answer becomes a guess.
        expect(empty).toContain('N=Contains Nuts');
        expect(empty).toContain('D=Contains Dairy');
    });

    it('never leaks the previous prompt structure or its internals', () => {
        // Cheap guard against a partial edit resurrecting the old emoji checklist.
        expect(empty).not.toMatch(/YOUR GOAL/);
        expect(empty).not.toMatch(/✅/);
        expect(empty).not.toMatch(/🛒/);
    });

    it('is deterministic for a fixed clock and order', () => {
        expect(buildSystemInstruction(null, { now: FIXED_NOW }))
            .toBe(buildSystemInstruction(null, { now: FIXED_NOW }));
    });

    it('stays within a sane size so the prompt cannot quietly bloat', () => {
        // The menu is ~5,600 tokens; the instructions around it should be a small fraction.
        const overhead = empty.length - 23_000;
        expect(overhead).toBeLessThan(6_000);
    });
});

describe(
    'any language, any mix - the model is not told to pick one',
    () => {
        /*
         * There used to be a classifier here: a marker-word list plus a weighted vote over recent
         * turns, which then pinned the whole conversation to whichever side won and put a
         * "reply in Bengali for the WHOLE conversation" instruction in the prompt. It misfired on
         * exactly the messages this restaurant gets most ("THAI SPECIAL FRIED RICE ta 2 ta order
         * korty chai") and broke whenever a marker word was missing. The model reads all of it
         * natively, so the fix is to stop separating languages at all.
         */
        const instruction = buildSystemInstruction(null, { now: FIXED_NOW });

        it('tells the model to read every script and mixture as one language', () => {
            expect(instruction).toMatch(/Bengali script/);
            expect(instruction).toMatch(/Romanised Bengali/);
            expect(instruction).toMatch(/mixture|mix/i);
        });

        it('tells it to mirror the guest mix rather than choose a language', () => {
            expect(instruction).toMatch(/mirroring their mix/);
        });

        it('forbids announcing, translating or asking which language to use', () => {
            expect(instruction).toMatch(/never announce/);
            expect(instruction).toMatch(/never translate a dish name/i);
            expect(instruction).toMatch(/never ask them to choose one/i);
        });

        it('no longer pins a language for the whole conversation', () => {
            expect(instruction).not.toMatch(/for the WHOLE conversation/);
            expect(instruction).not.toMatch(/Reply in English\./);
        });

        it('states cash on delivery and refuses to offer any other method', () => {
            expect(instruction).toMatch(/cash on delivery/i);
            expect(instruction).toMatch(/never offer one/);
            expect(instruction).toMatch(/never ask how they want to pay/);
        });

        it('takes the address the guest gives and does not demand a map pin', () => {
            expect(instruction).toMatch(/in their own\s+words/);
            expect(instruction).not.toMatch(/must be pinned on the map/);
            expect(instruction).toMatch(/optional extra/);
        });
    }
);

describe('guestWritesBengali - only used to pick our own fallback strings', () => {
    const turn = (c: string, sender: 'user' | 'ai' = 'user') =>
        ({ content: c, sender, timestamp: FIXED_NOW, type: 'text' } as ChatMessage);

    it('detects Bengali script in the last guest turn', () => {
        expect(guestWritesBengali([turn('আর কিছু লাগবে?')])).toBe(true);
    });

    it('treats Banglish as Latin, because a script check cannot see it', () => {
        // Documented limitation, and the reason this must never steer the model: "korty chai" is
        // Bengali to a human and contains no Bengali characters at all.
        expect(guestWritesBengali([turn('2 ta order korty chai')])).toBe(false);
    });

    it('ignores the bot own replies', () => {
        expect(guestWritesBengali([turn('add two rice'), turn('বাস্কেটে যোগ করা হয়েছে।', 'ai')])).toBe(false);
    });

    it('reads an empty conversation as not-Bengali', () => {
        expect(guestWritesBengali([])).toBe(false);
    });
});
describe('the prompt keeps the guest in control of the basket', () => {
    const empty = buildSystemInstruction(null, { now: FIXED_NOW });

    it('forbids ordering on a refusal', () => {
        // A live run added two more portions to a 1220 order because the guest said "no" and
        // the model still called add, leaving the guest billed 2440.
        expect(empty).toMatch(/A refusal is not an order/);
        expect(empty).toMatch(/do not call\s+any tool at all/);
    });

    it('never asks the model to hold one language for the whole conversation', () => {
        // The regression this replaced: a single `language` option flipped an instruction that
        // forbade the guest from switching, which is the opposite of what we want.
        expect(empty).not.toMatch(/WHOLE conversation/);
        expect(empty).not.toMatch(/language:/);
    });
});

describe('restaurant facts are in the prompt, so information needs no tool call', () => {
    const instruction = buildSystemInstruction(null, { now: FIXED_NOW });

    /*
     * Live failure: asked "tmra kotokhon open thako?" the model had no hours anywhere in its
     * context, so it either guessed or returned nothing usable and the guest got an error. Both
     * are worse than simply knowing where we are and when we are open.
     */
    it('states the address and phone', () => {
        expect(instruction).toMatch(/Dhanmondi/);
        expect(instruction).toMatch(/01755636264/);
    });

    it('gives the hours for the current season only', () => {
        // FIXED_NOW is 4 March, so the Mar-Sep season is the live one.
        expect(instruction).toMatch(/Mar-Sep/);
        expect(instruction).toMatch(/12:00-15:30/);
        expect(instruction).toMatch(/18:30-22:30/);
        expect(instruction).toMatch(/October through February|other season/i);
    });

    it('swaps the season with the calendar', () => {
        const december = buildSystemInstruction(null, { now: new Date('2026-12-24T19:00:00Z') });
        expect(december).toMatch(/Oct-Feb/);
        expect(december).toMatch(/18:00-22:30/);
    });

    it('states the delivery fee, radius and minimum', () => {
        expect(instruction).toMatch(new RegExp(`৳${MIN_ORDER_AMOUNT} minimum|minimum order ৳${MIN_ORDER_AMOUNT}`));
        expect(instruction).toMatch(new RegExp(`${MAX_DELIVERY_RANGE}km`));
    });

    it('tells the model to answer from these and never call a tool for them', () => {
        expect(instruction).toMatch(/answer from these, never guess/);
    });
});

describe('the empty basket is handled in words, not with a form', () => {
    const instruction = buildSystemInstruction(null, { now: FIXED_NOW });

    /*
     * Live failure: the guest opened the thread, said "place my order" with nothing in the
     * basket, and was asked for a name, number and delivery type. They supplied all three, were
     * thanked each time, and the order never went anywhere — because there was no food in it.
     */
    it('tells the model to say the basket is empty rather than collect details', () => {
        expect(instruction).toMatch(/AN EMPTY BASKET IS THE WHOLE PROBLEM/);
        expect(instruction).toMatch(/nothing has been added yet/);
        expect(instruction).toMatch(/Do NOT\s+ask for their name, number or address/);
    });

    it('forbids confirming an empty basket', () => {
        expect(instruction).toMatch(/never call confirm, while the basket is empty/);
    });

    it('puts the empty basket in front of the model on every turn', () => {
        expect(describeReadiness(createDraftOrder({ items: [] }))).toMatch(/items/);
        expect(buildSystemInstruction(createDraftOrder({ items: [] }), { now: FIXED_NOW })).toMatch(/Basket: empty/);
    });
});

describe('asking for the menu means opening the menu', () => {
    const instruction = buildSystemInstruction(null, { now: FIXED_NOW });

    /*
     * Live failure: "tmdr menu ta daw" was answered with the words "Here is our full menu." and
     * nothing else. The menu is a browsable card; saying it is not showing it.
     */
    it('routes a request for the menu to browse_menu', () => {
        expect(instruction).toMatch(/menu ta daw/);
        expect(instruction).toMatch(/call browse_menu/);
    });

    it('forbids answering a menu request in words alone', () => {
        expect(instruction).toMatch(/not merely say "here is our\s+menu" in words/);
    });
});

describe('details given before the basket is full are still stored', () => {
    const instruction = buildSystemInstruction(null, { now: FIXED_NOW });

    /*
     * Live failure: the guest offered their name and number with an empty basket, the bot replied
     * "I have noted your name as Amran" — and returned no tool call, so nothing was stored and
     * it would ask for the same details again after they ordered.
     */
    it('records name, number, address and collection method as soon as they are given', () => {
        expect(instruction).toMatch(/record\s+it with update_info in that same reply/);
    });

    it('says so even when the basket is still empty', () => {
        expect(instruction).toMatch(/even if the basket is still empty/);
    });

    it('forbids claiming to have remembered something without the call', () => {
        expect(instruction).toMatch(/unless you called\s+update_info/);
    });
});