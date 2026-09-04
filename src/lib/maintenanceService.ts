import { onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface MaintenanceMode { enabled: boolean; message: string; updatedAt?: string; updatedBy?: string; }

const DOC_REF = doc(db, 'system_config', 'maintenance_mode');
const defaultMaintenance: MaintenanceMode = { enabled: false, message: 'Sistem sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.' };

function normalize(value: any): MaintenanceMode {
  return {
    enabled: value?.enabled === true,
    message: typeof value?.message === 'string' && value.message.trim() ? value.message : defaultMaintenance.message,
    updatedAt: value?.updatedAt,
    updatedBy: value?.updatedBy
  };
}

export function subscribeToMaintenanceMode(onData: (mode: MaintenanceMode) => void, onError?: (err: any) => void) {
  return onSnapshot(
    DOC_REF,
    snapshot => onData(normalize(snapshot.exists() ? snapshot.data() : {})),
    error => { onData(defaultMaintenance); onError?.(error); }
  );
}

export async function getMaintenanceMode(): Promise<MaintenanceMode> {
  try {
    const snap = await getDoc(DOC_REF);
    return normalize(snap.exists() ? snap.data() : {});
  } catch {
    return defaultMaintenance;
  }
}

export async function setMaintenanceMode(enabled: boolean, message: string, updatedBy?: string): Promise<void> {
  await setDoc(DOC_REF, {
    enabled,
    message: message.trim() || defaultMaintenance.message,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'admin'
  }, { merge: true });
}

export { defaultMaintenance };
