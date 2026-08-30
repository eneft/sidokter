/**
 * SYSTEM BACKUP SERVICE
 * Service backup/restore terpusat untuk seluruh domain dokumen dan akun.
 */
import { LibraryDocument, NumberingConfig, SopDocument, UserAccount } from '../types';
import { getAllSopsFromLocal, restoreSopsToLocal, saveConfigToLocal } from './sopService';
import { getAllUsersForBackup, restoreUsersFromBackup } from './accountService';
import { restoreLibraryDocuments } from './documentLibraryService';
import { getAllSKForBackup, getAllSKFilesForBackup } from './skService';
import { getAllMOUForBackup, getAllMOUFilesForBackup } from './mouService';
import { getAllCachedFiles, saveFileToLocalCache } from '../utils/fileStorage';

export const BACKUP_VERSION = '2.0';
export const BACKUP_APPLICATION = 'SIDOKTER SOEGIRI';

export interface SystemBackupData {
  sops: SopDocument[];
  sk: LibraryDocument[];
  mou: LibraryDocument[];
  numberingConfig?: NumberingConfig;
  users: UserAccount[];
  sopFiles: Record<string, string>;
  skFiles: Record<string, string>;
  mouFiles: Record<string, string>;
}

export interface SystemBackupFile {
  backupVersion: string;
  application: string;
  createdAt: string;
  createdBy: string;
  data: SystemBackupData;
  notes: string[];
}

function addSopCachedFiles(sops: SopDocument[], cachedFiles: Record<string,string>) {
  return sops.map((sop) => {
    const copy: any = { ...sop };
    const mappings: Array<[string, string]> = [
      ['fileDataUrl', `sop_file_cache_${sop.id}_file`],
      ['oldFileDataUrl', `sop_file_cache_${sop.id}_oldFile`],
      ['signedScanDataUrl', `sop_file_cache_${sop.id}_signedScan`]
    ];
    for (const [field, key] of mappings) if (!copy[field] && cachedFiles[key]) copy[field] = cachedFiles[key];
    return copy as SopDocument;
  });
}

export async function createSystemBackup(createdBy: string): Promise<SystemBackupFile> {
  const cachedFiles = await getAllCachedFiles();
  const localSops = await getAllSopsFromLocal();
  const sops = addSopCachedFiles(localSops, cachedFiles);
  const sk = await getAllSKForBackup();
  const mou = await getAllMOUForBackup();
  const skFiles = await getAllSKFilesForBackup();
  const mouFiles = await getAllMOUFilesForBackup();
  const users = getAllUsersForBackup();

  const numberingRaw = localStorage.getItem('soegiri_offline_numbering_v1');
  const numberingConfig = numberingRaw ? JSON.parse(numberingRaw) as NumberingConfig : undefined;

  if (sops.length !== localSops.length) throw new Error('Verifikasi backup SPO gagal.');
  if (sk.length !== (await getAllSKForBackup()).length) throw new Error('Verifikasi backup SK gagal.');
  if (mou.length !== (await getAllMOUForBackup()).length) throw new Error('Verifikasi backup MOU gagal.');

  return {
    backupVersion: BACKUP_VERSION,
    application: BACKUP_APPLICATION,
    createdAt: new Date().toISOString(),
    createdBy,
    data: { sops, sk, mou, numberingConfig, users, sopFiles: {}, skFiles, mouFiles },
    notes: [
      'Backup sistem mencakup SPO, SK, MOU, akun pengguna, konfigurasi penomoran, dan lampiran PDF.',
      'Session login aktif dan status lockout sementara tidak disertakan demi keamanan.',
      'Password akun dicadangkan sebagai passwordHash dan passwordSalt, bukan password plaintext.',
      'Backup dibuat dari penyimpanan lokal SIDOKTER SOEGIRI.'
    ]
  };
}

export function downloadSystemBackup(backup: SystemBackupFile): string {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `SIDOKTER_SOEGIRI_Backup_${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return anchor.download;
}

export async function restoreSystemBackup(file: File, preserveUsername: string) {
  const text = await file.text();
  if (!text.trim()) throw new Error('File backup kosong.');
  let backup: any;
  try { backup = JSON.parse(text); } catch { throw new Error('File backup bukan JSON yang valid atau rusak.'); }

  if (!['SIDOKTER SOEGIRI', 'Soegiri SPO Center'].includes(backup?.application) || !backup?.data) {
    throw new Error('Format backup tidak valid. File harus berasal dari SIDOKTER SOEGIRI.');
  }

  const version = String(backup.backupVersion || '1.0');
  if (!['1.0', BACKUP_VERSION].includes(version)) throw new Error(`Versi backup ${version} tidak didukung.`);

  const rawSops = Array.isArray(backup.data.sops) ? backup.data.sops : [];
  const sops: SopDocument[] = rawSops.map((raw: any, index: number) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Data SPO ke-${index + 1} di backup tidak valid.`);
    const candidate = [raw.id, raw.sopId, raw.documentId, raw.localId].find((v) => typeof v === 'string' && v.trim());
    return { ...raw, id: candidate?.trim() || `restore-${Date.now()}-${index}-${Math.random().toString(36).slice(2,10)}` } as SopDocument;
  });
  const ids = new Set(sops.map((s) => s.id));
  if (ids.size !== sops.length) throw new Error('File backup tidak valid: terdapat ID SPO yang duplikat.');

  const sk = Array.isArray(backup.data.sk) ? backup.data.sk : (Array.isArray(backup.data.library) ? backup.data.library.filter((d:any) => d.type === 'SK') : []);
  const mou = Array.isArray(backup.data.mou) ? backup.data.mou : (Array.isArray(backup.data.library) ? backup.data.library.filter((d:any) => d.type === 'MOU') : []);
  const library = [...sk, ...mou].filter((d:any) => d && (d.type === 'SK' || d.type === 'MOU')) as LibraryDocument[];

  const users = Array.isArray(backup.data.users) ? backup.data.users as UserAccount[] : [];
  const config = backup.data.numberingConfig as NumberingConfig | undefined;
  const sopFiles: Record<string,string> = backup.data.sopFiles || {};
  const skFiles: Record<string,string> = backup.data.skFiles || {};
  const mouFiles: Record<string,string> = backup.data.mouFiles || {};

  await restoreSopsToLocal(sops);
  if (config) await saveConfigToLocal(config);
  if (users.length) await restoreUsersFromBackup(users, preserveUsername);
  await restoreLibraryDocuments(library, { ...skFiles, ...mouFiles });

  let sopAttachmentCount = 0;
  const allSopFiles = { ...sopFiles };
  for (const sop of sops) {
    const mappings: Array<[string, string]> = [
      ['file', `sop_file_cache_${sop.id}_file`],
      ['oldFile', `sop_file_cache_${sop.id}_oldFile`],
      ['signedScan', `sop_file_cache_${sop.id}_signedScan`]
    ];
    for (const [kind, key] of mappings) {
      const data = allSopFiles[key] || (sop as any)[kind === 'file' ? 'fileDataUrl' : kind === 'oldFile' ? 'oldFileDataUrl' : 'signedScanDataUrl'];
      if (!data) continue;
      await saveFileToLocalCache(sop.id, kind as any, data);
      sopAttachmentCount++;
    }
  }

  return { sops, sk, mou, users, config, sopAttachmentCount, libraryFiles: Object.keys({ ...skFiles, ...mouFiles }).length, version };
}
