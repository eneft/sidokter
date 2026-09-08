# SIDOKTER SOEGIRI — SECURITY LOGIN V3 AUDIT / FIX

## Status
Implemented the security hardening requested after the V2 audit.

## Critical fixes
1. Browser no longer stores password hashes/salts.
2. Browser no longer reads the `users` collection directly for account management.
3. Account create/update/delete is performed through authenticated `authApi` only.
4. Password hashes/salts live in backend-only `user_credentials`.
5. Legacy credentials in `users` are migrated server-side and removed from the profile document.
6. Normal system backup contains account profiles only; credential material is excluded.
7. Account restore restores profile only and marks the account `PASSWORD_REQUIRED`; an Administrator must set a new password.
8. Public default login/recovery credentials remain disabled.
9. Firestore rules deny browser access to `users`, `user_credentials`, and `session_states`.
10. Firestore access to SPO/SK/MOU/config now requires a currently-active server-issued session ID.
11. This prevents an old device/session from continuing to use direct Firestore access after a new login revokes the old session.
12. User-management UI state is sanitized so an entered password is not retained in React user-list state after save.

## Multi-device policy
SIDOKTER remains **single active session per account**:
- Device A logs in → session A is active.
- Device B logs in with the same account → session B replaces session A.
- Device A is rejected on the next server/session check and direct Firestore access is denied by rules.
- Therefore one account can be used on multiple devices **sequentially**, but not simultaneously.

This behavior is intentional for the current security baseline and avoids one shared account being active on several PCs at the same time.

## Password handling
- PBKDF2-SHA256 remains server-side with 100,000 iterations and random salt.
- Password plaintext is accepted only as an ephemeral request value for account creation/change and is never stored in the browser or Firestore profile.
- No default `admin123` or `pelayanan123` credential is embedded in the application.
