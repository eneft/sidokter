# FIRESTORE SCOPE FIX AUDIT — FINAL

## Root cause
Fresh devices received `Missing or insufficient permissions` on scoped `/sops` reads because Firestore Rules depended on `request.auth.token.hierarchyKeys`, while the client scope and server scope could diverge and Firebase custom claims have a strict size limit. Desktop cache masked the cloud failure.

## Fix
- SOP authorization scope is now server-authoritative in `users/{uid}.sopAccessKeys`.
- `users/{uid}.sopGlobalAccess` records global hierarchy access.
- Login writes the complete computed SOP scope to the user profile before issuing the custom token.
- Every authenticated `session` request refreshes the stored SOP scope, repairing legacy profiles and applying assignment changes without requiring stale custom claims.
- `user-save` computes and stores the SOP scope whenever an account is created/updated.
- Firebase custom token no longer carries the potentially large `hierarchyKeys` array; only the compact global flag remains.
- Firestore Rules authorize SOP reads from the server-side user profile scope.
- Client `array-contains-any` queries remain batched at 30 values because that is a Firestore query limit, not an authorization limit.
- Existing cache/error semantics remain: Firestore errors are not treated as empty cloud data.
- Firebase Cloud Storage remains authoritative for SPO binaries.

## Validation
- `node --check functions/index.js`: PASS
- ZIP integrity: PASS
- No nested project directory: PASS
- Full `npm ci`/production build could not be executed in this isolated environment because dependency installation hit a transport timeout.

## Required production verification
1. Deploy Functions, Hosting, and Firestore Rules.
2. Log out/re-login on a fresh mobile browser.
3. Confirm the user document contains `sopAccessKeys` and `sopAccessVersion: 3`.
4. Confirm the mobile client receives the same SPO list as desktop without IndexedDB/localStorage data.
5. Test an account with multiple assignments and >30 generated access keys.
6. Verify a user cannot read an SPO whose `accessKeys` do not intersect their stored scope.
