import { NumberingConfig, SopDocument, SopStatus, SopNumberReservation } from '../types';
import { SOEGIRI_MASTER_CATEGORIES, SOEGIRI_HOSPITAL_INFO, getSoegiriHierarchyInfo } from './soegiriStructure';

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

/** Validate a revision as digits only and return its numeric successor. */
export function getNextRevisionNumber(currentRevision: string): string {
  const normalized = String(currentRevision ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Nomor revisi saat ini wajib berupa angka non-negatif.');
  }
  const next = Number(normalized) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error('Nomor revisi saat ini tidak valid.');
  }
  return String(next).padStart(2, '0');
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

export interface DetectedHierarchyInfo {
  divisionCode: string;
  divisionName: string;
  subHierarchyCode?: string;
  subCode?: string;
  instalasiCode?: string;
  poliCode?: string;
  subUnitCode?: string;
  hierarchyDescription?: string;
  sequenceNumber?: number;
  year?: string;
}

/**
 * Robustly parse any SOP number string (e.g. PEL / 1.1.3 / 001 / 2026, PEP / 4 / 001 / 2026, 440/102/SPO/PEL/2023, PEL/1.1.3/008/2024, etc.)
 */
export function parseSopNumber(sopNumStr?: string): ParsedSopNumber | null {
  if (!sopNumStr || !sopNumStr.trim()) return null;
  const raw = sopNumStr.trim();

  // Normalize delimiters (slashes, hyphens, underscores) to slashes
  const normalized = raw.replace(/[-_]/g, '/');
  let parts = normalized.split('/').map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return null;

  // Strip leading "SPO" or "SOP" prefix token if present at start
  let prefix: string | undefined = undefined;
  if (parts[0].toUpperCase() === 'SPO' || parts[0].toUpperCase() === 'SOP') {
    prefix = parts[0].toUpperCase();
    parts = parts.slice(1);
  }

  if (parts.length === 0) return null;

  // Check if parts match standard RSUD 4-part: [DIV] / [SUB] / [SEQ] / [YEAR]
  // e.g. PEL / 1.1.3 / 001 / 2026 or PEP / 4 / 001 / 2026
  if (parts.length === 4 && /^\d{4}$/.test(parts[3]) && /^\d{1,4}$/.test(parts[2])) {
    const div = parts[0].toUpperCase();
    const sub = parts[1];
    const seq = parseInt(parts[2], 10);
    return {
      prefix,
      divisionCode: div,
      subHierarchyCode: sub,
      sequenceNumber: !isNaN(seq) && seq > 0 ? seq : 1,
      year: parts[3]
    };
  }

  // Check if parts match standard RSUD 3-part: [DIV] / [SEQ] / [YEAR]
  // e.g. PROGNAS / 001 / 2026
  if (parts.length === 3 && /^\d{4}$/.test(parts[2]) && /^\d{1,4}$/.test(parts[1])) {
    const div = parts[0].toUpperCase();
    const seq = parseInt(parts[1], 10);
    return {
      prefix,
      divisionCode: div,
      sequenceNumber: !isNaN(seq) && seq > 0 ? seq : 1,
      year: parts[2]
    };
  }

  // 1. Detect known division/category code from master list
  const knownCatCodes = SOEGIRI_MASTER_CATEGORIES.map((c) => c.code.toUpperCase());
  let divisionCode = 'PEL';
  const foundCatIdx = parts.findIndex((p) => knownCatCodes.includes(p.toUpperCase()));
  if (foundCatIdx >= 0) {
    divisionCode = parts[foundCatIdx].toUpperCase();
  } else {
    // Look for any alpha token that isn't SPO/SOP/SK/RSUD/etc.
    const alphaCandidate = parts.find(
      (p) => /^[A-Z]{3,8}$/i.test(p) && !['SPO', 'SOP', 'RSUD', 'DIR', 'SK', 'NO', 'NOMOR'].includes(p.toUpperCase())
    );
    if (alphaCandidate) {
      divisionCode = alphaCandidate.toUpperCase();
    } else if (parts[0]) {
      divisionCode = parts[0].toUpperCase();
    }
  }

  // 2. Detect 4-digit Year
  let year = SOEGIRI_HOSPITAL_INFO.year || '2026';
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{4}$/.test(parts[i])) {
      year = parts[i];
      break;
    }
  }

  // 3. Detect Roman Month
  let romanMonth: string | undefined = undefined;
  const romanIdx = parts.findIndex((p) => ROMAN_MONTHS.includes(p.toUpperCase()));
  if (romanIdx >= 0) {
    romanMonth = parts[romanIdx].toUpperCase();
  }

  // 4. Detect Sub-Hierarchy code (e.g. 1.1.3, 2.1, 1.2.2.1, or single digit hierarchy)
  let subHierarchyCode: string | undefined = undefined;
  const dotHierarchy = parts.find((p) => /^\d+(\.\d+)*$/.test(p) && p !== year && !ROMAN_MONTHS.includes(p.toUpperCase()) && p !== parts[parts.length - 2]);
  if (dotHierarchy && /^\d+(\.\d+)+$/.test(dotHierarchy)) {
    subHierarchyCode = dotHierarchy;
  }

  // 5. Detect Sequence Number (a numeric part that is NOT the 4-digit year)
  let sequenceNumber = 1;
  const seqCandidate = parts.find(
    (p) => /^\d{1,4}$/.test(p) && p !== year && !ROMAN_MONTHS.includes(p.toUpperCase()) && p !== subHierarchyCode
  );
  if (seqCandidate) {
    const parsedSeq = parseInt(seqCandidate, 10);
    if (parsedSeq > 0) sequenceNumber = parsedSeq;
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
 * Normalizes any SOP number string:
 * - Trims and converts all characters to uppercase.
 * - Uniformly separates segments by standard " / " (space slash space).
 * - Unlimited prefix/segment length (e.g. 3, 4, or 5 segments).
 * - Does NOT alter segment sequence or values, only standardizes capitalization and spacing.
 *
 * Examples:
 *  - "soegiri/398/2025" -> "SOEGIRI / 398 / 2025"
 *  - "440/102/spo/pel/2023" -> "440 / 102 / SPO / PEL / 2023"
 *  - "pel / 1.1.3 / 001 / 2026" -> "PEL / 1.1.3 / 001 / 2026"
 */
export function normalizeSopNumberInput(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return '';

  // Split by slashes and trim each segment
  const segments = trimmed
    .split('/')
    .map((seg) => seg.trim().replace(/\s+/g, ' '))
    .filter((seg) => seg.length > 0);

  if (segments.length === 0) return trimmed;
  return segments.join(' / ');
}

export interface MasterHierarchyPatternMatch {
  isMatch: boolean;
  categoryCode?: string;
  categoryName?: string;
  subHierarchyCode?: string;
  hierarchyName?: string;
  sequenceNumber?: number;
  year?: string;
}

/**
 * Checks whether an SOP number matches the RSUD Dr. Soegiri new application numbering pattern
 * as configured in the Master Hierarchy (SOEGIRI_MASTER_CATEGORIES).
 *
 * Matching Criteria:
 * 1. Does NOT start with legacy prefixes (e.g. 440, SPO, SOP, SK, DIR, RSUD, NO, NOMOR).
 * 2. Does NOT contain Roman month segments (e.g. /I/, /IV/, /XII/).
 * 3. The first segment MUST match a category code present in the Master Hierarchy (e.g. PEL, PEN, PEB, UPH, KEU, PEP, KOMDIK, PROGNAS, K3RS, PPI, etc.).
 * 4. The last segment MUST be a 4-digit year (e.g. 2026).
 * 5. Matches the numbering structure generated by the application for that hierarchy:
 *    - With Sub-Hierarchy: [KODE_KATEGORI] / [SUB_HIRARKI] / [NOMOR_URUT] / [TAHUN]
 *      (where sub-hierarchy is numeric dot-notation like 1.1, 1.1.3, 2.1.1.1)
 *    - Without Sub-Hierarchy (or root level): [KODE_KATEGORI] / [NOMOR_URUT] / [TAHUN]
 */
export function matchMasterHierarchyPattern(
  sopNumStr?: string,
  customCategories?: any[]
): MasterHierarchyPatternMatch {
  if (!sopNumStr || !sopNumStr.trim()) return { isMatch: false };
  const normalized = normalizeSopNumberInput(sopNumStr);
  if (!normalized) return { isMatch: false };

  // If it starts with non-category legacy tokens, it is a legacy format
  if (/^(440|SPO|SOP|NO|NOMOR|SK|DIR|RSUD)[\s\/\-_]/i.test(normalized)) {
    return { isMatch: false };
  }

  const parts迷 = normalized.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts迷.length < 3 || parts迷.length > 4) {
    return { isMatch: false };
  }

  // Check Roman months -> if present, it's legacy
  if (parts迷.some((p) => ROMAN_MONTHS.includes(p.toUpperCase()))) {
    return { isMatch: false };
  }

  // Last segment must be a 4-digit Year
  const lastPart = parts迷[parts迷.length - 1];
  if (!/^\d{4}$/.test(lastPart)) {
    return { isMatch: false };
  }

  const categories = customCategories || SOEGIRI_MASTER_CATEGORIES;
  const firstPart = parts迷[0].toUpperCase();

  // Category Code MUST exist in Master Hierarchy
  const matchedCategory = categories.find((c) => c.code.toUpperCase() === firstPart);
  if (!matchedCategory) {
    return { isMatch: false };
  }

  // Case A: 3 parts -> [KODE_KATEGORI] / [NOMOR_URUT] / [TAHUN]
  if (parts迷.length === 3) {
    const seqPart迷 = parts迷[1];
    if (!/^\d{1,4}$/.test(seqPart迷)) {
      return { isMatch: false };
    }
    const seqNum = parseInt(seqPart迷, 10);
    return {
      isMatch: true,
      categoryCode: matchedCategory.code,
      categoryName: matchedCategory.name,
      sequenceNumber: seqNum,
      year: lastPart
    };
  }

  // Case B: 4 parts -> [KODE_KATEGORI] / [SUB_HIRARKI] / [NOMOR_URUT] / [TAHUN]
  if (parts迷.length === 4) {
    const subPart = parts迷[1];
    const seqPart = parts迷[2];

    // Sub-hierarchy must be numeric dot notation (e.g. 1.1, 1.1.3, 2.1.1.1)
    if (!/^\d+(\.\d+)*$/.test(subPart)) {
      return { isMatch: false };
    }

    if (!/^\d{1,4}$/.test(seqPart)) {
      return { isMatch: false };
    }

    const seqNum = parseInt(seqPart, 10);
    const hierarchyInfo = getSoegiriHierarchyInfo({
      categoryCode: matchedCategory.code,
      hierarchyCode: subPart
    });

    return {
      isMatch: true,
      categoryCode: matchedCategory.code,
      categoryName: matchedCategory.name,
      subHierarchyCode: subPart,
      hierarchyName: hierarchyInfo?.conclusion || matchedCategory.name,
      sequenceNumber: seqNum,
      year: lastPart
    };
  }

  return { isMatch: false };
}

/**
 * Detects whether an SOP number strictly matches the application's Master Hierarchy numbering pattern.
 */
export function isNewSopFormat(sopNumStr?: string, customCategories?: any[]): boolean {
  return matchMasterHierarchyPattern(sopNumStr, customCategories).isMatch;
}

/**
 * Automatically detects hospital hierarchy and division structure from any SOP number string.
 */
export function detectHierarchyFromSopNumber(sopNumStr?: string): DetectedHierarchyInfo | null {
  const parsed = parseSopNumber(sopNumStr);
  if (!parsed) return null;

  const divCode = parsed.divisionCode.toUpperCase();
  const category = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code.toUpperCase() === divCode);
  const divisionName = category?.name || divCode;

  let subCode: string | undefined = undefined;
  let instalasiCode: string | undefined = undefined;
  let poliCode: string | undefined = undefined;
  let subUnitCode: string | undefined = undefined;

  if (parsed.subHierarchyCode) {
    const parts = parsed.subHierarchyCode.split('.').filter(Boolean);
    subCode = parts[0];
    instalasiCode = parts[1];
    poliCode = parts[2];
    subUnitCode = parts[3];
  }

  const hierarchyInfo = getSoegiriHierarchyInfo({
    categoryCode: divCode,
    subCode,
    instalasiCode,
    poliCode,
    subUnitCode,
    hierarchyCode: parsed.subHierarchyCode
  });

  return {
    divisionCode: divCode,
    divisionName,
    subHierarchyCode: parsed.subHierarchyCode,
    subCode,
    instalasiCode,
    poliCode,
    subUnitCode,
    hierarchyDescription: hierarchyInfo?.conclusion || divisionName,
    sequenceNumber: parsed.sequenceNumber,
    year: parsed.year
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

/** Stable Firestore sequence scope: counters never cross hierarchy or year. */
export function getNumberingSequenceScope(year: string, divisionCode: string, subHierarchyCode?: string): string {
  return `${String(year).trim()}|${String(divisionCode).trim().toUpperCase()}|${String(subHierarchyCode || '').trim() || 'ROOT'}`;
}

/** Pure calculation used inside the retryable Firestore creation transaction. */
export function getNextTransactionalSequence(storedCounter: number, highestExisting: number): number {
  return Math.max(Number(storedCounter) || 0, Number(highestExisting) || 0) + 1;
}

/**
 * Allocate the smallest explicitly released DRAFT number first. Released numbers
 * are scoped by the sequence document (year + division + hierarchy), so a gap in
 * another hierarchy can never affect this allocator.
 */
export function getNextLifecycleSequence(
  storedCounter: number,
  highestExisting: number,
  reusableSequences: unknown,
  occupiedSequences: Iterable<number> = [],
): { sequenceNumber: number; remainingReusable: number[] } {
  const occupied = new Set(
    Array.from(occupiedSequences || [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  );
  const reusable = Array.from(new Set(
    (Array.isArray(reusableSequences) ? reusableSequences : [])
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
  )).sort((a, b) => a - b);

  const sequenceNumber = reusable.find((value) => !occupied.has(value));
  if (sequenceNumber !== undefined) {
    return {
      sequenceNumber,
      // Occupied/stale entries are dropped permanently; later free entries stay queued.
      remainingReusable: reusable.filter((value) => value > sequenceNumber && !occupied.has(value)),
    };
  }

  let next = getNextTransactionalSequence(storedCounter, highestExisting);
  while (occupied.has(next)) next += 1;
  return { sequenceNumber: next, remainingReusable: [] };
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
 * Normalize an SOP number string for robust duplicate checks and comparisons.
 * Collapses whitespace, removes extra spaces around slashes, and converts to uppercase.
 */
export function normalizeSopNumber(sopNumStr?: string | null): string {
  if (!sopNumStr || !sopNumStr.trim()) return '';
  return sopNumStr
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/');
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateWith?: {
    id: string;
    title?: string;
    sopNumber: string;
    status?: SopStatus;
    isNumberReservation?: boolean;
  };
  matchedDoc?: SopDocument;
}

/**
 * Check if an SOP number is already used by another document
 */
export function checkDuplicateSopNumber(
  sops: Array<any>,
  targetSopNumber: string,
  excludeId?: string
): DuplicateCheckResult {
  if (!sops || !Array.isArray(sops) || !targetSopNumber || !targetSopNumber.trim()) {
    return { isDuplicate: false };
  }

  const cleanTarget = normalizeSopNumber(targetSopNumber);
  if (!cleanTarget) return { isDuplicate: false };

  const found = sops.find((s) => {
    if (excludeId && s.id === excludeId) return false;
    if (!s.sopNumber) return false;
    const cleanCurrent = normalizeSopNumber(s.sopNumber);
    return cleanCurrent === cleanTarget;
  });

  if (found) {
    return {
      isDuplicate: true,
      duplicateWith: {
        id: found.id,
        title: found.title,
        sopNumber: found.sopNumber || targetSopNumber,
        status: found.status,
        isNumberReservation: Boolean(found.isNumberReservation)
      },
      matchedDoc: found as SopDocument
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
  // Preserve manual legacy document numbers and number reservations
  if (sop.isLegacySop || sop.documentType === 'LAMA' || (sop as any).isNumberReservation) {
    return sop;
  }

  const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
  const divCode = (sop.divisionCode || parsed?.divisionCode || 'PEL').trim().toUpperCase();
  const masterCat = SOEGIRI_MASTER_CATEGORIES.find((c) => c.code.toUpperCase() === divCode);

  // The selected hierarchy is authoritative for EVERY category.
  // If the composite code is missing, reconstruct it from parsed or stored hierarchy fields.
  let cleanSub = (sop.subHierarchyCode || '').trim();
  if (!cleanSub && parsed?.subHierarchyCode) {
    cleanSub = parsed.subHierarchyCode.trim();
  }
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
  if (parsed && parsed.sequenceNumber > 0) {
    seq = parsed.sequenceNumber;
  }

  // 3. Extract year
  let year = SOEGIRI_HOSPITAL_INFO.year || '2026';
  if (sop.effectiveDate) {
    const y = sop.effectiveDate.split('-')[0];
    if (y && /^\d{4}$/.test(y)) year = y;
  } else if (parsed && parsed.year) {
    year = parsed.year;
  } else if (sop.createdAt) {
    const y = new Date(sop.createdAt).getFullYear().toString();
    if (y && /^\d{4}$/.test(y)) year = y;
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
export function standardizeAllSops(
  sops: SopDocument[],
  reservations: SopNumberReservation[] = []
): {
  updatedSops: SopDocument[];
  changedCount: number;
  changes: Array<{ oldNumber: string; newNumber: string; title: string }>;
  duplicateCount: number;
} {
  const changes: Array<{ oldNumber: string; newNumber: string; title: string }> = [];
  let duplicateCount = 0;

  if (!Array.isArray(sops)) {
    return { updatedSops: [], changedCount: 0, changes: [], duplicateCount: 0 };
  }

  const getYear = (sop: SopDocument): string => {
    const effectiveYear = String(sop.effectiveDate || '').slice(0, 4);
    if (/^\d{4}$/.test(effectiveYear)) return effectiveYear;
    const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
    if (parsed?.year && /^\d{4}$/.test(parsed.year)) return parsed.year;
    const createdYear = String(sop.createdAt || '').slice(0, 4);
    if (/^\d{4}$/.test(createdYear)) return createdYear;
    return SOEGIRI_HOSPITAL_INFO.year || '2026';
  };

  const getSequence = (sop: SopDocument): number => {
    const direct = Number(sop.sequenceNumber || 0);
    if (Number.isSafeInteger(direct) && direct > 0) return direct;
    const parsed = sop.sopNumber ? parseSopNumber(sop.sopNumber) : null;
    return parsed?.sequenceNumber && parsed.sequenceNumber > 0 ? parsed.sequenceNumber : 0;
  };

  const preserved = new Map<string, SopDocument>();
  const standard: SopDocument[] = [];
  for (const original of sops) {
    if (original.isLegacySop || original.documentType === 'LAMA' || original.jenis_spo === 'EKSISTING' || (original as any).isNumberReservation) {
      preserved.set(original.id, original);
      continue;
    }
    standard.push(standardizeSopDocument(original));
  }

  type Group = {
    divisionCode: string;
    subHierarchyCode: string;
    year: string;
    docs: SopDocument[];
    reservations: SopNumberReservation[];
  };
  const groups = new Map<string, Group>();
  const ensureGroup = (divisionCode: string, subHierarchyCode: string, year: string): Group => {
    const cleanDiv = String(divisionCode || 'PEL').trim().toUpperCase();
    const cleanSub = String(subHierarchyCode || '').trim();
    const key = `${year}|${cleanDiv}|${cleanSub || 'ROOT'}`;
    let group = groups.get(key);
    if (!group) {
      group = { divisionCode: cleanDiv, subHierarchyCode: cleanSub, year, docs: [], reservations: [] };
      groups.set(key, group);
    }
    return group;
  };

  for (const sop of standard) {
    ensureGroup(sop.divisionCode || 'PEL', sop.subHierarchyCode || '', getYear(sop)).docs.push(sop);
  }
  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    const year = String(reservation.year || '').trim();
    const divisionCode = String(reservation.divisionCode || '').trim().toUpperCase();
    const sequenceNumber = Number(reservation.sequenceNumber || 0);
    if (!/^\d{4}$/.test(year) || !divisionCode || !Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) continue;
    ensureGroup(divisionCode, reservation.subHierarchyCode || '', year).reservations.push(reservation);
  }

  const processed = new Map<string, SopDocument>();

  for (const group of groups.values()) {
    const docById = new Map(group.docs.map((doc) => [doc.id, doc]));
    const mutableIds = new Set(group.docs.filter((doc) => doc.status !== 'DIARSIPKAN').map((doc) => doc.id));
    const locked = new Set<number>();
    const lockedOwners = new Map<number, string>();
    const addLocked = (seq: number, owner: string) => {
      if (!Number.isSafeInteger(seq) || seq <= 0) return;
      if (lockedOwners.has(seq) && lockedOwners.get(seq) !== owner) duplicateCount += 1;
      else lockedOwners.set(seq, owner);
      locked.add(seq);
    };

    for (const doc of group.docs.filter((doc) => doc.status === 'DIARSIPKAN')) {
      addLocked(getSequence(doc), `ARCHIVED:${doc.id}`);
    }

    for (const reservation of group.reservations) {
      const status = String(reservation.status || '').toUpperCase();
      const usedDocumentId = String(reservation.usedDocumentId || '').trim();
      // A USED claim that still points to a document follows that document.
      // Only RESERVED slots and orphan USED claims independently lock a slot.
      if (status === 'USED' && usedDocumentId && docById.has(usedDocumentId)) continue;
      if (status === 'RESERVED' || status === 'USED') {
        addLocked(Number(reservation.sequenceNumber || 0), `${status}:${reservation.id}`);
      }
    }

    const seen = new Set<number>();
    for (const doc of group.docs) {
      const seq = getSequence(doc);
      if (!(seq > 0)) continue;
      if (seen.has(seq)) duplicateCount += 1;
      seen.add(seq);
    }
    for (const reservation of group.reservations.filter((row) => row.status === 'RESERVED')) {
      const seq = Number(reservation.sequenceNumber || 0);
      if (!(seq > 0)) continue;
      if (seen.has(seq)) duplicateCount += 1;
      seen.add(seq);
    }

    const mutable = group.docs
      .filter((doc) => mutableIds.has(doc.id))
      .sort((a, b) => {
        const aSeq = getSequence(a) || Number.MAX_SAFE_INTEGER;
        const bSeq = getSequence(b) || Number.MAX_SAFE_INTEGER;
        if (aSeq !== bSeq) return aSeq - bSeq;
        const aTime = Date.parse(a.createdAt || a.effectiveDate || '') || 0;
        const bTime = Date.parse(b.createdAt || b.effectiveDate || '') || 0;
        if (aTime !== bTime) return aTime - bTime;
        const titleOrder = String(a.title || '').localeCompare(String(b.title || ''));
        return titleOrder || String(a.id || '').localeCompare(String(b.id || ''));
      });

    const assigned = new Set<number>();
    let candidate = 1;
    for (const sop of mutable) {
      while (locked.has(candidate) || assigned.has(candidate)) candidate += 1;
      const targetSeq = candidate;
      assigned.add(targetSeq);
      candidate += 1;
      const padded = getPaddedNumber(targetSeq, 3);
      const newNumber = group.subHierarchyCode
        ? `${group.divisionCode} / ${group.subHierarchyCode} / ${padded} / ${group.year}`
        : `${group.divisionCode} / ${padded} / ${group.year}`;
      const oldNumber = String(sop.sopNumber || '').trim();
      if (getSequence(sop) !== targetSeq || oldNumber !== newNumber) {
        changes.push({ oldNumber: oldNumber || '-', newNumber, title: sop.title });
      }
      processed.set(sop.id, {
        ...sop,
        sequenceNumber: targetSeq,
        sopNumber: newNumber,
      });
    }

    for (const archived of group.docs.filter((doc) => doc.status === 'DIARSIPKAN')) {
      // Arsip is historical: never renumber or rewrite its canonical number.
      processed.set(archived.id, archived);
    }
  }

  for (const [id, sop] of preserved) processed.set(id, sop);
  const updatedSops = sops.map((original) => processed.get(original.id) || original);
  return {
    updatedSops,
    changedCount: changes.length,
    changes,
    duplicateCount,
  };
}
