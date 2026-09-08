# Audit — Minimal Existing Approval Patch

Source baseline: `sidokter (20).zip`

Only workflow files were changed:
- `src/components/UserView.tsx`
- `src/components/PetugasView.tsx`
- `src/App.tsx`

Changes:
1. SPO Existing submission status is always `DRAFT` and must wait for Admin approval.
2. Existing submission no longer writes activation timestamp/user at submission.
3. Admin activation validation message includes SPO Existing.

Protected files verified unchanged against baseline:
- `src/components/LoginPage.tsx`
- `src/index.css`

No login/branding/layout changes were made.
