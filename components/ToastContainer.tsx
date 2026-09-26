'use client';

import { Toaster, toast } from '@/components/ui/toast';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * The toast surface. shadcn's `<Toaster>` owns the whole stack — provider, portal,
 * live-region viewport, stacking and swipe-to-dismiss — so this file no longer holds any
 * state or markup of its own.
 */
export const ToastContainer = () => <Toaster />;

/**
 * Programmatic toast, called from anywhere (the chat, the order wizard, the map).
 *
 * This replaces a `useState<Toast[]>` + `setTimeout` pair that lived in `ChatWidget`.
 * Two wins beyond the shorter code: the timer and the toast list are now managed by base-ui
 * (so toasts survive re-renders and can be swiped away), and firing one no longer re-renders
 * the entire widget — which was a real source of jank while the waiter was typing.
 *
 * Errors are announced urgently; everything else politely.
 */
export function showToast(message: string, type: ToastType = 'success', timeout = 3000): void {
    toast.add({
        title: message,
        type,
        timeout,
        priority: type === 'error' ? 'high' : 'low',
    });
}
