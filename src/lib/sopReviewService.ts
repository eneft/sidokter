import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { SopDocument } from '../types';

export type SopReviewAction = 'REQUEST_REVISION' | 'SUBMIT_REVISION' | 'VERIFY';

export async function mutateSopReview(sopId: string, action: SopReviewAction, note?: string): Promise<SopDocument> {
  const callable = httpsCallable(functions, 'sopReviewWorkflow');
  const result = await callable({ sopId, action, note });
  const data = result.data as { sop?: SopDocument };
  if (!data?.sop) throw new Error('Respons alur verifikasi SPO tidak valid.');
  return data.sop;
}
