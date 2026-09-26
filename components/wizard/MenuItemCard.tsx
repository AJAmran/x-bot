'use client';

import React, { useState, useMemo, memo } from 'react';
import Image from 'next/image';
import { Plus, Flame, Sparkles, Clock } from 'lucide-react';
import { MenuItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

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
        <Card size="sm" className="group h-full gap-0 overflow-hidden bg-white py-0 ring-1 ring-slate-200/70 transition-shadow hover:shadow-[0_14px_30px_-18px_rgba(15,23,42,0.5)]">
            {/*
              The plate is the first thing to cut: in a two-column grid it dominated the card,
              so a shopper saw two dishes and a sliver of name. Shortening it fits roughly three
              rows on a phone instead of two, with the name and price immediately legible.
            */}
            <div className={`h-20 relative overflow-hidden bg-gradient-to-br ${gradient}`}>
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
                        <div className="text-4xl font-bold opacity-30 select-none" aria-hidden="true">{item.name.charAt(0)}</div>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
                    {item.popular && (
                        <Badge className="shadow-sm">
                            <Flame fill="currentColor" /> Popular
                        </Badge>
                    )}
                    {item.tags?.includes('V') && (
                        <Badge variant="secondary" className="shadow-sm">
                            <Sparkles fill="currentColor" /> Veg
                        </Badge>
                    )}
                </div>
                {/*
                  Price and prep time sit side by side rather than stacked: on a short plate a
                  two-high stack on the right and the Popular/Veg stack on the left nearly met
                  in the middle.
                */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-10">
                    {item.prep_time && (
                        <Badge variant="outline" className="border-white/70 bg-white/90 text-[10px] font-bold text-slate-700 shadow-sm backdrop-blur">
                            <Clock /> {item.prep_time} MINS
                        </Badge>
                    )}
                    <Badge className="px-2 text-xs font-black shadow-sm">
                        <span className="opacity-60">৳</span>{item.price}
                    </Badge>
                </div>
            </div>
            <CardContent className="flex flex-1 flex-col p-2.5">
                <CardTitle className="group-hover:text-primary-ink mb-1 line-clamp-2 text-[13px] font-bold uppercase tracking-tight text-slate-800">
                    {item.name}
                </CardTitle>
                <CardDescription className="mb-2 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-600">
                    {item.description}
                </CardDescription>
                <div className="mt-auto">
                    <Button
                        type="button"
                        onClick={() => onAdd(item)}
                        // "Added" alone is ambiguous once an item is in the basket — spell out what
                        // pressing again will do.
                        aria-label={count > 0
                            ? `Add another ${item.name}. ${count} already in your basket.`
                            : `Add ${item.name} to your basket`}
                        variant={count > 0 ? 'default' : 'outline'}
                        className={`h-10 w-full rounded-xl text-[11px] font-semibold uppercase tracking-widest ${count > 0
                            ? 'bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground hover:brightness-105'
                            : 'border-slate-200 text-slate-700 hover:border-primary-ink/40 hover:bg-primary/5 hover:text-primary-ink'}`}
                    >
                        {count > 0 ? (
                            <>
                                <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold" aria-hidden="true">{count}</span>
                                <span>Added</span>
                            </>
                        ) : (
                            <>
                                <Plus strokeWidth={2.5} /> Add Item
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
});

MenuItemCard.displayName = 'MenuItemCard';
