# AUDIT & PATCH — PETUGAS → USER

## Audit scope
Full source scan across `src/`, `server/`, `api/`, `functions/`, docs and project metadata.

## Findings
- UI/component naming had already been migrated to `User*` components.
- TypeScript role model is `admin | user`.
- No residual `Petugas`/`petugas` text remains in the package.
- Risk found: legacy persisted accounts/sessions with role `petugas` would fail strict `role === 'user'` checks after the rename.
- Risk found in server authentication: legacy Firestore role `petugas` could be emitted as a non-supported role claim/session.

## Patch applied
- Added role normalization at the local account/session read boundary: `admin` stays `admin`; every legacy/non-admin role (including `petugas`) is interpreted as `user`.
- Persisted client sessions are normalized when restored.
- Refreshed profiles normalize legacy roles.
- Server public sessions and custom-token claims normalize legacy roles.
- Authenticated server request context normalizes legacy roles before permission checks.
- Existing UI terminology remains `User`; no `Petugas` label is restored.

## Baseline protection
No changes were made to the locked SPO UI workflow, numbering rules, Existing/Legacy/Riviu behavior, A4 body layout, or front-page table design in this patch.

## Verification
- Residual `Petugas` scan: PASS (0 source references).
- `functions/index.js` syntax: PASS (`node --check`).
- Role compatibility smoke test: `petugas`, `Petugas`, `PETUGAS` → `user`; `admin` → `admin`.
- Full Vite/TypeScript production build: NOT CLAIMED PASS because project dependencies are not installed in the audit environment.
