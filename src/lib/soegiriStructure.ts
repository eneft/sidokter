export interface SoegiriHierarchyNode {
  id: string;
  code: string;
  name: string;
  active?: boolean;
  children?: SoegiriHierarchyNode[];
}

export interface SoegiriPoliOrUnit extends SoegiriHierarchyNode {
  id: string;
  code: string; // e.g. "1", "2", "3"
  name: string; // e.g. "Poli Mata"
  subUnits?: SoegiriPoliOrUnit[];
}

export interface SoegiriInstalasi extends SoegiriHierarchyNode {
  id: string;
  code: string; // e.g. "1", "2", "3"
  name: string; // e.g. "Rawat Jalan", "Rawat Inap", "Inst. Farmasi"
  polis?: SoegiriPoliOrUnit[];
}

export interface SoegiriSubKoor extends SoegiriHierarchyNode {
  id: string;
  code: string; // e.g. "1", "2", "3"
  name: string; // e.g. "Medik", "Keperawatan", "Umum & Perlengkapan"
  instalasis?: SoegiriInstalasi[];
}

export interface SoegiriCategory extends SoegiriHierarchyNode {
  id: string;
  number: number;
  code: string; // e.g. "PEL", "PEN", "PEB", "UPH", "KEU", "PEP", "KOMDIK", etc.
  name: string; // e.g. "Bidang Pelayanan", "Bidang Penunjang", etc.
  type: 'bidang' | 'bagian' | 'komite' | 'satuan' | 'pokja';
  subs?: SoegiriSubKoor[];
}

export const SOEGIRI_HOSPITAL_INFO = {
  government: 'PEMERINTAH KABUPATEN LAMONGAN',
  hospitalName: 'RUMAH SAKIT UMUM DAERAH Dr. SOEGIRI',
  shortName: 'RSUD Dr. SOEGIRI LAMONGAN',
  address: 'Jalan Kusuma Bangsa Nomor 7, Lamongan, Jawa Timur 62214',
  phone: '(0322) 321718',
  fax: '(0322) 322582',
  email: 'rsud-soegiri@lamongankab.go.id',
  website: 'rsud-soegiri.lamongankab.go.id',
  director: {
    name: 'dr. Abdur Rohman, Sp.PD.M.EK.',
    rank: 'Pembina Tingkat I',
    nip: '19770219 200604 1 013',
    title: 'Direktur RSUD Dr. Soegiri Lamongan'
  },
  year: '2026'
};

// 26 Poli Rawat Jalan
const RAWAT_JALAN_POLIS: SoegiriPoliOrUnit[] = [
  { id: 'poli-mata', code: '1', name: 'Poli Mata' },
  { id: 'poli-tht', code: '2', name: 'Poli THT' },
  { id: 'poli-jantung', code: '3', name: 'Poli Jantung' },
  { id: 'poli-penyakit-dalam', code: '4', name: 'Poli Penyakit Dalam' },
  { id: 'poli-kulit-kelamin', code: '5', name: 'Poli Kulit Kelamin' },
  { id: 'poli-estetika', code: '6', name: 'Poli Estetika' },
  { id: 'poli-gigi', code: '7', name: 'Poli Gigi' },
  { id: 'poli-bedah-mulut', code: '8', name: 'Poli Bedah Mulut' },
  { id: 'poli-syaraf', code: '9', name: 'Poli Syaraf' },
  { id: 'poli-bedah-syaraf', code: '10', name: 'Poli Bedah Syaraf' },
  { id: 'poli-orthopedi', code: '11', name: 'Poli Orthopedi' },
  { id: 'poli-bedah-umum', code: '12', name: 'Poli Bedah Umum' },
  { id: 'poli-obgyn', code: '13', name: 'Poli Obgyn' },
  { id: 'poli-lansia', code: '14', name: 'Poli Lansia' },
  { id: 'poli-urologi', code: '15', name: 'Poli Urologi' },
  { id: 'poli-mcu', code: '16', name: 'Poli MCU' },
  { id: 'poli-psikologi', code: '17', name: 'Poli Psikologi' },
  { id: 'poli-paru', code: '18', name: 'Poli Paru' },
  { id: 'poli-hiv-aids', code: '19', name: 'Poli HIV / AIDS' },
  { id: 'poli-anak', code: '20', name: 'Poli Anak' },
  { id: 'poli-jiwa', code: '21', name: 'Poli Jiwa' },
  { id: 'poli-btkv', code: '22', name: 'Poli BTKV' },
  { id: 'poli-andrologi', code: '23', name: 'Poli Andrologi' },
  { id: 'poli-pedodontist', code: '24', name: 'Poli Pedodontist' },
  { id: 'poli-tb-ro', code: '25', name: 'Poli TB RO' },
  { id: 'poli-tb-so', code: '26', name: 'Poli TB SO' },
];

// Rawat Inap Units
const RAWAT_INAP_UNITS: SoegiriPoliOrUnit[] = [
  { id: 'ranap-bedah', code: '1', name: 'Ruang Bedah' },
  { id: 'ranap-interne', code: '2', name: 'Ruang Interne' },
  { id: 'ranap-maternitas', code: '3', name: 'Ruang Maternitas' },
  { id: 'ranap-anak', code: '4', name: 'Ruang Anak' },
  { id: 'ranap-jiwa', code: '5', name: 'Ruang Jiwa' },
];

const DEFAULT_SOEGIRI_MASTER_CATEGORIES: SoegiriCategory[] = [
  // 1. Bidang Pelayanan (PEL)
  {
    id: 'soegiri-pel',
    number: 1,
    code: 'PEL',
    name: 'Bidang Pelayanan',
    type: 'bidang',
    subs: [
      {
        id: 'pel-sub-medik',
        code: '1',
        name: 'Medik',
        instalasis: [
          {
            id: 'pel-medik-rajal',
            code: '1',
            name: 'Rawat Jalan',
            polis: RAWAT_JALAN_POLIS
          },
          {
            id: 'pel-medik-ranap',
            code: '2',
            name: 'Rawat Inap',
            polis: RAWAT_INAP_UNITS
          },
          { id: 'pel-medik-igd', code: '3', name: 'IGD' },
          { id: 'pel-medik-ibs', code: '4', name: 'IBS' },
          { id: 'pel-medik-iar', code: '5', name: 'IAR' },
          { id: 'pel-medik-icu', code: '6', name: 'ICU' },
          { id: 'pel-medik-iccu', code: '7', name: 'ICCU' },
          { id: 'pel-medik-ihd', code: '8', name: 'IHD' },
          { id: 'pel-medik-irm', code: '9', name: 'IRM' },
        ]
      },
      {
        id: 'pel-sub-keperawatan',
        code: '2',
        name: 'Keperawatan',
        instalasis: [
          { id: 'pel-perawat-rajal', code: '1', name: 'Rawat Jalan' },
          { id: 'pel-perawat-ranap', code: '2', name: 'Rawat Inap' },
          { id: 'pel-perawat-igd', code: '3', name: 'IGD' },
          { id: 'pel-perawat-ibs', code: '4', name: 'IBS' },
          { id: 'pel-perawat-iar', code: '5', name: 'IAR' },
          { id: 'pel-perawat-icu', code: '6', name: 'ICU' },
          { id: 'pel-perawat-iccu', code: '7', name: 'ICCU' },
          { id: 'pel-perawat-ihd', code: '8', name: 'IHD' },
          { id: 'pel-perawat-irm', code: '9', name: 'IRM' },
        ]
      }
    ]
  },

  // 2. Bidang Penunjang (PEN)
  {
    id: 'soegiri-pen',
    number: 2,
    code: 'PEN',
    name: 'Bidang Penunjang',
    type: 'bidang',
    subs: [
      {
        id: 'pen-sub-medik',
        code: '1',
        name: 'Medik',
        instalasis: [
          { id: 'pen-medik-farmasi', code: '1', name: 'Inst. Farmasi' },
          {
            id: 'pen-medik-lab',
            code: '2',
            name: 'Inst. Laboratorium',
            polis: [
              {
                id: 'lab-pk',
                code: '1',
                name: 'Patologi Klinik',
                subUnits: [
                  { id: 'lab-pk-hem', code: '1', name: 'Hematologi' },
                  { id: 'lab-pk-kim', code: '2', name: 'Kimia klinik' },
                  { id: 'lab-pk-uri', code: '3', name: 'Urinalisis' },
                  { id: 'lab-pk-mik', code: '4', name: 'Mikrobiologi' },
                  { id: 'lab-pk-bio', code: '5', name: 'Biomolekuler' },
                  { id: 'lab-pk-alat', code: '6', name: 'Peralatan' },
                  { id: 'lab-pk-umum', code: '7', name: 'Umum' }
                ]
              },
              { id: 'lab-pa', code: '2', name: 'Patologi Anatomi' },
              { id: 'lab-bd', code: '3', name: 'Bank Darah' },
            ]
          },
          { id: 'pen-medik-rad', code: '3', name: 'Inst. Radiologi' },
          { id: 'pen-medik-forensik', code: '4', name: 'Inst. Forensik' },
          { id: 'pen-medik-rm', code: '5', name: 'Inst. Rekam Medik' },
          { id: 'pen-medik-rehab', code: '6', name: 'Inst. Rehab Medik' },
        ]
      },
      {
        id: 'pen-sub-nonmedik',
        code: '2',
        name: 'Non Medik',
        instalasis: [
          { id: 'pen-nonmed-cssd', code: '1', name: 'Inst. CSSD dan Laundry' },
          { id: 'pen-nonmed-ips', code: '2', name: 'IPS (Pemeliharaan Sarana)' },
          { id: 'pen-nonmed-ipl', code: '3', name: 'IPL (Penyehatan Lingkungan)' },
          { id: 'pen-nonmed-gizi', code: '4', name: 'Inst. Gizi' },
        ]
      }
    ]
  },

  // 3. Bidang Pengembangan (PEB)
  {
    id: 'soegiri-peb',
    number: 3,
    code: 'PEB',
    name: 'Bidang Pengembangan',
    type: 'bidang',
    subs: [
      { id: 'peb-diklat', code: '1', name: 'Pendidikan & Pelatihan' },
      { id: 'peb-sdm', code: '2', name: 'Pengembangan SDM' },
      { id: 'peb-inovasi', code: '3', name: 'Inovasi' },
    ]
  },

  // 4. Bagian Umum dan Kepegawaian (UPH)
  {
    id: 'soegiri-uph',
    number: 4,
    code: 'UPH',
    name: 'Bagian Umum dan Kepegawaian',
    type: 'bagian',
    subs: [
      {
        id: 'uph-sub-up',
        code: '1',
        name: 'Umum & Perlengkapan',
        instalasis: [
          { id: 'uph-up-umum', code: '1', name: 'Umum' },
          { id: 'uph-up-perlengkapan', code: '2', name: 'Perlengkapan' }
        ]
      },
      {
        id: 'uph-sub-ko',
        code: '2',
        name: 'Kepegawaian & Organisasi',
        instalasis: [
          { id: 'uph-ko-kepegawaian', code: '1', name: 'Kepegawaian' },
          { id: 'uph-ko-organisasi', code: '2', name: 'Organisasi' }
        ]
      },
      {
        id: 'uph-sub-hk',
        code: '3',
        name: 'Hukum & Kehumasan',
        instalasis: [
          { id: 'uph-hk-hukum', code: '1', name: 'Hukum' },
          { id: 'uph-hk-kehumasan', code: '2', name: 'Kehumasan' },
          { id: 'uph-hk-pengaduan', code: '3', name: 'Pengaduan' }
        ]
      }
    ]
  },

  // 5. Bagian Keuangan (KEU)
  {
    id: 'soegiri-keu',
    number: 5,
    code: 'KEU',
    name: 'Bagian Keuangan',
    type: 'bagian',
    subs: [
      {
        id: 'keu-sub-bendahara',
        code: '1',
        name: 'Bendahara',
        instalasis: [
          { id: 'keu-ben-kasir', code: '1', name: 'Kasir' }
        ]
      },
      {
        id: 'keu-sub-verifikasi',
        code: '2',
        name: 'Verifikasi',
        instalasis: [
          { id: 'keu-ver-penjaminan', code: '1', name: 'Inst. Penjaminan' }
        ]
      }
    ]
  },

  // 6. Bagian Perencanaan dan Evaluasi (PEP)
  {
    id: 'soegiri-pep',
    number: 6,
    code: 'PEP',
    name: 'Bagian Perencanaan dan Evaluasi',
    type: 'bagian',
    subs: [
      { id: 'pep-perencanaan', code: '1', name: 'Perencanaan' },
      { id: 'pep-evaluasi', code: '2', name: 'Evaluasi' },
      { id: 'pep-pelaporan', code: '3', name: 'Pelaporan' },
      { id: 'pep-it', code: '4', name: 'Informasi Teknologi' },
      { id: 'pep-pemasaran', code: '5', name: 'Pemasaran' },
    ]
  },

  // 7 - 33: Komite, Pokja, Satuan Kerja, Akreditasi
  { id: 'kom-komdik', number: 7, code: 'KOMDIK', name: 'Komite Medik', type: 'komite' },
  { id: 'kom-komper', number: 8, code: 'KOMPER', name: 'Komite Keperawatan', type: 'komite' },
  { id: 'kom-komnakes', number: 9, code: 'KOMNAKES', name: 'Komite Tenaga Kesehatan', type: 'komite' },
  { id: 'kom-kmkp', number: 10, code: 'KMKP', name: 'Komite Mutu dan Keselamatan Pasien', type: 'komite' },
  { id: 'kom-kppra', number: 11, code: 'KPPRA', name: 'Komite Program Pengendalian Resistensi Antimikroba', type: 'komite' },
  { id: 'kom-keh', number: 12, code: 'KEH', name: 'Komite Etik dan Hukum', type: 'komite' },
  { id: 'kom-kft', number: 13, code: 'KFT', name: 'Komite Farmasi dan Terapi', type: 'komite' },
  { id: 'kom-kppi', number: 14, code: 'KPPI', name: 'Komite Pencegahan dan Pengendalian Infeksi', type: 'komite' },
  { id: 'kom-k3rs', number: 15, code: 'K3RS', name: 'Komite Kesehatan dan Keselamatan Kerja Rumah Sakit', type: 'komite' },
  { id: 'sat-spi', number: 16, code: 'SPI', name: 'Satuan Pengawas Internal', type: 'satuan' },
  { id: 'pok-mpp', number: 17, code: 'MPP', name: 'Manajemen Pelayanan Pasien', type: 'pokja' },
  { id: 'pok-tkrs', number: 18, code: 'TKRS', name: 'Tata Kelola Rumah Sakit', type: 'pokja' },
  { id: 'pok-mfk', number: 19, code: 'MFK', name: 'Manajemen Fasilitas Kesehatan', type: 'pokja' },
  { id: 'pok-kps', number: 20, code: 'KPS', name: 'Kualifikasi Dan Pendidikan Staf', type: 'pokja' },
  { id: 'pok-ppk', number: 21, code: 'PPK', name: 'Pendidikan Dalam Pelayanan Kesehatan', type: 'pokja' },
  { id: 'pok-pmkp', number: 22, code: 'PMKP', name: 'Peningkatan Mutu dan Keselamatan Pasien', type: 'pokja' },
  { id: 'pok-ppi', number: 23, code: 'PPI', name: 'Pencegahan dan Pengendalian Infeksi', type: 'pokja' },
  { id: 'pok-mrmik', number: 24, code: 'MRMIK', name: 'Manajemen Rekam Medik dan Informasi Kesehatan', type: 'pokja' },
  { id: 'pok-akp', number: 25, code: 'AKP', name: 'Akses dan Kesinambungan Pelayanan', type: 'pokja' },
  { id: 'pok-pap', number: 26, code: 'PAP', name: 'Pelayanan dan Asuhan Pasien', type: 'pokja' },
  { id: 'pok-pab', number: 27, code: 'PAB', name: 'Pelayanan Anestesi dan Bedah', type: 'pokja' },
  { id: 'pok-hpk', number: 28, code: 'HPK', name: 'Hak Pasien dan Keluarga', type: 'pokja' },
  { id: 'pok-pkpo', number: 29, code: 'PKPO', name: 'Pelayanan Kefarmasian dan Penggunaan Obat', type: 'pokja' },
  { id: 'pok-pp', number: 30, code: 'PP', name: 'Pengkajian Pasien', type: 'pokja' },
  { id: 'pok-ke', number: 31, code: 'KE', name: 'Komunikasi dan Edukasi', type: 'pokja' },
  { id: 'pok-skp', number: 32, code: 'SKP', name: 'Sasaran Keselamatan Pasien', type: 'pokja' },
  { id: 'pok-prognas', number: 33, code: 'PROGNAS', name: 'Program Nasional', type: 'pokja' },
];


function normalizeNode(node: any): SoegiriHierarchyNode {
  const rawChildren = Array.isArray(node.children) && node.children.length > 0
    ? node.children
    : (node.subUnits || node.polis || node.instalasis || node.subs || []);
  const mappedChildren = Array.isArray(rawChildren) ? rawChildren.map(normalizeNode) : [];
  return {
    ...node,
    active: node.active !== false,
    children: mappedChildren,
    subs: mappedChildren,
    instalasis: mappedChildren,
    polis: mappedChildren,
    subUnits: mappedChildren,
  };
}

function normalizeCategory(category: SoegiriCategory): SoegiriCategory {
  const rawChildren = Array.isArray(category.children) && category.children.length > 0
    ? category.children
    : (category.subs || []);
  const mappedChildren = Array.isArray(rawChildren) ? rawChildren.map(normalizeNode) : [];
  return {
    ...category,
    active: category.active !== false,
    children: mappedChildren,
    subs: mappedChildren,
  };
}

export let SOEGIRI_MASTER_CATEGORIES: SoegiriCategory[] = DEFAULT_SOEGIRI_MASTER_CATEGORIES.map(normalizeCategory);

export function setSoegiriMasterCategories(categories: SoegiriCategory[]): void {
  SOEGIRI_MASTER_CATEGORIES = categories.map(normalizeCategory);
}

export function getDefaultSoegiriMasterCategories(): SoegiriCategory[] {
  return DEFAULT_SOEGIRI_MASTER_CATEGORIES.map(normalizeCategory);
}

export interface SoegiriSelectionState {
  categoryCode: string;
  hierarchyCode?: string;
  subCode?: string;
  instalasiCode?: string;
  poliCode?: string;
  subUnitCode?: string;
}

/**
 * Builds composite sub-code, e.g. "1.1.3" or "1.2.1.1" or "2.4" or "4"
 * Strictly validates that each segment exists in the master hierarchy tree so
 * invalid or stale sub-level codes (e.g. poli code on an instalasi without polis)
 * are never included.
 */
export function buildSubHierarchyCode(selection: SoegiriSelectionState): string {
  const explicit = (selection as any).hierarchyCode;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
  const parts = [selection.subCode, selection.instalasiCode, selection.poliCode, selection.subUnitCode].filter(Boolean) as string[];
  return parts.join('.');
}

/**
 * Generates human readable description and breadcrumb labels
 */
export function getSoegiriHierarchyInfo(selection: SoegiriSelectionState) {
  const cat = SOEGIRI_MASTER_CATEGORIES.find(c => c.code === selection.categoryCode);
  if (!cat) return { label: '', path: [], conclusion: '', code: '' };
  const code = buildSubHierarchyCode(selection);
  const codes = code ? code.split('.').filter(Boolean) : [];
  const path: string[] = [];
  let current: any = cat;
  for (const part of codes) {
    const children = Array.isArray(current.children) ? current.children : (current.subs || current.instalasis || current.polis || current.subUnits || []);
    const node = children.find((n: SoegiriHierarchyNode) => String(n.code) === String(part));
    if (!node) break;
    path.push(node.name);
    current = node;
  }
  const label = path.length ? `${cat.name} → ${path.join(' → ')}` : cat.name;
  return { label, path, conclusion: label, code };
}

export function isSopAccessibleByUser(
  sop: {
    divisionCode: string;
    subCode?: string;
    instalasiCode?: string;
    instCode?: string;
    poliCode?: string;
    subUnitCode?: string;
    subHierarchyCode?: string;
    sopNumber?: string;
    isExampleOnly?: boolean;
  },
  userSession?: {
    role: string;
    badges?: string[];
    divisionCode?: string;
    divisionCodes?: string[];
    assignments?: Array<{
      id?: string;
      divisionCode: string;
      subCode?: string;
      instCode?: string;
      poliCode?: string;
      subUnitCode?: string;
      hierarchyCode?: string;
      hierarchyPath?: string[];
    }>;
    subCode?: string;
    instCode?: string;
    poliCode?: string;
    subUnitCode?: string;
  } | null
): boolean {
  if (!userSession) return false;
  if (userSession.role === 'admin') return true;
  if (sop.isExampleOnly) return false;

  // Elevated badge precedence: STRUKTURAL grants document-wide access
  // regardless of the user's assigned hierarchy. Role admin remains the
  // highest system privilege.
  if (Array.isArray(userSession.badges) && userSession.badges.some((b) => String(b).trim().toUpperCase() === 'STRUKTURAL')) return true;

  const sopDivision = String(sop.divisionCode || '').trim().toUpperCase();
  if (!sopDivision) return false;

  const sopHierarchy = String(
    sop.subHierarchyCode ||
    [sop.subCode, sop.instalasiCode || sop.instCode, sop.poliCode, sop.subUnitCode].filter(Boolean).join('.') ||
    (sop.sopNumber?.split('/')[1]?.trim() || '')
  ).trim();

  const normalizeHierarchy = (value?: string) =>
    String(value || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');

  const isHierarchyWithin = (candidate: string, assigned: string) => {
    const c = normalizeHierarchy(candidate);
    const a = normalizeHierarchy(assigned);
    if (!a) return true;
    if (!c) return false;
    return c === a || c.startsWith(`${a}.`);
  };

  const assignments: {
    divisionCode: string;
    subCode?: string;
    instCode?: string;
    poliCode?: string;
    subUnitCode?: string;
    hierarchyCode?: string;
    hierarchyPath?: string[];
  }[] = Array.isArray(userSession.assignments) && userSession.assignments.length
    ? userSession.assignments
    : (Array.isArray(userSession.divisionCodes) && userSession.divisionCodes.length
      ? userSession.divisionCodes.map((code) => ({ divisionCode: code }))
      : [{
          divisionCode: userSession.divisionCode || 'PEL',
          subCode: userSession.subCode,
          instCode: userSession.instCode,
          poliCode: userSession.poliCode,
          subUnitCode: userSession.subUnitCode,
        }]);

  // ALL is a global scope marker reserved for Admin. It must never grant
  // a User access to every SPO.
  if (userSession.role === 'admin' && assignments.some((a) => String(a.divisionCode || '').toUpperCase() === 'ALL')) return true;

  return assignments.some((assignment) => {
    if (String(assignment.divisionCode || '').trim().toUpperCase() !== sopDivision) return false;
    const assignedHierarchy = normalizeHierarchy(
      assignment.hierarchyCode ||
      (assignment.hierarchyPath || []).filter(Boolean).join('.') ||
      [assignment.subCode, assignment.instCode, assignment.poliCode, assignment.subUnitCode].filter(Boolean).join('.')
    );
    return isHierarchyWithin(sopHierarchy, assignedHierarchy);
  });
}

export const userCanAccessSop = isSopAccessibleByUser;
