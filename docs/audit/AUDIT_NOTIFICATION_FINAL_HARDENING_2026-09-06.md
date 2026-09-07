# Audit Notification Final Hardening — 2026-09-06

## Baseline
`SIDOKTER_NOTIFICATION_CROSS_DEVICE_HARDENED_BUGFIX_FINAL.zip`

## Fixes applied
1. Assignment notification event identity now prefers explicit `assignmentUpdatedAt`, `assignedAt`, or `assignmentRevision`; legacy fallback remains accessKeys/division fingerprint.
2. Notification Center type/filter identity colors are unified to Navy/Slate. Amber/red remain semantic only for due/overdue/error conditions.
3. Firestore remains the cross-device source of truth; UID-scoped storage/cache is retained only as client cache.

## Verification
- Root project contains no `AUDIT_*.md` files; audit documents are under `docs/audit/`.
- No nested project wrapper detected.
- Curly/parenthesis balance checked for modified TypeScript/TSX files.
- `npm run build` attempted; environment does not have installed `vite` (`vite: not found`), so production build could not be executed here.

## Security limitation
Notification documents remain client-created and scoped to the authenticated owner's UID. A truly server-authoritative notification producer requires Cloud Functions/server-side event issuance; this audit does not introduce that architecture because it would be a separate backend change.
