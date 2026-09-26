'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage as ChatMessageType } from '@/lib/types';
import { Bot, User, CheckCircle2, Clock, Copy, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Message, MessageAvatar, MessageContent, MessageFooter } from '@/components/ui/message';

interface Props {
    message: ChatMessageType;
}

/**
 * Robust message formatter for markdown-like syntax used by the AI.
 */
const MessageFormatter = memo(({ content }: { content: string }) => {
    const parseLine = (text: string, key: string) => {
        // Handle bold text **text**
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <strong key={`${key}-b-${i}`} className="rounded-sm bg-primary/15 px-1 font-extrabold text-slate-900">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return <span key={`${key}-t-${i}`}>{part}</span>;
        });
    };

    const lines = content.split('\n');
    const result: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];

    const flushList = (key: string) => {
        if (currentList.length > 0) {
            result.push(
                <ul key={key} className="space-y-2 my-3 pl-1">
                    {currentList}
                </ul>
            );
            currentList = [];
        }
    };

    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        const isList = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');

        if (isList) {
            const listText = line.trim().replace(/^[\*\-•]\s+/, '');
            currentList.push(
                <li key={`li-${idx}`} className="flex items-start gap-2.5 group/li">
                    <div className="mt-2 size-1.5 rounded-full bg-primary-ink/70 group-hover/li:bg-primary-ink transition-colors shrink-0" />
                    <div className="text-slate-800 font-medium text-[13.5px]">{parseLine(listText, `li-${idx}`)}</div>
                </li>
            );
        } else {
            flushList(`list-before-${idx}`);
            if (!trimmed) {
                if (idx > 0 && idx < lines.length - 1) result.push(<div key={`br-${idx}`} className="h-3" />);
            } else {
                result.push(
                    <div key={`p-${idx}`} className="leading-relaxed text-slate-700 font-medium text-[13.5px]">
                        {parseLine(line, `p-${idx}`)}
                    </div>
                );
            }
        }
    });

    flushList('list-end');
    return <div className="space-y-1">{result}</div>;
});

MessageFormatter.displayName = 'MessageFormatter';

/**
 * Specialized component for order confirmation cards.
 */
const OrderReceipt = memo(({ message }: { message: ChatMessageType }) => {
    const orderId = message.metadata?.orderId || '---';
    const [copied, setCopied] = useState(false);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Extract total from content if metadata is missing
    const totalMatch = message.content.match(/Total: ৳?(\d+)/i);
    const total = totalMatch ? `৳${totalMatch[1]}` : '---';

    const copyId = useCallback(() => {
        navigator.clipboard.writeText(orderId).then(() => {
            setCopied(true);
            if (resetTimer.current) clearTimeout(resetTimer.current);
            resetTimer.current = setTimeout(() => setCopied(false), 2000);
        }).catch(() => setCopied(false));
    }, [orderId]);

    useEffect(() => () => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
    }, []);

    return (
        <div className="flex justify-center my-3 animate-scale-in w-full">
            <Card className="w-full max-w-[320px] overflow-hidden rounded-[1.75rem] bg-white py-0 ring-1 ring-slate-200/80 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.5)]">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-center text-white">
                    <div className="absolute -top-10 -right-10 size-32 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
                    <div className="absolute -bottom-12 -left-8 size-32 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
                    <div className="relative mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.841_0.238_128.85/0.9)]">
                        <CheckCircle2 className="size-6" aria-hidden="true" />
                    </div>
                    <h4 className="relative font-heading font-extrabold tracking-tight text-lg uppercase">Success!</h4>
                    <p className="relative mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">Order has been placed</p>
                </div>

                <div className="space-y-5 bg-gradient-to-b from-white to-primary/[0.04] p-5">
                    {/*
                      A real Button, not a <div onClick>: the previous version was
                      unreachable by keyboard and had no role, so a screen-reader user could
                      not copy the reference at all.
                    */}
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={copyId}
                        aria-label={`Copy order reference ${orderId} to clipboard`}
                        className="group h-auto w-full flex-col gap-1 rounded-xl py-1 font-normal hover:bg-primary/5"
                    >
                        <span className="flex items-center justify-center gap-1.5">
                            <Hash className="size-2.5 text-primary-ink" aria-hidden="true" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Order Reference</span>
                        </span>
                        <span className="flex items-center justify-center gap-2">
                            <span className="font-mono text-xl font-black tracking-tighter text-slate-800">{orderId}</span>
                            {copied
                                ? <Badge variant="secondary" className="text-[10px] font-black uppercase">Copied</Badge>
                                : <Copy className="size-3 text-slate-400 transition-colors group-hover:text-primary-ink" aria-hidden="true" />}
                        </span>
                    </Button>

                    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <span className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Final Amount</span>
                        {/* `primary-ink`, not `primary`: the brand lime is ~1.5:1 on white. */}
                        <span className="text-3xl font-black tracking-tighter text-primary-ink">{total}</span>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl border border-primary-ink/20 bg-primary/5 p-3">
                        <Clock className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                        <p className="text-[10px] font-bold leading-tight text-slate-600">Our team will call you at your provided number shortly.</p>
                    </div>
                </div>
            </Card>
        </div>
    );
});

OrderReceipt.displayName = 'OrderReceipt';

export const ChatMessage = memo(({ message }: Props) => {
    const isUser = message.sender === 'user';
    const isSystem = message.sender === 'system';
    const isOrderUpdate = message.type === 'order_update';

    if (isOrderUpdate) return <OrderReceipt message={message} />;

    if (isSystem) {
        return (
        <div className="flex justify-center my-3 animate-fade-in w-full">
            <div className="flex gap-2.5 items-center bg-gradient-to-r from-slate-900 to-slate-800 border border-white/10 text-slate-200 text-[10px] font-black tracking-widest uppercase py-2 px-4 rounded-full shadow-[0_10px_30px_-14px_rgba(15,23,42,0.8)] max-w-[92%]">
                <span className="size-1.5 shrink-0 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                    {message.content.replace(/\*\*/g, '')}
                </div>
            </div>
        );
    }

    return (
        /*
          No `my-*`/`px-*` here: the log owns the horizontal inset and a `gap-2` between rows.
          The component used to carry both, so every bubble was inset twice (32px a side on a
          420px panel) and lost ~40px of height to margins that never collapsed.
        */
        <Message align={isUser ? 'end' : 'start'} className="animate-slide-up">
            <MessageAvatar
                aria-hidden="true"
                className={`relative size-8 translate-y-0 rounded-[1.1rem] border transition-all duration-500 group-hover/message:-translate-y-0.5 ${isUser
                    ? 'border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-[0_6px_18px_-8px_rgba(15,23,42,0.7)]'
                    : 'border-primary/25 bg-gradient-to-br from-primary to-emerald-400 text-primary-foreground shadow-[0_6px_18px_-8px_oklch(0.841_0.238_128.85/0.85)]'}`}
            >
                {isUser
                    ? <User className="relative z-10 size-3.5" strokeWidth={2.5} />
                    : <Bot className="relative z-10 size-3.5" strokeWidth={2.5} />}
            </MessageAvatar>

            <MessageContent className="max-w-[88%] gap-1.5">
                {/*
                  The reply bubble keeps a whisper of the brand lime in its gradient so a long
                  transcript still reads as one surface, but the text stays slate — the lime is
                  never load-bearing for legibility.
                */}
                <div className={`rounded-[1.6rem] px-4 py-3 transition-all duration-300 ${isUser
                    ? 'rounded-tr-md border border-slate-800/80 bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.6)]'
                    : 'rounded-tl-md border border-slate-200/70 bg-gradient-to-br from-white to-primary/[0.06] text-slate-800 shadow-[0_6px_24px_-14px_rgba(15,23,42,0.35)]'
                    }`}>
                    <div className="text-[14px] leading-relaxed tracking-tight font-medium">
                        {isUser ? (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                        ) : (
                            <MessageFormatter content={message.content} />
                        )}
                    </div>
                </div>

                <MessageFooter className="mt-0 px-3.5 text-[10px] font-black uppercase tracking-widest">
                    <span className="sr-only">Sent at </span>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isUser && <span className="size-1 rounded-full bg-primary-ink opacity-60" aria-hidden="true" />}
                </MessageFooter>
            </MessageContent>
        </Message>
    );
});

ChatMessage.displayName = 'ChatMessage';
