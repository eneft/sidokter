/**
 * Polyfills for modern ECMAScript features required by PDF.js (v4.4+ / v6+)
 * in older browser engines, sandboxed iframes, and Web Worker environments.
 */

// 1. Promise.withResolvers
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// 2. Promise.try
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function <T>(fn: () => T | PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn()));
  };
}

// 3. Uint8Array.prototype.toHex
if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function (): string {
    return Array.from(this)
      .map((b) => (b as number).toString(16).padStart(2, '0'))
      .join('');
  };
}

// 4. Uint8Array.fromHex
if (typeof (Uint8Array as any).fromHex !== 'function') {
  (Uint8Array as any).fromHex = function (hexString: string): Uint8Array {
    const cleanHex = hexString.replace(/\s+/g, '');
    const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  };
}

export {};
