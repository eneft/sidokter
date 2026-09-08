# Audit Login Page — 2026-09-05

## Scope
Redesign `src/components/LoginPage.tsx` only, preserving the existing authentication API and session workflow.

## Preserved
- `authenticateUser()` remains the login entry point.
- Successful login still calls `onLogin(result.session)`.
- Existing lockout, maintenance notice, inactivity notice, password visibility toggle, loading state, and GEMES login-index behavior are preserved.
- Firebase/session implementation was not modified.
- SPO, SK, MOU, and other application workflows were not modified.

## UI changes
- Cleaner split-screen desktop login.
- SIDOKTER SOEGIRI is the dominant brand on the login page.
- Hospital logo and RSUD Dr. Soegiri identity remain visible.
- Responsive mobile login layout retained.
- Reduced visual clutter and simplified feature copy.
- Improved input/button hierarchy and focus states.

## Security cleanup
- Removed the hard-coded default admin password from the public login UI.
- Removed the hard-coded default setup key from the public login UI.
- Admin setup still uses the existing server-authoritative `provisionInitialAdmin()` flow, but the key must now be entered explicitly.
- No credentials are persisted by the login page.

## Verification
- Source archive integrity: PASS.
- Project root structure: PASS; no nested project folder.
- TypeScript parser check: PASS at syntax level; full typecheck/build requires project dependencies (`node_modules`).
- `npm install --ignore-scripts --no-audit --no-fund` was attempted in the audit environment but timed out, so full production build is intentionally NOT claimed as PASS.
