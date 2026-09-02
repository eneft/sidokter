import React from 'react';
import { FinalLibraryPage } from './FinalLibraryPage';
import { LibraryDocument, SopDocument, UserSession } from '../types';

interface Props {
  sops: SopDocument[];
  documents: LibraryDocument[];
  userSession: UserSession;
  onViewSop?: (sop: SopDocument) => void;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const AdminLibraryPage: React.FC<Props> = (props) => {
  return <FinalLibraryPage {...props} />;
};
