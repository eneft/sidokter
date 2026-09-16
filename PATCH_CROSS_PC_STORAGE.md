# SIDOKTER Cross-PC Storage Fix

## Fix
- Firebase Storage remains the durable source for uploaded SPO binaries.
- `storageApi` now authorizes SPO binaries using the SOP's Firestore access boundary (`accessKeys` / `authorizedUids`) when the storage-file index was created by another user.
- Existing uploader-only storage metadata no longer prevents another authorized SIDOKTER user from opening the same SPO on another PC.
- Admin, structural, global access, owner access remain supported.
- Browser-local IndexedDB remains cache/offline fallback only; it is not the source of truth when a cloud reference exists.

## Expected flow
PC 1 upload -> Firebase Storage -> Firestore `signedScanStoragePath` -> PC 2 reads Firestore -> `storageApi` -> same Storage binary -> PDF.js.

No PDF regeneration is involved in this path.
