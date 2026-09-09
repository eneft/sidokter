# SIDOKTER Security Baseline V1.2

## Active policy
- Authentication is server-authoritative. Browser `sessionStorage` is cache only.
- One account may have multiple active devices/sessions simultaneously.
- Every successful login creates a unique server-side session ID.
- Logout revokes only the current session. `revoke-all`, password change, or account deletion revokes all sessions.
- Firestore client writes to privileged collections are blocked by rules.
- SPO: Admin has full write access; non-Admin may create/update only their own `DRAFT` records. Activation/finalisation/status changes require Admin.
- SPO reads are restricted by server-issued hierarchy claims; Admin/global hierarchy access is allowed.
- SK/MOU (`library_documents`) create/upload is allowed for Admin Root and authorized STRUKTURAL users; metadata update/delete remains Admin Root-only. VERIFIKATOR does not receive SK/MOU privilege merely from the badge.
- User profile writes are trusted-auth-API-only.
- `system_config` writes are Admin-only.
- Audit/auth/session security collections are trusted-server-only.

## Release gate
1. Deploy Firestore rules.
2. Deploy Functions after multi-device session change.
3. Test two devices with the same account: both sessions remain active.
4. Test logout on device A: device B remains active.
5. Test revoke-all/password change: all sessions are rejected.
6. Test User cannot directly write an ACTIVE SPO, SK/MOU, users, or system_config document.
7. Test Admin can perform the documented privileged operations.

## Badge Nomenclature Lock — 2026-09-08

- `ADMIN` is reserved exclusively for the **Admin Root system role** (`role: admin`).
- The former user badge `ADMIN` is renamed to **`VERIFIKATOR`**.
- `VERIFIKATOR` is an elevated user badge for SPO verification/activation within the user's authorized hierarchy. It does not grant Admin Root privileges and does not expose the Administrator Hub.
- `STRUKTURAL` remains a separate elevated badge with its defined structural/SK/MOU access privileges.
- Legacy persisted badge value `ADMIN` is normalized to `VERIFIKATOR` when user data is read or saved, so existing accounts are not silently stripped of their operational privilege.
- UI labels, type definitions, helper functions, and permission checks must use `VERIFIKATOR`; checks for `role === 'admin'` must remain reserved for Admin Root.

- Server file storage endpoints require a valid server-issued SIDOKTER session. STRUKTURAL may upload; only Admin Root may delete. Raw/decoded JWT payloads are never accepted as authentication.

- Library PDF download endpoints require an authenticated SIDOKTER session; `library-*` files additionally require Admin Root or STRUKTURAL.
- Browser cache is never authoritative: a successful empty cloud snapshot clears stale library cache; a cloud read failure does not erase cache.
- Storage upload/delete/download routes no longer accept anonymous requests.


## FINAL UI/UX BASELINE SIDOKTER

1. Tampilan existing dipertahankan; tidak dilakukan redesign total, hanya perapihan.
2. Card wajib responsive/flexible: desktop 3 kolom, tablet 2 kolom, mobile 1 kolom; tidak fixed width dan tidak overflow.
3. Tabel SPO disederhanakan menjadi: Nomor SPO | Judul SPO | Status | Aksi.
4. Judul SPO tidak oversized; ukuran/bobot konsisten dengan teks tabel.
5. Judul SPO clickable/tappable dan langsung membuka Preview SPO.
6. Tombol Preview di tabel dihapus.
7. Tombol Download di tabel dihapus.
8. Download, jika user berhak, tersedia di halaman Preview.
9. Tombol Buka SPO tetap diperbolehkan sebagai aksi utama.
10. Elemen/tombol redundant dikurangi, termasuk duplikasi tombol Sinkronkan Nomor.
11. Visual tenang, administratif, clean; hindari badge/button besar yang tidak perlu.
12. Responsive berlaku untuk seluruh halaman, bukan hanya card.

Target: clean, profesional, ringan, responsif, dan mudah membaca banyak dokumen sekaligus.


## AUDIT FIX — V1.2.5
- Server authentication accepts only server-issued SIDOKTER session IDs; no username/UID header fallback and no decoded JWT authentication.
- `default-admin-session` bootstrap bypass is removed.
- Storage upload: authenticated users may continue normal SPO uploads; `library-*` SK/MOU uploads require Admin Root or STRUKTURAL.
- Protected storage responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Storage upload is limited to PDF/PNG/JPEG and 15 MB before persistence.
- `Sinkronkan Nomor` has one canonical AdminHub action; duplicate Header actions are removed.
- Protected-document helper treats Admin Root and STRUKTURAL as allowed; VERIFIKATOR is not granted SK/MOU access merely by badge.
