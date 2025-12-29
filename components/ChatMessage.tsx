'use client';

import React, { memo, useCallback } from 'react';
import { ChatMessage as ChatMessageType } from '@/lib/types';
import { Bot, User, CheckCircle2, Clock, Copy, Hash } from 'lucide-react';

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
                    <strong key={`${key}-b-${i}`} className="font-extrabold text-slate-900 bg-brand-50/50 px-1 rounded-sm">
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
                    <div className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-400 group-hover/li:bg-brand-600 transition-colors shrink-0" />
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

    // Extract total from content if metadata is missing
    const totalMatch = message.content.match(/Total: ৳?(\d+)/i);
    const total = totalMatch ? `৳${totalMatch[1]}` : '---';

    const copyId = useCallback(() => {
        navigator.clipboard.writeText(orderId);
        alert("Order ID copied! 📋");
    }, [orderId]);

    return (
        <div className="flex justify-center my-6 animate-scale-in w-full px-4">
            <div className="bg-white border border-slate-200 rounded-[2rem] shadow-2xl shadow-slate-200/50 overflow-hidden w-full max-w-[320px] transform hover:scale-[1.02] transition-transform duration-500">
                <div className="bg-slate-900 p-6 text-white text-center relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-600/20 rounded-full blur-3xl" />
                    <div className="bg-brand-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/20">
                        <CheckCircle2 size={24} />
                    </div>
                    <h4 className="font-black italic tracking-tighter text-lg uppercase">Success!</h4>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mt-1">Order has been placed</p>
                </div>

                <div className="p-6 space-y-6 bg-gradient-to-b from-white to-slate-50">
                    <div className="text-center group cursor-pointer" onClick={copyId}>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <Hash size={10} className="text-brand-500" />
                            <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black">Order Reference</p>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <p className="text-xl font-black text-slate-800 font-mono tracking-tighter">{orderId}</p>
                            <Copy size={12} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                        </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Final Amount</span>
                        <span className="text-3xl font-black text-brand-600 italic tracking-tighter">{total}</span>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-brand-50/50 rounded-xl border border-brand-100/50">
                        <Clock size={16} className="text-brand-600" />
                        <p className="text-[10px] font-bold text-slate-600 leading-tight">Our team will call you at your provided number shortly.</p>
                    </div>
                </div>
            </div>
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
            <div className="flex justify-center my-6 animate-fade-in w-full px-6">
                <div className="flex gap-3 items-center bg-white/80 backdrop-blur-md border border-slate-200/50 text-slate-500 text-[10px] font-black tracking-widest uppercase py-2 px-5 rounded-full shadow-sm max-w-md">
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                    {message.content.replace(/\*\*/g, '')}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex gap-3 my-5 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-slide-up px-4 group`}>
            {/* Elegant Avatar */}
            <div className={`w-9 h-9 rounded-[1.2rem] flex items-center justify-center shrink-0 shadow-lg border relative transition-all duration-500 transform group-hover:-translate-y-1 ${isUser ? 'bg-slate-900 border-slate-700' : 'bg-white border-brand-100 shadow-brand-500/5'
                }`}>
                {!isUser && <div className="absolute inset-0 bg-brand-500/10 rounded-[1.2rem] animate-pulse"></div>}
                {isUser ? <User size={16} className="text-white" strokeWidth={2.5} /> : <Bot size={18} className="text-brand-600 relative z-10" strokeWidth={2.5} />}
            </div>

            {/* Precision Bubble */}
            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                <div className={`rounded-[1.8rem] px-5 py-4 shadow-xl relative transition-all duration-300 ${isUser
                    ? 'bg-slate-900 border border-slate-800 text-slate-50 rounded-tr-sm shadow-slate-900/10'
                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm ring-4 ring-slate-50/50'
                    }`}>
                    <div className="text-[14px] leading-relaxed tracking-tight font-medium">
                        {isUser ? (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                        ) : (
                            <MessageFormatter content={message.content} />
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-2.5 px-3">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-30">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isUser && <div className="w-1 h-1 bg-brand-400 rounded-full opacity-40"></div>}
                </div>
            </div>
        </div>
    );
});

ChatMessage.displayName = 'ChatMessage';
