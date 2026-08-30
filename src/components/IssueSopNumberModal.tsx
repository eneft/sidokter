import React, { useEffect } from 'react';

type IssueSopNumberModalProps = {
  open: boolean;
  title: string;
  effectiveDate: string;
  revisionNumber: string;
  isIssuingNumber: boolean;
  onTitleChange: (value: string) => void;
  onEffectiveDateChange: (value: string) => void;
  onRevisionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function IssueSopNumberModal({
  open,
  title,
  effectiveDate,
  revisionNumber,
  isIssuingNumber,
  onTitleChange,
  onEffectiveDateChange,
  onRevisionChange,
  onClose,
  onSubmit,
}: IssueSopNumberModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isIssuingNumber) onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isIssuingNumber, onClose]);

  if (!open) return null;

  const canSubmit =
    title.trim().length > 0 &&
    effectiveDate.trim().length > 0 &&
    revisionNumber.trim().length > 0 &&
    !isIssuingNumber;

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-sop-number-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isIssuingNumber) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2
              id="issue-sop-number-modal-title"
              className="text-lg font-black text-slate-900"
            >
              Terbitkan Nomor SPO
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Lengkapi data sebelum nomor SPO diterbitkan.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isIssuingNumber}
            className="rounded-xl px-3 py-2 text-xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Judul SPO <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Contoh: SPO Pelayanan Pasien Rawat Jalan"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Tanggal Berlaku <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => onEffectiveDateChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Revisi <span className="text-red-500">*</span>
            </label>
            <input
              value={revisionNumber}
              onChange={(e) => onRevisionChange(e.target.value)}
              placeholder="00"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isIssuingNumber}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor'}
          </button>
        </div>
      </div>
    </div>
  );
}
