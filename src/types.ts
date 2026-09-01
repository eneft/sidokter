export type SopStatus = 'DRAFT' | 'AKTIF' | 'DIARSIPKAN';

export type UserRole = 'admin' | 'petugas';

export interface UserAssignment {
  id: string;
  label?: string;
  divisionCode: string;
  unitName?: string;
  subCode?: string;
  instCode?: string;
  poliCode?: string;
  subUnitCode?: string;
  hierarchyCode?: string;
  hierarchyPath?: string[];
  hierarchyCodes?: string[];
}

export interface UserSession {
  id?: string;
  username: string;
  name: string;
  role: UserRole;
  authUid?: string;           // Local account ID
  sessionId: string;          // Cryptographic random active session ID
  sessionCreatedAt: number;   // Timestamp ms for Absolute Timeout (e.g. max 12 hours)
  lastActiveAt: number;       // Timestamp ms for Idle Timeout (e.g. 30 minutes)
  unitName?: string;
  divisionCode?: string;      // legacy/default division code
  divisionCodes?: string[];    // legacy/backward-compatible division list
  assignments?: UserAssignment[]; // authoritative multi-hierarchy access assignments
  subCode?: string;           // e.g. "1", "2"
  instCode?: string;          // e.g. "1", "2"
  poliCode?: string;          // e.g. "3"
  subUnitCode?: string;       // e.g. "1"
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string;          // Plaintext during creation/update, converted to passwordHash
  passwordHash?: string;      // PBKDF2-SHA256 salted hash
  passwordSalt?: string;      // Random cryptographic salt hex
  activeSessionId?: string;   // Current active session ID for Single Active Session enforcement
  lastLoginAt?: string;       // ISO timestamp of last successful login
  sessionCreatedAt?: number;  // Timestamp ms when current active session started
  failedLoginAttempts?: number; // Failed login counter for rate-limiting
  lockoutUntil?: number;      // Timestamp ms until which account is locked out
  name: string;
  role: UserRole;
  unitName?: string;
  divisionCode?: string;      // legacy/default division code
  divisionCodes?: string[];    // legacy/backward-compatible division list
  assignments?: UserAssignment[]; // authoritative multi-hierarchy access assignments
  subCode?: string;           // e.g. "1", "2"
  instCode?: string;          // e.g. "1", "2"
  poliCode?: string;          // e.g. "3"
  subUnitCode?: string;       // e.g. "1"
  createdAt: string;
  updatedAt?: string;
}

export interface LoginAuditLog {
  id: string;
  username: string;
  name?: string;
  role?: string;
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'SESSION_REVOKED' | 'LOGOUT' | 'PASSWORD_CHANGED' | 'LOCKED_OUT' | 'BACKUP_EXPORT' | 'RESTORE_EXECUTE';
  timestamp: string;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  details?: string;
}

export interface Division {
  id: string;
  name: string;
  code: string;
  color: string;
  iconName?: string;
  type?: 'bidang' | 'bagian' | 'komite' | 'satuan' | 'pokja';
  hasSubs?: boolean;
}

export interface SopCategory {
  id: string;
  name: string;
  code: string;
}

export interface RevisionLog {
  id: string;
  version: string;
  date: string;
  author: string;
  notes: string;
  changedFields?: string[];
}

export interface SopDocument {
  id: string;
  sopNumber: string; // e.g. PEL / 1.1.3 / 001 / 2026 or PROGNAS / 001 / 2026
  sequenceNumber: number;
  title: string;
  divisionId: string;
  divisionCode: string;
  divisionName: string;
  categoryId: string;
  categoryName: string;
  version: string; // e.g. "00" or "1.0"
  status: SopStatus;
  effectiveDate: string; // YYYY-MM-DD
  reviewPeriodMonths: number; // e.g. 12 (1 year)
  nextReviewDate: string; // YYYY-MM-DD
  creatorName: string;
  creatorUnit?: string;
  approverName?: string;
  summary: string;
  tags: string[];

  // RSUD Dr. Soegiri specific hierarchical classification
  subHierarchyCode?: string; // e.g. "1.1.3", "3.3", "4"
  subHierarchyPath?: string[]; // e.g. ["Medik", "Rawat Jalan", "Poli Jantung"]
  hierarchyDescription?: string; // e.g. "SOP ini dikeluarkan dari bidang pelayanan medik diunit rawat jalan poli jantung pada tahun 2026"
  subCode?: string;
  instalasiCode?: string;
  poliCode?: string;
  subUnitCode?: string;

  // SIDOKTER SOEGIRI Standard Document Body
  // Urutan Baku:
  // 1. PENGERTIAN
  // 2. TUJUAN
  // 3. KEBIJAKAN
  // 4. PROSEDUR
  // 5. ALUR (Opsional)
  // 6. UNIT TERKAIT
  pengertian?: string; // 1. PENGERTIAN
  tujuan?: string; // 2. TUJUAN
  kebijakan?: string; // 3. KEBIJAKAN
  prosedur?: string; // 4. PROSEDUR
  alur?: string; // 5. ALUR / DIAGRAM ALIR (Opsional)
  unitTerkait?: string; // 6. UNIT TERKAIT
  revisionNumber?: string; // "00"
  halaman?: string; // "1 / 1"
  direkturNama?: string; // "dr. Abdur Rohman, Sp.PD.M.EK."
  direkturNip?: string; // "19770219 200604 1 013"
  direkturPangkat?: string; // "Pembina Tingkat I"

  // File details
  fileName?: string;
  fileSize?: number; // in bytes
  fileType?: string;
  fileDataUrl?: string; // for uploaded file preview (Dokumen Baru / Hasil Review)

  // Jenis input SPO: Baru, Eksisting (lama tetapi masih berlaku), dan Riviu
  jenis_spo?: 'BARU' | 'EKSISTING' | 'RIVIU';
  documentType?: 'BARU' | 'EKSISTING' | 'RIVIU' | 'ARSIP' | 'LAMA' | 'REVIEW'; // Backward-compatible alias
  isReviewDocument?: boolean;
  existingSopId?: string;
  // True when an Existing SPO replaces an existing draft/number record; it remains BARU in document type.
  isExistingReplacement?: boolean;
  isLegacySop?: boolean;
  legacySopNumber?: string;
  oldSopNumber?: string;
  oldFileName?: string;
  oldFileSize?: number;
  oldFileType?: string;
  oldFileDataUrl?: string;
  reviewReason?: string;
  isExampleOnly?: boolean; // Flag to indicate master template/example SOP visible only to Admin
  
  // Timestamps & history
  createdAt: string;
  updatedAt: string;
  revisionHistory: RevisionLog[];
  
  // Pengesahan Tanda Tangan Direktur & Aktivasi oleh Admin Tata Naskah
  activatedAt?: string; // Tanggal verifikasi & aktivasi (YYYY-MM-DD)
  activatedBy?: string; // Nama Admin Tata Naskah yang mengaktifkan
  activationNotes?: string; // Catatan pengesahan / nomor fisik
  signedScanFileName?: string;
  signedScanFileSize?: number;
  signedScanFileType?: string;
  signedScanDataUrl?: string; // File pindaian/scan dokumen fisik yang sudah bertandatangan Direktur
  
  // Custom metadata
  confidentialityLevel: 'Publik' | 'Internal' | 'Rahasia';
  locationOrFolder?: string;
  // True when the register record exists only to reserve an official SPO number.
  isNumberReservation?: boolean;
  numberReservationPurpose?: 'EXISTING_REPLACE_ONLY' | 'SYSTEM_DOCUMENT' | string;
  // ID register Nomor Terbit yang dipakai alur SPO Existing. Bukan ID dokumen.
  numberReservationId?: string;
}


export type MainMenuTab = 'dashboard' | 'spo' | 'sk' | 'mou' | 'library' | 'profile' | 'admin';

export type LibraryDocumentType = 'SK' | 'MOU';

export interface LibraryDocument {
  id: string;
  type: LibraryDocumentType;
  title: string;
  documentNumber?: string; // e.g. Nomor SK: 188/025/KEP/413.204/2026 or Nomor MOU: 001/PKS/RSUD-SGR/2026
  partnerName?: string;    // for MOU: e.g. "BPJS Kesehatan Cabang Bojonegoro / Lamongan"
  effectiveDate?: string;  // Tanggal terbit / mulai berlaku
  expiryDate?: string;     // Tanggal berakhir (khusus MOU/PKS)
  description?: string;    // Keterangan / ringkasan dokumen
  status?: string;         // 'AKTIF' | 'DIARSIPKAN'
  fileName: string;
  fileSize: number;
  fileType: string;
  storagePath: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: string;
}

export type JenisSpo = 'BARU' | 'EKSISTING' | 'RIVIU';

export function getStandardJenisSpo(sop: Partial<SopDocument>): JenisSpo {
  if (sop.jenis_spo === 'BARU' || sop.jenis_spo === 'EKSISTING' || sop.jenis_spo === 'RIVIU') {
    return sop.jenis_spo;
  }
  if (sop.documentType === 'BARU') return 'BARU';
  // ARSIP/LAMA are legacy values kept only for backward compatibility.
  if (sop.documentType === 'EKSISTING' || sop.documentType === 'ARSIP' || sop.documentType === 'LAMA' || sop.isLegacySop) return 'EKSISTING';
  if (sop.documentType === 'RIVIU' || sop.documentType === 'REVIEW' || sop.isReviewDocument) return 'RIVIU';
  return 'BARU';
}

export interface NumberingConfig {
  prefix: string; // default "PEL" or custom
  template: string; // e.g. "{KODE_UTAMA} / {KODE_TAMBAHAN} / {NOMOR} / {TAHUN}"
  numberPadding: number; // e.g. 3 => 001
  useRomanMonth: boolean; // true => VIII, false => 08
  resetSequence: 'yearly' | 'monthly' | 'never';
  currentCounter: number;
  divisionCounters: Record<string, number>; // per-division counter support
  separator: string; // e.g. " / "
  mode: 'soegiri_standard' | 'custom_template';
}

export interface FilterOptions {
  searchQuery: string;
  division: string;
  category: string;
  status: string;
  year: string;
  type?: string; // 'bidang' | 'bagian' | 'komite' | 'pokja'
  sortBy: 'sopNumber' | 'title' | 'effectiveDate' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

