# SIDOKTER Firebase Migration Fix V3

Canonical project: `sidokter-soegiri`

Canonical auth function:
`https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/authApi`

Firestore database:
`ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`

## Deploy

From the ZIP root:

```bash
firebase use sidokter-soegiri
firebase deploy --only functions:authApi
```

Then open this URL in a browser:

`https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/authApi`

Expected response contains:

- `status: ok`
- `build: firebase-migration-fix-v3`
- `project: sidokter-soegiri`
- `firestoreUsersReadable: true`

A GET health response proves the deployed function is the V3 code and that its Admin SDK can read the named Firestore database.

For login, the function returns a safe `code` and `stage` on HTTP 500. Do not expose passwords, hashes, salts, or tokens in client logs.
