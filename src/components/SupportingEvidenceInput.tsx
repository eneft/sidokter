import React from 'react';
import { Eye, Plus, Trash2, Upload } from 'lucide-react';
import { SopDocument, SupportingEvidenceCategory } from '../types';
import { formatBytes } from '../utils/numbering';

export interface PendingEvidence {
  id: string;
  category: SupportingEvidenceCategory;
  description: string;
  file: File | null;
}

export const SUPPORTING_EVIDENCE_CATEGORIES: Array<[SupportingEvidenceCategory, string]> = [
  ['NOTULEN_BA', 'Notulen / Berita Acara'],
  ['PERATURAN_PEDOMAN', 'Peraturan / Pedoman'],
  ['EVALUASI_AUDIT', 'Evaluasi / Audit / Monitoring'],
  ['SURAT_INSTRUKSI', 'Surat / Instruksi / Disposisi'],
  ['LAINNYA', 'Dokumen Lainnya'],
];

export const getSupportingEvidenceCategoryLabel = (category: SupportingEvidenceCategory): string =>
  SUPPORTING_EVIDENCE_CATEGORIES.find(([key]) => key === category)?.[1] || 'Dokumen Lainnya';

export const createPendingEvidence = (number: number): PendingEvidence => ({
  id: `evidence-${number}`,
  category: 'LAINNYA',
  description: '',
  file: null,
});

export const SupportingEvidenceInput: React.FC<{
  value: PendingEvidence[];
  onChange: (value: PendingEvidence[]) => void;
  source?: SopDocument;
  manualSourceFile?: File | null;
  onManualSourceFileChange?: (file: File | null) => void;
  onViewSource?: () => void;
  showPrimary?: boolean;
  title?: string;
  description?: string;
  acceptedFileTypes?: string;
}> = ({
  value,
  onChange,
  source,
  manualSourceFile = null,
  onManualSourceFileChange = (_file: File | null) => undefined,
  onViewSource = () => undefined,
  showPrimary = true,
  title = 'Bukti Dukung Riviu',
  description = 'Bukti #1 adalah SPO yang diriviu. Bukti tambahan bersifat opsional.',
  acceptedFileTypes = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
}) => {
  const update = (index: number, patch: Partial<PendingEvidence>) =>
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
      <div>
        <div className="text-xs font-black uppercase tracking-wider text-slate-800">{title}</div>
        <p className="text-[10px] text-slate-500">{description}</p>
      </div>
      {showPrimary && <div className="grid grid-cols-1 sm:grid-cols-[30px_150px_minmax(0,1fr)_auto] gap-2 items-center rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
        <span className="text-xs font-black text-emerald-800 text-center">1.</span>
        <span className="text-[11px] font-black text-slate-800">SPO yang Diriviu</span>
        {source ? (
          <div className="min-w-0 text-[11px] text-slate-700">
            <span className="font-bold">{source.sopNumber || source.legacySopNumber || 'Tanpa nomor'} — {source.title}</span>
            <span className="ml-2 whitespace-nowrap text-slate-500">Rev. {source.revisionNumber || source.version || '00'}</span>
          </div>
        ) : (
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Upload PDF SPO
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onManualSourceFileChange(e.target.files?.[0] || null)} />
            </label>
            <span className={`min-w-0 truncate text-[10px] font-semibold ${manualSourceFile ? 'text-emerald-700' : 'text-slate-500'}`}>
              {manualSourceFile?.name || 'PDF SPO yang diriviu wajib diunggah'}
            </span>
          </div>
        )}
        {(source || manualSourceFile) && <button type="button" onClick={onViewSource} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-blue-800 hover:bg-blue-50"><Eye className="h-3.5 w-3.5" /> Lihat</button>}
      </div>}
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[30px_180px_minmax(0,1fr)_auto] gap-2 items-center rounded-lg border border-slate-200 bg-white p-2">
            <span className="text-xs font-black text-slate-600 text-center">{index + (showPrimary ? 2 : 1)}.</span>
            <select value={item.category} onChange={(e) => update(index, { category: e.target.value as SupportingEvidenceCategory })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px]">
              {SUPPORTING_EVIDENCE_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div className="min-w-0 flex flex-col gap-1">
              <input type="text" value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Keterangan (opsional)" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]" />
              <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[10px]">
                <span className="shrink-0 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 font-bold text-slate-700">Pilih Berkas</span>
                <span className="truncate font-semibold text-slate-600">{item.file ? `${item.file.name} (${formatBytes(item.file.size)})` : 'Belum ada berkas'}</span>
                <input type="file" accept={acceptedFileTypes} onChange={(e) => update(index, { file: e.target.files?.[0] || null })} className="hidden" />
              </label>
            </div>
            <div className="flex gap-1 justify-end">
              {item.file && <button type="button" title="Preview" onClick={() => window.open(URL.createObjectURL(item.file!), '_blank', 'noopener,noreferrer')} className="p-1.5 rounded-lg text-blue-800 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>}
              <button type="button" title="Hapus" onClick={() => onChange(value.filter((_, i) => i !== index))} className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...value, createPendingEvidence(Math.max(0, ...value.map((item) => Number(item.id.split('-').pop()) || 0)) + 1)])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
        <Plus className="w-3.5 h-3.5" /> Tambah Lampiran Opsional
      </button>
    </section>
  );
};
