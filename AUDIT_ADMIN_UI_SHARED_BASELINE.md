# AUDIT — ADMIN UI SHARED BASELINE

## Rule
Administrator has the highest permission level, but MUST use the same UI/UX and SPO workflow as User. Only admin-specific capabilities differ.

## Implemented
- Admin now renders the shared `UserView` component instead of a separate Admin workspace UI.
- Admin uses the same `Header`/sidebar visual system as User.
- Admin uses the same Dashboard, SPO, SK, MOU, Arsip Digital, and Profil surfaces.
- Admin uses the same progressive SPO workflow and A4 editor contained in `UserView`.
- Admin-only capabilities remain available through an Administrasi section in the shared sidebar: User Management, Master Hirarki & Unit, Security, Backup & Restore, and Mode Pemeliharaan.
- Admin permission checks remain role-based; this change does not downgrade admin permissions.

## Validation
- `tsc --noEmit --skipLibCheck` reached dependency/type-environment errors only; no JSX parser error remained in `App.tsx`, `UserView.tsx`, or `Header.tsx`.
- Full production build was not run successfully because dependencies could not be installed in the available environment (npm install timed out).

## Protected baseline
- SPO Baru / Existing / Riviu separation
- Progressive input: Jenis SPO -> Hirarki -> Batang Tubuh
- Final action only at Batang Tubuh
- Existing/Legacy numbering identity
- Reservation rules
- Badge STRUKTURAL access rules
- SK/MOU access rules
- Arsip Digital naming
- Dashboard greeting/GEMES rotation
- Password policy
