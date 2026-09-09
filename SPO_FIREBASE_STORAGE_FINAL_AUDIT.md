# SIDOKTER — SPO Firebase Cloud Storage Final Audit

## Storage contract
- Firebase Cloud Storage is the authoritative binary store for SPO files.
- Firestore stores SPO metadata plus `fileUrl`/`storagePath` references.
- IndexedDB/local cache is cache/recovery only and is never written back to Firestore by restore/bulk-local operations.
- The normal SPO preview/download UI does not fall back to browser-local cached binaries when a durable cloud reference is absent.

## Removed local-authoritative paths
- No `server/storageHandler.ts`.
- No `data/storage/` SPO binary storage path.
- No `data/storage_meta.json`.
- No normal SPO upload writes a new PDF into browser cache.
- No `restoreSopsToLocal()` or `bulkUpdateSops()` pushes local snapshots back to Firestore.

## Upload flow
1. Browser reads the selected file only as a transient DataURL/Blob.
2. `uploadFileToCloudStorage()` sends it to `/api/storage/upload`.
3. `storageApi` verifies Firebase Auth + SIDOKTER session and writes the binary with Firebase Admin `getStorage().bucket()`.
4. The API returns `fileUrl` and `storagePath`.
5. `saveSopToLocal()` awaits all required uploads.
6. Firestore is written only after durable file upload succeeds.
7. IndexedDB is updated only after the Firestore write succeeds.

## Legacy migration
`repairSopFileReferences()` can recover an old browser-local binary and upload it to Firebase Storage when a durable reference is missing. Once uploaded, the local DataURL is removed from the SPO record and the Firestore reference is updated.

## Security
- Storage API requires Firebase ID token and an active SIDOKTER session.
- Access is checked using Admin, STRUKTURAL, owner, and hierarchy/access-key rules.
- Storage objects are not treated as public document links.

## Verification
- `node --check functions/index.js`: passed.
- ZIP/source static checks: passed.
- Full `npm ci` / Vite build could not be completed in the audit container because dependency installation hit a transport timeout. This is an environment limitation, not a claimed build success.
