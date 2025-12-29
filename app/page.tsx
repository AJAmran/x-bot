/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, User, Menu, ShoppingBag, Send, MapPin, Phone, MessageSquare, ArrowRight, Sparkles, X, ChevronRight, Check, Mic, MicOff } from 'lucide-react';
import { StorageService } from '@/lib/storageService';
import { RESTAURANT_DATA } from '@/lib/constants';
import { ChatMessage as ChatMessageType, Order, OrderAction } from '@/lib/types';
import { useCart } from '@/lib/hooks/useCart';
import { useChat } from '@/lib/hooks/useChat';
import { ChatMessage } from '@/components/ChatMessage';
import { OrderWizard } from '@/components/OrderWizard';
import { ToastContainer, Toast } from '@/components/ToastContainer';
import { getGeminiResponse } from '@/lib/gemini';
import { ChatService } from '@/lib/chatService';
import { Clock as ClockIcon, Utensils } from 'lucide-react';

// Add WebkitSpeechRecognition type support
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

const PREDEFINED_QUESTIONS = [
  { label: 'Opening Hours', text: 'When are you open?', icon: <ClockIcon size={12} /> },
  { label: 'Contact Info', text: 'What is your address and phone number?', icon: <Phone size={12} /> },
  { label: 'Full Menu', text: 'Show me the full menu', icon: <Utensils size={12} /> },
];

import { ChatWidget } from '@/components/ChatWidget';

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-brand-50/30">
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-12 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 bg-white/50 backdrop-blur-xl border border-white px-4 py-2 rounded-full mb-8 shadow-sm">
          <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">SeasonBot v2.0 AI</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight leading-[0.9] mb-6">
          The Future of <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-orange-400">Conversational</span><br />
          Dining.
        </h1>

        <p className="max-w-2xl text-slate-500 text-lg font-medium leading-relaxed mb-10">
          Meet SeasonBot—the next generation of hospitality. Real-time ordering,
          intelligent location binding, and professional head-waiter intelligence,
          all inside a stunning, responsive interface.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 shadow-2xl shadow-slate-900/20 hover:scale-105 transition-all active:scale-95">
            View Live Menu <ChevronRight size={16} />
          </button>
          <button className="bg-white text-slate-900 border border-slate-200 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-50 transition-all active:scale-95">
            Integration Guide
          </button>
        </div>
      </div>

      <ChatWidget />
    </div>
  );
}

function TabButton({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: any, label: string, badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-all relative ${active ? 'text-brand-600 scale-110' : 'text-slate-300 hover:text-slate-500'}`}
    >
      <div className={`p-1 transition-all ${active ? 'bg-brand-50 rounded-xl' : ''}`}>
        {icon}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
      {badge && badge > 0 && (
        <span className="absolute -top-1 right-0 bg-slate-900 text-white text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center border-2 border-white animate-bounce-short">{badge}</span>
      )}
    </button>
  );
}
