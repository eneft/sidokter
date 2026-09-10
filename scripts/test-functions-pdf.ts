import fs from 'node:fs';

async function testFunctionsPdf() {
  // Let's load functions/index.js
  const functions = await import('../functions/index.js' as any);
  console.log('Exported functions:', Object.keys(functions));

  // Mock request and response
  const req: any = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      // No auth header yet
    },
    body: {
      html: '<div id="printable-sop-official-document"><div class="sop-preview-page"><h1>SPO Test</h1></div></div>',
      css: '',
      sopNumber: 'SPO/001/2025'
    }
  };

  let statusCode = 0;
  let headers: Record<string, string> = {};
  let responseData: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    set(key: string | Record<string, string>, val?: string) {
      if (typeof key === 'string') {
        headers[key.toLowerCase()] = val!;
      } else {
        for (const k of Object.keys(key)) {
          headers[k.toLowerCase()] = key[k];
        }
      }
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return this;
    },
    send(data: any) {
      responseData = data;
      console.log('RES SEND:', statusCode, typeof data, Buffer.isBuffer(data) ? `Buffer(${data.length})` : data);
      return this;
    }
  };

  try {
    await functions.pdfApi(req, res);
  } catch (err) {
    console.error('pdfApi threw uncaught error:', err);
  }
}

testFunctionsPdf().catch(console.error);
