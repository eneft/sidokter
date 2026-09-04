# PDF SAFE GOLDEN BASELINE

This build intentionally restores the PDF rendering execution path from the known-working
"PDF Download fix.zip" baseline.

PDF baseline:
- puppeteer-core 25.1.0
- @sparticuz/chromium 149.0.0
- headless: 'shell'
- Chromium's native `chromium.args` preserved
- page.setContent(...)
- page.evaluate() waits for document.fonts.ready and images
- page.evaluate() waits for two animation frames to settle layout
- page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
- A4 pagination remains authoritative in the supplied SPO HTML/CSS
- No file:// navigation
- No CDP Page.setDocumentContent
- No replacement PDF engine
- PDF binary is validated to begin with %PDF-

Important:
The renderer was restored to the known-working baseline rather than adding experimental
Chromium lifecycle changes. The rest of the project is kept from Final versin.zip.
