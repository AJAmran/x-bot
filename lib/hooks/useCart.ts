'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Order } from '../types';
import { calculateTotals } from '../order';
import { StorageService } from '../storageService';

export function useCart(initialOrder: Order | null) {
    const [currentOrder, setCurrentOrder] = useState<Order | null>(initialOrder);

    // Single source of truth for the maths — see lib/order.ts.
    const totals = useMemo(
        () =>
            calculateTotals(currentOrder?.items ?? [], {
                deliveryType: currentOrder?.customerInfo?.deliveryType,
                distanceKm: currentOrder?.customerInfo?.distance,
            }),
        [currentOrder]
    );

    // Persist as an effect, not inside the updater: React state updaters must stay pure
    // (they may be invoked more than once) and writing to localStorage during render-commit
    // is what made the previous implementation unsafe under concurrent rendering.
    useEffect(() => {
        if (currentOrder) StorageService.saveOrderDraft(currentOrder);
    }, [currentOrder]);

    const updateOrder = useCallback((updates: Partial<Order>) => {
        setCurrentOrder(curr => (curr ? { ...curr, ...updates } : (updates as Order)));
    }, []);

    const resetCart = useCallback(() => {
        setCurrentOrder(null);
        StorageService.clearOrderDraft();
    }, []);

    return {
        currentOrder,
        setCurrentOrder, // Expose for initial load
        ...totals,
        updateOrder,
        resetCart,
    };
}
