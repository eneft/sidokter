import React from 'react';
import { LibraryDocument, UserSession } from '../types';
import { LibraryDocumentPage } from './LibraryDocumentPage';
export const MOUPage: React.FC<{documents: LibraryDocument[]; userSession: UserSession; onBack?: () => void; onShowToast?: any}> = (p) => <LibraryDocumentPage {...p} type="MOU" />;
