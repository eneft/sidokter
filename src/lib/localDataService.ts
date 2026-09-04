import { DEFAULT_NUMBERING_CONFIG } from '../utils/numbering';
import { checkFirebaseConnection, saveSystemConfigToFirestore } from './firestoreService';

/**
 * Initializes non-sensitive local application settings only.
 * User credentials and user provisioning are intentionally NOT performed here.
 * Authentication is server-authoritative through authApi.
 */
export async function initializeLocalData(): Promise<void> {
  void checkFirebaseConnection();

  if (!localStorage.getItem('soegiri_offline_numbering_v1')) {
    localStorage.setItem('soegiri_offline_numbering_v1', JSON.stringify(DEFAULT_NUMBERING_CONFIG));
    // Do not write cloud configuration from the public login page.
  }
}
