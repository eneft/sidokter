# SIDOKTER — SPO Firebase Storage FINAL V5 Audit

## Scope
Fix for intermittent cross-device SPO visibility and file availability.

## Authoritative architecture
- Firestore: authoritative SPO metadata and storage references.
- Firebase Cloud Storage: authoritative SPO binary files.
- IndexedDB: browser cache only.
- localStorage: not used as normal SPO source.
- server `data/storage`: not used as SPO storage.

## Fixed bugs
1. Firestore read failures are no longer converted to an empty `[]` result.
2. Missing authentication/access scope is treated as a sync error, not an empty dataset.
3. Successful Firestore snapshots replace IndexedDB exactly; stale local records are not merged into cloud data.
4. Successful empty Firestore snapshots clear the scoped cache intentionally.
5. Realtime errors preserve local cache instead of clearing it.
6. `array-contains-any` access keys are batched in groups of <=30.
7. User hierarchy access keys are no longer truncated to 30 before query batching.
8. Initial UI emission waits for cloud sync success or an explicit cloud failure before using local cache.
9. Legacy local-file repair is not part of normal realtime synchronization.
10. Local IndexedDB snapshots are never automatically pushed back to Firestore.

## Static checks
- Firebase Storage function syntax: PASS (`node -c functions/index.js`).
- Forbidden authoritative local storage references in `src`, `server.ts`, `functions`: NONE.
- Automatic local -> Firestore SOP sync calls: NONE.
- Nested project folder in release ZIP: NONE.

## Build validation
Full `npm ci` / `npm run build` could not be completed in the audit container because dependency installation hit a transport timeout. Production build must therefore be run in the deployment environment before release.

## Deployment acceptance test
1. PC A: upload a new SPO PDF and activate it.
2. PC B: log in independently.
3. Confirm the same SPO appears.
4. Preview and download the PDF on PC B.
5. Refresh PC B and repeat preview/download.
6. Clear browser cache on PC B and repeat.
7. Verify an authorized user with a different hierarchy scope sees only permitted SPOs.
8. Verify an unauthorized user does not receive the document.
