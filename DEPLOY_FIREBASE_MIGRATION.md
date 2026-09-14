# SIDOKTER Firebase Migration Fix

Target Firebase project: `sidokter-soegiri`
Firestore database: `ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`

## Changes
- Firebase `authApi` is the canonical authentication backend.
- Removed the hard-coded legacy Cloud Run authentication URL from the production candidate list.
- Local JSON authentication fallback is disabled by default and requires `SIDOKTER_LOCAL_AUTH_FALLBACK=true` explicitly.
- Firebase Custom Tokens are no longer replaced by server session IDs.
- Browser login no longer falls back to anonymous Firebase Authentication.
- `authApi` now reports an internal `code` and `stage` for HTTP 500 diagnostics without exposing passwords or hashes.
- Existing Firestore named database ID and collection names are preserved.

## Deploy
From the project root:

```bash
firebase use sidokter-soegiri
firebase deploy --only functions:authApi,hosting
```

If the application is deployed separately through Vercel/Node, rebuild/redeploy it after the source changes. Keep `SIDOKTER_LOCAL_AUTH_FALLBACK=false` in production.

## First login test
1. Test the Function health endpoint through a POST request with `{ "action": "health" }`.
2. Try one known valid SIDOKTER account.
3. If login still returns HTTP 500, the response now includes `code` and `stage`; check the Firebase Function log for the matching stage.

## Important
Do not create another Firestore database and do not change the named database ID unless the deployment is intentionally migrated to a different database.


## Login 500 diagnostic
After deploying `authApi`, test the function directly with POST action `health`. A successful response confirms the named Firestore database is readable. If login still returns HTTP 500, the response now includes a safe `code` and `stage` such as `AUTH_FIRESTORE_USER_READ_ERROR`, `AUTH_SESSION_WRITE_ERROR`, or `AUTH_CUSTOM_TOKEN_ERROR`. The detailed Firebase exception remains only in Cloud Functions logs.
