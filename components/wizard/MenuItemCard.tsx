'use client';

import React, { useState, useMemo, memo } from 'react';
import Image from 'next/image';
import { Plus, Flame, Sparkles, Clock } from 'lucide-react';
import { MenuItem } from '@/lib/types';

interface MenuItemCardProps {
    item: MenuItem;
    onAdd: (item: MenuItem) => void;
    count: number;
}

export const MenuItemCard = memo(({ item, onAdd, count }: MenuItemCardProps) => {
    const [imgError, setImgError] = useState(false);

    const gradient = useMemo(() => {
        const id = item.id;
        const gradients = [
            'from-orange-400 to-red-500',
            'from-amber-400 to-orange-500',
            'from-red-400 to-rose-500',
            'from-lime-400 to-green-500',
            'from-emerald-400 to-teal-500'
        ];
        return gradients[id.charCodeAt(id.length - 1) % gradients.length];
    }, [item.id]);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full transition-all hover:shadow-lg group overflow-hidden relative">
            <div className={`h-28 relative overflow-hidden bg-gradient-to-br ${gradient}`}>
                {!imgError && item.image ? (
                    <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="(max-width: 420px) 50vw, 200px"
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/90 p-4">
                        <div className="text-4xl font-bold opacity-30 select-none">{item.name.charAt(0)}</div>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
                    {item.popular && (
                        <span className="bg-white/90 backdrop-blur-md text-orange-600 text-[9px] px-2 py-0.5 rounded-full font-black shadow-sm uppercase flex items-center gap-1">
                            <Flame size={8} fill="currentColor" /> Popular
                        </span>
                    )}
                    {item.tags?.includes('V') && (
                        <span className="bg-white/90 backdrop-blur-md text-green-600 text-[9px] px-2 py-0.5 rounded-full font-black shadow-sm uppercase flex items-center gap-1">
                            <Sparkles size={8} fill="currentColor" /> Veg
                        </span>
                    )}
                </div>
                <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1.5 z-10">
                    {item.prep_time && (
                        <div className="bg-white/95 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[9px] font-black shadow-sm text-slate-500 flex items-center gap-1 border border-slate-100">
                            <Clock size={8} /> {item.prep_time} MINS
                        </div>
                    )}
                    <div className="bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-lg text-xs font-bold shadow-sm text-slate-900 border border-slate-100">
                        <span className="text-[10px] text-slate-500 mr-0.5">৳</span>{item.price}
                    </div>
                </div>
            </div>
            <div className="p-3 flex flex-col flex-1">
                <h4 className="font-black text-slate-800 text-[13px] leading-tight line-clamp-2 mb-1 group-hover:text-brand-600 transition-colors uppercase tracking-tight">{item.name}</h4>
                <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 leading-relaxed font-medium opacity-80">{item.description}</p>
                <div className="mt-auto">
                    <button
                        onClick={() => onAdd(item)}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black transition-all duration-300 relative overflow-hidden active:scale-95 uppercase tracking-widest ${count > 0
                            ? 'bg-slate-900 text-white shadow-lg shadow-slate-500/20'
                            : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-brand-50 hover:border-brand-200 hover:text-brand-700'
                            }`}
                    >
                        {count > 0 ? (
                            <>
                                <div className="bg-white/20 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold">{count}</div>
                                <span>Added</span>
                            </>
                        ) : (
                            <>
                                <Plus size={12} strokeWidth={2.5} /> Add Item
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
});

MenuItemCard.displayName = 'MenuItemCard';
