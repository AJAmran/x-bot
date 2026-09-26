'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

interface Options {
    /** Wrap Tab/Shift+Tab inside the container. Only correct when it covers the viewport. */
    trap: boolean;
    onEscape?: () => void;
}

/**
 * Focus management for the chat panel.
 *
 * Two distinct jobs, deliberately not conflated:
 *   - **Escape** always works while the panel is open, returning to the chat tab and then
 *     closing the widget.
 *   - **Focus trapping** is only enabled when the panel actually covers the viewport
 *     (`standalone`, or the full-screen mobile layout). On desktop the panel floats beside the
 *     page, and trapping there would strand keyboard users — they could not Tab past the chat
 *     to the content behind it, which is a regression rather than an accessibility win.
 *
 * On open, focus moves to `[data-autofocus]` if present, otherwise the first focusable
 * element; on close, focus returns to whatever was focused before. The one exception is an
 * iframe embed on first load, which must not steal focus from the host page.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, { trap, onEscape }: Options) {
    const ref = useRef<T | null>(null);
    const escapeRef = useRef(onEscape);
    /** True once the panel has been opened at least once, so we can detect "already open on mount". */
    const hasActivated = useRef(false);

    // Held in a ref so the keydown listener can stay stable while still calling the latest
    // handler. Assigned in an effect — writing `ref.current` during render is not allowed.
    useEffect(() => {
        escapeRef.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!active) return;
        const container = ref.current;
        if (!container) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

        // When this document is inside an iframe, do NOT grab focus on mount. A widget embedded
        // on someone else's page must not steal the visitor's focus (or scroll their page) just
        // because it loaded. Focus is still restored to the opener on close, and Escape/trapping
        // remain active, so keyboard users are not stranded.
        const isFramed = typeof window !== 'undefined' && window.self !== window.top;
        const isFirstActivation = !hasActivated.current;
        hasActivated.current = true;

        if (!(isFramed && isFirstActivation)) {
            const initial = container.querySelector<HTMLElement>('[data-autofocus]') ?? container.querySelector<HTMLElement>(FOCUSABLE);
            (initial ?? container).focus({ preventScroll: true });
        }

        const visibleFocusable = () =>
            Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
                element => element.offsetParent !== null || element === document.activeElement
            );

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                escapeRef.current?.();
                return;
            }
            if (!trap || event.key !== 'Tab') return;

            const items = visibleFocusable();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (!first || !last) return;

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            // Returning focus is what makes Escape feel correct: you end up back on the button
            // that opened the widget.
            previouslyFocused?.focus?.({ preventScroll: true });
        };
    }, [active, trap]);

    return ref;
}
