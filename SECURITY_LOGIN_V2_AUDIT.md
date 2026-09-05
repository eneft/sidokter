# SIDOKTER — SECURITY LOGIN V2

## Status
Critical login findings from the previous audit have been remediated in this build.

## Fixed
1. Login is server-authoritative through `functions/index.js` (`authApi`).
2. Browser no longer verifies passwords from `localStorage`.
3. Firebase Auth receives a custom token issued by the trusted authentication service.
4. Firebase Auth persistence is `browserSessionPersistence` (tab/session scoped).
5. Client session data in `sessionStorage` is cache-only; restore and session guard call the trusted server.
6. Multi-device sessions are enforced by a server-side `session_states/{uid}/sessions/{sessionId}` registry; each successful device login gets its own session ID and token claim.
7. Login lockout remains 5 failed attempts / 15 minutes and is enforced server-side.
8. Added an IP+username login rate limiter in the authentication function.
9. Removed Quick Login credentials from the public login page.
10. Removed public Emergency Admin Reset from the login page.
11. Removed automatic creation of `admin/admin123` and `pelayanan/pelayanan123` in the browser.
12. Firestore rules no longer allow public read/write.
13. `users` writes are Administrator-only; `users` reads are self/admin.
14. SPO/SK/MOU/config writes are Administrator-only; normal users are read-only.
15. `auth_logs`, `audit_logs`, and `session_states` cannot be written by browser clients.
16. PDF endpoints require a valid Firebase ID token and active server session; spoofable identity headers are no longer trusted.
17. Password hashes are no longer returned by the normal Firestore user-fetch path.

## Required deployment configuration
Set these environment variables for the Functions/runtime:

- `AUTH_ALLOWED_ORIGIN` — exact production browser origin, e.g. `https://your-domain.example`
- `AUTH_API_URL` — optional; defaults to the Firebase `authApi` URL for this project
- `VITE_AUTH_API_URL` — optional; defaults to the Firebase `authApi` URL for this project
- `FIREBASE_PROJECT_ID` — optional; defaults to the project configured in this build

For multiple production browser origins, use `AUTH_ALLOWED_ORIGINS` as a comma-separated list.

## Important migration note
Existing Firestore user records with `passwordHash` + `passwordSalt` continue to work. The old public browser bootstrap/recovery path is intentionally disabled. If a new deployment has no Administrator account, provision the first account through a controlled server-side/admin procedure; do not re-enable a public default password.

## Verification performed
- No `allow read, write: if true` remains in Firestore rules.
- No `admin123` / `pelayanan123` remains in application source.
- No public Quick Login handler remains.
- No public Emergency Reset handler remains.
- `functions/index.js` passes Node syntax validation.
- TypeScript syntax errors introduced by the security patch were checked with the global TypeScript compiler; remaining compiler output is dependency-resolution only because `node_modules` is not included in the supplied ZIP.


## SECURITY LOGIN V3 HARDENING
- Credentials dipindahkan dari `users/` ke collection backend-only `user_credentials/`.
- Browser tidak lagi membaca/menulis `users/` secara langsung untuk manajemen akun.
- User management memakai `authApi` untuk create/update/delete.
- Backup akun hanya menyimpan profile; hash/salt tidak dibackup.
- Restore akun hanya memulihkan profile dan menandai `PASSWORD_REQUIRED`; password harus ditetapkan ulang Administrator.
- Legacy credential pada `users/` dimigrasikan server-side saat `user-list`/login dan dihapus dari profile.
- Satu akun tetap menggunakan model **single active session**: login perangkat kedua mencabut sesi perangkat pertama.
