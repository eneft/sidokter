# SIDOKTER — Multi-Device Session Policy

- One account may have multiple active devices/sessions simultaneously.
- Every successful login creates a unique server-side session ID.
- Firebase ID tokens carry that session ID.
- Protected server/Firestore access is allowed only when the exact session record exists and `revoked == false`.
- Logging out revokes only the current device/session.
- `revoke-all`, password change, or account deletion revokes all sessions for that account.
- `sessionStorage` remains tab-scoped client cache; it is not the security authority.
- Device/session metadata is stored server-side for audit (IP and user-agent, truncated).
