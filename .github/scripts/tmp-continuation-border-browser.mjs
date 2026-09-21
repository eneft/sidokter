import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const fixturePath = 'continuation-border-audit.html';
const port = 4178;

fs.writeFileSync(fixturePath, `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="/src/index.css" />
</head>
<body>
  <div id="frame" style="width:170mm;height:257mm;display:flex;flex-direction:column;background:#fff">
    <table id="continuation-table" class="sop-official-table sop-continuation-page-table" style="width:100%;border-collapse:collapse;flex-shrink:0">
      <tbody>
        <tr id="tail-row" data-sop-suppress-bottom-border="true">
          <td id="tail-left">PROSEDUR</td>
          <td id="tail-right">Baris terakhir sebelum filler.</td>
        </tr>
      </tbody>
    </table>
    <div id="continuation-fill" style="flex:1 1 auto;min-height:0;position:relative;box-sizing:border-box;background:#fff;border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000">
      <div style="position:absolute;top:0;bottom:0;left:28%;border-left:1px solid #000"></div>
    </div>
  </div>
</body>
</html>`);

const vite = spawn('npm', ['exec', 'vite', '--', '--host', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', chunk => { viteLog += chunk.toString(); });
vite.stderr.on('data', chunk => { viteLog += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/${fixturePath}`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start.\n${viteLog}`);
}

async function chromePath() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { executablePath: candidate, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  }
  const mod = await import('@sparticuz/chromium');
  const chromium = mod.default || mod;
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

try {
  await waitForServer();
  const chrome = await chromePath();
  const browser = await puppeteer.launch({ ...chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/${fixturePath}`, { waitUntil: 'networkidle0' });
    const result = await page.evaluate(() => {
      const css = id => getComputedStyle(document.getElementById(id));
      return {
        tableBottom: css('continuation-table').borderBottomWidth,
        leftBottom: css('tail-left').borderBottomWidth,
        rightBottom: css('tail-right').borderBottomWidth,
        fillerBottom: css('continuation-fill').borderBottomWidth,
      };
    });
    console.log('CONTINUATION_BORDER_AUDIT', JSON.stringify(result));
    if (result.tableBottom !== '0px') throw new Error(`Continuation table still has bottom border: ${result.tableBottom}`);
    if (result.leftBottom !== '0px' || result.rightBottom !== '0px') throw new Error(`Tail row still has bottom border: ${result.leftBottom}/${result.rightBottom}`);
    if (result.fillerBottom !== '1px') throw new Error(`Final floor line missing: ${result.fillerBottom}`);
  } finally {
    await browser.close();
  }
} finally {
  vite.kill('SIGTERM');
  try { fs.unlinkSync(fixturePath); } catch {}
}
process.exit(0);
