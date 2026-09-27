/**
 * lib/widgetBus.ts — a one-event bridge between the marketing pages and the chat widget.
 *
 * The pages are Server Components and the widget is a client component, so they cannot share
 * React state. Rather than promote the whole page to a client component just to pass one
 * `onClick`, the page dispatches a DOM event and the widget listens for it. This is also the
 * seam any future "open the chat" button anywhere in the app would use.
 *
 * A second argument carries a message to drop into the composer, which is what makes a dish card
 * on the home page worth tapping: the guest arrives in the chat with the dish already written
 * and can send it with one press, instead of retyping the name and the code.
 */

export type WidgetTab = 'chat' | 'menu' | 'cart';

export interface OpenWidgetDetail {
    tab: WidgetTab;
    /** Text to pre-fill, not to send. We never auto-send on the guest's behalf. */
    prefill?: string;
}

export const OPEN_WIDGET_EVENT = 'seasonbot:open';

/** Ask the widget to open, optionally on a specific tab and with a message ready to send. */
export function requestOpenWidget(tab: WidgetTab = 'chat', prefill?: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<OpenWidgetDetail>(OPEN_WIDGET_EVENT, {
        detail: prefill ? { tab, prefill } : { tab },
    }));
}
