import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X, 
  CalendarClock, 
  FilePlus2, 
  ArrowRight,
  Volume2,
  VolumeX,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isAudioMuted, setAudioMuted } from '../lib/notificationService';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'assignment' | 'review';
  title: string;
  message?: string;
  divisionCode?: string;
  dueDate?: string;
  isOverdue?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number; // duration in ms, default 4000ms for standard, 8000ms for assignment/review
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

interface SingleToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const SingleToastItem: React.FC<SingleToastProps> = ({ toast, onDismiss }) => {
  const defaultDuration =
    toast.duration || (toast.type === 'assignment' || toast.type === 'review' ? 8500 : 4500);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(defaultDuration);

  useEffect(() => {
    if (isPaused) return;

    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newRemaining = Math.max(0, remainingTimeRef.current - elapsed);
      const pct = (newRemaining / defaultDuration) * 100;
      setProgress(pct);

      if (newRemaining <= 0) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [isPaused, defaultDuration, onDismiss, toast.id]);

  const handleMouseEnter = () => {
    setIsPaused(true);
    const elapsed = Date.now() - startTimeRef.current;
    remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    startTimeRef.current = Date.now();
  };

  const isAssignment = toast.type === 'assignment';
  const isReview = toast.type === 'review';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 25, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.94 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`pointer-events-auto relative overflow-hidden flex flex-col rounded-2xl shadow-xl border backdrop-blur-md transition-shadow hover:shadow-2xl ${
        isAssignment
          ? 'bg-white/95 border-emerald-300 text-slate-800'
          : isReview
          ? 'bg-white/95 border-amber-300 text-slate-800'
          : toast.type === 'success'
          ? 'bg-white/95 border-emerald-200 text-slate-800'
          : toast.type === 'error'
          ? 'bg-white/95 border-rose-200 text-slate-800'
          : toast.type === 'warning'
          ? 'bg-white/95 border-amber-200 text-slate-800'
          : 'bg-white/95 border-blue-200 text-slate-800'
      }`}
    >
      {/* Accent Header for Assignment & Review */}
      {(isAssignment || isReview) && (
        <div
          className={`px-4 py-1.5 flex items-center justify-between text-[11px] font-black tracking-wide border-b ${
            isAssignment
              ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
              : 'bg-amber-50 text-amber-900 border-amber-100'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full animate-ping ${
                isAssignment ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {isAssignment ? 'PENUGASAN DOKUMEN DIVISI' : 'PENGINGAT RIVIU BERKALA'}
          </span>
          {toast.divisionCode && (
            <span className="px-2 py-0.5 rounded-md bg-white/80 border border-current text-[10px] font-mono font-bold">
              DIVISI: {toast.divisionCode}
            </span>
          )}
          {toast.dueDate && (
            <span className="text-[10px] font-semibold opacity-90">
              Tempo: {toast.dueDate}
            </span>
          )}
        </div>
      )}

      {/* Main Toast Content */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {isAssignment && (
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shadow-xs">
              <FilePlus2 className="w-5 h-5" />
            </div>
          )}
          {isReview && (
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shadow-xs">
              <CalendarClock className="w-5 h-5" />
            </div>
          )}
          {toast.type === 'success' && (
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          )}
          {toast.type === 'error' && (
            <div className="p-2 rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          )}
          {toast.type === 'warning' && (
            <div className="p-2 rounded-xl bg-amber-100 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          {toast.type === 'info' && (
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
              <Info className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 leading-snug">
              {toast.title}
            </h4>
          </div>
          {toast.message && (
            <p className="mt-1 text-xs text-slate-600 leading-relaxed break-words font-medium">
              {toast.message}
            </p>
          )}

          {/* Action Button if provided */}
          {toast.onAction && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ${
                  isAssignment
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : isReview
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <span>{toast.actionLabel || (isReview ? 'Tinjau Sekarang' : 'Buka Dokumen')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          aria-label="Tutup notifikasi"
          title="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Real-time Progress Countdown Bar */}
      <div className="h-1 w-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ease-linear ${
            isAssignment
              ? 'bg-emerald-500'
              : isReview
              ? 'bg-amber-500'
              : toast.type === 'error'
              ? 'bg-rose-500'
              : 'bg-slate-400'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  const [muted, setMuted] = useState(isAudioMuted());

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setAudioMuted(next);
  };

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {/* Sound Mute & Dismiss-All Control if multiple toasts */}
      <div className="flex items-center justify-between pointer-events-auto px-1">
        <button
          type="button"
          onClick={toggleSound}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 shadow-sm text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          title={muted ? 'Aktifkan Suara Notifikasi' : 'Senyapkan Suara Notifikasi'}
        >
          {muted ? (
            <>
              <VolumeX className="w-3.5 h-3.5 text-rose-500" />
              <span>Suara Senyap</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Suara Aktif</span>
            </>
          )}
        </button>

        {toasts.length > 1 && (
          <button
            type="button"
            onClick={() => toasts.forEach((t) => onDismiss(t.id))}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-white/80 backdrop-blur-md px-2 py-1 rounded-full border border-slate-200 transition-colors cursor-pointer"
          >
            Tutup Semua ({toasts.length})
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {toasts.slice(-4).map((toast) => (
          <SingleToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
