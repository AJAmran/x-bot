import { describe, it, expect } from 'vitest';
import { activeSeason, describeStatus, formatClock, formattedWindows, openStatusAt, windowsFor } from '../hours';

// Local-time constructors on purpose. `new Date('2026-03-04T13:00:00')` is parsed in the runner's
// own zone, so "1pm" means 1pm wherever the suite happens to execute. Appending a `Z` would make
// these assertions depend on the machine's offset.
const at = (iso: string) => new Date(iso);

describe('activeSeason', () => {
    it('treats October through February as the first season', () => {
        expect(activeSeason(at('2026-10-15T12:00:00'))).toBe('oct_feb');
        expect(activeSeason(at('2026-12-24T19:00:00'))).toBe('oct_feb');
        expect(activeSeason(at('2027-01-05T12:00:00'))).toBe('oct_feb');
        expect(activeSeason(at('2027-02-28T12:00:00'))).toBe('oct_feb');
    });

    it('treats March through September as the second', () => {
        expect(activeSeason(at('2026-03-04T13:00:00'))).toBe('mar_sep');
        expect(activeSeason(at('2026-06-21T20:00:00'))).toBe('mar_sep');
        expect(activeSeason(at('2026-09-30T23:00:00'))).toBe('mar_sep');
    });
});

describe('openStatusAt - the answer a visitor actually needs', () => {
    it('is closed before the first sitting and says when it opens', () => {
        const status = openStatusAt(at('2026-03-04T09:30:00'));
        expect(status.open).toBe(false);
        expect(status.current).toBeNull();
        expect(status.nextOpenAt?.getHours()).toBe(12);
        expect(describeStatus(status)).toBe('Closed — opens for lunch at 12:00 pm');
    });

    it('is open for lunch inside the window', () => {
        const status = openStatusAt(at('2026-03-04T13:00:00'));
        expect(status.open).toBe(true);
        expect(status.current).toBe('lunch');
        expect(describeStatus(status)).toBe('Open for lunch until 3:30 pm');
    });

    it('closes exactly at the end of the window', () => {
        // 15:30 is the closing minute of a Mar-Sep lunch, so we are shut.
        expect(openStatusAt(at('2026-03-04T15:30:00')).open).toBe(false);
        // One minute earlier we are still open.
        expect(openStatusAt(at('2026-03-04T15:29:00')).open).toBe(true);
    });

    it('opens exactly at the start of dinner', () => {
        expect(openStatusAt(at('2026-03-04T18:30:00')).open).toBe(true);
        expect(openStatusAt(at('2026-03-04T18:29:00')).open).toBe(false);
    });

    it('is open for dinner in the evening', () => {
        const status = openStatusAt(at('2026-03-04T20:15:00'));
        expect(status.current).toBe('dinner');
        expect(describeStatus(status)).toBe('Open for dinner until 10:30 pm');
    });

    it('rolls over to tomorrow after the last sitting', () => {
        const now = at('2026-03-04T23:30:00');
        const status = openStatusAt(now);
        expect(status.open).toBe(false);
        expect(status.nextOpenAt?.getDate()).toBe(5);
        expect(status.nextOpenAt?.getHours()).toBe(12);
    });

    it('uses the winter schedule in December, including the earlier dinner', () => {
        // Oct-Feb dinner starts at 18:00, half an hour before the summer one.
        expect(openStatusAt(at('2026-12-24T18:15:00')).open).toBe(true);
        expect(windowsFor(at('2026-12-24T12:00:00')).dinner.start).toBe(18 * 60);
    });

    it('keeps the half-hour gap between sittings closed', () => {
        // 16:00 in March: lunch has ended, dinner has not begun.
        expect(openStatusAt(at('2026-03-04T16:00:00')).open).toBe(false);
    });
});

describe('formatClock', () => {
    it('renders midday and midnight in 12-hour form', () => {
        expect(formatClock(0)).toBe('12:00 am');
        expect(formatClock(12 * 60)).toBe('12:00 pm');
    });

    it('zero-pads minutes and picks the right suffix', () => {
        expect(formatClock(9 * 60 + 5)).toBe('9:05 am');
        expect(formatClock(13 * 60 + 30)).toBe('1:30 pm');
        expect(formatClock(22 * 60 + 30)).toBe('10:30 pm');
    });
});

describe('formattedWindows', () => {
    it('prints both sittings for the current season', () => {
        expect(formattedWindows(at('2026-03-04T12:00:00'))).toEqual([
            { sitting: 'Lunch', range: '12:00 pm – 3:30 pm' },
            { sitting: 'Dinner', range: '6:30 pm – 10:30 pm' },
        ]);
    });
});
