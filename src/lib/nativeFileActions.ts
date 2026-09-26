import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isCapacitorNativeRuntime } from './runtimeEndpoints';

function safeNativeFileName(fileName: string): string {
  return (fileName || 'Dokumen_SIDOKTER.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 160);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca berkas.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareOrSaveBlobNative(blob: Blob, fileName: string): Promise<boolean> {
  if (!isCapacitorNativeRuntime() || !blob?.size) return false;
  try {
    const safeName = safeNativeFileName(fileName);
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: safeName, data, directory: Directory.Cache, recursive: true });
    const uri = await Filesystem.getUri({ path: safeName, directory: Directory.Cache });
    await Share.share({
      title: safeName,
      text: 'Dokumen SIDOKTER SOEGIRI',
      files: [uri.uri],
      dialogTitle: 'Bagikan atau simpan dokumen'
    });
    return true;
  } catch (error) {
    console.warn('[nativeFileActions] Native share/save unavailable:', error);
    return false;
  }
}
