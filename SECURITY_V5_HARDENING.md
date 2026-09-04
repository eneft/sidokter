# SIDOKTER V5 — Security Hardening Baseline

Status: hardened except Firestore client rules, intentionally left open by project requirement.

## Locked decisions
- Firebase/Firestore rules remain open for the existing application data flow.
- No browser-supplied user-id/header can authenticate a request.
- No anonymous Firebase Auth fallback is used after login.
- Every protected server storage/PDF operation requires a valid session/token.
- Storage upload is authenticated; storage delete is Administrator-only.
- No default Administrator password or one-time first-admin bootstrap tanpa secret is shipped in source.
- Administrator bootstrap requires `(tidak digunakan)` and a strong password.
- Multiple simultaneous sessions per account are allowed across devices.
- Logout revokes only the current session; Revoke All revokes all sessions.
- Password change revokes all sessions.
- SPO number reservation uses a Firestore transaction-backed cloud counter; IndexedDB is only a compatibility/read cache.
- Hierarchy master and maintenance mode are cloud-backed for multi-device consistency.
- Production auth/PDF endpoints default to the Firebase Functions in `asia-southeast2`; localhost uses the local Express API.
- Deployment state files and nested legacy ZIP/source duplicates are excluded from the release package.

## Explicit exception
`firestore.rules` is intentionally not hardened because the project owner requires Firebase/Firestore client access to remain open. Backend-only collections such as `user_credentials` and `session_states` remain denied in the rules file.
