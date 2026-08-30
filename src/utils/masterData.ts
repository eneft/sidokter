import { Division, SopCategory } from '../types';
import { SOEGIRI_MASTER_CATEGORIES } from './soegiriStructure';

/**
 * Master data resmi SPO Center.
 * Sumber utama hierarki unit/bidang adalah soegiriStructure.ts.
 * Tidak berisi dokumen contoh/dummy.
 */
export const MASTER_DIVISIONS: Division[] = SOEGIRI_MASTER_CATEGORIES.map((cat) => {
  let color = 'bg-slate-50 text-slate-700 border-slate-200';
  if (cat.type === 'bidang') color = 'bg-blue-50 text-blue-700 border-blue-200';
  if (cat.type === 'bagian') color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (cat.type === 'komite') color = 'bg-purple-50 text-purple-700 border-purple-200';
  if (cat.type === 'pokja') color = 'bg-amber-50 text-amber-700 border-amber-200';
  if (cat.type === 'satuan') color = 'bg-rose-50 text-rose-700 border-rose-200';

  return {
    id: cat.id,
    name: cat.name,
    code: cat.code,
    color,
    type: cat.type,
    hasSubs: Boolean(cat.children?.length)
  };
});

/** Kategori SPO yang dipakai sebagai master klasifikasi dokumen. */
export const MASTER_CATEGORIES: SopCategory[] = [
  { id: 'cat-pelayanan', name: 'Pelayanan Medis & Asuhan Pasien', code: 'PEL' },
  { id: 'cat-penunjang', name: 'Penunjang Diagnostik & Terapi', code: 'PEN' },
  { id: 'cat-mutu', name: 'Mutu & Keselamatan Pasien (KMKP)', code: 'MUTU' },
  { id: 'cat-kepegawaian', name: 'Kepegawaian, Hukum & Umum', code: 'ADM' },
  { id: 'cat-it', name: 'Teknologi Informasi & SIMRS', code: 'IT' },
  { id: 'cat-prognas', name: 'Program Nasional (TB, HIV, Stunting)', code: 'PROGNAS' },
  { id: 'cat-farmasi', name: 'Pengelolaan Obat & Farmasi Klinis', code: 'FAR' },
  { id: 'cat-ppi', name: 'Pencegahan & Pengendalian Infeksi', code: 'PPI' },
];
