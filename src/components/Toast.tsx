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
  Stamp,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isAudioMuted, setAudioMuted, NotificationType } from '../lib/notificationService';

export interface ToastMessage {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  divisionCode?: string;
  dueDate?: string;
  isOverdue?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
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
    toast.duration || (toast.type === 'activation' || toast.type === 'proposal' || toast.type === 'assignment' || toast.type === 'review' ? 7500 : 4000);
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

  const isActivation = toast.type === 'activation';
  const isProposal = toast.type === 'proposal';
  const isAssignment = toast.type === 'assignment';
  const isReview = toast.type === 'review';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="pointer-events-auto relative overflow-hidden flex flex-col rounded-2xl bg-white/98 backdrop-blur-md border border-slate-200/90 shadow-lg shadow-slate-900/5 hover:shadow-md transition-all text-slate-800"
    >
      <div className="p-3.5 flex items-start gap-3">
        {/* Minimalist Icon */}
        <div className="shrink-0 mt-0.5">
          {isActivation ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Stamp className="w-4 h-4" />
            </div>
          ) : isProposal ? (
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          ) : isAssignment ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FilePlus2 className="w-4 h-4" />
            </div>
          ) : isReview ? (
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          ) : toast.type === 'success' ? (
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : toast.type === 'error' ? (
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : toast.type === 'warning' ? (
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Subtle Category Chips */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isActivation && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                SPO Diaktifkan
              </span>
            )}
            {isProposal && (
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                Usulan Aktivasi
              </span>
            )}
            {isAssignment && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                Penugasan
              </span>
            )}
            {isReview && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Riviu Berkala
              </span>
            )}
            {toast.divisionCode && (
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {toast.divisionCode}
              </span>
            )}
            {toast.dueDate && (
              <span className="text-[10px] text-slate-400 font-medium ml-auto">
                Tempo: {toast.dueDate}
              </span>
            )}
          </div>

          <h4 className="text-xs font-bold text-slate-900 leading-snug">
            {toast.title}
          </h4>

          {toast.message && (
            <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed line-clamp-2">
              {toast.message}
            </p>
          )}

          {/* Minimalist Action Link */}
          {toast.onAction && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className={`inline-flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  isActivation || isAssignment
                    ? 'text-emerald-700 hover:text-emerald-800'
                    : isProposal
                    ? 'text-indigo-700 hover:text-indigo-800'
                    : isReview
                    ? 'text-amber-700 hover:text-amber-800'
                    : 'text-slate-800 hover:text-slate-950'
                }`}
              >
                <span>{toast.actionLabel || (isProposal ? 'Tinjau & Sahkan' : 'Buka Dokumen')}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
          aria-label="Tutup notifikasi"
          title="Tutup"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hairline Progress Timer Bar */}
      <div className="h-[2px] w-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ease-linear ${
            isActivation || isAssignment || toast.type === 'success'
              ? 'bg-emerald-500'
              : isProposal
              ? 'bg-indigo-500'
              : isReview || toast.type === 'warning'
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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {/* Minimalist Controls */}
      <div className="flex items-center justify-between pointer-events-auto px-1 mb-0.5">
        <button
          type="button"
          onClick={toggleSound}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-xs text-[10px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          title={muted ? 'Aktifkan Suara Notifikasi' : 'Senyapkan Suara Notifikasi'}
        >
          {muted ? (
            <>
              <VolumeX className="w-3 h-3 text-rose-500" />
              <span>Senyap</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3 h-3 text-emerald-600" />
              <span>Suara Aktif</span>
            </>
          )}
        </button>

        {toasts.length > 1 && (
          <button
            type="button"
            onClick={() => toasts.forEach((t) => onDismiss(t.id))}
            className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-200/80 transition-colors cursor-pointer"
          >
            Tutup Semua ({toasts.length})
          </button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {toasts.slice(-3).map((toast) => (
          <SingleToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};
