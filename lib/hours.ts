/**
 * lib/hours.ts — when the restaurant is actually open.
 *
 * The hours live in `RESTAURANT_DATA` as two seasonal pairs of windows ("12:00-15:00"), because
 * that is how the source data records them. Nothing read them: the model was asked "when are you
 * open?" and had no way to know, so it guessed. This module turns that data into something a
 * page can state as fact and a visitor can plan around.
 *
 * Everything here is pure and takes an explicit `Date`, because "is it open" depends on the
 * viewer's clock, not the server's — the answer is computed in the browser where the same instant
 * is known locally.
 */

import { RESTAURANT_DATA } from './constants';

export type ServiceWindow = 'lunch' | 'dinner';

export interface OpenWindow {
    start: number;
    end: number;
}

/** Minutes since midnight. */
const minutesOf = (date: Date): number => date.getHours() * 60 + date.getMinutes();

/**
 * October through February is the first season in the source data, March to September the
 * second. The boundary months are the restaurant's, not ours: a Dhaka winter dinner starts at
 * 18:00 and a summer one at 18:30, and that half hour is the whole reason this is seasonal.
 */
export function activeSeason(date: Date): 'oct_feb' | 'mar_sep' {
    const month = date.getMonth() + 1;
    return month >= 10 || month <= 2 ? 'oct_feb' : 'mar_sep';
}

function parseWindow(raw: string): OpenWindow {
    const [start, end] = raw.split('-').map(part => {
        const [h, m] = part.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    });
    return { start: start ?? 0, end: end ?? 0 };
}

/** The two service windows in force on a given date. */
export function windowsFor(date: Date): Record<ServiceWindow, OpenWindow> {
    // The source data namespaces the seasons ("season_oct_feb"); the short ids above are what
    // the rest of this module passes around.
    const season = activeSeason(date) === 'oct_feb' ? RESTAURANT_DATA.restaurant.hours.season_oct_feb : RESTAURANT_DATA.restaurant.hours.season_mar_sep;
    return {
        lunch: parseWindow(season.lunch),
        dinner: parseWindow(season.dinner),
    };
}

export interface OpenStatus {
    open: boolean;
    /** Which sitting is running, if any. */
    current: ServiceWindow | null;
    /** When the current sitting ends, if we are in one. */
    closesAt: Date | null;
    /** When we next open, if we are closed. */
    nextOpenAt: Date | null;
    /** e.g. "Dinner", for display next to a dot. */
    label: string;
}

/**
 * Whether we are open at `now`, and — the part a visitor actually wants — when that changes.
 * "Open" on its own is half an answer; "open for dinner until 10:30 pm" is the whole answer.
 */
export function openStatusAt(now: Date): OpenStatus {
    const windows = windowsFor(now);
    const minutes = minutesOf(now);

    for (const sitting of ['lunch', 'dinner'] as const) {
        const { start, end } = windows[sitting];
        if (minutes >= start && minutes < end) {
            const closesAt = new Date(now);
            closesAt.setHours(Math.floor(end / 60), end % 60, 0, 0);
            return { open: true, current: sitting, closesAt, nextOpenAt: null, label: sitting === 'lunch' ? 'Lunch' : 'Dinner' };
        }
    }

    // Closed: find the next sitting that has not finished yet. Both sittings are later the same
    // day, except when we are after the last one — then it is tomorrow's lunch.
    for (const sitting of ['lunch', 'dinner'] as const) {
        if (minutes < windows[sitting].start) {
            const next = new Date(now);
            next.setHours(Math.floor(windows[sitting].start / 60), windows[sitting].start % 60, 0, 0);
            return { open: false, current: null, closesAt: null, nextOpenAt: next, label: sitting === 'lunch' ? 'Lunch' : 'Dinner' };
        }
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(Math.floor(windows.lunch.start / 60), windows.lunch.start % 60, 0, 0);
    return { open: false, current: null, closesAt: null, nextOpenAt: tomorrow, label: 'Lunch' };
}

/** "15:30" -> "3:30 pm". Twelve-hour, because that is how the times are written on a menu board. */
export function formatClock(minutes: number): string {
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const suffix = h24 >= 12 ? 'pm' : 'am';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Opens for dinner 6:30 pm" / "Open for dinner, until 10:30 pm". */
export function describeStatus(status: OpenStatus): string {
    if (status.open && status.closesAt) {
        return `Open for ${status.label.toLowerCase()} until ${formatClock(minutesOf(status.closesAt))}`;
    }
    if (status.nextOpenAt) {
        return `Closed — opens for ${status.label.toLowerCase()} at ${formatClock(minutesOf(status.nextOpenAt))}`;
    }
    return 'Closed';
}

/** The windows as they should be printed in a "Hours" table. */
export function formattedWindows(date: Date): Array<{ sitting: string; range: string }> {
    const windows = windowsFor(date);
    return [
        { sitting: 'Lunch', range: `${formatClock(windows.lunch.start)} – ${formatClock(windows.lunch.end)}` },
        { sitting: 'Dinner', range: `${formatClock(windows.dinner.start)} – ${formatClock(windows.dinner.end)}` },
    ];
}
