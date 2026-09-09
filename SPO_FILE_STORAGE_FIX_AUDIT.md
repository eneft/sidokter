# SIDOKTER SPO File Storage Fix

## Fixes
- SPO binary upload is awaited before authoritative Firestore save.
- Firestore save can now fail the caller instead of silently reporting success.
- Local IndexedDB is rolled back when the authoritative SPO save fails.
- Legacy local DataURLs are automatically repaired to durable storage when still available in the current browser.
- `[LOCAL_STORAGE_BINARY]` never overwrites a real local cached binary during cloud sync.
- Protected storage HEAD/GET/DELETE requests carry the SIDOKTER session header.
- A failed automatic cloud upload no longer falls back to pretending a DataURL is durable.
- Firestore/IndexedDB sync remains serialized to reduce stale snapshot races.

## Existing legacy files
Records created before this fix may contain `[LOCAL_STORAGE_BINARY]` with no durable URL. If the original binary is still present in the browser that created/edited it, the next cloud sync can repair it automatically. If the binary no longer exists anywhere except that lost browser cache, the application cannot reconstruct it and the document must be re-uploaded.

## Deployment note
The included `server/storageHandler.ts` stores files under `data/storage`. This is persistent only when the deployment environment provides persistent server disk. Do not deploy this storage design to an ephemeral/serverless filesystem without migrating the binary layer to a persistent object store.
