import { strict as assert } from 'node:assert';
import {
  buildCloudFunctionUrl,
  isCapacitorNativeRuntime,
  isProtectedStorageApiUrl,
  normalizeStorageApiUrl,
  storageApiUrl,
} from '../src/lib/runtimeEndpoints';

const originalWindow = (globalThis as any).window;
const setWindow = (protocol: string, origin: string) => {
  (globalThis as any).window = {
    location: { protocol, origin },
    Capacitor: { isNativePlatform: () => protocol === 'capacitor:' }
  };
};

setWindow('https:', 'https://sidokter.vercel.app');
assert.equal(isCapacitorNativeRuntime(), false);
assert.equal(storageApiUrl('/files/abc', 'sidokter-soegiri'), '/api/storage/files/abc');
assert.equal(normalizeStorageApiUrl('https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc', 'sidokter-soegiri'), '/api/storage/files/abc');

setWindow('capacitor:', 'capacitor://localhost');
assert.equal(isCapacitorNativeRuntime(), true);
assert.equal(storageApiUrl('/files/abc', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc');
assert.equal(normalizeStorageApiUrl('/api/storage/path/sidokter%2Fspo%2Fa.pdf', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/path/sidokter%2Fspo%2Fa.pdf');
assert.equal(isProtectedStorageApiUrl('/api/storage/files/abc'), true);
assert.equal(isProtectedStorageApiUrl('https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi/files/abc'), true);
assert.equal(buildCloudFunctionUrl('authApi', 'sidokter-soegiri'), 'https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/authApi');

(globalThis as any).window = originalWindow;
console.log('iOS runtime endpoint contract: OK');
