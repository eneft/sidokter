/// <reference types="vite/client" />

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string },
    options?: any
  ): Promise<MammothResult>;
  export function extractRawText(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string }
  ): Promise<MammothResult>;
}
