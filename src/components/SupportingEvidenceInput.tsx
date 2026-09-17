import React from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { SupportingEvidenceCategory } from '../types';
import { formatBytes } from '../utils/numbering';

export interface PendingEvidence {
  id: string;
  category: SupportingEvidenceCategory;
  description: string;
  file: File | null;
}

const categories: Array<[SupportingEvidenceCategory, string]> = [
  ['NOTULEN_BA', 'Notulen / Berita Acara'],
  ['PERATURAN_PEDOMAN', 'Peraturan / Pedoman'],
  ['EVALUASI_AUDIT', 'Evaluasi / Audit / Monitoring'],
  ['SURAT_INSTRUKSI', 'Surat / Instruksi / Disposisi'],
  ['LAINNYA', 'Dokumen Lainnya'],
];

export const createPendingEvidence = (number: number): PendingEvidence => ({
  id: `evidence-${number}`,
  category: 'LAINNYA',
  description: '',
  file: null,
});

export const SupportingEvidenceInput: React.FC<{
  value: PendingEvidence[];
  onChange: (value: PendingEvidence[]) => void;
}> = ({ value, onChange }) => {
  const update = (index: number, patch: Partial<PendingEvidence>) =>
    onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-3.5 space-y-2.5">
      <div>
        <div className="text-xs font-black uppercase tracking-wider text-amber-950">Bukti Dukung Riviu</div>
        <p className="text-[10px] text-amber-800">Minimal satu dokumen tambahan. Dokumen sumber/SPO lama tidak dihitung sebagai bukti dukung.</p>
      </div>
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[30px_180px_minmax(0,1fr)_auto] gap-2 items-center rounded-lg border border-amber-200 bg-white p-2">
            <span className="text-xs font-black text-amber-800 text-center">{index + 1}.</span>
            <select value={item.category} onChange={(e) => update(index, { category: e.target.value as SupportingEvidenceCategory })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[11px]">
              {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div className="min-w-0 flex flex-col gap-1">
              <input type="text" value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Keterangan (opsional)" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]" />
              <input type="file" required={index === 0} onChange={(e) => update(index, { file: e.target.files?.[0] || null })} className="w-full text-[10px] file:mr-2 file:rounded file:border-0 file:bg-amber-600 file:px-2 file:py-1 file:text-white" />
              {item.file && <span className="truncate text-[10px] font-semibold text-emerald-700">{item.file.name} ({formatBytes(item.file.size)})</span>}
            </div>
            <div className="flex gap-1 justify-end">
              {item.file && <button type="button" title="Preview" onClick={() => window.open(URL.createObjectURL(item.file!), '_blank', 'noopener,noreferrer')} className="p-1.5 rounded-lg text-blue-800 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>}
              <button type="button" title="Hapus" disabled={value.length === 1} onClick={() => onChange(value.filter((_, i) => i !== index))} className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...value, createPendingEvidence(Math.max(0, ...value.map((item) => Number(item.id.split('-').pop()) || 0)) + 1)])} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100">
        <Plus className="w-3.5 h-3.5" /> Tambah Bukti Dukung
      </button>
    </section>
  );
};
