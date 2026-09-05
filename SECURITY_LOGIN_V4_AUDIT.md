# SECURITY LOGIN V4 — FINAL AUDIT

## Objective
Admin must be available on first deployment without hardcoded `default credential lama yang tidak aman`, while keeping credentials server-side and enforcing one active device session.

## Implemented
- Login remains server-authoritative through `authApi` + Firebase Custom Token.
- Initial Administrator provisioning is server-side via `bootstrap-admin`.
- Username for first Admin is fixed to `admin`.
- Password is chosen during first setup; minimum 12 chars with upper/lowercase, number and symbol.
- Provisioning requires `SIDOKTER_BOOTSTRAP_SECRET` stored server-side.
- Provisioning is one-time: if any normalized `role=admin` exists, it returns 409 and does not create another Admin.
- Credential hash/salt are stored only in `user_credentials` and are never returned to the browser.
- Firestore rules deny all browser access to `users`, `user_credentials`, and `session_states`.
- User management uses trusted backend actions.
- Backup contains profile data only; no password/hash/salt/session/lockout.
- Quick Login and public Emergency Reset remain disabled.
- Multi-device sessions are server-authoritative: each successful device login gets a unique session record; sessions remain independent until logout, revoke-all, password change, or account deletion.

## First-login procedure
1. Configure `SIDOKTER_BOOTSTRAP_SECRET` in the Firebase Functions server environment/Secret Manager.
2. Open SIDOKTER login.
3. Select `Setup Administrator Pertama`.
4. Enter the server setup key and choose the Admin password.
5. Login as `admin` using the chosen password.
6. The initial provisioning endpoint is permanently locked once an Admin exists.

## Multi-device policy
One account = one active session.
- PC 1 login: allowed.
- PC 2 login with same account: allowed and becomes the new active session.
- PC 1: previous session is revoked and protected requests fail.
- Two simultaneous active sessions for the same account: not allowed.

## Audit result
PASS for the requested red security findings and initial Admin provisioning design.

## Deployment note
Do not put the real bootstrap secret into frontend code, `src/`, Git, README, or the ZIP. Use Firebase Functions environment/Secret Manager configuration.
