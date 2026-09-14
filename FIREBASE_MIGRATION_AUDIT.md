# Firebase Migration Audit

- Project ID: `sidokter-soegiri`
- Firestore DB: `ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`
- Canonical auth function: `asia-southeast2-sidokter-soegiri.cloudfunctions.net/authApi`
- Legacy project reference: removed from runtime source.
- Legacy Cloud Run auth endpoint: removed from runtime source.
- Anonymous Auth login fallback: removed.
- Custom-token overwrite: removed.
- Local auth fallback: explicit opt-in only.
- Function JS syntax check: PASS (`node --check functions/index.js`).
- Full dependency build was not run because this ZIP has no installed `node_modules` and package installation timed out in the build environment.
