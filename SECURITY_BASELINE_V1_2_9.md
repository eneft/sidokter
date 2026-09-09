# SIDOKTER Security & Release Baseline V1.2.9

## Scope
Final hardening pass following V1.2.8 audit.

### Locked permission model
- ADMIN = Admin Root / system administrator.
- VERIFIKATOR = verification authority; not Admin Root.
- STRUKTURAL = structural access; retains approved SPO global access and SK/MOU upload/view/download scope.

### Changes in V1.2.9
1. `src/utils/soegiriStructure.ts` is now a compatibility re-export of the canonical `src/lib/soegiriStructure.ts`. Permission and hierarchy helpers therefore have one implementation.
2. Admin Hub's SPO number synchronization card has one primary entry point: `Buka Panel Detail`. The actual synchronization action remains inside the dedicated synchronization panel.
3. Image upload ceiling remains aligned at 15 MB with server storage.
4. Release packaging excludes `node_modules` and temporary backup files.

### Explicit non-changes
- No change to STRUKTURAL global SPO access.
- No change to SK/MOU permissions already approved.
- No redesign of the SIDOKTER UI.

### Verification limitation
Full lint/build requires a complete dependency installation. The release ZIP intentionally does not contain `node_modules`; deployment should run `npm ci` before `npm run lint` and `npm run build`.
