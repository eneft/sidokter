# AUDIT DOCX IMPORT — SECOND PASS

Status: PATCHED

Findings:
1. The DOCX import UI was present in the Stage 3 sections of UserView and PetugasView.
2. PetugasView had an incomplete patch: it referenced `parseSopFromDocx` and `FileUp` without importing them. This would fail a real TypeScript/Vite build.
3. This pass adds both missing imports to PetugasView.
4. UserView already imports both symbols.
5. UploadSopModal already imports the parser and uses the existing Upload icon.
6. The DOCX handler writes only to editable SPO fields and does not assign the source Word file to `selectedFile`/attachment state.
7. The UI button is guarded by `documentType === 'BARU'`, so it is not displayed for LAMA/REVIEW.
8. ZIP integrity passed with `unzip -t`.
9. Full dependency installation/build could not be completed in this isolated audit environment because `npm install --ignore-scripts --no-audit --no-fund` timed out. A source-only TypeScript run therefore reports missing installed packages, not a clean full build result.

Changed in this pass:
- src/components/PetugasView.tsx: add `FileUp` import.
- src/components/PetugasView.tsx: add `parseSopFromDocx` import.
