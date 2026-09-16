# SIDOKTER_CODEX_CONTEXT.md

## 1. PROJECT IDENTITY

**Project:** Sistem Dokumen Terpadu Soegiri (SIDOKTER)  
**Primary purpose:** Online integrated document management system for RSUD Dr. Soegiri Lamongan.

SIDOKTER is a production-oriented web application. Changes must prioritize stability, data integrity, security, and backward compatibility.

### Core rule

> **NON-BREAKING CHANGES ONLY unless explicitly requested.**

Do not redesign, remove, rename, or alter existing working functionality merely because another implementation seems cleaner.

---

## 2. CURRENT DEVELOPMENT PRINCIPLE

Before modifying code:

1. Inspect the repository structure.
2. Identify the current implementation and dependencies.
3. Trace the complete data flow.
4. Check existing Firebase integration.
5. Check existing UI behavior.
6. Determine the root cause.
7. Make the smallest safe change.
8. Run build/tests/lint where available.
9. Review the resulting diff.
10. Report exactly what changed and what was verified.

Never assume a function is missing just because it is not found in one component. Search the whole repository.

Do not perform a broad rewrite unless explicitly requested.

---

## 3. TECHNOLOGY / INTEGRATION CONTEXT

SIDOKTER has been developed around:

- React / Vite frontend
- Firebase
- Firestore
- Firebase Storage
- Firebase Cloud Functions
- Firebase Hosting
- GitHub
- Vercel
- Google AI Studio
- PDF.js for PDF rendering
- DOCX processing/import
- Custom application authentication

### Important Firebase context

The application uses Firestore for application data.

The project has historically used a custom authentication implementation rather than relying solely on Firebase Authentication.

Relevant files/components may include:

- `src/lib/authService.ts`
- account service
- password crypto utilities
- Firebase configuration
- Cloud Functions

Do not remove or replace the existing authentication architecture without explicit authorization.

---

# 4. FIREBASE STORAGE REQUIREMENT

This is a critical requirement.

Uploaded documents must be available to **all authorized users/devices**, not only the PC that performed the upload.

### Required behavior

When a user uploads:

- PDF
- DOCX
- supporting evidence/data-support files
- other document attachments supported by the application

the actual binary file must be persisted to **Firebase Storage** when the feature is designed for persistent shared storage.

Firestore should store the corresponding metadata/reference required to retrieve the file.

### Cross-device requirement

Example:

PC 1:
- user uploads `SPO.pdf`

PC 2:
- another authorized user opens the same SPO

PC 2 must be able to retrieve and display/download the same file from Firebase Storage.

Do NOT rely on:

- browser local storage
- IndexedDB as the authoritative copy
- local filesystem paths
- object URLs that only exist in one browser session
- in-memory React state
- temporary local references

These may be used for temporary UI handling, but they are NOT the authoritative persistent document store.

### When auditing uploads, verify the complete chain

```text
User selects file
        ↓
Frontend upload handler
        ↓
Firebase Storage upload
        ↓
Storage path / download reference
        ↓
Firestore metadata
        ↓
Other device reads Firestore
        ↓
Other device retrieves Firebase Storage file
        ↓
Preview / download
```

If any link is missing, diagnose and fix it.

---

# 5. DOCUMENT TYPES

SIDOKTER handles several document types, especially:

- SPO
- SK
- MOU
- supporting evidence/data dukung

PDF and DOCX must be treated appropriately.

## Existing SPO

There are two important upload branches.

### Branch A — PDF

PDF is treated as a fast migration path.

Requirements:

- preserve the original PDF
- do NOT automatically reflow it into the A4 Live SPO editor
- retain the original document
- store it persistently
- allow preview of the original PDF
- allow authorized users to retrieve it from other devices

PDF.js may be used for in-app PDF preview.

### Branch B — DOCX

DOCX can be imported into a Live SPO structure.

Expected extraction targets:

- Judul
- Tanggal
- Pengertian
- Tujuan
- Kebijakan
- Prosedur
- Alur
- Unit Terkait

The resulting content should be compatible with the existing Live SPO editor and A4 preview.

Do not break the existing PDF migration behavior while implementing DOCX improvements.

---

# 6. PDF PREVIEW

SIDOKTER uses PDF.js / a PDF rendering mechanism for uploaded PDFs.

When debugging:

- verify the file URL/reference
- verify Firebase Storage access
- verify CORS where applicable
- verify Storage rules
- verify token/download URL behavior
- verify PDF.js worker configuration
- verify the browser can actually fetch the document
- distinguish frontend rendering errors from Storage permission errors

A generic error such as:

```text
Failed to fetch
```

must NOT automatically be treated as a PDF.js problem.

Trace the request to determine whether the actual problem is:

- missing file
- incorrect Storage path
- invalid download URL
- permission denied
- CORS
- expired/invalid reference
- Cloud Function failure
- frontend URL construction
- PDF.js worker/configuration

---

# 7. SPO WORKFLOW — LOCKED

The SPO input workflow is progressive and sequential.

### Stage 1
**Jenis SPO**

### Stage 2
**Unit Kerja / Hirarki**

### Stage 3
**Form / Batang Tubuh**

Stages should lock/minimize after completion while retaining the ability to edit as designed.

Do not replace this with a different wizard model unless explicitly requested.

---

# 8. SPO BATANG TUBUH ORDER — LOCKED

The standard SPO body order is:

1. Pengertian
2. Tujuan
3. Kebijakan
4. Prosedur
5. Alur (if applicable)
6. Unit Terkait

Do not silently reorder these sections.

---

# 9. SPO PAGE / DOCUMENT FORMAT — LOCKED

### Page

A4.

### Margins

- Left: 3 cm
- Top: 2 cm
- Right: 2 cm
- Bottom: 2 cm

### Font

**Bookman Old Style, 12 pt**

### Pagination

An SPO may be more than one page.

Do NOT force a page break simply to make content fit a page.

Pagination should be content-driven.

---

# 10. SPO TYPES / STATUS

SPO types include:

- SPO Baru
- SPO Arsip
- SPO Riviu

### Statuses — LOCKED

Only these three statuses should exist:

- `DRAFT`
- `AKTIF`
- `DIARSIPKAN`

`MENUNGGU TTD` is treated as `DRAFT`.

Do not reintroduce `TIDAK AKTIF` as a fourth status.

---

# 11. SPO NUMBERING

The current new SPO numbering system uses **4 segments**.

Legacy records may contain numbering formats with:

- 3 segments
- 5 segments

Legacy numbers must remain readable and must not be corrupted merely to enforce the new format.

### Riviu

A Riviu always receives a **new SPO number**.

The old SPO number remains as a reference to the previous document.

### Number reservation

The `Nomor Terbit` reservation list is:

- NOT used for SPO Baru
- used for Riviu

Never assign a reserved Riviu number to a new SPO Baru.

---

# 12. UI / UX LOCKED BASELINE

Do not break the existing UI.

### Main actions

Header includes:

- `+ Daftarkan SPO Baru`
- `Terbitkan Nomor`
- `Nomor Terbit` list

### SPO list

Keep the table simple:

- Nomor SPO
- Judul SPO
- Jenis/Status
- Aksi

**Nomor SPO must be displayed fully.**

Do not truncate it in a way that prevents users from seeing the full number.

Remove the old:

- `Akses: 1 hirarki unit kerja`

panel if it still exists in the current baseline.

---

# 13. RESPONSIVE UI

### Desktop

Use the A4 document-style Batang Tubuh interface.

### Tablet / mobile

Use responsive card-style presentation.

The application must remain usable on:

- desktop
- tablet
- mobile

Do not sacrifice desktop behavior while fixing mobile responsiveness.

---

# 14. A4 PREVIEW

Internal A4 preview margin:

**10 mm**

Column proportions:

- 28%
- 24%
- 24%
- 24%

Keep these proportions unless explicitly instructed otherwise.

---

# 15. RICH TEXT

The relevant renderer/editor class is:

```text
rich-text-document-content
```

Rich text behavior should remain compatible with existing documents.

Existing toolbar behavior, including:

- bullets
- numbering
- rich text formatting

must not be broken when changing editor functionality.

---

# 16. ADMIN / USER UI

Admin should use essentially the same UI as User, with additional privileges.

A `Struktural` badge grants access to:

- SK
- MOU

Sidebar baseline:

- Dashboard
- SPO
- SK
- MOU
- Arsip Digital (Library)
- Profile
- Logout

Do not create unnecessary separate admin interfaces unless required.

---

# 17. SECURITY PRINCIPLES

Treat SIDOKTER as a real online multi-device application.

Never solve a persistence/security problem by moving data into client-only storage.

Audit:

- authentication
- authorization
- Firestore rules
- Storage rules
- Cloud Functions permissions
- exposed credentials
- session handling
- document access control
- download URLs
- upload validation

Never hard-code service-account private keys or secret credentials into frontend code.

Never expose Firebase Admin credentials to the browser.

---

# 18. CLOUD FUNCTIONS

The project has used Firebase Functions including functionality conceptually corresponding to:

- `authApi`
- `storageApi`
- `pdfApi`
- `createNotification`

When debugging Functions:

1. Inspect the deployed/current source.
2. Verify dependencies.
3. Verify runtime version.
4. Verify exports.
5. Verify Firebase project configuration.
6. Verify IAM/service-account permissions.
7. Verify environment configuration.
8. Run the function locally where possible.
9. Build before deployment.
10. Deploy only after confirming the intended target project.

Historical problems have included:

- HTTP 500
- permission denied
- missing `firebase-functions`
- service-account permission problems
- deployment showing zero functions
- build script problems

Do not assume these problems are still present; verify the current repository.

---

# 19. FIREBASE PROJECT

The intended Firebase project has been:

```text
sidokter-soegiri
```

Hosting has been associated with:

```text
sidokter-soegiri.web.app
```

Before deployment, verify the active Firebase project rather than blindly deploying.

Use the repository's current Firebase configuration as the source of truth.

---

# 20. DEPLOYMENT SAFETY

Before deployment:

```text
inspect
→ build
→ test
→ review diff
→ verify Firebase project
→ deploy
→ verify production
```

Never deploy to an unknown Firebase project.

Never delete or recreate Firebase resources as a first response to a bug.

Do not remove existing production data to solve application bugs.

---

# 21. DATABASE / DATA INTEGRITY

Firestore contains application metadata/data.

When changing schemas:

- preserve existing records
- support legacy records where practical
- avoid destructive migrations
- do not rename fields without considering existing data
- do not silently delete unknown fields
- document migrations

If a migration is necessary, make it explicit and reversible where possible.

---

# 22. DOCUMENT METADATA

For every persistent uploaded document, determine and preserve appropriate metadata, such as:

- document ID
- original filename
- MIME type
- file size
- Storage path
- download/reference URL as appropriate
- upload timestamp
- uploader
- associated document/SPO ID
- document type
- status

Do not store only a browser-local object URL as the document reference.

---

# 23. AUDIT METHODOLOGY

When asked to audit SIDOKTER:

### Phase 1 — Repository audit

Inspect:

- `package.json`
- source tree
- Firebase configuration
- Functions
- Storage code
- Firestore code
- upload components
- document viewers
- PDF.js integration
- DOCX import
- rules
- deployment configuration

### Phase 2 — Trace

For every important feature, trace:

```text
UI
→ service
→ Firebase/API
→ database/storage
→ response
→ UI
```

### Phase 3 — Identify defects

Classify issues:

- Critical
- High
- Medium
- Low
- Informational

Do not invent bugs.

### Phase 4 — Fix

Fix confirmed issues with the smallest safe change.

### Phase 5 — Verify

Run available:

- build
- tests
- lint
- type checking
- deployment validation

### Phase 6 — Report

Report:

- issue
- root cause
- files changed
- fix
- verification performed
- remaining risks

---

# 24. IMPORTANT: DO NOT CONFUSE LOCAL SUCCESS WITH PRODUCTION SUCCESS

A feature working on PC 1 does not prove it works online.

For shared document functionality, explicitly test:

### Upload test

PC 1:

```text
Upload PDF/DOCX/data support
→ confirm Firebase Storage object exists
→ confirm Firestore metadata exists
```

### Cross-device test

PC 2:

```text
Open same record
→ retrieve metadata
→ retrieve Storage object
→ preview/download
```

### Persistence test

Refresh/re-login:

```text
file remains available
```

This is mandatory for document persistence fixes.

---

# 25. GIT WORKFLOW

Prefer small, logical commits.

Example:

```text
fix(storage): persist uploaded documents to Firebase Storage
fix(pdf): repair PDF preview retrieval
fix(docx): preserve imported SPO sections
fix(firebase): correct storage permissions
```

Avoid giant commits containing unrelated changes.

Before modifying a file, understand whether it is already part of an important working baseline.

---

# 26. DO NOT BREAK THESE FEATURES

Unless explicitly requested, do not break:

- SPO Baru
- SPO Existing
- SPO Riviu
- SPO numbering
- status model
- A4 preview
- PDF upload
- PDF preview
- DOCX import
- Firebase Storage persistence
- Firestore persistence
- cross-device document retrieval
- SK
- MOU
- Arsip Digital
- authentication
- responsive UI
- existing document records

---

# 27. RESPONSE FORMAT FOR CODEX TASKS

After completing a task, provide a concise report containing:

## Summary

What was changed.

## Root Cause

What actually caused the problem.

## Files Changed

List the important files.

## Verification

List commands/tests/build checks performed.

## Firebase Verification

If applicable, state:

- Firestore verified
- Storage verified
- Functions verified
- rules/config verified

Do not claim something was verified if it was not actually checked.

## Remaining Issues

Clearly list anything unresolved.

---

# 28. DEFAULT INSTRUCTION TO CODEX

Use this as the default operating instruction:

> You are working on SIDOKTER (Sistem Dokumen Terpadu Soegiri), a production-oriented document management application.
>
> Read this entire `SIDOKTER_CODEX_CONTEXT.md` before modifying the repository.
>
> Preserve the existing UI/UX and application behavior. Make non-breaking changes only unless explicitly instructed otherwise.
>
> Do not rewrite the application unnecessarily.
>
> Before coding, inspect the repository and trace the relevant data flow. Identify the actual root cause. Make the smallest safe fix. Run build/tests/type checks/lint where available. Review the diff.
>
> For document persistence, Firebase Storage is the authoritative shared binary-file store. Firestore should contain the metadata/reference needed to retrieve those files. A file existing only in browser memory, local storage, IndexedDB, or a local object URL is not considered successfully persisted.
>
> For every upload-related fix, verify the complete flow from upload → Firebase Storage → Firestore metadata → retrieval from another device → preview/download.
>
> Preserve the locked SIDOKTER rules in this document, especially SPO workflow, numbering, statuses, A4 formatting, PDF Existing behavior, DOCX import behavior, responsive UI, and Firebase architecture.
>
> Never claim a test or Firebase behavior was verified unless you actually verified it.
>
> If a requested change conflicts with this baseline, explicitly identify the conflict before implementing it.

---

# 29. CURRENT PRIORITY FOR THE DOCUMENT SYSTEM

When working on the current document-upload problem, prioritize:

1. Firebase Storage persistence
2. Firestore metadata/reference integrity
3. Cross-PC / cross-browser retrieval
4. PDF preview
5. DOCX import
6. supporting-document persistence
7. Storage/Firestore permissions
8. Cloud Functions reliability
9. production deployment verification
10. only then UI refinements

The key success criterion is:

> **A document uploaded from one authorized device must be persistently available to another authorized device through the online SIDOKTER system.**

---

# 30. FINAL RULE

**Do not optimize for “code looks cleaner.” Optimize for:**

- working production behavior
- data safety
- cross-device persistence
- security
- compatibility
- minimal regression risk
- verifiable results

SIDOKTER is an existing system, not a greenfield demo.
