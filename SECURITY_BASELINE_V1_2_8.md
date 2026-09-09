# SIDOKTER SECURITY BASELINE V1.2.8

## Locked permission model
- ADMIN = Admin Root.
- VERIFIKATOR = badge kewenangan verifikasi/aktivasi SPO sesuai hirarki.
- STRUKTURAL = badge akses struktural; memiliki akses SPO global dan akses SK/MOU upload/view/download sesuai baseline.
- VERIFIKATOR tidak otomatis memperoleh hak SK/MOU hanya karena badge.

## Storage authorization
- Storage file ID/prefix is classification metadata only, never the authorization boundary.
- Server-issued session is authoritative for identity.
- Storage metadata is server-derived from the authenticated session; client cannot assign ownerUid, accessKeys, or globalAccess.
- Download fails closed when authoritative storage metadata is unavailable.
- Access is granted to Admin Root, STRUKTURAL/global resources, file owner, or matching server-derived hierarchy access keys.
- Protected storage responses are private/no-store and nosniff.
- Upload ceiling is 15 MB and client image ceiling is aligned to 15 MB.

## Firestore
- STRUKTURAL is included in global SPO read authorization.
- SK/MOU remains Admin Root + STRUKTURAL for read/create; update/delete Admin Root.

## UI
- Existing design is retained; responsive 3/2/1 card grid.
- SPO table: Nomor SPO | Judul SPO | Status | Aksi.
- Title opens Preview; no Preview/Download buttons in table; download is in Preview when permitted.
- Buka SPO remains primary action.
- Sinkronkan Nomor has one main access point.
