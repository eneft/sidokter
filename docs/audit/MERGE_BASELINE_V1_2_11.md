# SIDOKTER V1.2.11 — MERGED BASELINE

Basis: sidokter (22).zip

Applied from V1.2.10:
- Security hardening and authorization fixes.
- Firestore STRUKTURAL global SPO access.
- Storage authorization hardening.
- Canonical permission helper compatibility.
- Admin Hub sync UI cleanup.
- 15 MB image limit consistency.
- Security baseline documentation.

Intentionally preserved from sidokter (22):
- `src/components/LoginPage.tsx`
- `src/index.css` login composition, including `#login-auth-card` / `.login-auth-card` styling.

Release hygiene:
- `test-login.json` removed.
- `node_modules/` excluded.
- No nested project wrapper.
