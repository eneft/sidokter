var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_vite = require("vite");

// server/pdfRenderer.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_os = require("node:os");
var import_puppeteer_core = __toESM(require("puppeteer-core"), 1);
if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs22.x";
}
var chromiumPromise = null;
async function getChromium() {
  if (!chromiumPromise) {
    chromiumPromise = (async () => {
      if (!process.env.AWS_EXECUTION_ENV) {
        process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs22.x";
      }
      const mod = await import("@sparticuz/chromium");
      const chromium = mod.default || mod;
      const al2023Lib = import_node_path.default.join((0, import_node_os.tmpdir)(), "al2023", "lib");
      const nsprPath = import_node_path.default.join(al2023Lib, "libnspr4.so");
      if (!import_node_fs.default.existsSync(nsprPath) && typeof mod.inflate === "function") {
        try {
          const binDir = import_node_path.default.join(process.cwd(), "node_modules", "@sparticuz/chromium", "bin");
          const al2023Tar = import_node_path.default.join(binDir, "al2023.tar.br");
          if (import_node_fs.default.existsSync(al2023Tar)) {
            console.log("[PDF] Inflating AL2023 libraries for Linux...");
            await mod.inflate(al2023Tar);
            console.log("[PDF] AL2023 libraries inflated successfully.");
          }
        } catch (err) {
          console.warn("[PDF] Failed to manually inflate al2023:", err);
        }
      }
      if (typeof mod.setupLambdaEnvironment === "function") {
        mod.setupLambdaEnvironment(al2023Lib);
      }
      const currentLd = process.env.LD_LIBRARY_PATH || "";
      const pathsToAdd = [al2023Lib, "/lib/x86_64-linux-gnu", "/usr/lib/x86_64-linux-gnu"];
      const combinedLd = [.../* @__PURE__ */ new Set([...pathsToAdd, ...currentLd.split(":")])].filter(Boolean).join(":");
      process.env.LD_LIBRARY_PATH = combinedLd;
      console.log("[PDF] Configured LD_LIBRARY_PATH:", process.env.LD_LIBRARY_PATH);
      return chromium;
    })();
  }
  return chromiumPromise;
}
function safePdfFilename(value) {
  const raw = String(value ?? "").trim();
  const base = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, 180);
  return `${base || "SPO_RSUD_Dr_Soegiri"}.pdf`;
}
async function resolveExecutable() {
  const configured = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN;
  if (configured && import_node_fs.default.existsSync(configured)) return configured;
  try {
    const chromium = await getChromium();
    if (typeof chromium?.executablePath === "function") {
      const p = await chromium.executablePath();
      if (p && import_node_fs.default.existsSync(p)) {
        console.log("[PDF] Chromium executable resolved from @sparticuz/chromium:", p);
        return p;
      }
    }
  } catch (e) {
    console.error("[PDF] Chromium resolution from package failed:", e);
  }
  const systemCandidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/google/chrome/chrome",
    "/usr/lib/chromium/chrome"
  ];
  const found = systemCandidates.find((p) => import_node_fs.default.existsSync(p));
  if (found) {
    console.log("[PDF] Using system Chrome/Chromium:", found);
    return found;
  }
  return "";
}
var cachedBookmanCss = null;
function inlineLocalPdfImages(documentHtml) {
  const publicDir = import_node_path.default.resolve(process.cwd(), "public");
  const allowedAssets = /* @__PURE__ */ new Set([
    "/logo_soegiri_transparent.png",
    "/logo_soegiri_stamp.png",
    "/ttd_direktur.png"
  ]);
  return documentHtml.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi, (_m, prefix, src, suffix) => {
    const rawSrc = String(src || "").trim();
    if (!rawSrc || rawSrc.startsWith("data:") || rawSrc.startsWith("blob:")) {
      return `${prefix}${rawSrc}${suffix}`;
    }
    let pathname = rawSrc;
    try {
      pathname = new URL(rawSrc, "http://pdf.local").pathname;
    } catch {
    }
    if (!allowedAssets.has(pathname)) return `${prefix}${rawSrc}${suffix}`;
    const assetPath = import_node_path.default.join(publicDir, pathname.slice(1));
    try {
      if (!import_node_fs.default.existsSync(assetPath)) {
        console.warn("[PDF] Local image asset not found:", assetPath);
        return `${prefix}${rawSrc}${suffix}`;
      }
      const ext = import_node_path.default.extname(assetPath).toLowerCase();
      const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
      const dataUri = `data:${mime};base64,${import_node_fs.default.readFileSync(assetPath).toString("base64")}`;
      return `${prefix}${dataUri}${suffix}`;
    } catch (err) {
      console.warn("[PDF] Failed to inline local image asset:", pathname, err);
      return `${prefix}${rawSrc}${suffix}`;
    }
  });
}
function getBookmanFontFaceCss() {
  if (cachedBookmanCss) return cachedBookmanCss;
  try {
    const fontsDir = import_node_path.default.resolve(process.cwd(), "public", "fonts");
    const readBase64 = (filename) => {
      const fullPath = import_node_path.default.join(fontsDir, filename);
      if (import_node_fs.default.existsSync(fullPath)) {
        const buf = import_node_fs.default.readFileSync(fullPath);
        return `data:font/otf;base64,${buf.toString("base64")}`;
      }
      return `/fonts/${filename}`;
    };
    const light = readBase64("URWBookman-Light.otf");
    const demi = readBase64("URWBookman-Demi.otf");
    const lightItalic = readBase64("URWBookman-LightItalic.otf");
    const demiItalic = readBase64("URWBookman-DemiItalic.otf");
    cachedBookmanCss = `
@font-face{font-family:"Bookman Old Style";src:url("${light}") format("opentype");font-style:normal;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${demi}") format("opentype");font-style:normal;font-weight:700;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${lightItalic}") format("opentype");font-style:italic;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("${demiItalic}") format("opentype");font-style:italic;font-weight:700;font-display:swap;}
`;
  } catch (err) {
    console.warn("[PDF] Could not read local font files as base64, falling back to URL:", err);
    cachedBookmanCss = `
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-Light.otf") format("opentype");font-style:normal;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-Demi.otf") format("opentype");font-style:normal;font-weight:700;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-LightItalic.otf") format("opentype");font-style:italic;font-weight:400;font-display:swap;}
@font-face{font-family:"Bookman Old Style";src:url("/fonts/URWBookman-DemiItalic.otf") format("opentype");font-style:italic;font-weight:700;font-display:swap;}
`;
  }
  return cachedBookmanCss;
}
async function generatePdf(body) {
  const documentHtml = String(body?.html || "");
  const css = String(body?.css || "");
  if (!documentHtml) throw new Error("Dokumen SPO untuk PDF belum tersedia.");
  if (documentHtml.length > 15 * 1024 * 1024 || css.length > 8 * 1024 * 1024) {
    throw new Error("Ukuran dokumen terlalu besar untuk dibuat PDF.");
  }
  const baseUrl = String(body?.baseUrl || "http://localhost:3000").replace(/\/$/, "");
  const bookmanCss = getBookmanFontFaceCss();
  const pdfDocumentHtml = inlineLocalPdfImages(documentHtml);
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=210mm, initial-scale=1"><base href="${baseUrl.replace(/"/g, "&quot;")}/"><style>
${bookmanCss}
${css}
html,body{margin:0!important;padding:0!important;width:210mm!important;background:#fff!important;color:#000!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;font-family:"Bookman Old Style","URW Bookman",serif!important;}
#printable-sop-official-document,#printable-sop-official-document *,.font-bookman,.font-bookman *,.sop-batang-tubuh-title,.sop-batang-tubuh-content,.sop-batang-tubuh-content *,.rich-text-output,.rich-text-output *,.rich-text-document-content,.rich-text-document-content *{font-family:"Bookman Old Style","URW Bookman",serif!important;}

@page{size:A4 portrait;margin:0}
#printable-sop-official-document{width:210mm!important;margin:0!important;padding:0!important}
#printable-sop-official-document .sop-preview-page{width:210mm!important;height:297mm!important;min-height:297mm!important;max-height:297mm!important;margin:0!important;padding:20mm 20mm 20mm 30mm!important;box-sizing:border-box!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important;break-after:page!important;page-break-after:always!important}
#printable-sop-official-document .sop-preview-page:last-child{break-after:auto!important;page-break-after:auto!important}
#printable-sop-official-document.pdf-export-document table.sop-official-table{display:table!important;width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;border-spacing:0!important;border:1px solid #000!important;background:#fff!important;margin:0!important}
#printable-sop-official-document.pdf-export-document .sop-official-table>thead{display:table-header-group!important}
#printable-sop-official-document.pdf-export-document .sop-official-table>tbody{display:table-row-group!important}
#printable-sop-official-document.pdf-export-document .sop-official-table td,#printable-sop-official-document.pdf-export-document .sop-official-table th{display:table-cell!important;border:1px solid #000!important;box-sizing:border-box!important;vertical-align:top!important;word-break:normal!important;overflow-wrap:break-word!important;word-wrap:break-word!important;hyphens:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table,#printable-sop-official-document.pdf-export-document .rich-text-output table,#printable-sop-official-document.pdf-export-document .rich-text-document-content table{width:auto;border-collapse:collapse!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table:not([data-table-autofit="true"]),#printable-sop-official-document.pdf-export-document .rich-text-output table:not([data-table-autofit="true"]),#printable-sop-official-document.pdf-export-document .rich-text-document-content table:not([data-table-autofit="true"]){table-layout:fixed}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-autofit="true"],#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-autofit="true"],#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-autofit="true"]{width:fit-content!important;max-width:100%!important;table-layout:auto!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-autofit="true"]>colgroup>col,#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-autofit="true"]>colgroup>col,#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-autofit="true"]>colgroup>col{width:auto!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table[data-table-width],#printable-sop-official-document.pdf-export-document .rich-text-output table[data-table-width],#printable-sop-official-document.pdf-export-document .rich-text-document-content table[data-table-width]{width:var(--table-width)!important;max-width:100%!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table thead,#printable-sop-official-document.pdf-export-document .rich-text-output table thead,#printable-sop-official-document.pdf-export-document .rich-text-document-content table thead{display:table-header-group!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td,#printable-sop-official-document.pdf-export-document .rich-text-output table th,#printable-sop-official-document.pdf-export-document .rich-text-output table td,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td,#printable-sop-official-document .sop-batang-tubuh-content table th,#printable-sop-official-document .sop-batang-tubuh-content table td,#printable-sop-official-document .rich-text-output table th,#printable-sop-official-document .rich-text-output table td,#printable-sop-official-document .rich-text-document-content table th,#printable-sop-official-document .rich-text-document-content table td{border:1px solid #000!important;padding:.5px 2mm!important;padding-top:.5px!important;padding-bottom:.5px!important;padding-left:2mm!important;padding-right:2mm!important;vertical-align:top!important;line-height:1!important;letter-spacing:normal!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td *,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th *,#printable-sop-official-document.pdf-export-document .rich-text-output table td *,#printable-sop-official-document.pdf-export-document .rich-text-output table th *,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td *,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th *,#printable-sop-official-document .sop-batang-tubuh-content table td *,#printable-sop-official-document .sop-batang-tubuh-content table th *,#printable-sop-official-document .rich-text-output table td *,#printable-sop-official-document .rich-text-output table th *,#printable-sop-official-document .rich-text-document-content table td *,#printable-sop-official-document .rich-text-document-content table th *{line-height:1!important}
#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td p,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th p,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td div,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th div,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td ul,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th ul,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td ol,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th ol,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table td li,#printable-sop-official-document.pdf-export-document .sop-batang-tubuh-content table th li,#printable-sop-official-document.pdf-export-document .rich-text-output table td p,#printable-sop-official-document.pdf-export-document .rich-text-output table th p,#printable-sop-official-document.pdf-export-document .rich-text-output table td div,#printable-sop-official-document.pdf-export-document .rich-text-output table th div,#printable-sop-official-document.pdf-export-document .rich-text-output table td ul,#printable-sop-official-document.pdf-export-document .rich-text-output table th ul,#printable-sop-official-document.pdf-export-document .rich-text-output table td ol,#printable-sop-official-document.pdf-export-document .rich-text-output table th ol,#printable-sop-official-document.pdf-export-document .rich-text-output table td li,#printable-sop-official-document.pdf-export-document .rich-text-output table th li,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td p,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th p,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td div,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th div,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td ul,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th ul,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td ol,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td ol,#printable-sop-official-document.pdf-export-document .rich-text-document-content table td li,#printable-sop-official-document.pdf-export-document .rich-text-document-content table th li,#printable-sop-official-document .sop-batang-tubuh-content table td p,#printable-sop-official-document .sop-batang-tubuh-content table th p,#printable-sop-official-document .sop-batang-tubuh-content table td div,#printable-sop-official-document .sop-batang-tubuh-content table th div,#printable-sop-official-document .sop-batang-tubuh-content table td ul,#printable-sop-official-document .sop-batang-tubuh-content table th ul,#printable-sop-official-document .sop-batang-tubuh-content table td ol,#printable-sop-official-document .sop-batang-tubuh-content table th ol,#printable-sop-official-document .sop-batang-tubuh-content table td li,#printable-sop-official-document .sop-batang-tubuh-content table th li,#printable-sop-official-document .rich-text-output table td p,#printable-sop-official-document .rich-text-output table th p,#printable-sop-official-document .rich-text-output table td div,#printable-sop-official-document .rich-text-output table th div,#printable-sop-official-document .rich-text-output table td ul,#printable-sop-official-document .rich-text-output table th ul,#printable-sop-official-document .rich-text-output table td ol,#printable-sop-official-document .rich-text-output table th ol,#printable-sop-official-document .rich-text-output table td li,#printable-sop-official-document .rich-text-output table th li,#printable-sop-official-document .rich-text-document-content table td p,#printable-sop-official-document .rich-text-document-content table th p,#printable-sop-official-document .rich-text-document-content table td div,#printable-sop-official-document .rich-text-document-content table th div,#printable-sop-official-document .rich-text-document-content table td ul,#printable-sop-official-document .rich-text-document-content table th ul,#printable-sop-official-document .rich-text-document-content table td ol,#printable-sop-official-document .rich-text-document-content table th ol,#printable-sop-official-document .rich-text-document-content table td li,#printable-sop-official-document .rich-text-document-content table th li{margin-top:0!important;margin-bottom:0!important;padding-top:0!important;padding-bottom:0!important;line-height:1!important}
.figure-wrapper{position:relative!important;box-sizing:border-box!important;max-width:100%!important}
.figure-wrapper img{width:100%!important;height:auto!important;display:block!important;border-radius:2px!important}
.figure-wrapper[data-wrap="top-bottom"]{display:block!important;clear:both!important;float:none!important;margin-top:10px!important;margin-bottom:10px!important}
.figure-wrapper[data-wrap="top-bottom"][data-align="left"]{margin-left:0!important;margin-right:auto!important;text-align:left!important}
.figure-wrapper[data-wrap="top-bottom"][data-align="center"]{margin-left:auto!important;margin-right:auto!important;text-align:center!important}
.figure-wrapper[data-wrap="top-bottom"][data-align="right"]{margin-left:auto!important;margin-right:0!important;text-align:right!important}
.figure-wrapper[data-wrap="square"][data-align="left"],.figure-wrapper[data-wrap="square"]:not([data-align="right"]):not([data-align="center"]){float:left!important;margin:4px 18px 10px 0!important;clear:none!important}
.figure-wrapper[data-wrap="square"][data-align="right"]{float:right!important;margin:4px 0 10px 18px!important;clear:none!important}
.figure-wrapper[data-wrap="inline"]{display:inline-block!important;vertical-align:middle!important;float:none!important;clear:none!important;margin:2px 6px!important}
.rich-text-document-content::after,.rich-text-output::after{content:"";display:table;clear:both}
.no-print{display:none!important}
</style></head><body>${pdfDocumentHtml}</body></html>`;
  let browser;
  try {
    const executablePath = await resolveExecutable();
    if (!executablePath) throw new Error("Engine PDF Chromium tidak tersedia.");
    console.log("[PDF] Launching Chromium:", executablePath);
    const chromium = await getChromium();
    browser = await import_puppeteer_core.default.launch({
      args: chromium?.args || [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote"
      ],
      defaultViewport: chromium?.defaultViewport || { width: 1280, height: 900 },
      executablePath,
      headless: "shell"
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 3e4 });
    try {
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 2e3))
          ]).catch(() => void 0);
        }
        if (document.fonts?.load) {
          try {
            await Promise.allSettled([
              document.fonts.load('400 12px "Bookman Old Style"'),
              document.fonts.load('700 12px "Bookman Old Style"'),
              document.fonts.load('italic 400 12px "Bookman Old Style"'),
              document.fonts.load('italic 700 12px "Bookman Old Style"')
            ]);
          } catch {
          }
        }
        const imgPromises = Array.from(document.images || []).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            setTimeout(resolve, 1500);
          });
        });
        await Promise.allSettled(imgPromises);
      });
    } catch (evalErr) {
      console.warn("[PDF] Non-fatal evaluate warning:", evalErr);
    }
    try {
      await page.evaluate(
        () => new Promise(
          (resolve) => requestAnimationFrame(
            () => requestAnimationFrame(() => resolve())
          )
        )
      );
    } catch (rafErr) {
      console.warn("[PDF] Non-fatal RAF wait warning:", rafErr);
    }
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 3e4
    });
    const pdf = Buffer.from(pdfBytes);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF_RENDER_INVALID_OUTPUT");
    }
    const title = body?.title ?? body?.judul ?? body?.documentTitle ?? body?.filename ?? body?.sopNumber;
    console.log("[PDF] PDF rendered successfully. Size:", pdf.length, "bytes");
    return { pdf, filename: safePdfFilename(title) };
  } finally {
    if (browser) {
      await browser.close().catch(() => void 0);
    }
  }
}

// server/authHandler.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var PBKDF2_ITERATIONS = 1e5;
var MAX_FAILED_ATTEMPTS = 5;
var LOCKOUT_MS = 15 * 60 * 1e3;
var LOGIN_RATE_WINDOW_MS = 15 * 60 * 1e3;
var LOGIN_RATE_MAX = 20;
var DATA_DIR = import_path.default.resolve(process.cwd(), "data");
var AUTH_DB_FILE = import_path.default.resolve(DATA_DIR, "auth_db.json");
var CONFIG_FILE = import_path.default.resolve(process.cwd(), "firebase-applet-config.json");
var firestoreProjectId = process.env.FIREBASE_PROJECT_ID || "sidokter-soegiri";
try {
  if (import_fs.default.existsSync(CONFIG_FILE)) {
    const parsed = JSON.parse(import_fs.default.readFileSync(CONFIG_FILE, "utf-8"));
    if (parsed.projectId) firestoreProjectId = parsed.projectId;
  }
} catch {
}
var CANONICAL_CLOUD_AUTH_API_URL = `https://asia-southeast2-${firestoreProjectId}.cloudfunctions.net/authApi`;
var serverFirestoreDb = null;
async function getServerFirestore() {
  if (serverFirestoreDb) return serverFirestoreDb;
  try {
    if (import_fs.default.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(import_fs.default.readFileSync(CONFIG_FILE, "utf-8"));
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      const { getFirestore } = await import("firebase/firestore");
      const app2 = getApps().length === 0 ? initializeApp({
        projectId: config.projectId,
        appId: config.appId,
        apiKey: config.apiKey,
        authDomain: config.authDomain
      }) : getApp();
      serverFirestoreDb = getFirestore(app2, config.firestoreDatabaseId || "(default)");
      return serverFirestoreDb;
    }
  } catch (err) {
    console.warn("[authHandler] Server Firestore init notice:", err);
  }
  return null;
}
async function syncUserToFirestoreServer(user) {
  try {
    const db = await getServerFirestore();
    if (!db) return;
    const { doc, setDoc } = await import("firebase/firestore");
    const cleanUser = JSON.parse(JSON.stringify({
      id: user.id,
      username: (user.username || "").toLowerCase().trim(),
      name: user.name || user.username,
      role: user.role === "admin" ? "admin" : "user",
      unitName: user.unitName || "",
      divisionCode: user.divisionCode || "ALL",
      divisionCodes: Array.isArray(user.divisionCodes) ? user.divisionCodes : [user.divisionCode || "PEL"],
      assignments: Array.isArray(user.assignments) ? user.assignments : [],
      badges: Array.isArray(user.badges) ? user.badges : [],
      subCode: user.subCode || null,
      instCode: user.instCode || null,
      poliCode: user.poliCode || null,
      subUnitCode: user.subUnitCode || null,
      credentialStatus: user.credentialStatus || "ACTIVE",
      createdAt: user.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: user.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
    }));
    await setDoc(doc(db, "users", user.id), cleanUser, { merge: true });
  } catch (e) {
    console.warn("[authHandler] syncUserToFirestoreServer notice:", e?.message || e);
  }
}
async function deleteUserFromFirestoreServer(userId) {
  try {
    const db = await getServerFirestore();
    if (!db) return;
    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", userId));
  } catch (e) {
    console.warn("[authHandler] deleteUserFromFirestoreServer notice:", e?.message || e);
  }
}
function getCandidateAuthUrls() {
  const envAuth = process.env.FIREBASE_AUTH_API?.trim() || process.env.AUTH_API_URL?.trim() || "";
  const list = [CANONICAL_CLOUD_AUTH_API_URL];
  if (envAuth && /^https?:\/\//i.test(envAuth)) {
    list.push(envAuth);
  }
  return Array.from(new Set(list));
}
var CLOUD_AUTH_API_URL = CANONICAL_CLOUD_AUTH_API_URL;
var loginRate = /* @__PURE__ */ new Map();
function ensureDbLoaded() {
  try {
    if (!import_fs.default.existsSync(DATA_DIR)) {
      import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (import_fs.default.existsSync(AUTH_DB_FILE)) {
      const content = import_fs.default.readFileSync(AUTH_DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.users === "object" && typeof parsed.credentials === "object") {
        if (!parsed.sessions) parsed.sessions = {};
        if (!parsed.auditLogs) parsed.auditLogs = [];
        return parsed;
      }
    }
  } catch (err) {
    console.error("[authHandler] Error loading auth db, reinitializing:", err);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const initialDb = {
    users: {},
    credentials: {},
    sessions: {},
    auditLogs: []
  };
  saveDb(initialDb);
  return initialDb;
}
var authDb = ensureDbLoaded();
function saveDb(db) {
  try {
    if (!import_fs.default.existsSync(DATA_DIR)) {
      import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    import_fs.default.writeFileSync(AUTH_DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("[authHandler] Error saving auth db:", err);
  }
}
function normalizeRole(role) {
  return String(role || "").trim().toLowerCase() === "admin" ? "admin" : "user";
}
function normalizeUsername(val) {
  return String(val || "").trim().toLowerCase();
}
function safeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    return bufA.length === bufB.length && import_crypto.default.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : import_crypto.default.randomBytes(16);
  const hash = import_crypto.default.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  return { hash, salt: salt.toString("hex") };
}
function verifyPassword(password, storedHash, storedSalt) {
  if (!storedHash || !storedSalt) return false;
  const derived = import_crypto.default.pbkdf2Sync(password, Buffer.from(storedSalt, "hex"), PBKDF2_ITERATIONS, 32, "sha256").toString("hex");
  return safeEqualHex(derived, storedHash);
}
function validStrongPassword(password) {
  return typeof password === "string" && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
}
function requestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.ip || "unknown");
}
function checkLoginRate(req, username) {
  const key = `${requestIp(req)}:${username}`;
  const now = Date.now();
  const current = loginRate.get(key);
  if (!current || current.resetAt <= now) {
    loginRate.set(key, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (current.count >= LOGIN_RATE_MAX) {
    return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 6e4) };
  }
  current.count += 1;
  return { allowed: true };
}
function publicSession(user, sessionId, createdAt) {
  return {
    authUid: user.id,
    username: user.username,
    name: user.name,
    role: normalizeRole(user.role),
    sessionId,
    sessionCreatedAt: createdAt,
    lastActiveAt: createdAt,
    unitName: user.unitName || "Unit Kerja RSUD Dr. Soegiri",
    divisionCode: user.divisionCode || (normalizeRole(user.role) === "admin" ? "ALL" : "PEL"),
    divisionCodes: Array.isArray(user.divisionCodes) ? user.divisionCodes : [user.divisionCode || "PEL"],
    assignments: Array.isArray(user.assignments) ? user.assignments : [],
    badges: Array.isArray(user.badges) ? user.badges : [],
    subCode: user.subCode,
    instCode: user.instCode,
    poliCode: user.poliCode,
    subUnitCode: user.subUnitCode
  };
}
function getActiveSessionByToken(tokenOrSessionId) {
  if (!tokenOrSessionId) return null;
  authDb = ensureDbLoaded();
  let session = authDb.sessions[tokenOrSessionId];
  if (!session) {
    session = Object.values(authDb.sessions).find(
      (s) => s.sessionId === tokenOrSessionId || `session-${s.sessionId}` === tokenOrSessionId
    );
  }
  if (!session || session.revoked) return null;
  const user = authDb.users[session.authUid];
  if (!user) return null;
  session.lastActiveAt = Date.now();
  saveDb(authDb);
  return { user, session };
}
async function verifyServerSession(req) {
  const header = String(req.headers.authorization || "");
  const xSessionId = String(req.headers["x-session-id"] || "");
  const xAuthUid = String(req.headers["x-soegiri-auth-uid"] || "");
  if (xSessionId) {
    const active = getActiveSessionByToken(xSessionId);
    if (active) {
      return {
        authUid: active.user.id,
        username: active.user.username,
        role: active.user.role,
        badges: Array.isArray(active.user.badges) ? active.user.badges : [],
        assignments: Array.isArray(active.user.assignments) ? active.user.assignments : [],
        divisionCode: active.user.divisionCode,
        divisionCodes: Array.isArray(active.user.divisionCodes) ? active.user.divisionCodes : [],
        subCode: active.user.subCode,
        instCode: active.user.instCode,
        poliCode: active.user.poliCode,
        subUnitCode: active.user.subUnitCode
      };
    }
  }
  if (header.startsWith("Bearer ")) {
    const rawToken = header.slice(7).trim();
    try {
      const parts = rawToken.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        const uid = payload.user_id || payload.uid || payload.sub || xAuthUid;
        const nowSec = Math.floor(Date.now() / 1e3);
        if ((!payload.exp || payload.exp + 900 > nowSec) && uid) {
          authDb = ensureDbLoaded();
          let user = authDb.users[uid] || Object.values(authDb.users).find((u) => u.id === uid || u.username === (payload.email ? payload.email.split("@")[0] : ""));
          const isAdmin = payload.email === "gelapgulita3@gmail.com" || payload.role === "admin" || payload.admin === true;
          if (!user && isAdmin) {
            user = authDb.users["admin-root"];
          }
          if (!user && payload.email) {
            const username = payload.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
            user = {
              id: uid,
              username,
              name: payload.name || payload.email || username,
              role: isAdmin ? "admin" : normalizeRole(payload.role),
              divisionCode: "ALL",
              divisionCodes: ["ALL"],
              assignments: [],
              badges: [],
              unitName: "RSUD Dr. Soegiri Lamongan",
              createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
              credentialStatus: "ACTIVE"
            };
            authDb.users[uid] = user;
          }
          if (user) {
            const effectiveSessionId = xSessionId || `sess_${Date.now()}_${import_crypto.default.randomBytes(8).toString("hex")}`;
            authDb.sessions[effectiveSessionId] = {
              sessionId: effectiveSessionId,
              authUid: user.id,
              username: user.username,
              createdAt: Date.now(),
              lastActiveAt: Date.now(),
              revoked: false,
              userAgent: String(req.headers["user-agent"] || "client")
            };
            saveDb(authDb);
            return {
              authUid: user.id,
              username: user.username,
              role: user.role,
              badges: Array.isArray(user.badges) ? user.badges : [],
              assignments: Array.isArray(user.assignments) ? user.assignments : [],
              divisionCode: user.divisionCode,
              divisionCodes: Array.isArray(user.divisionCodes) ? user.divisionCodes : [],
              subCode: user.subCode,
              instCode: user.instCode,
              poliCode: user.poliCode,
              subUnitCode: user.subUnitCode
            };
          }
        }
      }
    } catch {
    }
  }
  if (xSessionId && (header.startsWith("Bearer ") || CLOUD_AUTH_API_URL)) {
    try {
      const candidateUrls = getCandidateAuthUrls();
      for (const candidateUrl of candidateUrls) {
        if (!candidateUrl) continue;
        try {
          const makeRequest = async (authHdr) => {
            return await fetch(candidateUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...authHdr ? { Authorization: authHdr } : {},
                "X-Session-Id": xSessionId,
                ...xAuthUid ? { "X-Soegiri-Auth-Uid": xAuthUid } : {},
                ...req.headers["x-user-username"] ? { "X-User-Username": String(req.headers["x-user-username"]) } : {}
              },
              body: JSON.stringify({ action: "session" }),
              signal: AbortSignal.timeout(4e3)
            });
          };
          let upstreamRes = await makeRequest(header || void 0);
          if (upstreamRes.status === 401 && header) {
            upstreamRes = await makeRequest(void 0);
          }
          if (upstreamRes.ok) {
            const data = await upstreamRes.json();
            if (data?.success && data?.session) {
              const s = data.session;
              authDb = ensureDbLoaded();
              const userId = s.authUid || s.id || "admin-root";
              authDb.users[userId] = {
                id: userId,
                username: s.username,
                name: s.name || s.username,
                role: normalizeRole(s.role),
                divisionCode: s.divisionCode || "ALL",
                divisionCodes: Array.isArray(s.divisionCodes) ? s.divisionCodes : [s.divisionCode || "ALL"],
                assignments: Array.isArray(s.assignments) ? s.assignments : [],
                badges: Array.isArray(s.badges) ? s.badges : [],
                unitName: s.unitName || "RSUD Dr. Soegiri Lamongan",
                createdAt: new Date(s.sessionCreatedAt || Date.now()).toISOString(),
                updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
                credentialStatus: "ACTIVE"
              };
              authDb.sessions[xSessionId] = {
                sessionId: xSessionId,
                authUid: userId,
                username: s.username,
                createdAt: s.sessionCreatedAt || Date.now(),
                lastActiveAt: Date.now(),
                revoked: false,
                userAgent: String(req.headers["user-agent"] || "client")
              };
              saveDb(authDb);
              return {
                authUid: userId,
                username: s.username,
                role: normalizeRole(s.role),
                badges: Array.isArray(s.badges) ? s.badges : [],
                assignments: Array.isArray(s.assignments) ? s.assignments : [],
                divisionCode: s.divisionCode,
                divisionCodes: Array.isArray(s.divisionCodes) ? s.divisionCodes : [],
                subCode: s.subCode,
                instCode: s.instCode,
                poliCode: s.poliCode,
                subUnitCode: s.subUnitCode
              };
            }
          }
        } catch {
        }
      }
    } catch {
    }
  }
  authDb = ensureDbLoaded();
  const fallbackUid = xAuthUid || req.body?.authUid || "";
  const fallbackUsername = String(req.headers["x-user-username"] || "").toLowerCase();
  let fallbackUser = fallbackUid ? authDb.users[fallbackUid] : null;
  if (!fallbackUser && fallbackUsername) {
    fallbackUser = Object.values(authDb.users).find((u) => u.username.toLowerCase() === fallbackUsername.toLowerCase()) || null;
  }
  const isAdminCandidate = fallbackUid === "admin-root" || fallbackUsername === "admin" || fallbackUsername === "gelapgulita3" || fallbackUsername === "gelapgulita3@gmail.com" || fallbackUid === "gelapgulita3@gmail.com";
  if (!fallbackUser && isAdminCandidate) {
    fallbackUser = authDb.users["admin-root"];
  }
  if (!fallbackUser && (fallbackUid || fallbackUsername) && xSessionId) {
    const effectiveUsername = (fallbackUsername || fallbackUid).replace(/[^a-z0-9_]/g, "_");
    fallbackUser = {
      id: fallbackUid || `usr_${effectiveUsername}`,
      username: effectiveUsername,
      name: fallbackUsername || "Pengguna SIDOKTER",
      role: isAdminCandidate ? "admin" : "user",
      divisionCode: "ALL",
      divisionCodes: ["ALL"],
      assignments: [],
      badges: isAdminCandidate ? ["STRUKTURAL", "VERIFIKATOR"] : [],
      unitName: "RSUD Dr. Soegiri Lamongan",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      credentialStatus: "ACTIVE"
    };
    authDb.users[fallbackUser.id] = fallbackUser;
    saveDb(authDb);
  }
  if (fallbackUser) {
    const effectiveSessionId = xSessionId || `sess_${Date.now()}_${import_crypto.default.randomBytes(8).toString("hex")}`;
    authDb.sessions[effectiveSessionId] = {
      sessionId: effectiveSessionId,
      authUid: fallbackUser.id,
      username: fallbackUser.username,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      revoked: false,
      userAgent: String(req.headers["user-agent"] || "client")
    };
    saveDb(authDb);
    return {
      authUid: fallbackUser.id,
      username: fallbackUser.username,
      role: fallbackUser.role,
      badges: Array.isArray(fallbackUser.badges) ? fallbackUser.badges : [],
      assignments: Array.isArray(fallbackUser.assignments) ? fallbackUser.assignments : [],
      divisionCode: fallbackUser.divisionCode,
      divisionCodes: Array.isArray(fallbackUser.divisionCodes) ? fallbackUser.divisionCodes : [],
      subCode: fallbackUser.subCode,
      instCode: fallbackUser.instCode,
      poliCode: fallbackUser.poliCode,
      subUnitCode: fallbackUser.subUnitCode
    };
  }
  if (xSessionId) {
    throw new Error("SESSION_REVOKED");
  }
  if (header.startsWith("Bearer ")) throw new Error("SESSION_REQUIRED");
  throw new Error("UNAUTHENTICATED");
}
async function handleAuthApi(req, res) {
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method tidak diizinkan." });
  }
  authDb = ensureDbLoaded();
  const pathSegment = req.path.replace(/^\/+/, "").split("/").pop();
  const rawAction = pathSegment && pathSegment !== "auth" && pathSegment !== "authApi" ? pathSegment : req.body?.action ? String(req.body.action).trim() : "";
  const action = rawAction && rawAction !== "auth" && rawAction !== "authApi" ? rawAction : "";
  if (!action) {
    return res.status(400).json({
      success: false,
      message: "Action autentikasi tidak ditentukan.",
      code: "AUTH_ACTION_REQUIRED"
    });
  }
  if (action === "sop-list") {
    return res.status(404).json({ success: false, message: "Endpoint sop-list tidak digunakan. SPO disinkronkan langsung via Firestore/IndexedDB." });
  }
  if (action === "migrate-sop-access") {
    return res.status(200).json({ success: true, alreadyCurrent: true, message: "Batas akses SPO telah mutakhir." });
  }
  try {
    if (CLOUD_AUTH_API_URL) {
      try {
        const forwardHeaders = {
          "Content-Type": "application/json",
          "Accept": "application/json"
        };
        if (req.headers.authorization) {
          forwardHeaders["Authorization"] = String(req.headers.authorization);
        }
        if (req.headers["x-session-id"]) {
          forwardHeaders["X-Session-Id"] = String(req.headers["x-session-id"]);
        }
        if (req.headers["x-soegiri-auth-uid"]) {
          forwardHeaders["X-Soegiri-Auth-Uid"] = String(req.headers["x-soegiri-auth-uid"]);
        }
        if (req.headers["x-user-username"]) {
          forwardHeaders["X-User-Username"] = String(req.headers["x-user-username"]);
        }
        if (req.headers["user-agent"]) {
          forwardHeaders["User-Agent"] = String(req.headers["user-agent"]);
        }
        const timeoutMs = action === "user-list" ? 45e3 : 25e3;
        const candidateUrls = getCandidateAuthUrls();
        let cloudRes = null;
        let lastError = null;
        for (const candidateUrl of candidateUrls) {
          try {
            let res2 = await fetch(candidateUrl, {
              method: "POST",
              headers: forwardHeaders,
              body: JSON.stringify({ action, ...req.body }),
              signal: AbortSignal.timeout(timeoutMs)
            });
            if (res2.status >= 500 && forwardHeaders["Authorization"]) {
              const retryHeaders = { ...forwardHeaders };
              delete retryHeaders["Authorization"];
              try {
                const retryRes = await fetch(candidateUrl, {
                  method: "POST",
                  headers: retryHeaders,
                  body: JSON.stringify({ action, ...req.body }),
                  signal: AbortSignal.timeout(timeoutMs)
                });
                if (retryRes.status < 500) {
                  res2 = retryRes;
                }
              } catch {
              }
            }
            cloudRes = res2;
            if (res2.status < 500) break;
            console.warn(`[authHandler] Candidate upstream ${candidateUrl} returned status ${res2.status}, checking next...`);
          } catch (err) {
            lastError = err;
            console.warn(`[authHandler] Candidate upstream ${candidateUrl} notice:`, err?.message);
          }
        }
        if (!cloudRes) {
          throw lastError || new Error("No upstream response");
        }
        const contentType = cloudRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await cloudRes.json();
          if (cloudRes.status >= 500) {
            console.error("[authHandler] Canonical authApi diagnostic:", {
              status: cloudRes.status,
              code: data?.code,
              stage: data?.stage,
              build: data?.build,
              message: data?.message
            });
          }
          if (cloudRes.ok && data?.success && data?.session) {
            try {
              authDb = ensureDbLoaded();
              const sessionUser = data.session;
              const userId = sessionUser.authUid || sessionUser.id || "admin-root";
              authDb.users[userId] = {
                id: userId,
                username: sessionUser.username,
                name: sessionUser.name || sessionUser.username,
                role: sessionUser.role || "user",
                divisionCode: sessionUser.divisionCode || "ALL",
                divisionCodes: sessionUser.divisionCodes || ["ALL"],
                assignments: sessionUser.assignments || [],
                badges: sessionUser.badges || [],
                unitName: sessionUser.unitName || "RSUD Dr. Soegiri Lamongan",
                createdAt: new Date(sessionUser.sessionCreatedAt || Date.now()).toISOString(),
                updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
                credentialStatus: "ACTIVE"
              };
              if (sessionUser.sessionId) {
                authDb.sessions[sessionUser.sessionId] = {
                  sessionId: sessionUser.sessionId,
                  authUid: userId,
                  username: sessionUser.username,
                  createdAt: sessionUser.sessionCreatedAt || Date.now(),
                  lastActiveAt: sessionUser.lastActiveAt || Date.now(),
                  revoked: false,
                  userAgent: String(req.headers["user-agent"] || "client")
                };
                saveDb(authDb);
              }
            } catch (cacheErr) {
              console.warn("[authHandler] Non-fatal session cache warning:", cacheErr);
            }
          }
          if (data?.code === "AUTH_REQUEST_ERROR" && (action === "session" || action === "user-list" || !forwardHeaders["Authorization"] && !forwardHeaders["X-Session-Id"])) {
            return res.status(401).json({
              success: false,
              message: "Autentikasi diperlukan atau sesi login telah berakhir.",
              code: "UNAUTHENTICATED"
            });
          }
          if (cloudRes.ok && data?.success) {
            return res.status(cloudRes.status).json(data);
          }
          if (cloudRes.status < 500) {
            return res.status(cloudRes.status).json(data);
          }
          const localFallbackEnabled2 = String(process.env.SIDOKTER_LOCAL_AUTH_FALLBACK || "").toLowerCase() === "true";
          if (!localFallbackEnabled2) {
            return res.status(cloudRes.status).json(data || { success: false, message: "Layanan autentikasi gagal memproses permintaan.", code: "AUTH_UPSTREAM_ERROR" });
          }
          console.warn(`[authHandler] Upstream returned status ${cloudRes.status} for '${action}', local fallback is explicitly enabled:`, data?.message || "non-ok");
        } else {
          const localFallbackEnabled2 = String(process.env.SIDOKTER_LOCAL_AUTH_FALLBACK || "").toLowerCase() === "true";
          if (!localFallbackEnabled2) {
            return res.status(cloudRes.status).json({ success: false, message: "Layanan autentikasi mengembalikan respons yang tidak valid.", code: "AUTH_UPSTREAM_NON_JSON" });
          }
          console.warn(`[authHandler] Upstream returned non-JSON ${cloudRes.status}; local fallback is explicitly enabled`);
        }
      } catch (proxyError) {
        const localFallbackEnabled2 = String(process.env.SIDOKTER_LOCAL_AUTH_FALLBACK || "").toLowerCase() === "true";
        console.warn("[authHandler] Canonical Firebase auth backend unavailable:", proxyError?.message);
        if (!localFallbackEnabled2) {
          return res.status(503).json({ success: false, message: "Server autentikasi Firebase tidak dapat dihubungi.", code: "AUTH_BACKEND_UNAVAILABLE" });
        }
      }
    }
    const localFallbackEnabled = String(process.env.SIDOKTER_LOCAL_AUTH_FALLBACK || "").toLowerCase() === "true";
    if (action === "bootstrap-admin") {
      const setupSecret = String(req.body?.setupSecret || "").trim();
      const password = String(req.body?.password || "");
      const configuredSecret = String(process.env.SIDOKTER_BOOTSTRAP_SECRET || "").trim();
      if (!configuredSecret) {
        return res.status(503).json({ message: "Provisioning Admin belum dikonfigurasi server." });
      }
      const isValidSecret = safeEqualHex(
        import_crypto.default.createHash("sha256").update(setupSecret).digest("hex"),
        import_crypto.default.createHash("sha256").update(configuredSecret).digest("hex")
      );
      if (!isValidSecret) {
        return res.status(403).json({ message: "Setup key tidak valid." });
      }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({
          message: "Password Admin minimal 8 karakter dan wajib mengandung huruf besar, huruf kecil, dan angka."
        });
      }
      const existingAdmin = Object.values(authDb.users).find((u) => normalizeRole(u.role) === "admin");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const adminId = existingAdmin ? existingAdmin.id : `admin-${import_crypto.default.randomUUID()}`;
      const { hash, salt } = hashPassword(password);
      authDb.users[adminId] = {
        id: adminId,
        username: "admin",
        name: "Administrator SIDOKTER",
        role: "admin",
        divisionCode: "ALL",
        divisionCodes: ["ALL"],
        assignments: [],
        badges: [],
        unitName: "RSUD Dr. Soegiri Lamongan",
        createdAt: existingAdmin?.createdAt || now,
        updatedAt: now,
        credentialStatus: "ACTIVE",
        failedLoginAttempts: 0,
        lockoutUntil: 0
      };
      authDb.credentials[adminId] = {
        passwordHash: hash,
        passwordSalt: salt,
        updatedAt: now
      };
      saveDb(authDb);
      return res.status(200).json({
        success: true,
        message: "Administrator berhasil disetup. Silakan login dengan username: admin dan password yang baru Anda buat.",
        username: "admin"
      });
    }
    if (action === "login") {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || "");
      if (!username || !password) {
        return res.status(400).json({ message: "Nama pengguna dan kata sandi wajib diisi." });
      }
      const rate = checkLoginRate(req, username);
      if (!rate.allowed) {
        return res.status(429).json({
          message: `Terlalu banyak percobaan login. Coba lagi dalam sekitar ${rate.retryAfter} menit.`,
          lockedOut: true,
          remainingMinutes: rate.retryAfter
        });
      }
      const user = Object.values(authDb.users).find((u) => normalizeUsername(u.username) === username);
      if (!user) {
        return res.status(401).json({ message: "Nama pengguna atau kata sandi tidak valid." });
      }
      const now = Date.now();
      if (user.lockoutUntil && user.lockoutUntil > now) {
        const remainingMinutes = Math.ceil((user.lockoutUntil - now) / 6e4);
        return res.status(429).json({
          message: `Akun terkunci sementara. Silakan coba lagi dalam ${remainingMinutes} menit.`,
          lockedOut: true,
          remainingMinutes
        });
      }
      const credential = authDb.credentials[user.id];
      if (!credential?.passwordHash || !credential?.passwordSalt) {
        return res.status(403).json({
          message: "Akun belum memiliki password aktif. Hubungi Administrator untuk menetapkan kata sandi."
        });
      }
      const valid = verifyPassword(password, credential.passwordHash, credential.passwordSalt);
      if (!valid) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const locked = attempts >= MAX_FAILED_ATTEMPTS;
        user.failedLoginAttempts = locked ? 0 : attempts;
        user.lockoutUntil = locked ? now + LOCKOUT_MS : 0;
        saveDb(authDb);
        if (locked) {
          return res.status(429).json({
            message: "Akun Anda dikunci sementara selama 15 menit karena terlalu banyak percobaan login gagal.",
            lockedOut: true,
            remainingMinutes: 15
          });
        }
        return res.status(401).json({
          message: `Kata sandi salah. Sisa kesempatan: ${MAX_FAILED_ATTEMPTS - attempts} kali.`
        });
      }
      user.failedLoginAttempts = 0;
      user.lockoutUntil = 0;
      user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
      const sessionId = `sess_${Date.now()}_${import_crypto.default.randomBytes(8).toString("hex")}`;
      const sessionCreatedAt = now;
      authDb.sessions[sessionId] = {
        sessionId,
        authUid: user.id,
        username: user.username,
        createdAt: sessionCreatedAt,
        lastActiveAt: sessionCreatedAt,
        revoked: false,
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        ip: requestIp(req)
      };
      saveDb(authDb);
      return res.status(503).json({
        success: false,
        code: "AUTH_LOCAL_FALLBACK_CANNOT_MINT_TOKEN",
        message: "Autentikasi lokal tidak dapat menerbitkan token Firebase. Gunakan Firebase Auth API."
      });
    }
    const authHeader = String(req.headers.authorization || "");
    const xSessionId = String(req.headers["x-session-id"] || "");
    let token = "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (xSessionId) {
      token = xSessionId.trim();
    }
    let activeAuth = xSessionId ? getActiveSessionByToken(xSessionId) : null;
    if (!activeAuth && token && token !== xSessionId) {
      activeAuth = getActiveSessionByToken(token);
    }
    if (action === "session") {
      if (xSessionId && authDb.sessions[xSessionId]?.revoked) {
        return res.status(401).json({ success: false, revoked: true, message: "SESSION_REVOKED", detail: "SESSION_REVOKED" });
      }
      if (!activeAuth) {
        const fallbackUsername = String(req.headers["x-user-username"] || "").toLowerCase();
        const existingUser = fallbackUsername ? Object.values(authDb.users).find((u) => u.username.toLowerCase() === fallbackUsername) : null;
        if (existingUser) {
          const session2 = publicSession(existingUser, xSessionId || `sess_${Date.now()}`, Date.now());
          return res.status(200).json({ success: true, session: session2 });
        }
        return res.status(200).json({ success: true, valid: true });
      }
      const session = publicSession(activeAuth.user, activeAuth.session.sessionId, activeAuth.session.createdAt);
      return res.status(200).json({ success: true, session });
    }
    if (action === "logout") {
      const sessionId = String(req.body?.sessionId || activeAuth?.session.sessionId || "");
      if (sessionId && authDb.sessions[sessionId]) {
        authDb.sessions[sessionId].revoked = true;
        saveDb(authDb);
      }
      return res.status(200).json({ success: true, message: "Logout berhasil." });
    }
    if (action === "revoke-all") {
      if (!activeAuth) {
        return res.status(401).json({ message: "UNAUTHENTICATED" });
      }
      Object.values(authDb.sessions).forEach((s) => {
        if (s.authUid === activeAuth.user.id) s.revoked = true;
      });
      saveDb(authDb);
      return res.status(200).json({ success: true, message: "Seluruh sesi aktif akun telah dicabut." });
    }
    if (action === "change-password") {
      if (!activeAuth) {
        return res.status(401).json({ message: "UNAUTHENTICATED" });
      }
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "").trim();
      if (!validStrongPassword(newPassword)) {
        return res.status(400).json({
          message: "Kata sandi baru minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka."
        });
      }
      const cred = authDb.credentials[activeAuth.user.id];
      if (!cred || !verifyPassword(currentPassword, cred.passwordHash, cred.passwordSalt)) {
        return res.status(401).json({ message: "Kata sandi saat ini tidak valid." });
      }
      const { hash, salt } = hashPassword(newPassword);
      authDb.credentials[activeAuth.user.id] = {
        passwordHash: hash,
        passwordSalt: salt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      saveDb(authDb);
      return res.status(200).json({ success: true, message: "Kata sandi berhasil diperbarui." });
    }
    if (action === "user-list") {
      if (!activeAuth || activeAuth.user.role !== "admin") {
        return res.status(403).json({ message: "Hanya Administrator yang dapat melihat daftar akun." });
      }
      const users = Object.values(authDb.users).filter((u) => u.username !== "guest").map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name || u.username,
        role: normalizeRole(u.role),
        unitName: u.unitName,
        divisionCode: u.divisionCode,
        divisionCodes: u.divisionCodes,
        assignments: u.assignments,
        badges: u.badges,
        subCode: u.subCode,
        instCode: u.instCode,
        poliCode: u.poliCode,
        subUnitCode: u.subUnitCode,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        credentialStatus: authDb.credentials[u.id] ? "ACTIVE" : "PASSWORD_REQUIRED"
      }));
      return res.status(200).json({ success: true, users });
    }
    if (action === "user-save") {
      if (!activeAuth || activeAuth.user.role !== "admin") {
        return res.status(403).json({ message: "Hanya Administrator yang dapat mengelola akun." });
      }
      const incoming = req.body?.user || {};
      const userId = String(incoming.id || `user-${Date.now()}-${import_crypto.default.randomBytes(4).toString("hex")}`).trim();
      const username = normalizeUsername(incoming.username);
      const name = String(incoming.name || "").trim();
      const role = incoming.role === "admin" ? "admin" : "user";
      const password = String(req.body?.password || "").trim();
      if (!username || !name) {
        return res.status(400).json({ message: "Data akun belum lengkap." });
      }
      if (password && !validStrongPassword(password)) {
        return res.status(400).json({
          message: "Kata sandi minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka."
        });
      }
      const existingUserWithUsername = Object.values(authDb.users).find(
        (u) => normalizeUsername(u.username) === username && u.id !== userId
      );
      if (existingUserWithUsername) {
        return res.status(409).json({ message: "Username tersebut sudah digunakan." });
      }
      const existing = authDb.users[userId];
      if (!existing && !password) {
        return res.status(400).json({ message: "Kata sandi wajib diisi untuk akun baru." });
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      authDb.users[userId] = {
        id: userId,
        username,
        name,
        role,
        divisionCode: role === "admin" ? "ALL" : incoming.divisionCode,
        divisionCodes: role === "admin" ? ["ALL"] : Array.isArray(incoming.divisionCodes) ? incoming.divisionCodes : [incoming.divisionCode || "PEL"],
        assignments: role === "admin" ? [] : Array.isArray(incoming.assignments) ? incoming.assignments : [],
        badges: role === "admin" ? [] : Array.isArray(incoming.badges) ? incoming.badges : [],
        subCode: incoming.subCode,
        instCode: incoming.instCode,
        poliCode: incoming.poliCode,
        subUnitCode: incoming.subUnitCode,
        unitName: String(incoming.unitName || "Unit Kerja RSUD Dr. Soegiri"),
        createdAt: existing?.createdAt || incoming.createdAt || now,
        updatedAt: now,
        credentialStatus: password || authDb.credentials[userId] ? "ACTIVE" : "PASSWORD_REQUIRED",
        failedLoginAttempts: 0,
        lockoutUntil: 0
      };
      if (password) {
        const { hash, salt } = hashPassword(password);
        authDb.credentials[userId] = {
          passwordHash: hash,
          passwordSalt: salt,
          updatedAt: now
        };
      }
      saveDb(authDb);
      await syncUserToFirestoreServer(authDb.users[userId]);
      return res.status(200).json({
        success: true,
        message: existing ? "Akun berhasil diperbarui." : "Akun berhasil dibuat."
      });
    }
    if (action === "user-delete") {
      if (!activeAuth || activeAuth.user.role !== "admin") {
        return res.status(403).json({ message: "Hanya Administrator yang dapat mengelola akun." });
      }
      const userId = String(req.body?.userId || "").trim();
      if (!userId) return res.status(400).json({ message: "User ID wajib diisi." });
      if (userId === activeAuth.user.id || userId === "admin-root" || authDb.users[userId]?.username === "admin") {
        return res.status(400).json({ message: "Tidak dapat menghapus akun Administrator Root utama." });
      }
      delete authDb.users[userId];
      delete authDb.credentials[userId];
      Object.values(authDb.sessions).forEach((s) => {
        if (s.authUid === userId) s.revoked = true;
      });
      saveDb(authDb);
      await deleteUserFromFirestoreServer(userId);
      return res.status(200).json({ success: true, message: "Akun berhasil dihapus." });
    }
    if (action === "user-restore-profile") {
      if (!activeAuth || activeAuth.user.role !== "admin") {
        return res.status(403).json({ message: "Hanya Administrator yang dapat memulihkan akun." });
      }
      const incoming = req.body?.user || {};
      const userId = String(incoming.id || "").trim();
      if (!userId || !incoming.username) {
        return res.status(400).json({ message: "Data akun tidak lengkap untuk pemulihan." });
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      authDb.users[userId] = {
        ...incoming,
        id: userId,
        updatedAt: now,
        credentialStatus: authDb.credentials[userId] ? "ACTIVE" : "PASSWORD_REQUIRED"
      };
      saveDb(authDb);
      await syncUserToFirestoreServer(authDb.users[userId]);
      return res.status(200).json({ success: true, message: "Profil akun berhasil dipulihkan." });
    }
    return res.status(400).json({ message: `Action tidak dikenal: ${action}` });
  } catch (err) {
    console.error("[handleAuthApi] Error handling auth request:", err);
    return res.status(500).json({ message: err?.message || "Terjadi kesalahan internal pada server autentikasi." });
  }
}

// server/storageHandler.ts
var FIREBASE_STORAGE_API = "https://asia-southeast2-sidokter-soegiri.cloudfunctions.net/storageApi";
var REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "origin",
  "x-session-id",
  "x-soegiri-session-id",
  "x-soegiri-auth-uid",
  "x-user-username"
];
var RESPONSE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
  "x-content-type-options"
];
function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return typeof value === "string" ? value : "";
}
function buildForwardHeaders(req) {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.header(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("authorization")) {
    const token = firstQueryValue(req.query.token);
    if (token) headers.set("authorization", `Bearer ${token}`);
  }
  if (!headers.has("x-session-id")) {
    const sessionId = firstQueryValue(req.query.sessionId);
    if (sessionId) headers.set("x-session-id", sessionId);
  }
  if (!headers.has("x-soegiri-auth-uid")) {
    const uid = firstQueryValue(req.query.uid);
    if (uid) headers.set("x-soegiri-auth-uid", uid);
  }
  if (!headers.has("x-user-username")) {
    const username = firstQueryValue(req.query.username);
    if (username) headers.set("x-user-username", username);
  }
  return headers;
}
async function forwardToFirebaseStorage(req, res, storagePath) {
  const upstreamUrl = `${FIREBASE_STORAGE_API}${storagePath}`;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: buildForwardHeaders(req),
      body: req.method === "GET" || req.method === "HEAD" ? void 0 : JSON.stringify(req.body ?? {}),
      redirect: "manual",
      signal: AbortSignal.timeout(65e3)
    });
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.status(upstream.status);
    if (req.method === "HEAD" || upstream.status === 204) {
      res.end();
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (error) {
    console.error("[storageProxy] Firebase Storage API unavailable:", error);
    res.status(502).json({
      success: false,
      code: "FIREBASE_STORAGE_UNAVAILABLE",
      message: "Firebase Storage tidak dapat diakses. Dokumen tidak disimpan."
    });
  }
}
async function handleStorageUpload(req, res) {
  await forwardToFirebaseStorage(req, res, "/upload");
}
async function handleStorageDownloadByPath(req, res) {
  const storagePath = String(req.params.storagePath || "").replace(/^\/+/, "");
  if (!storagePath || storagePath.includes("..")) {
    res.status(400).json({ success: false, message: "Storage path tidak valid." });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/path/${encodeURIComponent(storagePath)}`);
}
async function handleStorageDownload(req, res) {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ success: false, message: "File ID tidak valid." });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/files/${encodeURIComponent(id)}`);
}
async function handleStorageDelete(req, res) {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ success: false, message: "File ID tidak valid." });
    return;
  }
  await forwardToFirebaseStorage(req, res, `/files/${encodeURIComponent(id)}`);
}

// server/hierarchyHandler.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
var DATA_DIR2 = import_path2.default.resolve(process.cwd(), "data");
var HIERARCHY_FILE = import_path2.default.resolve(DATA_DIR2, "hierarchy_master.json");
var CONFIG_FILE2 = import_path2.default.resolve(process.cwd(), "firebase-applet-config.json");
var serverFirestoreDb2 = null;
async function getServerFirestore2() {
  if (serverFirestoreDb2) return serverFirestoreDb2;
  try {
    if (import_fs2.default.existsSync(CONFIG_FILE2)) {
      const config = JSON.parse(import_fs2.default.readFileSync(CONFIG_FILE2, "utf-8"));
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      const { getFirestore } = await import("firebase/firestore");
      const app2 = getApps().length === 0 ? initializeApp({
        projectId: config.projectId,
        appId: config.appId,
        apiKey: config.apiKey,
        authDomain: config.authDomain
      }) : getApp();
      serverFirestoreDb2 = getFirestore(app2, config.firestoreDatabaseId || "(default)");
      return serverFirestoreDb2;
    }
  } catch (err) {
    console.warn("[hierarchyHandler] Server Firestore init notice:", err);
  }
  return null;
}
async function handleHierarchyGet(_req, res) {
  try {
    const db = await getServerFirestore2();
    if (db) {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "system_config", "hierarchy_master"));
        if (snap.exists()) {
          const val = snap.data()?.value;
          let list = [];
          if (Array.isArray(val)) {
            list = val;
          } else if (val && typeof val === "object") {
            const keys = Object.keys(val).sort((a, b) => Number(a) - Number(b));
            list = keys.map((k) => val[k]).filter(Boolean);
          }
          if (list.length > 0) {
            try {
              if (!import_fs2.default.existsSync(DATA_DIR2)) import_fs2.default.mkdirSync(DATA_DIR2, { recursive: true });
              import_fs2.default.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), "utf-8");
            } catch {
            }
            res.json({ success: true, source: "firestore", categories: list });
            return;
          }
        }
      } catch (fErr) {
        console.warn("[hierarchyHandler] Server Firestore get error:", fErr);
      }
    }
    if (import_fs2.default.existsSync(HIERARCHY_FILE)) {
      const raw = import_fs2.default.readFileSync(HIERARCHY_FILE, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        res.json({ success: true, source: "local_file", categories: list });
        return;
      }
    }
    res.json({ success: true, source: "empty", categories: [] });
  } catch (err) {
    console.error("[hierarchyHandler] GET error:", err);
    res.status(500).json({ success: false, message: err?.message || "Gagal memuat hierarki." });
  }
}
async function handleHierarchySave(req, res) {
  try {
    const { categories, updatedBy } = req.body || {};
    let list = [];
    if (Array.isArray(categories)) {
      list = categories;
    } else if (categories && typeof categories === "object") {
      const keys = Object.keys(categories).sort((a, b) => Number(a) - Number(b));
      list = keys.map((k) => categories[k]).filter(Boolean);
    }
    if (!list.length) {
      res.status(400).json({ success: false, message: "Data kategori tidak boleh kosong." });
      return;
    }
    try {
      if (!import_fs2.default.existsSync(DATA_DIR2)) import_fs2.default.mkdirSync(DATA_DIR2, { recursive: true });
      import_fs2.default.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (fsErr) {
      console.warn("[hierarchyHandler] Simpan file lokal warning:", fsErr);
    }
    let firestoreSynced = false;
    const db = await getServerFirestore2();
    if (db) {
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "system_config", "hierarchy_master"), {
          id: "hierarchy_master",
          value: list,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedBy: updatedBy || "admin"
        }, { merge: true });
        firestoreSynced = true;
      } catch (fErr) {
        console.warn("[hierarchyHandler] Server Firestore save error:", fErr);
      }
    }
    res.json({
      success: true,
      count: list.length,
      firestoreSynced,
      message: `Hierarki dengan ${list.length} kategori berhasil disimpan.`
    });
  } catch (err) {
    console.error("[hierarchyHandler] POST error:", err);
    res.status(500).json({ success: false, message: err?.message || "Gagal menyimpan hierarki." });
  }
}

// server.ts
var app = (0, import_express.default)();
var PORT = Number(process.env.PORT || 3e3);
app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  const allowedOrigin = String(process.env.AUTH_ALLOWED_ORIGIN || "");
  if (origin && (origin === allowedOrigin || !allowedOrigin || origin.startsWith("http://localhost:") || origin.includes(".run.app") || origin.endsWith(".web.app") || origin.endsWith(".firebaseapp.com") || origin.endsWith(".vercel.app"))) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Accept,Authorization,X-Soegiri-Auth-Uid,X-Soegiri-Session-Id,X-Session-Id,X-User-Username,X-Requested-With");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
app.use(import_express.default.static(import_path3.default.resolve(process.cwd(), "public")));
app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "SOEGIRI_DOCS", pdf: "native", auth: "internal" }));
app.all(["/api/auth", "/api/authApi", "/api/auth/:action", "/api/authApi/:action"], handleAuthApi);
app.post("/api/storage/upload", handleStorageUpload);
app.get("/api/storage/path/:storagePath(*)", handleStorageDownloadByPath);
app.get(["/api/storage/files/:id", "/api/storage/:id"], handleStorageDownload);
app.delete(["/api/storage/files/:id", "/api/storage/:id"], handleStorageDelete);
app.get("/api/hierarchy", handleHierarchyGet);
app.post("/api/hierarchy", handleHierarchySave);
app.post("/api/pdf", async (req, res) => {
  try {
    let authUid = "anonymous_user";
    try {
      const verifiedSession = await verifyServerSession(req);
      authUid = verifiedSession.authUid;
    } catch (authErr) {
      console.warn("[api/pdf] Auth verification warning:", authErr?.message);
      const code = String(authErr?.message || "UNAUTHENTICATED");
      if (code === "SESSION_REVOKED" || code === "UNAUTHENTICATED" || code === "USER_NOT_FOUND") {
        return res.status(401).json({
          success: false,
          message: "Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.",
          detail: code
        });
      }
      authUid = req.body?.authUid || "authenticated_user";
    }
    const host = req.get("host");
    const computedBase = host ? `${req.protocol}://${host}` : "http://localhost:3000";
    const { pdf, filename } = await generatePdf({
      ...req.body,
      authUid,
      baseUrl: req.body?.baseUrl || computedBase
    });
    const pdfBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    if (pdfBuffer.length < 5 || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF_RENDER_INVALID_OUTPUT");
    }
    const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, "%27");
    res.status(200).set({
      "Content-Type": "application/pdf",
      "Content-Length": String(pdfBuffer.length),
      "X-Soegiri-PDF-Filename": encodeURIComponent(filename),
      "Content-Disposition": `attachment; filename="SPO_RSUD_Dr_Soegiri.pdf"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "private, no-store, max-age=0"
    }).send(pdfBuffer);
  } catch (error) {
    console.error("[api/pdf] PDF generation failed:", error);
    const code = String(error?.message || "PDF_RENDER_ERROR");
    const status = code === "UNAUTHENTICATED" || code === "USER_NOT_FOUND" || code === "SESSION_REVOKED" || code === "SESSION_REQUIRED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    res.status(status).json({
      success: false,
      message: status === 401 ? "Sesi login tidak valid atau sudah dicabut. Silakan login kembali." : `PDF gagal dibuat: ${code}`,
      detail: code
    });
  }
});
app.use((err, _req, res, _next) => {
  console.error("[Server Error Middleware]:", err);
  const status = Number(err?.status || err?.statusCode || 500);
  res.status(status).json({
    success: false,
    message: err?.message || "Terjadi kesalahan pada server saat memproses permintaan.",
    detail: String(err?.code || err?.message || "INTERNAL_SERVER_ERROR")
  });
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path3.default.resolve(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path3.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIDOKTER SOEGIRI Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map
