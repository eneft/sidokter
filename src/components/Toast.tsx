import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md ${
              t.type === 'success'
                ? 'bg-white/95 border-emerald-200 text-slate-800'
                : t.type === 'error'
                ? 'bg-white/95 border-rose-200 text-slate-800'
                : 'bg-white/95 border-indigo-200 text-slate-800'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && (
                <div className="p-1 rounded-lg bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              {t.type === 'error' && (
                <div className="p-1 rounded-lg bg-rose-100 text-rose-600">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}
              {t.type === 'info' && (
                <div className="p-1 rounded-lg bg-indigo-100 text-indigo-600">
                  <Info className="w-5 h-5" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 leading-tight">
                {t.title}
              </h4>
              {t.message && (
                <p className="mt-1 text-xs text-slate-600 leading-relaxed break-words">
                  {t.message}
                </p>
              )}
            </div>

            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
