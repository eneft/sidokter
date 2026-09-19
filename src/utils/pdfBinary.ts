const PDF_PREFIX = new TextEncoder().encode('%PDF-');
const PDF_EOF = new TextEncoder().encode('%%EOF');

const startsWith = (bytes: Uint8Array, expected: Uint8Array) =>
  expected.every((byte, index) => bytes[index] === byte);

const includesBytes = (bytes: Uint8Array, expected: Uint8Array) => {
  for (let offset = Math.max(0, bytes.length - 1024); offset <= bytes.length - expected.length; offset += 1) {
    if (expected.every((byte, index) => bytes[offset + index] === byte)) return true;
  }
  return false;
};

export function createPdfBlob(input: ArrayBuffer | Uint8Array): Blob {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!startsWith(bytes, PDF_PREFIX)) throw new Error('Respons server bukan PDF yang valid.');
  if (!includesBytes(bytes, PDF_EOF)) throw new Error('Respons PDF dari server tidak lengkap.');
  // Keep the byte view intact: never spread/stringify it into a numeric-key object.
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function responseToPdfBlob(response: Response): Promise<Blob> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/pdf') {
    throw new Error(`Server mengembalikan Content-Type ${contentType || 'kosong'}, bukan application/pdf.`);
  }
  return createPdfBlob(await response.arrayBuffer());
}
