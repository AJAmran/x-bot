'use client';

import { useState, useCallback, useMemo } from 'react';
import { Order, CartItem, CustomerInfo } from '../types';
import { generateOrderId, MIN_ORDER_AMOUNT } from '../constants';
import { StorageService } from '../storageService';

const DEFAULT_DELIVERY_FEE = 0;

export function useCart(initialOrder: Order | null) {
    const [currentOrder, setCurrentOrder] = useState<Order | null>(initialOrder);

    const stats = useMemo(() => {
        const items = currentOrder?.items || [];
        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const deliveryFee = currentOrder?.customerInfo?.deliveryType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;
        const total = subtotal + deliveryFee;
        const isMinOrderMet = subtotal >= MIN_ORDER_AMOUNT;

        return { subtotal, totalItems, deliveryFee, total, isMinOrderMet };
    }, [currentOrder]);

    const updateOrder = useCallback((updates: Partial<Order>) => {
        setCurrentOrder(curr => {
            const updated = curr ? { ...curr, ...updates } : (updates as Order);
            StorageService.saveOrderDraft(updated);
            return updated;
        });
    }, []);

    const resetCart = useCallback(() => {
        setCurrentOrder(null);
        StorageService.clearOrderDraft();
    }, []);

    const syncOrderWithItems = useCallback((items: CartItem[], customerInfo: CustomerInfo) => {
        const subtotal = items.reduce((sum, i) => sum + i.total, 0);
        const deliveryFee = customerInfo.deliveryType === 'delivery' ? DEFAULT_DELIVERY_FEE : 0;
        const total = subtotal + deliveryFee;

        const newOrder: Order = {
            id: currentOrder?.id || generateOrderId(),
            items,
            customerInfo,
            status: 'draft',
            subtotal,
            deliveryFee,
            total,
            createdAt: currentOrder?.createdAt || new Date(),
            paymentStatus: 'pending'
        };

        setCurrentOrder(newOrder);
        StorageService.saveOrderDraft(newOrder);
    }, [currentOrder?.id, currentOrder?.createdAt]);

    return {
        currentOrder,
        setCurrentOrder, // Expose for initial load
        ...stats,
        updateOrder,
        resetCart,
        syncOrderWithItems
    };
}
