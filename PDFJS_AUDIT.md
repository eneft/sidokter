# PDF.js Removal Audit

## Scope and result

The requested `SIDOKTER_CODEX_CONTEXT.md` file is not present anywhere under
`/workspace`; the audit therefore proceeded from the checked-out repository.

At audit time (before removal), PDF.js was used only by the browser-side `DocumentViewer` component:

- `src/components/DocumentViewer.tsx` imports `pdfjs-dist` and its Vite URL
  worker, configures `GlobalWorkerOptions.workerSrc`, fetches protected storage
  files into memory, and invokes `getDocument()` to render every page onto a
  canvas.
- `package.json` declares `pdfjs-dist`. There is no PDF.js-specific Vite
  configuration, worker asset outside that package import, or viewer-specific
  stylesheet.

`pdf-lib`, Puppeteer, `/api/pdf`, and the Cloud Function `pdfApi` are separate
server-side PDF *generation* facilities and are not PDF.js. They are outside
this removal because they preserve the locked A4 SPO export workflow.

## Current persisted-file flow

1. SPO, SK, and MOU upload code calls `uploadFileToCloudStorage`.
2. The client sends the binary to the authenticated `/api/storage/upload`
   endpoint.
3. `storageApi` writes the binary to Firebase Storage and stores an index record
   in Firestore collection `storage_files`; client services save the resulting
   protected URL and durable `storagePath` in the SPO or library-document
   Firestore metadata.
4. Retrieval resolves the protected storage URL/path with authenticated headers.
5. Before removal, `DocumentViewer` downloaded the binary and gave it to PDF.js
   for canvas rendering. Downloads use the same authenticated storage retrieval.

PDF.js has no dependency on Firebase Storage, Firestore metadata, routing, or
SPO status/numbering. It is only the final rendering step, but its worker/CDN
fallback, PDF parsing, and per-page canvas lifecycle can make the viewer
unstable.

## Planned minimal change

Replace the PDF.js canvas renderer with an authenticated fetch that creates a
short-lived Blob URL and displays that URL in a native browser `<iframe>`. Keep
all upload, Storage, Firestore, metadata, path fallback, and download code
unchanged. Remove the package and the PDF.js-only polyfill if unused after the
viewer change.
