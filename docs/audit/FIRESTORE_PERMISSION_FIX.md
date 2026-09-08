# Firestore Permission Fix — SIDOKTER

## Fixed
- Realtime document watcher no longer subscribes to the entire `sops` collection. It uses the same scoped SOP query as the SOP sync service.
- Permission-denied on optional realtime SOP sync is treated as a graceful local-cache fallback instead of a console warning flood.
- SOP and SK/MOU client writes are restricted to Admin in Firestore rules.
- Notification reads remain UID-scoped under `notifications/{uid}/items`.

## Important deployment step
The browser uses the Firebase project/database defined by `firebase-applet-config.json`. The rules in this ZIP only take effect after deploying `firestore.rules` to that exact Firebase project/database.

Verify the deployed rules before testing: `ai-studio-sidokter-1b8a631d-522f-4a38-abec-2ee76aefa2c3`.
