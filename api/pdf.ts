import firebaseConfig from '../firebase-applet-config.json';

const PDF_API_URL = String(
  process.env.SIDOKTER_PDF_API_URL ||
  `https://asia-southeast2-${firebaseConfig.projectId}.cloudfunctions.net/pdfApi`
).replace(/\/$/, '');

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Sesi login tidak valid. Silakan login kembali.' });
  }

  try {
    const upstream = await fetch(PDF_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/pdf',
        'Authorization': authorization,
        ...(req.headers.origin ? { 'Origin': String(req.headers.origin) } : {})
      },
      body: JSON.stringify(req.body || {})
    });

    const contentType = upstream.headers.get('content-type') || '';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (contentType) res.setHeader('Content-Type', contentType);
    const disposition = upstream.headers.get('content-disposition');
    const filenameHeader = upstream.headers.get('x-soegiri-pdf-filename');
    if (disposition) res.setHeader('Content-Disposition', disposition);
    if (filenameHeader) res.setHeader('X-Soegiri-PDF-Filename', filenameHeader);
    return res.send(buffer);
  } catch (error: any) {
    console.error('[api/pdf] proxy failed:', error);
    return res.status(503).json({
      success: false,
      message: 'Layanan PDF tidak dapat dihubungi. Pastikan Firebase Function pdfApi sudah aktif.'
    });
  }
}
