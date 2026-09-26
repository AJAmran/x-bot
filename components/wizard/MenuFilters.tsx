'use client';

import { useId } from 'react';
import { ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Field, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer';

export const SORT_OPTIONS = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'name-asc', label: 'Name: A to Z' },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

export interface MenuFiltersProps {
    sort: SortOption;
    onSortChange: (value: SortOption) => void;
    vegetarianOnly: boolean;
    onVegetarianOnlyChange: (value: boolean) => void;
    popularOnly: boolean;
    onPopularOnlyChange: (value: boolean) => void;
    /** Dishes left after the active category and filters, shown beside the phone trigger. */
    resultCount?: number;
}

/**
 * Sorting and filtering for a 239-dish menu.
 *
 * The panel is duplicated on purpose: inline on `sm` and up, where there is room for it, and
 * inside a Drawer below that, where two selects and two checkboxes would otherwise push the
 * food itself off the first screen. Both render the same controls from the same state, so
 * there is only one definition of the behaviour.
 */
export function MenuFilters({
    sort,
    onSortChange,
    vegetarianOnly,
    onVegetarianOnlyChange,
    popularOnly,
    onPopularOnlyChange,
    resultCount,
}: MenuFiltersProps) {
    const activeCount = Number(vegetarianOnly) + Number(popularOnly) + Number(sort !== 'recommended');

    return (
        <>
            {/* Inline on desktop and tablet. */}
            <div className="hidden items-end gap-4 px-4 pb-2.5 @lg:flex">
                <SortField sort={sort} onSortChange={onSortChange} />
                <FilterFields
                    vegetarianOnly={vegetarianOnly}
                    onVegetarianOnlyChange={onVegetarianOnlyChange}
                    popularOnly={popularOnly}
                    onPopularOnlyChange={onPopularOnlyChange}
                />
            </div>

            {/*
              Drawer on phones. The trigger is a compact pill rather than a full-width bar: at
              panel width a stretched button left a mostly empty row above the food, and the
              dish count on the right gives the row a reason to exist and shows what the filters
              are actually cutting down.
            */}
            <div className="flex items-center gap-2 px-4 pb-2.5 @lg:hidden">
                <Drawer showSwipeHandle>
                    <DrawerTrigger
                        render={
                            <Button
                                type="button"
                                variant="outline"
                                className="h-9 shrink-0 justify-start gap-1.5 rounded-full border-slate-200 bg-white px-3.5 text-[11px] font-bold hover:border-primary-ink/30 hover:bg-primary/5 hover:text-primary-ink"
                            />
                        }
                    >
                        <SlidersHorizontal className="size-3.5 text-primary-ink" aria-hidden="true" />
                        Sort &amp; filter
                        {activeCount > 0 && (
                            <Badge className="size-4 rounded-full p-0 text-[9px] font-black">
                                <span className="sr-only">{activeCount} filters active</span>
                                <span aria-hidden="true">{activeCount}</span>
                            </Badge>
                        )}
                    </DrawerTrigger>
                    {/*
                      The sheet is portaled to the body and a vertical drawer is inset-x-0, so
                      it spans the whole window. That is right for a page-level sheet but wrong
                      for the floating widget, where it buried a 420px panel. These overrides pin
                      it to the panel's own geometry at md and up; they need the important flag
                      because the primitive drives its edges from data-attribute variants
                      (two-class selectors), which outrank a plain utility however it is ordered.
                    */}
                    <DrawerContent className="bg-white md:left-auto! md:right-8! md:bottom-24! md:w-[420px]! md:max-h-[calc(100vh-120px)]!">
                        <DrawerHeader className="text-left">
                            <DrawerTitle className="flex items-center gap-2 font-bold">
                                <ArrowUpDown className="size-4" aria-hidden="true" />
                                Sort &amp; filter
                            </DrawerTitle>
                            <DrawerDescription>
                                {SORT_OPTIONS.length} sort orders and {FILTERS.length} filters apply to every
                                category.
                            </DrawerDescription>
                        </DrawerHeader>
                        <div className="flex flex-col gap-5 overflow-y-auto p-4 pt-2">
                            <SortField sort={sort} onSortChange={onSortChange} />
                            <FilterFields
                                vegetarianOnly={vegetarianOnly}
                                onVegetarianOnlyChange={onVegetarianOnlyChange}
                                popularOnly={popularOnly}
                                onPopularOnlyChange={onPopularOnlyChange}
                            />
                        </div>
                        <DrawerFooter>
                            <DrawerClose
                                render={
                                    <Button
                                        type="button"
                                        className="h-11 w-full rounded-xl font-bold"
                                    />
                                }
                            >
                                Show results
                            </DrawerClose>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>

                {resultCount !== undefined && (
                    <p className="ml-auto text-[11px] font-bold tabular-nums text-slate-500">
                        {resultCount} {resultCount === 1 ? 'dish' : 'dishes'}
                        <span className="sr-only"> match your filters</span>
                    </p>
                )}
            </div>
        </>
    );
}

/**
 * Its own id, generated here rather than passed in. The panel and the drawer are both mounted
 * at once — CSS hides one of them — so an id shared between the two instances put two elements
 * with the same id in the document. A `label[for]` then resolves to whichever came first in the
 * DOM, which is the hidden one, and the select's trigger-to-listbox wiring is built on those
 * ids, so the options stopped being reachable.
 */
function SortField({ sort, onSortChange }: { sort: SortOption, onSortChange: (value: SortOption) => void }) {
    const id = useId();
    return (
        <Field className="w-48 shrink-0 gap-1.5">
            <FieldLabel htmlFor={id} className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Sort by
            </FieldLabel>
            <Select value={sort} onValueChange={(value) => onSortChange(value as SortOption)}>
                <SelectTrigger id={id} aria-label="Sort the menu" className="h-10 w-full rounded-xl border-slate-200 bg-white font-bold">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SORT_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    );
}

const FILTERS = [
    { key: 'vegetarian', label: 'Vegetarian only', hint: 'Dishes tagged V' },
    { key: 'popular', label: 'Popular only', hint: 'The waiter’s shortlist' },
] as const;

function FilterFields({
    vegetarianOnly,
    onVegetarianOnlyChange,
    popularOnly,
    onPopularOnlyChange,
}: Omit<MenuFiltersProps, 'sort' | 'onSortChange'>) {
    return (
        <FieldSet className="min-w-0 flex-1 gap-1.5">
            <FieldLegend className="mb-0 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Filters
            </FieldLegend>
            <div className="flex flex-wrap gap-2">
                {FILTERS.map(filter => {
                    const checked = filter.key === 'vegetarian' ? vegetarianOnly : popularOnly;
                    const onCheckedChange = filter.key === 'vegetarian'
                        ? onVegetarianOnlyChange
                        : onPopularOnlyChange;
                    const id = `menu-filter-${filter.key}`;

                    return (
                        /*
                          Label (not FieldLabel) is the clickable wrapper here: it is a real <label>
                          around the checkbox, so the whole chip is a hit target and the checkbox
                          is announced with its own label. FieldLabel is for label-above-control
                          form rows, which is not this layout.
                        */
                        <Label
                            key={filter.key}
                            htmlFor={id}
                            data-checked={checked || undefined}
                            className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold transition-colors hover:bg-slate-50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-checked:border-primary/40 data-checked:bg-primary/5"
                        >
                            <Checkbox
                                id={id}
                                checked={checked}
                                onCheckedChange={(value) => onCheckedChange(value === true)}
                            />
                            {filter.label}
                            <span className="sr-only"> — {filter.hint}</span>
                        </Label>
                    );
                })}
            </div>
        </FieldSet>
    );
}
