export default function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(200).json({
    status: 'ok',
    app: 'SOEGIRI_DOCS',
    platform: 'vercel',
    timestamp: new Date().toISOString()
  });
}
