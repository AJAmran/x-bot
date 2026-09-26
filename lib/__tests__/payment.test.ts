import { describe, it, expect } from 'vitest';
import { luhnCheck, maskCardNumber, simulateAuthorization, validatePaymentDetails } from '../order';
import { DEMO_CARD_NUMBER, PAYMENT_AUTH_DELAY_MS, PAYMENT_METHODS, PAYMENT_SIMULATED_NOTICE } from '../constants';

const NOW = new Date('2026-06-15T12:00:00Z');
const check = (method: 'cod' | 'card' | 'mobile_banking', details: Parameters<typeof validatePaymentDetails>[1]) =>
    validatePaymentDetails(method, details, NOW);
const codes = (result: ReturnType<typeof validatePaymentDetails>) => (result.valid ? [] : result.issues.map(i => i.code));

const validCard = { cardNumber: DEMO_CARD_NUMBER, expiry: '11/29', cvc: '123' };

describe('luhnCheck', () => {
    it('accepts the standard sandbox number', () => {
        expect(luhnCheck(DEMO_CARD_NUMBER)).toBe(true);
    });

    it('accepts other real-world test numbers', () => {
        for (const number of ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117']) {
            expect(luhnCheck(number), number).toBe(true);
        }
    });

    it('ignores spacing and formatting', () => {
        expect(luhnCheck('4111 1111-1111 1111')).toBe(true);
    });

    it('rejects a single mistyped digit', () => {
        expect(luhnCheck('4111111111111112')).toBe(false);
    });

    it('rejects short and empty input', () => {
        expect(luhnCheck('')).toBe(false);
        expect(luhnCheck('42424')).toBe(false);
    });
});

describe('maskCardNumber', () => {
    it('shows only the last four digits', () => {
        expect(maskCardNumber('4242424242424242')).toBe('•••• •••• •••• 4242');
    });

    it('degrades gracefully on short input', () => {
        expect(maskCardNumber('42')).toBe('42');
    });
});

describe('validatePaymentDetails — cash on delivery', () => {
    it('needs no details at all', () => {
        expect(check('cod', {}).valid).toBe(true);
    });
});

describe('validatePaymentDetails — card', () => {
    it('accepts a complete, valid card', () => {
        expect(check('card', validCard).valid).toBe(true);
    });

    it('rejects a bad card number', () => {
        expect(codes(check('card', { ...validCard, cardNumber: '1234567812345678' }))).toEqual(['card_number_invalid']);
    });

    it('rejects a missing card number', () => {
        expect(codes(check('card', { ...validCard, cardNumber: undefined }))).toEqual(['card_number_invalid']);
    });

    it('requires MM/YY', () => {
        expect(codes(check('card', { ...validCard, expiry: '11/2029' }))).toEqual(['card_expiry_invalid']);
        expect(codes(check('card', { ...validCard, expiry: '13/29' }))).toEqual(['card_expiry_invalid']);
        expect(codes(check('card', { ...validCard, expiry: 'nope' }))).toEqual(['card_expiry_invalid']);
    });

    it('rejects an expiry in the past', () => {
        expect(codes(check('card', { ...validCard, expiry: '05/26' }))).toEqual(['card_expiry_invalid']);
    });

    it('accepts the current month, which is valid through its last day', () => {
        expect(check('card', { ...validCard, expiry: '06/26' }).valid).toBe(true);
    });

    it('requires a 3 or 4 digit security code', () => {
        expect(codes(check('card', { ...validCard, cvc: '12' }))).toEqual(['card_cvc_invalid']);
        expect(check('card', { ...validCard, cvc: '1234' }).valid).toBe(true);
    });

    it('reports only the first problem, which is what the toast shows', () => {
        const result = check('card', {});
        expect(result.valid).toBe(false);
        expect(result.issues[0]?.message).toBeTruthy();
    });
});

describe('validatePaymentDetails — mobile banking', () => {
    it('accepts a valid BD mobile number', () => {
        expect(check('mobile_banking', { walletNumber: '01712345678' }).valid).toBe(true);
        expect(check('mobile_banking', { walletNumber: '+8801712345678' }).valid).toBe(true);
    });

    it('rejects anything else', () => {
        expect(codes(check('mobile_banking', { walletNumber: '12345' }))).toEqual(['wallet_number_invalid']);
        expect(codes(check('mobile_banking', {}))).toEqual(['wallet_number_invalid']);
    });
});

describe('simulateAuthorization', () => {
    it('leaves cash on delivery unpaid, to be collected by the rider', () => {
        expect(simulateAuthorization('cod')).toEqual({ method: 'cod', status: 'pending' });
    });

    it('marks card and wallet as paid with a clearly fake reference', () => {
        const outcome = simulateAuthorization('card');
        expect(outcome.status).toBe('paid');
        expect(outcome.reference).toMatch(/^SIM-[A-Z0-9]{6}$/);
    });

    it('does not invent a reference for cash on delivery', () => {
        expect(simulateAuthorization('cod').reference).toBeUndefined();
    });
});

describe('payment configuration', () => {
    it('offers exactly the three documented methods', () => {
        expect(PAYMENT_METHODS.map(m => m.id)).toEqual(['cod', 'card', 'mobile_banking']);
    });

    it('uses a noticeable delay for real-looking authorisation and a short one for cash', () => {
        expect(PAYMENT_AUTH_DELAY_MS.card).toBeGreaterThanOrEqual(1000);
        expect(PAYMENT_AUTH_DELAY_MS.mobile_banking).toBeGreaterThanOrEqual(1000);
        expect(PAYMENT_AUTH_DELAY_MS.cod).toBeLessThan(PAYMENT_AUTH_DELAY_MS.card);
    });

    it('ships an explicit "this is simulated" notice for the UI', () => {
        expect(PAYMENT_SIMULATED_NOTICE).toMatch(/simulated/i);
        expect(PAYMENT_SIMULATED_NOTICE).toMatch(/no real gateway/i);
    });
});
