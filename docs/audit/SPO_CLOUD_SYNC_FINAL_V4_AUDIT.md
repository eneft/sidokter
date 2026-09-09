# SIDOKTER — SPO CLOUD SYNC FINAL V4 AUDIT

Tanggal: 2026-09-09

## Root cause addressed
Direct client Firestore SOP reads could fail with `Missing or insufficient permissions` even though SIDOKTER application authentication/session was valid. A fresh device had no IndexedDB cache, so the failure appeared as `0 SPO`.

## Fix
1. Added trusted-server `sop-list` action to `functions/index.js`.
2. The server validates the Firebase ID token and the SIDOKTER server session with `requireAuth()` before reading any SOP.
3. The server applies the same hierarchy scope used by SIDOKTER. Admin/global users receive all SOPs; normal users receive only SOPs whose `accessKeys` intersect their authorized hierarchy keys.
4. Client `fetchSopsFromFirestore()` falls back to the trusted server only when the direct Firestore read is permission-denied.
5. Client realtime SOP subscription starts trusted-server polling every 15 seconds if the direct Firestore listener receives permission-denied. Direct Firestore resumes and stops fallback polling when it becomes healthy again.
6. Firestore Rules remain restrictive. No public `allow read, write: if true` was added for SOPs.
7. IndexedDB remains cache-only. A successful cloud/server snapshot replaces the cache; failed reads do not clear it.

## Security model
- Firebase Storage remains authoritative for binary files.
- Firestore remains authoritative for SOP metadata.
- Trusted server reads use Firebase Admin SDK but require both a valid Firebase ID token and an active SIDOKTER server session.
- No client-side rule bypass is introduced.
- Non-admin users cannot request an arbitrary UID or scope from `sop-list`; scope is derived server-side from the authenticated user's profile.

## Validation
- `functions/index.js`: `node --check` PASS.
- ZIP structure: root project is clean; no nested project directory.
- ZIP integrity: tested after packaging.
- Full TypeScript/Vite build could not be independently completed in the audit container because project dependencies were not installed/available; this is an environment limitation, not a claim of build success.

## Expected fresh-device flow
HP/browser tanpa cache:
Login → Firebase Auth custom token → SIDOKTER session → direct Firestore attempt → permission fallback if necessary → trusted server `sop-list` → scoped SOP list → IndexedDB cache.

Therefore a fresh device no longer depends on pre-existing IndexedDB data to display the authorized SOP list when direct Firestore Rules evaluation is unavailable.
