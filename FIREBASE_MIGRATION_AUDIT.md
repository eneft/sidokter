# Firebase Migration / Hosting Audit

- Project ID: `sidokter-soegiri`
- Hosting: `https://sidokter-soegiri.web.app`
- Firestore DB: `ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`
- Function region: `asia-southeast2`

## Cloud Functions

| Function | Type | Firebase Hosting route |
|---|---|---|
| `authApi` | HTTPS v2 | `/api/auth`, `/api/auth/**` |
| `pdfApi` | HTTPS v2 | `/api/pdf` |
| `storageApi` | HTTPS v2 | `/api/storage`, `/api/storage/**` |
| `hierarchyApi` | HTTPS v2 | `/api/hierarchy`, `/api/hierarchy/**` |
| `createNotification` | Callable v2 | Firebase Functions SDK; no Hosting rewrite required |

## Critical production fix

Firebase Hosting does **not** run `server.ts`. The previous `/api/hierarchy` endpoint existed only in the Express server, so the route could work in AI Studio/Vercel-style runtime but fail after publishing only the Vite `dist` folder to Firebase Hosting.

This version adds `hierarchyApi` to Cloud Functions and maps `/api/hierarchy` through Firebase Hosting.

## Deployment requirement

Deploy **Hosting and all Functions together**:

```bash
firebase use sidokter-soegiri
npm run verify:functions
npm run build:client
firebase deploy --only functions,hosting,firestore,storage
```

Do not use `firebase deploy --only hosting` for the production release of this app.

## Static verification performed

- `node --check functions/index.js`: PASS
- All expected function exports detected: PASS
- All HTTPS functions have Hosting rewrites: PASS
- `createNotification` callable export detected: PASS
- Firebase project target in `.firebaserc`: `sidokter-soegiri`
- Hosting target: `dist`

## Runtime verification after deployment

1. `https://sidokter-soegiri.web.app` loads.
2. Login works through `/api/auth`.
3. PDF preview/generation works through `/api/pdf`.
4. Upload/preview/download/delete works through `/api/storage`.
5. Master Data Hirarki works through `/api/hierarchy`.
6. Notifications work through `createNotification`.
7. Firestore and Storage use the configured Firebase project/database.
8. No normal operation produces `app/no-app`, `UNAUTHENTICATED`, or `HIERARCHY_ERROR` in Function logs.
