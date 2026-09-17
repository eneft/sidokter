import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { SopDocument } from '../types';

export type SopReviewAction = 'REQUEST_REVISION' | 'SUBMIT_REVISION' | 'VERIFY';

const SAFE_REVIEW_ERRORS: Record<string, string> = {
  'functions/unauthenticated': 'Sesi Firebase tidak aktif. Silakan masuk ulang.',
  'functions/permission-denied': 'Anda tidak berwenang menjalankan tindakan review ini.',
  'functions/not-found': 'SPO atau layanan review tidak ditemukan.',
  'functions/failed-precondition': 'Kondisi SPO sudah berubah. Muat ulang dokumen lalu coba kembali.',
  'functions/invalid-argument': 'Data permintaan perbaikan tidak valid.',
  'functions/unavailable': 'Layanan review sementara tidak tersedia. Silakan coba kembali.',
  'functions/deadline-exceeded': 'Layanan review tidak merespons tepat waktu. Silakan coba kembali.',
  'functions/internal': 'Layanan review mengalami kendala internal. Hubungi administrator bila berulang.',
};

export function getSafeSopReviewError(error: unknown): Error {
  if (!(error instanceof FirebaseError)) return error instanceof Error ? error : new Error('Alur verifikasi gagal diproses.');
  // Callable HttpsError messages are authored server-side and contain no
  // sensitive Firestore/Admin details. Generic transport errors use a stable
  // localized fallback instead of exposing "internal [0]".
  const genericTransportMessage = /^(internal|unknown)(?:\s*\[\d+\])?$/i.test(error.message.trim());
  const message = genericTransportMessage
    ? (SAFE_REVIEW_ERRORS[error.code] || 'Layanan review gagal dihubungi. Silakan coba kembali.')
    : error.message;
  return new Error(message);
}

export async function mutateSopReview(sopId: string, action: SopReviewAction, note?: string): Promise<SopDocument> {
  try {
    const callable = httpsCallable(functions, 'sopReviewWorkflow');
    const result = await callable({ sopId, action, note });
    const data = result.data as { sop?: SopDocument };
    if (!data?.sop) throw new Error('Respons alur verifikasi SPO tidak valid.');
    return data.sop;
  } catch (error) {
    throw getSafeSopReviewError(error);
  }
}
