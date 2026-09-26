/**
 * lib/widgetBus.ts — a one-event bridge between the landing page and the chat widget.
 *
 * The landing page is a Server Component and the widget is a client component, so they cannot
 * share React state. Rather than promote the whole page to a client component just to pass one
 * `onClick`, the page dispatches a DOM event and the widget listens for it. This is also the
 * seam a future "open the chat" button anywhere in the app would use.
 */

export type WidgetTab = 'chat' | 'menu' | 'cart';

export const OPEN_WIDGET_EVENT = 'seasonbot:open';

/** Ask the widget to open, optionally on a specific tab. No-op during SSR. */
export function requestOpenWidget(tab: WidgetTab = 'chat'): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<WidgetTab>(OPEN_WIDGET_EVENT, { detail: tab }));
}
