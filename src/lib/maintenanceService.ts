export interface MaintenanceMode { enabled: boolean; message: string; updatedAt?: string; updatedBy?: string; }

const KEY = 'soegiri_offline_maintenance_v1';
const subscribers = new Set<() => void>();
const defaultMaintenance: MaintenanceMode = { enabled: false, message: 'Sistem sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.' };

function read(): MaintenanceMode {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : defaultMaintenance; } catch { return defaultMaintenance; }
}
function write(value: MaintenanceMode) { localStorage.setItem(KEY, JSON.stringify(value)); subscribers.forEach((fn) => fn()); }

export function subscribeToMaintenanceMode(onData: (mode: MaintenanceMode) => void, onError?: (err: any) => void) {
  const emit = () => { try { onData(read()); } catch (e) { onError?.(e); } };
  emit(); subscribers.add(emit);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => { subscribers.delete(emit); window.removeEventListener('storage', onStorage); };
}
export async function getMaintenanceMode(): Promise<MaintenanceMode> { return read(); }
export async function setMaintenanceMode(enabled: boolean, message: string, updatedBy?: string): Promise<void> {
  write({ enabled, message: message.trim() || defaultMaintenance.message, updatedAt: new Date().toISOString(), updatedBy: updatedBy || 'admin' });
}
export { defaultMaintenance };
