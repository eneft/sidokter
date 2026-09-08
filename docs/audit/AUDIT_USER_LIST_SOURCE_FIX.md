# AUDIT — USER LIST SOURCE FIX

## Finding
Firebase/Firestore still contains the complete user population. The regression was not a hierarchy rule deleting users.

The Vercel `/api/auth` proxy previously tried environment-configured/legacy auth endpoints before the canonical Firebase `authApi`. A legacy endpoint could therefore return a valid HTTP 200 `user-list` response from its old local `auth_db.json`, causing the UI to accept a one-user result and never invoke the Firestore fallback.

## Fix
The canonical Firebase Cloud Function `authApi` is now the first upstream for `/api/auth`. Legacy URLs remain compatibility fallbacks only.

## Security / behavior preserved
- No Firestore user data changed.
- No hierarchy access rules changed.
- No SK/MOU access rules changed.
- No login persistence behavior changed.
- Legacy `auth_db.json` is not promoted to an active user source.

## Verification target
Administrator account management must obtain the full `users` collection from Firebase through `authApi:user-list`.
