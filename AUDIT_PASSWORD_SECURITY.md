# AUDIT PASSWORD SECURITY

## Rule locked
Password baru minimal 8 karakter dan wajib mengandung:
- huruf besar (A-Z)
- huruf kecil (a-z)
- angka (0-9)

## Updated validation points
- `src/App.tsx`: self password update now enforces the same rule.
- `src/components/UserPasswordTab.tsx`: user self-service validation enforces the same rule.
- `src/components/SecurityAccountPanel.tsx`: security account password change enforces the same rule.
- `src/components/UserManagementModal.tsx`: admin user password create/reset validation enforces the same rule.
- `functions/index.js`: backend password create/update validation enforces the same rule.

## Preserved
- Current password verification remains required for self-service changes.
- Confirmation password remains required in the user password UI.
- Password hashing/storage flow was not changed.
