# Audit Notification Hardening Fix — 2026-09-06

## Baseline
Applied to the latest `SIDOKTER_NOTIFICATION_CROSS_DEVICE_HARDENED_FINAL.zip` baseline.

## Fixes
- Canonical notification event keys are used for dedupe.
- Activation key no longer changes on unrelated document updates; it uses `activatedAt`.
- Proposal key no longer changes on unrelated document updates; it uses `activationRequestedAt`.
- Assignment key includes the document assignment/access-key fingerprint rather than only the document ID.
- Firestore assignment watcher now uses one local `assignmentKey` variable consistently.
- Local event and Firestore event side effects are guarded by a shared per-session event-key set, preventing duplicate toast/chime for the same event path.
- Existing cloud/local notifications seed the per-session dedupe sets, preventing a local event from duplicating an already persisted notification.
- Notification read state persists `readAt` in Firestore.
- Notification identity remains Firebase Auth UID based.
- Removed duplicate AudioContext construction.

## Safety
No changes to SPO hierarchy rules, authentication, login UI, document content, or Firebase user data.
