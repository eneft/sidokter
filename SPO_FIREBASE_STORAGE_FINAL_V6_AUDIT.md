# SIDOKTER — SPO Firebase Storage Final V6 Audit

## Scope
Audit V5 source and harden the SPO persistence contract so Firebase is authoritative and browser-local data cannot masquerade as current cloud data.

## Final storage contract
- Firestore: authoritative SPO metadata and durable Firebase Storage references (`fileUrl`, `storagePath`, etc.).
- Firebase Cloud Storage: authoritative binary files.
- IndexedDB: browser cache only.
- LocalStorage/file cache: legacy/offline/recovery only; never a normal online source of current SPO data.

## V6 fixes
1. Firestore SOP writes explicitly delete legacy `fileDataUrl`, `signedScanDataUrl`, and `oldFileDataUrl` fields using `deleteField()`. This prevents stale DataURLs from surviving a `merge:true` write.
2. Online Firestore read failure no longer causes the UI to emit a stale IndexedDB snapshot. Local cache is only surfaced when the browser is actually offline.
3. Successful Firestore snapshots continue to replace the IndexedDB SOP cache rather than merging browser-only records.
4. `array-contains-any` access-key queries remain chunked at Firestore's 30-value limit.
5. Missing access scope is treated as an error, not an empty cloud dataset.
6. Normal SPO preview remains cloud-reference-first; a missing cloud reference is not silently replaced by a PC-local cached PDF.

## Static checks
- ZIP integrity: PASS (`unzip -t`).
- Firebase Cloud Function syntax: PASS (`node --check functions/index.js`).
- No `data/storage` / `storage_meta.json` authoritative SPO path references found in `src`, `functions`, or `server`.
- Full TypeScript/build validation requires project dependencies; environment validation without dependencies reports only missing external Node/React packages.

## Important deployment requirement
Deploy the Firebase function/hosting/storage configuration used by the project. Do not reset or delete existing Firestore or Firebase Storage data.

## Legacy documents
Legacy SPOs without durable `fileUrl`/`storagePath` require an explicit repair/migration process. A browser that happens to contain an old local copy must not silently publish that copy during normal login/sync.
