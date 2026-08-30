import { NumberingConfig, SopDocument } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, SOEGIRI_HOSPITAL_INFO } from './soegiriStructure';

export const ROMAN_MONTHS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'
];

export function getRomanMonth(dateStr?: string | Date): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const monthIdx = d.getMonth();
  return ROMAN_MONTHS[monthIdx] || 'I';
}

export function getPaddedNumber(num: number, padding: number = 3): string {
  return String(num).padStart(padding, '0');
}

export interface GenerateNumberParams {
  config: NumberingConfig;
  divisionCode: string;
  subHierarchyCode?: string;
  categoryCode?: string;
  dateStr?: string;
  sequenceNum?: number;
}

export interface ParsedSopNumber {
  prefix?: string;
  divisionCode: string;
  subHierarchyCode?: string;
  sequenceNumber: number;
  romanMonth?: string;
  year: string;
}

/**
 * Robustly parse any SOP number string (e.g. PEL / 1.1.3 / 001 / 2026, PEL/1.1.3/001/2026, SPO/PEL/1.1.3/001/2026, etc.)
 */
export function parseSopNumber(sopNumStr?: string): ParsedSopNumber | null {
  if (!sopNumStr || !sopNumStr.trim()) return null;
  const raw = sopNumStr.trim();

  // Normalize delimiters (slashes, hyphens, underscores) to slashes
  const normalized = raw.replace(/[-_]/g, '/');
  let parts = normalized.split('/').map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return null;

  // Strip leading "SPO" or "SOP" prefix token if present
  let prefix: string | undefined = undefined;
  if (parts[0].toUpperCase() === 'SPO' || parts[0].toUpperCase() === 'SOP') {
    prefix = parts[0].toUpperCase();
    parts = parts.slice(1);
  }

  if (parts.length === 0) return null;

  const divisionCode = parts[0].toUpperCase();

  // Check last part for 4-digit year
  let year = SOEGIRI_HOSPITAL_INFO.year || '2026';
  if (parts.length >= 2 && /^\d{4}$/.test(parts[parts.length - 1])) {
    year = parts[parts.length - 1];
  }

  let sequenceNumber = 1;
  let subHierarchyCode: string | undefined = undefined;
  let romanMonth: string | undefined = undefined;

  // Check for Roman month
  const romanIdx = parts.findIndex((p) => ROMAN_MONTHS.includes(p.toUpperCase()));
  if (romanIdx >= 0) {
    romanMonth = parts[romanIdx].toUpperCase();
  }

  if (parts.length >= 4) {
    // 4+ parts: [DIV, SUB_CODE, SEQ, YEAR] or with Roman month
    subHierarchyCode = parts[1];
    const seqCandidate = parts.find(
      (p, idx) => idx > 0 && idx < parts.length - 1 && /^\d+$/.test(p) && p !== parts[parts.length - 1]
    );
    if (seqCandidate) {
      sequenceNumber = parseInt(seqCandidate, 10);
    }
  } else if (parts.length === 3) {
    if (/^\d{4}$/.test(parts[2])) {
      // [DIV, SEQ, YEAR]
      if (/^\d+$/.test(parts[1])) {
        sequenceNumber = parseInt(parts[1], 10);
      } else {
        // [DIV, SUB, YEAR]
        subHierarchyCode = parts[1];
      }
    } else if (/^\d+$/.test(parts[2])) {
      // [DIV, SUB, SEQ]
      subHierarchyCode = parts[1];
      sequenceNumber = parseInt(parts[2], 10);
    }
  } else if (parts.length === 2) {
    if (/^\d+$/.test(parts[1])) {
      sequenceNumber = parseInt(parts[1], 10);
    }
  }

  return {
    prefix,
    divisionCode,
    subHierarchyCode,
    sequenceNumber: sequenceNumber > 0 ? sequenceNumber : 1,
    romanMonth,
    year
  };
}

/**
 * Generate a unique unit key based on divisionCode and subHierarchyCode
 */
export function getUnitKey(divisionCode: string, subHierarchyCode?: string): string {
  const cleanDiv = (divisionCode || 'PEL').trim().toUpperCase();
  const cleanSub = (subHierarchyCode || '').trim();
  return cleanSub ? `${cleanDiv}:${cleanSub}` : cleanDiv;
}

/**
 * Calculate the highest existing sequence number for a specific unit (divisionCode + subHierarchyCode)
 */
export function getHighestSequenceForUnit(
  sops: Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string; effectiveDate?: string; createdAt?: string }>,
  divisionCode: string,
  subHierarchyCode?: string,
  year?: string
): number {
  if (!sops || !Array.isArray(sops)) return 0;
  const cleanDiv = (divisionCode || 'PEL').trim().toUpperCase();
  const cleanSub = (subHierarchyCode || '').trim();
  const targetYear = String(year || SOEGIRI_HOSPITAL_INFO.year || new Date().getFullYear());

  let maxSeq = 0;

  sops.forEach((s) => {
    // Ignore legacy docs when counting sequence
    if (s.isLegacySop || s.documentType === 'LAMA') return;

    const sDiv = (s.divisionCode || '').trim().toUpperCase();
    const sSub = (s.subHierarchyCode || '').trim();
    const parsed = s.sopNumber ? parseSopNumber(s.sopNumber) : null;

    const effectiveDiv = sDiv || parsed?.divisionCode || '';
    const effectiveSub = sSub !== undefined && sSub !== '' ? sSub : (parsed?.subHierarchyCode || '');

    // Must match the same division and numbering year.
    if (effectiveDiv !== cleanDiv) return;
    const effectiveYear = parsed?.year ||
      (typeof s.effectiveDate === 'string' && /^\d{4}/.test(s.effectiveDate) ? s.effectiveDate.slice(0, 4) : '') ||
      (s.createdAt ? String(new Date(s.createdAt).getFullYear()) : '');
    if (effectiveYear !== targetYear) return;

    // Must match the same sub-hierarchy unit
    if (cleanSub) {
      if (effectiveSub !== cleanSub) return;
    } else {
      if (effectiveSub !== '') return;
    }

    // Extract sequence number
    let itemSeq = 0;
    if (typeof s.sequenceNumber === 'number' && s.sequenceNumber > 0) {
      itemSeq = s.sequenceNumber;
    } else if (parsed && parsed.sequenceNumber > 0) {
      itemSeq = parsed.sequenceNumber;
    }

    if (itemSeq > maxSeq) {
      maxSeq = itemSeq;
    }
  });

  return maxSeq;
}

/**
 * Calculate the highest existing sequence number for a given division code
 */
export function getHighestSequenceForDivision(
  sops: Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string; effectiveDate?: string; createdAt?: string }>,
  divisionCode: string
): number {
  return getHighestSequenceForUnit(sops, divisionCode);
}

/**
 * Get all existing sequence numbers used in a specific unit
 */
export function getUsedSequencesForUnit(
  sops: Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string; effectiveDate?: string; createdAt?: string }>,
  divisionCode: string,
  subHierarchyCode?: string,
  year?: string
): Set<number> {
  const used = new Set<number>();
  if (!sops || !Array.isArray(sops)) return used;

  const cleanDiv = (divisionCode || 'PEL').trim().toUpperCase();
  const cleanSub = (subHierarchyCode || '').trim();
  const targetYear = String(year || SOEGIRI_HOSPITAL_INFO.year || new Date().getFullYear());

  sops.forEach((s) => {
    if (s.isLegacySop || s.documentType === 'LAMA') return;

    const sDiv = (s.divisionCode || '').trim().toUpperCase();
    const sSub = (s.subHierarchyCode || '').trim();
    const parsed = s.sopNumber ? parseSopNumber(s.sopNumber) : null;

    const effectiveDiv = sDiv || parsed?.divisionCode || '';
    const effectiveSub = sSub !== undefined && sSub !== '' ? sSub : (parsed?.subHierarchyCode || '');

    if (effectiveDiv !== cleanDiv) return;
    const effectiveYear = parsed?.year ||
      (typeof s.effectiveDate === 'string' && /^\d{4}/.test(s.effectiveDate) ? s.effectiveDate.slice(0, 4) : '') ||
      (s.createdAt ? String(new Date(s.createdAt).getFullYear()) : '');
    if (effectiveYear !== targetYear) return;

    if (cleanSub) {
      if (effectiveSub !== cleanSub) return;
    } else {
      if (effectiveSub !== '') return;
    }

    let itemSeq = 0;
    if (typeof s.sequenceNumber === 'number' && s.sequenceNumber > 0) {
      itemSeq = s.sequenceNumber;
    } else if (parsed && parsed.sequenceNumber > 0) {
      itemSeq = parsed.sequenceNumber;
    }

    if (itemSeq > 0) {
      used.add(itemSeq);
    }
  });

  return used;
}

/**
 * Check if an SOP number is already used by another document
 */
export function checkDuplicateSopNumber(
  sops: Array<{ id: string; sopNumber?: string; title?: string }>,
  targetSopNumber: string,
  excludeId?: string
): { isDuplicate: boolean; duplicateWith?: { id: string; title?: string; sopNumber: string } } {
  if (!sops || !Array.isArray(sops) || !targetSopNumber || !targetSopNumber.trim()) {
    return { isDuplicate: false };
  }

  const cleanTarget = targetSopNumber.trim().replace(/\s+/g, ' ').toUpperCase();

  const found = sops.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    if (!s.sopNumber) return false;
    const cleanCurrent = s.sopNumber.trim().replace(/\s+/g, ' ').toUpperCase();
    return cleanCurrent === cleanTarget;
  });

  if (found) {
    return {
      isDuplicate: true,
      duplicateWith: {
        id: found.id,
        title: found.title,
        sopNumber: found.sopNumber || targetSopNumber
      }
    };
  }

  return { isDuplicate: false };
}

/**
 * Get next sequence number for a specific unit (starts at 1 -> '001' for every unit)
 */
export function getNextSequenceNumber(
  config?: NumberingConfig,
  divisionCode?: string,
  subHierarchyCodeOrSops?: string | Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string }>,
  sopsArray?: Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string }>,
  year?: string
): number {
  let subCode: string | undefined = undefined;
  let sops: Array<{ divisionCode?: string; subHierarchyCode?: string; sequenceNumber?: number; sopNumber?: string; isLegacySop?: boolean; documentType?: string }> | undefined = undefined;

  if (Array.isArray(subHierarchyCodeOrSops)) {
    sops = subHierarchyCodeOrSops;
  } else if (typeof subHierarchyCodeOrSops === 'string') {
    subCode = subHierarchyCodeOrSops;
    sops = sopsArray;
  } else {
    sops = sopsArray;
  }

  if (!divisionCode) return 1;

  if (sops && sops.length > 0) {
    const highest = getHighestSequenceForUnit(sops, divisionCode, subCode, year);
    return highest + 1;
  }

  // No active SOP exists for this unit: restart at 001.
  return 1;
}

/**
 * Generate formatted SOP number string based on RSUD Dr. Soegiri 2026 standard or custom template
 */
export function generateSopNumber(params: GenerateNumberParams): {
  sopNumber: string;
  sequenceNumber: number;
} {
  const { config, divisionCode, subHierarchyCode, categoryCode = 'PEL', dateStr, sequenceNum } = params;
  const date = dateStr ? new Date(dateStr) : new Date();
  
  const year = date.getFullYear().toString();
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');
  const monthRoman = getRomanMonth(date);
  const day = String(date.getDate()).padStart(2, '0');
  
  // Determine sequence number
  const nextSeq = sequenceNum !== undefined ? sequenceNum : (config.currentCounter + 1);
  const paddedNum = getPaddedNumber(nextSeq, config.numberPadding);

  // If in Soegiri Standard mode:
  // Examples from guidance document:
  // PEL / 1.1.3 / 001 / 2026  (with sub-code)
  // UPH / 3.3 / 001 / 2026
  // PEP / 4 / 001 / 2026
  // PROGNAS / 001 / 2026      (without sub-code)
  if (config.mode === 'soegiri_standard' || !config.template || config.template.includes('{KODE_UTAMA}')) {
    const sep = config.separator || ' / ';
    const parts: string[] = [divisionCode || 'PEL'];
    if (subHierarchyCode && subHierarchyCode.trim()) {
      parts.push(subHierarchyCode.trim());
    }
    parts.push(paddedNum);
    parts.push(year);

    return {
      sopNumber: parts.join(sep),
      sequenceNumber: nextSeq
    };
  }

  // Otherwise, custom template replacement
  const cleanSubCode = subHierarchyCode && subHierarchyCode.trim() ? subHierarchyCode.trim() : '';
  let result = config.template
    .replace('{KODE_UTAMA}', divisionCode || 'PEL')
    .replace('{KODE_TAMBAHAN}', cleanSubCode ? `${cleanSubCode}` : '')
    .replace('{PREFIX}', config.prefix || 'SOP')
    .replace('{DIVISI}', divisionCode || 'PEL')
    .replace('{KATEGORI}', categoryCode || 'PEL')
    .replace('{BULAN_ROMAWI}', monthRoman)
    .replace('{BULAN}', config.useRomanMonth ? monthRoman : monthNum)
    .replace('{BULAN_ANGKA}', monthNum)
    .replace('{TAHUN}', year)
    .replace('{TANGGAL}', day)
    .replace('{NOMOR}', paddedNum)
    // Clean any double separators resulting from empty subcode, e.g. "PROGNAS /  / 001"
    .replace(/\/\s*\/\s*/g, '/ ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    sopNumber: result,
    sequenceNumber: nextSeq,
  };
}

export const DEFAULT_NUMBERING_CONFIG: NumberingConfig = {
  prefix: 'PEL',
  template: '{KODE_UTAMA} / {KODE_TAMBAHAN} / {NOMOR} / {TAHUN}',
  numberPadding: 3,
  useRomanMonth: false,
  resetSequence: 'yearly',
  currentCounter: 0,
  separator: ' / ',
  mode: 'soegiri_standard',
  divisionCounters: {},
};

export const NUMBERING_PRESETS = [
  {
    name: 'RSUD Dr. Soegiri 2026 Standar Berjarak (PEL / 1.1.3 / 001 / 2026)',
    template: '{KODE_UTAMA} / {KODE_TAMBAHAN} / {NOMOR} / {TAHUN}',
    separator: ' / ',
    mode: 'soegiri_standard' as const,
    example: 'PEL / 1.1.3 / 001 / 2026'
  },
  {
    name: 'RSUD Dr. Soegiri 2026 Tanpa Spasi (PEL/1.1.3/001/2026)',
    template: '{KODE_UTAMA}/{KODE_TAMBAHAN}/{NOMOR}/{TAHUN}',
    separator: '/',
    mode: 'soegiri_standard' as const,
    example: 'PEL/1.1.3/001/2026'
  },
  {
    name: 'SPO Strip Penghubung (PEL-1.1.3-001-2026)',
    template: '{KODE_UTAMA}-{KODE_TAMBAHAN}-{NOMOR}-{TAHUN}',
    separator: '-',
    mode: 'soegiri_standard' as const,
    example: 'PEL-1.1.3-001-2026'
  },
  {
    name: 'Prefiks SPO Lengkap (SPO/PEL/1.1.3/001/2026)',
    template: 'SPO/{KODE_UTAMA}/{KODE_TAMBAHAN}/{NOMOR}/{TAHUN}',
    separator: '/',
    mode: 'custom_template' as const,
    example: 'SPO/PEL/1.1.3/001/2026'
  },
  {
    name: 'Dengan Bulan Romawi (PEL/1.1.3/001/VIII/2026)',
    template: '{KODE_UTAMA}/{KODE_TAMBAHAN}/{NOMOR}/{BULAN_ROMAWI}/{TAHUN}',
    separator: '/',
    mode: 'custom_template' as const,
    example: 'PEL/1.1.3/001/VIII/2026'
  }
];

export function formatBytes(bytes?: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Standardize an SOP document's numbering and sub-hierarchy code
 * to ensure complete compliance with RSUD Dr. Soegiri 2026 guidelines.
 */
export function standardizeSopDocument(sop: SopDocument): SopDocument {
  // Preserve manual legacy document numbers
  if (sop.isLegacySop || sop.documentType === 'LAMA') {
    return sop;
  }

  const divCode = (sop.divisionCode || 'PEL').trim().toUpperCase();
  const masterCat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code.toUpperCase() === divCode);

  // The selected hierarchy is authoritative for EVERY category.
  // Never infer a branch from title/unit text (for example, never turn
  // PEN 1.2.2 into 1.2.1 because the title contains "laboratorium").
  // If the composite code is missing, reconstruct it only from the stored
  // hierarchy fields, never from free text.
  let cleanSub = (sop.subHierarchyCode || '').trim();
  if (!cleanSub) {
    cleanSub = [
      sop.subCode,
      sop.instalasiCode || (sop as any).instCode,
      sop.poliCode,
      sop.subUnitCode
    ].filter(Boolean).join('.');
  }

  // Categories without children do not carry a sub-hierarchy.
  if (masterCat && (!masterCat.children || masterCat.children.length === 0)) {
    cleanSub = '';
  }

  // 2. Extract numeric sequence number
  let seq = typeof sop.sequenceNumber === 'number' && sop.sequenceNumber > 0 ? sop.sequenceNumber : 1;
  const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
  if (parsed && parsed.sequenceNumber > 0) {
    seq = parsed.sequenceNumber;
  }

  // 3. Extract year
  let year = SOEGIRI_HOSPITAL_INFO.year || '2026';
  if (sop.effectiveDate) {
    const y = sop.effectiveDate.split('-')[0];
    if (y && /^\d{4}$/.test(y)) year = y;
  } else if (sop.createdAt) {
    const y = new Date(sop.createdAt).getFullYear().toString();
    if (y && /^\d{4}$/.test(y)) year = y;
  } else if (parsed && parsed.year) {
    year = parsed.year;
  }

  const paddedNum = getPaddedNumber(seq, 3);
  let standardNumber = '';
  if (cleanSub) {
    standardNumber = `${divCode} / ${cleanSub} / ${paddedNum} / ${year}`;
  } else {
    standardNumber = `${divCode} / ${paddedNum} / ${year}`;
  }

  return {
    ...sop,
    divisionCode: divCode,
    subHierarchyCode: cleanSub,
    sequenceNumber: seq,
    sopNumber: (sop.sopNumber && sop.sopNumber.trim()) ? sop.sopNumber.trim() : standardNumber,
    direkturNama: sop.direkturNama || SOEGIRI_HOSPITAL_INFO.director.name,
    direkturNip: sop.direkturNip || SOEGIRI_HOSPITAL_INFO.director.nip,
    direkturPangkat:
      !sop.direkturPangkat || sop.direkturPangkat.toLowerCase().includes('direktur')
        ? SOEGIRI_HOSPITAL_INFO.director.rank
        : sop.direkturPangkat
  };
}

/**
 * Standardize an entire list of SOPs, eliminate duplicate numbers across all units deterministically,
 * and identify what changed.
 */
export function standardizeAllSops(sops: SopDocument[]): {
  updatedSops: SopDocument[];
  changedCount: number;
  changes: Array<{ oldNumber: string; newNumber: string; title: string }>;
  duplicateCount: number;
} {
  const changes: Array<{ oldNumber: string; newNumber: string; title: string }> = [];
  let changedCount = 0;
  let duplicateCount = 0;

  if (!sops || !Array.isArray(sops)) {
    return { updatedSops: [], changedCount: 0, changes: [], duplicateCount: 0 };
  }

  // 1. Separate legacy from standard
  const legacySops: SopDocument[] = [];
  const standardSops: SopDocument[] = [];

  sops.forEach((sop) => {
    if (sop.isLegacySop || sop.documentType === 'LAMA') {
      legacySops.push(sop);
    } else {
      standardSops.push(standardizeSopDocument(sop));
    }
  });

  // 2. Group standard SOPs by Unit Key: `${divCode}:${cleanSub}:${year}`
  const unitGroups = new Map<string, SopDocument[]>();

  standardSops.forEach((sop) => {
    const divCode = (sop.divisionCode || 'PEL').trim().toUpperCase();
    const cleanSub = (sop.subHierarchyCode || '').trim();

    let year = SOEGIRI_HOSPITAL_INFO.year || '2026';
    if (sop.effectiveDate) {
      const y = sop.effectiveDate.split('-')[0];
      if (y && /^\d{4}$/.test(y)) year = y;
    } else if (sop.createdAt) {
      const y = new Date(sop.createdAt).getFullYear().toString();
      if (y && /^\d{4}$/.test(y)) year = y;
    }

    const groupKey = `${divCode}:${cleanSub}:${year}`;
    if (!unitGroups.has(groupKey)) {
      unitGroups.set(groupKey, []);
    }
    unitGroups.get(groupKey)!.push(sop);
  });

  // 3. Process each unit group to guarantee unique sequence numbers (001, 002, 003...)
  const processedStandardSops: SopDocument[] = [];

  unitGroups.forEach((groupDocs, groupKey) => {
    const [divCode, cleanSub, year] = groupKey.split(':');

    // Sort documents deterministically:
    // 1) original sequenceNumber if valid
    // 2) createdAt timestamp ascending
    // 3) title / id for strict tiebreaking
    groupDocs.sort((a, b) => {
      const aSeq = typeof a.sequenceNumber === 'number' && a.sequenceNumber > 0 ? a.sequenceNumber : 999999;
      const bSeq = typeof b.sequenceNumber === 'number' && b.sequenceNumber > 0 ? b.sequenceNumber : 999999;
      if (aSeq !== bSeq) return aSeq - bSeq;

      const aTime = new Date(a.createdAt || a.effectiveDate || 0).getTime();
      const bTime = new Date(b.createdAt || b.effectiveDate || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;

      return (a.title || '').localeCompare(b.title || '');
    });

    const usedSequences = new Set<number>();

    groupDocs.forEach((sop) => {
      let targetSeq = typeof sop.sequenceNumber === 'number' && sop.sequenceNumber > 0 ? sop.sequenceNumber : 1;

      // If sequence is already taken by another SOP in the same unit, resolve duplicate
      if (usedSequences.has(targetSeq)) {
        duplicateCount++;
        // Find next lowest unused positive sequence starting from 1
        let candidate = 1;
        while (usedSequences.has(candidate)) {
          candidate++;
        }
        targetSeq = candidate;
      }

      usedSequences.add(targetSeq);

      const paddedNum = getPaddedNumber(targetSeq, 3);
      const standardNumber = cleanSub
        ? `${divCode} / ${cleanSub} / ${paddedNum} / ${year}`
        : `${divCode} / ${paddedNum} / ${year}`;

      const isChanged = sop.sopNumber !== standardNumber || sop.sequenceNumber !== targetSeq;

      if (isChanged) {
        changedCount++;
        changes.push({
          oldNumber: sop.sopNumber || '-',
          newNumber: standardNumber,
          title: sop.title
        });
      }

      processedStandardSops.push({
        ...sop,
        divisionCode: divCode,
        subHierarchyCode: cleanSub,
        sequenceNumber: targetSeq,
        sopNumber: standardNumber
      });
    });
  });

  // Re-merge maintaining id lookups
  const idMap = new Map<string, SopDocument>();
  processedStandardSops.forEach((s) => idMap.set(s.id, s));
  legacySops.forEach((s) => idMap.set(s.id, s));

  const updatedSops = sops.map((original) => idMap.get(original.id) || original);

  return {
    updatedSops,
    changedCount,
    changes,
    duplicateCount
  };
}


