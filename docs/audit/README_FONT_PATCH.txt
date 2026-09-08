FONT/PAGINATION PATCH

Root cause found:
- The PDF renderer used Bookman Old Style.
- The official browser preview/pagination CSS still forced .font-bookman and SPO body content to Times New Roman.
- Pagination was therefore measured with different font metrics than the PDF renderer. Line wrapping changed and later pages could become displaced/broken.

Fix:
- Added bundled Bookman Old Style @font-face declarations.
- Scoped an authoritative Bookman rule to the official A4 document, measurement canvas, preview pages and official print document.
- Kept unrelated application typography untouched.
- PDF renderer now uses font-display:block and disables font synthesis.
- No workflow, numbering, access, signature/stamp, SK/MOU, dashboard or other baseline logic was changed.
