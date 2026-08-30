// Client-side PBKDF2 is used only when an already-authenticated Administrator
// provisions a new account. Login verification and password changes happen in
// the trusted authentication service and never expose stored hashes to the browser.
const PBKDF2_ITERATIONS = 100000;

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export async function hashPassword(password: string, customSaltHex?: string): Promise<{ hash: string; salt: string }> {
  let salt: Uint8Array;
  if (customSaltHex) {
    salt = new Uint8Array(customSaltHex.length / 2);
    for (let i = 0; i < customSaltHex.length; i += 2) salt[i / 2] = parseInt(customSaltHex.slice(i, i + 2), 16);
  } else {
    salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return { hash: bufferToHex(bits), salt: bufferToHex(salt.buffer) };
}


export async function verifyPassword(password: string, storedHash: string, saltHex: string): Promise<boolean> {
  if (!storedHash || !saltHex) return false;
  try {
    const result = await hashPassword(password, saltHex);
    if (result.hash.length !== storedHash.length) return false;
    // Constant-time-ish comparison in JavaScript; the stored hash never leaves the
    // authenticated local database operation in production and this is only a legacy
    // recovery path.
    let diff = 0;
    for (let i = 0; i < storedHash.length; i++) {
      diff |= result.hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}
