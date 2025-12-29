'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface Props {
    toasts: Toast[];
    removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<Props> = ({ toasts }) => {
    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-100 flex flex-col gap-3 w-full max-w-85 px-4 pointer-events-none">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-2xl border animate-slide-up backdrop-blur-xl transition-all duration-300 ${toast.type === 'success' ? 'bg-white/95 border-green-100 text-slate-800 ring-1 ring-green-500/10' :
                            toast.type === 'error' ? 'bg-white/95 border-red-100 text-red-800 ring-1 ring-red-500/10' :
                                'bg-slate-900/95 border-slate-800 text-white'
                        }`}
                >
                    <div className={`p-1.5 rounded-xl shrink-0 ${toast.type === 'success' ? 'bg-green-100 text-green-600' :
                            toast.type === 'error' ? 'bg-red-100 text-red-600' :
                                'bg-brand-600 text-white'
                        }`}>
                        {toast.type === 'success' && <CheckCircle2 size={16} />}
                        {toast.type === 'error' && <AlertCircle size={16} />}
                        {toast.type === 'info' && <Info size={16} />}
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-widest italic">{toast.message}</p>
                </div>
            ))}
        </div>
    );
};
