import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  SopDocument, 
  Division, 
  SopCategory, 
  NumberingConfig, 
  FilterOptions, 
  SopStatus,
  UserSession,
  UserAccount,
  LibraryDocument,
  MainMenuTab
} from './types';
import { MASTER_DIVISIONS, MASTER_CATEGORIES } from './utils/masterData';
import { 
  DEFAULT_NUMBERING_CONFIG, 
  getNextSequenceNumber,
  getUnitKey,
  getPaddedNumber,
  getUsedSequencesForUnit,
  checkDuplicateSopNumber,
  standardizeAllSops,
  standardizeSopDocument
} from './utils/numbering';
import { SOEGIRI_HOSPITAL_INFO } from './utils/soegiriStructure';
import { subscribeToHierarchyMaster } from './lib/hierarchyService';
import { saveFileToLocalCache, deleteFileFromLocalCache, clearAllFileLocalCache, getAllCachedFiles } from './utils/fileStorage';
import {
  subscribeToSops,
  getAllSopsFromLocal,
  subscribeToNumberingConfig,
  saveSopToLocal,
  restoreSopsToLocal,
  deleteSopFromLocal,
  deleteAllSops,
  saveConfigToLocal,
  registerSopAndNumberingToLocal,
  reserveNextSopNumber
} from './lib/sopService';
import { subscribeToUsers, saveUserToLocal, deleteUserFromLocal } from './lib/accountService';
import { subscribeToMaintenanceMode, getMaintenanceMode, setMaintenanceMode } from './lib/maintenanceService';
import { subscribeToSKDocuments } from './lib/skService';
import { subscribeToMOUDocuments } from './lib/mouService';
import { initializeLocalData } from './lib/localDataService';
import { createSystemBackup, restoreSystemBackup, downloadSystemBackup } from './lib/backupService';
import {
  subscribeToUserSessionGuard,
  logoutUser,
  persistClientSession,
  getPersistedClientSession,
  validatePersistedClientSession,
  refreshUserSessionProfile,
  clearPersistedClientSession,
  changeUserPassword,
  recordAuditLog,
  IDLE_TIMEOUT_MS,
  ABSOLUTE_TIMEOUT_MS
} from './lib/authService';

// Components
import { Header } from './components/Header';
import { DashboardStats } from './components/DashboardStats';
import { SopFilterBar } from './components/SopFilterBar';
import { SopTable } from './components/SopTable';
import { UploadSopModal } from './components/UploadSopModal';
import { SopDetailModal } from './components/SopDetailModal';
import { EditSopModal } from './components/EditSopModal';
import { AktivasiSopModal } from './components/AktivasiSopModal';
import { PrintRegisterModal } from './components/PrintRegisterModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { LoginPage } from './components/LoginPage';
import { PetugasView } from './components/PetugasView';
import { UserManagementModal } from './components/UserManagementModal';
import { SecurityAccountPanel } from './components/SecurityAccountPanel';
import { HospitalLogo } from './components/HospitalLogo';
import { MasterDataModal } from './components/MasterDataModal';
import { BackupRestorePanel } from './components/BackupRestorePanel';
import { MaintenancePage } from './components/MaintenancePage';
import { MaintenanceModal } from './components/MaintenanceModal';
import { SKPage } from './components/SKPage';
import { MOUPage } from './components/MOUPage';
import { AdminLibraryPage } from './components/AdminLibraryPage';
import { DashboardOverviewPage } from './components/DashboardOverviewPage';
import { FinalLibraryPage } from './components/FinalLibraryPage';
import { AdminHubPage } from './components/AdminHubPage';
import { 
  Home, 
  FileText, 
  Plus, 
  Users, 
  ShieldCheck, 
  LogOut, 
  Menu, 
  X, 
  Database, 
  DatabaseBackup, 
  Wrench,
  Printer,
  Calendar,
  Sparkles,
  Layers,
  BookOpen
} from 'lucide-react';

export default function App() {
  // Auth & Session State with Cryptographic Single Active Session
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [isSessionRestoring, setIsSessionRestoring] = useState(true);

  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<number>(() => Date.now());
  const [, setHierarchyVersion] = useState(0);

  useEffect(() => {
    initializeLocalData().catch((e) => console.error('Local data initialization failed:', e));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToHierarchyMaster(() => setHierarchyVersion((v) => v + 1));
    return () => unsubscribe();
  }, []);
  const lastActivityRef = React.useRef<number>(Date.now());

  const resetAllViewStates = () => {
    setSelectedSopForDetail(null);
    setSelectedSopForEdit(null);
    setSelectedSopForActivation(null);
    setIsUploadOpen(false);
    setIsPrintRegisterOpen(false);
    setIsUserManagementOpen(false);
    setIsSecurityOpen(false);
    setIsBackupRestoreOpen(false);
    setIsMaintenanceModalOpen(false);
    setSopToDelete(null);
    setFilters({
      searchQuery: '',
      division: '',
      category: '',
      status: '',
      year: '',
      sortBy: 'sopNumber',
      sortOrder: 'desc'
    });
    setViewMode('table');
  };


  // Restore the login session after a normal browser refresh.
  // sessionStorage is tab-scoped, so this does not turn the session into a
  // cross-device persistent login. local database activeSessionId remains authoritative.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persisted = getPersistedClientSession();
      if (!persisted) {
        if (!cancelled) setIsSessionRestoring(false);
        return;
      }

      const valid = await validatePersistedClientSession(persisted);
      if (cancelled) return;

      if (valid) {
        const refreshed = await refreshUserSessionProfile(persisted);
        if (cancelled) return;
        if (refreshed) {
          setSessionKey(Date.now());
          setUserSession(refreshed);
        } else {
          clearPersistedClientSession();
        }
      } else {
        clearPersistedClientSession();
      }
      setIsSessionRestoring(false);
    })();

    return () => { cancelled = true; };
  }, []);


  // 1. Single Active Session Real-Time Guard
  // Disconnects / Logs out immediately if the same account signs in on another browser or device
  useEffect(() => {
    if (!userSession || !userSession.username || !userSession.sessionId) return;

    const unsubscribeGuard = subscribeToUserSessionGuard(
      userSession.username,
      userSession.sessionId,
      (reason) => {
        if (reason === 'REVOKED_ANOTHER_LOGIN') {
          resetAllViewStates();
          clearAllFileLocalCache();
          logoutUser(userSession).catch(() => {});
          setUserSession(null);
          setInactivityNotice(
            'Sesi Dihentikan (Single Active Session): Akun Anda telah login di perangkat atau browser lain. Sesi pada perangkat ini telah dihentikan secara otomatis demi keamanan.'
          );
          addToast(
            'error',
            'Sesi Dihentikan di Perangkat Lain',
            'Akun Anda aktif di sesi login baru. Sesi pada perangkat ini telah di-revoke secara otomatis.'
          );
        }
      },
      (updatedUser) => {
        if (updatedUser.role !== 'petugas') return;
        const assignments = Array.isArray(updatedUser.assignments) && updatedUser.assignments.length
          ? updatedUser.assignments
          : [];
        setUserSession((current) => {
          if (!current || current.sessionId !== userSession.sessionId) return current;
          const fallbackAssignments = assignments.length
            ? assignments
            : [{ id: `legacy-${updatedUser.divisionCode || current.divisionCode || 'PEL'}`, divisionCode: updatedUser.divisionCode || current.divisionCode || 'PEL' }];
          const next: UserSession = {
            ...current,
            name: updatedUser.name || current.name,
            unitName: updatedUser.unitName || current.unitName,
            divisionCode: updatedUser.divisionCode || current.divisionCode,
            divisionCodes: Array.from(new Set(fallbackAssignments.map((a: any) => a.divisionCode).filter(Boolean))),
            assignments: fallbackAssignments as any,
            subCode: updatedUser.subCode,
            instCode: updatedUser.instCode,
            poliCode: updatedUser.poliCode,
            subUnitCode: updatedUser.subUnitCode,
          };
          persistClientSession(next);
          return next;
        });
      }
    );

    return () => {
      unsubscribeGuard();
    };
  }, [userSession?.username, userSession?.sessionId]);

  // Central maintenance-mode listener.
  // This subscription is active globally across all devices and sessions in real time.
  useEffect(() => {
    let active = true;

    getMaintenanceMode()
      .then((mode) => {
        if (!active) return;
        setMaintenanceModeState(mode);
      })
      .catch((error) => {
        console.error('Initial maintenance mode read failed:', error);
      });

    const unsubscribe = subscribeToMaintenanceMode(
      (mode) => {
        if (active) setMaintenanceModeState(mode);
      },
      (error) => {
        console.error('Maintenance mode realtime listener failed:', error);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // 2. Dual-Layer Session Timeout:

  // - Layer A: Idle Timeout (30 Menit tidak ada interaksi)
  // - Layer B: Absolute Timeout (Masa aktif sesi maksimal 12 Jam)
  useEffect(() => {
    if (!userSession) return;

    lastActivityRef.current = Date.now();

    const triggerIdleTimeout = () => {
      resetAllViewStates();
      clearAllFileLocalCache();
      logoutUser(userSession).catch(() => {});
      setUserSession(null);
      setInactivityNotice(
        'Sesi Anda telah berakhir secara otomatis karena tidak ada aktivitas selama 30 menit demi menjaga keamanan data penomoran SPO.'
      );
      addToast(
        'error',
        'Sesi Kedaluwarsa (Idle Timeout)',
        'Sistem telah mengeluarkan Anda secara otomatis karena tidak ada aktivitas selama 30 menit.'
      );
    };

    const triggerAbsoluteTimeout = () => {
      resetAllViewStates();
      clearAllFileLocalCache();
      logoutUser(userSession).catch(() => {});
      setUserSession(null);
      setInactivityNotice(
        'Masa aktif sesi Anda telah mencapai batas maksimal (12 jam). Silakan login kembali untuk melanjutkan.'
      );
      addToast(
        'error',
        'Sesi Berakhir (Batas Maksimal 12 Jam)',
        'Masa aktif sesi 12 jam telah habis demi kepatuhan audit keamanan.'
      );
    };

    const updateActivity = () => {
      const now = Date.now();
      const elapsedIdle = now - lastActivityRef.current;
      
      // Check absolute timeout
      const sessionCreated = userSession.sessionCreatedAt || now;
      if (now - sessionCreated >= ABSOLUTE_TIMEOUT_MS) {
        triggerAbsoluteTimeout();
        return;
      }

      // Check idle timeout
      if (elapsedIdle >= IDLE_TIMEOUT_MS) {
        triggerIdleTimeout();
        return;
      }

      lastActivityRef.current = now;
    };

    // When user switches tabs, minimizes window, or returns back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        const sessionCreated = userSession.sessionCreatedAt || now;
        if (now - sessionCreated >= ABSOLUTE_TIMEOUT_MS) {
          triggerAbsoluteTimeout();
          return;
        }

        const elapsedIdle = now - lastActivityRef.current;
        if (elapsedIdle >= IDLE_TIMEOUT_MS) {
          triggerIdleTimeout();
        }
      }
    };

    // Listen to user activity events
    const activityEvents = [
      'mousemove',
      'mousedown',
      'mouseup',
      'keydown',
      'keyup',
      'touchstart',
      'touchend',
      'touchmove',
      'scroll',
      'wheel',
      'click',
      'input'
    ];

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, updateActivity, { passive: true });
      document.addEventListener(evt, updateActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    const checkInterval = setInterval(() => {
      const now = Date.now();
      
      // Absolute timeout check
      const sessionCreated = userSession.sessionCreatedAt || now;
      if (now - sessionCreated >= ABSOLUTE_TIMEOUT_MS) {
        triggerAbsoluteTimeout();
        return;
      }

      // Idle timeout check
      const elapsedIdle = now - lastActivityRef.current;
      if (elapsedIdle >= IDLE_TIMEOUT_MS) {
        triggerIdleTimeout();
      }
    }, 2000); // Check every 2 seconds

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, updateActivity);
        document.removeEventListener(evt, updateActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearInterval(checkInterval);
    };
  }, [userSession?.sessionId, userSession?.sessionCreatedAt]);
  // 1. Application data is loaded from authenticated local database only.
  // Do not hydrate SOPs, users, or numbering rules from browser storage.
  const [sops, setSops] = useState<SopDocument[]>([]);
  const [libraryDocuments, setLibraryDocuments] = useState<LibraryDocument[]>([]);
  const [mainMenuTab, setMainMenuTab] = useState<MainMenuTab>('dashboard');
  // Tracks local database connectivity/quota failures without crashing the app.
  const [localDataUnavailable, setLocalDataUnavailable] = useState(false);

  // Central maintenance mode. Stored in local database so it applies to every
  // browser/device and updates in real time.
  const [maintenanceMode, setMaintenanceModeState] = useState<{
    enabled: boolean;
    message: string;
    updatedAt?: string;
    updatedBy?: string;
  }>({
    enabled: false,
    message: 'Sistem sedang dalam pemeliharaan. Silakan coba kembali beberapa saat lagi.'
  });
  const [isChangingMaintenanceMode, setIsChangingMaintenanceMode] = useState(false);

  const [numberingConfig, setNumberingConfig] = useState<NumberingConfig>({
    ...DEFAULT_NUMBERING_CONFIG,
    currentCounter: 0,
    divisionCounters: {}
  });

  const [users, setUsers] = useState<UserAccount[]>([]);

  const divisions = MASTER_DIVISIONS;
  const categories = MASTER_CATEGORIES;

  // 2. Filter & View States
  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: '',
    division: '',
    category: '',
    status: '',
    year: '',
    sortBy: 'sopNumber',
    sortOrder: 'desc'
  });

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // 3. Modal Controls
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedSopForDetail, setSelectedSopForDetail] = useState<SopDocument | null>(null);
  const [selectedSopForEdit, setSelectedSopForEdit] = useState<SopDocument | null>(null);
  const [selectedSopForActivation, setSelectedSopForActivation] = useState<SopDocument | null>(null);
  const [sopToDelete, setSopToDelete] = useState<{ id: string; title: string; sopNumber: string } | null>(null);
  const [isPrintRegisterOpen, setIsPrintRegisterOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState(false);
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const isRestoringRef = useRef(false);
  // Prevent a stale local database realtime snapshot from overwriting a just-restored
  // authoritative local snapshot.
  const awaitingRestoredSnapshotRef = useRef(false);
  const expectedRestoredIdsRef = useRef<Set<string>>(new Set());

  // 4. Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const skCount = useMemo(() => libraryDocuments.filter((d) => d.type === 'SK').length, [libraryDocuments]);
  const mouCount = useMemo(() => libraryDocuments.filter((d) => d.type === 'MOU').length, [libraryDocuments]);
  const activeSopCount = useMemo(() => sops.filter((s) => s.status === 'AKTIF').length, [sops]);
  const finalDocCount = activeSopCount + libraryDocuments.length;

  // Sync to localStorage as backup



  const handleAdminBackup = async () => {
    if (userSession?.role !== 'admin' || isBackingUp) return;

    setIsBackingUp(true);
    try {
      const backup = await createSystemBackup(userSession.username);
      const filename = downloadSystemBackup(backup);
      const { sops, sk, mou, users } = backup.data;

      addToast(
        'success',
        'Backup Berhasil',
        `${sops.length} SPO, ${sk.length} SK, ${mou.length} MOU, dan ${users.length} akun berhasil dicadangkan.`
      );

      await recordAuditLog({
        username: userSession.username,
        name: userSession.name,
        role: userSession.role,
        sessionId: userSession.sessionId,
        event: 'BACKUP_EXPORT',
        details: `Backup sistem berhasil dibuat: ${filename} (${sops.length} SPO, ${sk.length} SK, ${mou.length} MOU, ${users.length} akun).`
      });
    } catch (error) {
      console.error('Admin backup failed:', error);
      addToast(
        'error',
        'Backup Gagal',
        error instanceof Error ? error.message : 'Data belum berhasil dicadangkan. Silakan coba lagi.'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleAdminRestore = async () => {
    if (userSession?.role !== 'admin' || isRestoring) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanupInput = () => {
      input.onchange = null;
      input.remove();
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      cleanupInput();
      if (!file) {
        addToast('info', 'Restore Dibatalkan', 'Tidak ada file backup yang dipilih.');
        return;
      }

      setIsRestoring(true);
      setRestoreProgress('Memvalidasi dan memulihkan seluruh data sistem...');
      isRestoringRef.current = true;

      try {
        const result = await restoreSystemBackup(file, userSession.username);
        const restoredSops = await getAllSopsFromLocal();

        setSops(restoredSops);
        setFilters({
          searchQuery: '',
          division: '',
          category: '',
          status: '',
          year: '',
          sortBy: 'sopNumber',
          sortOrder: 'desc'
        });
        if (result.config) setNumberingConfig(result.config);
        if (result.users.length) setUsers(result.users.filter((u) => u.username !== 'guest'));

        const restoredLibrary = [...result.sk, ...result.mou];
        setLibraryDocuments(restoredLibrary);
        expectedRestoredIdsRef.current = new Set(restoredSops.map((s) => s.id));
        awaitingRestoredSnapshotRef.current = true;

        setRestoreProgress('');
        addToast(
          'success',
          'Restore Berhasil',
          `${result.sops.length} SPO, ${result.sk.length} SK, ${result.mou.length} MOU, dan ${result.users.length} akun berhasil dipulihkan. ${result.sopAttachmentCount} lampiran SPO serta ${result.libraryFiles} file SK/MOU dipulihkan.`
        );

        await recordAuditLog({
          username: userSession.username,
          name: userSession.name,
          role: userSession.role,
          sessionId: userSession.sessionId,
          event: 'RESTORE_EXECUTE',
          details: `Restore sistem berhasil: ${result.sops.length} SPO, ${result.sk.length} SK, ${result.mou.length} MOU, ${result.users.length} akun.`
        });
      } catch (error) {
        console.error('Admin restore failed:', error);
        awaitingRestoredSnapshotRef.current = false;
        expectedRestoredIdsRef.current = new Set();
        setRestoreProgress('');
        addToast(
          'error',
          'Restore Gagal',
          error instanceof Error ? error.message : 'File backup tidak dapat dipulihkan.'
        );
      } finally {
        isRestoringRef.current = false;
        setIsRestoring(false);
      }
    };

    input.click();
  };

  // Local browser data subscriptions
  useEffect(() => {
    // Never open application data listeners before Offline Authentication has
    // established a trusted session.
    if (!userSession) return;

    // Offline/quota fallback: keep the last successfully synchronized SOP list visible.
    // This never writes anything to local database and never treats cache as authoritative.
    try {
      const cachedSops = localStorage.getItem('soegiri_sops_last_good');
      if (cachedSops && (!sops || sops.length === 0)) {
        const parsed = JSON.parse(cachedSops);
        if (Array.isArray(parsed)) setSops(parsed);
      }
    } catch {}

    const activePetugasDivisions = userSession.role === 'petugas'
      ? (Array.isArray(userSession.assignments) && userSession.assignments.length
          ? Array.from(new Set(userSession.assignments.map((a) => a.divisionCode).filter(Boolean)))
          : (userSession.divisionCode || 'PEL'))
      : 'ALL';
    const unsubscribeSops = subscribeToSops((localSops) => {
      // During restore, never allow an intermediate cached snapshot to overwrite
      // the authoritative local result.
      if (isRestoringRef.current) return;

      // After restore, wait for the realtime listener to catch up to the exact
      // restored local state. Older cached snapshots are ignored.
      if (awaitingRestoredSnapshotRef.current) {
        const incomingIds = new Set(localSops.map((s) => s.id));
        const expectedIds = expectedRestoredIdsRef.current;
        const matchesExpected =
          incomingIds.size === expectedIds.size &&
          Array.from(expectedIds).every((id: string) => incomingIds.has(id));

        if (!matchesExpected) return;

        awaitingRestoredSnapshotRef.current = false;
        expectedRestoredIdsRef.current = new Set();
      }

      setSops(localSops);
      try {
        localStorage.setItem('soegiri_sops_last_good', JSON.stringify(localSops));
      } catch {}
      setLocalDataUnavailable(false);
    }, (err) => {
      setLocalDataUnavailable(true);
      console.error('local database SOP subscription unavailable:', err);
    }, activePetugasDivisions);

    const mergeLibraryDocuments = (type: 'SK' | 'MOU', documents: LibraryDocument[]) => {
      setLibraryDocuments((current) => {
        const otherType = current.filter((document) => document.type !== type);
        return [...otherType, ...documents];
      });
      setLocalDataUnavailable(false);
    };

    const unsubscribeSK = subscribeToSKDocuments(
      (documents) => mergeLibraryDocuments('SK', documents),
      (err) => {
        setLocalDataUnavailable(true);
        console.error('local database SK subscription unavailable:', err);
      }
    );

    const unsubscribeMOU = subscribeToMOUDocuments(
      (documents) => mergeLibraryDocuments('MOU', documents),
      (err) => {
        setLocalDataUnavailable(true);
        console.error('local database MOU subscription unavailable:', err);
      }
    );

    const unsubscribeConfig = subscribeToNumberingConfig((localConfig) => {
      setNumberingConfig(localConfig);
      setLocalDataUnavailable(false);
    }, (err) => {
      setLocalDataUnavailable(true);
      console.error('local database numbering config unavailable:', err);
    });

    const unsubscribeUsers = userSession.role === 'admin'
      ? subscribeToUsers(
          (localUsers) => {
            setUsers(localUsers);
            setLocalDataUnavailable(false);
          },
          (err) => {
            setLocalDataUnavailable(true);
            console.error('local database users subscription unavailable:', err);
          }
        )
      : () => {};

    if (userSession.role !== 'admin') {
      setUsers([]);
    }

  
    return () => {
      unsubscribeSops();
      unsubscribeSK();
      unsubscribeMOU();
      unsubscribeConfig();
      unsubscribeUsers();
    };
  }, [userSession?.authUid, userSession?.divisionCode, userSession?.role, userSession?.assignments]);

  // Compute available distinct years from SOPs
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    (sops || []).forEach((s) => {
      if (s?.effectiveDate) {
        const yr = s.effectiveDate.split('-')[0];
        if (yr) years.add(yr);
      }
      if (s?.createdAt) {
        const yr = new Date(s.createdAt).getFullYear().toString();
        if (yr && yr !== 'NaN') years.add(yr);
      }
    });
    return Array.from(years).sort().reverse();
  }, [sops]);

  // Filter and Sort Logic
  const filteredAndSortedSops = useMemo(() => {
    const query = filters.searchQuery.toLowerCase().trim();

    return (sops || [])
      .filter((sop) => {
        // Search SPO hanya berdasarkan judul dokumen.
        // Detail isi tidak digunakan sebagai sumber pencarian.
        if (query && !(sop.title || '').toLowerCase().includes(query)) {
          return false;
        }

        // Division Filter
        if (filters.division && sop.divisionCode !== filters.division) {
          return false;
        }

        // Category Filter
        if (filters.category && sop.categoryName !== filters.category && sop.divisionCode !== filters.category) {
          return false;
        }

        // Status Filter
        if (filters.status && sop.status !== filters.status) {
          return false;
        }

        // Year Filter
        if (filters.year) {
          const sopYear = sop.effectiveDate ? sop.effectiveDate.split('-')[0] : '';
          const createYear = new Date(sop.createdAt).getFullYear().toString();
          if (sopYear !== filters.year && createYear !== filters.year) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = a[filters.sortBy];
        let valB: any = b[filters.sortBy];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return filters.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return filters.sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [sops, filters]);

  // Handlers
  const handleFilterChange = (updates: Partial<FilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleResetFilters = () => {
    setFilters({
      searchQuery: '',
      division: '',
      category: '',
      status: '',
      year: '',
      sortBy: 'sopNumber',
      sortOrder: 'desc'
    });
    addToast('info', 'Filter Direset', 'Semua filter pencarian telah dikembalikan.');
  };

  // Add New SOP
  const handleCreateSop = async (newSopData: Omit<SopDocument, 'id' | 'createdAt' | 'updatedAt' | 'revisionHistory'> & { id?: string }): Promise<SopDocument> => {
    const now = new Date().toISOString();
    const newId = newSopData.id || `sop-${Date.now()}`;
    const isLegacyInput = newSopData.documentType === 'LAMA' || newSopData.isLegacySop;
    const isNewSopInput = (newSopData.jenis_spo || newSopData.documentType) === 'BARU';

    // BARU always receives its sequence from the atomic reservation register.
    // This prevents two tabs/users from ever getting the same number.
    let authoritativeSopData = newSopData;
    if (isNewSopInput && !isLegacyInput) {
      const reserved = await reserveNextSopNumber({
        config: numberingConfig,
        divisionCode: newSopData.divisionCode,
        subHierarchyCode: newSopData.subHierarchyCode,
        dateStr: newSopData.effectiveDate,
        reservedBy: newSopData.creatorName || userSession?.name || 'Administrator'
      });
      authoritativeSopData = {
        ...newSopData,
        sequenceNumber: reserved.sequenceNumber,
        sopNumber: reserved.sopNumber
      };
    }

    const newSop: SopDocument = {
      ...authoritativeSopData,
      id: newId,
      createdAt: now,
      updatedAt: now,
      revisionHistory: [
        {
          id: `rev-init-${Date.now()}`,
          version: newSopData.revisionNumber || newSopData.version || '00',
          date: newSopData.effectiveDate || now.split('T')[0],
          author: newSopData.creatorName,
          notes: 'Registrasi dan penerbitan nomor resmi SPO RSUD Dr. Soegiri Lamongan.'
        }
      ]
    };

    // Cache physical files in local persistent storage
    if (newSop.fileDataUrl) {
      saveFileToLocalCache(newSop.id, 'file', newSop.fileDataUrl);
    }
    if (newSop.oldFileDataUrl) {
      saveFileToLocalCache(newSop.id, 'oldFile', newSop.oldFileDataUrl);
    }

    const isLegacy = authoritativeSopData.documentType === 'LAMA' || authoritativeSopData.isLegacySop;
    const finalSop = isLegacy ? newSop : standardizeSopDocument(newSop);

    if (isLegacy) {
      // Even legacy uploads must wait for the authoritative local database write
      // before the UI reports success.
      await saveSopToLocal(finalSop);
      setSops((prev) => prev.some((s) => s.id === finalSop.id)
        ? prev.map((s) => (s.id === finalSop.id ? finalSop : s))
        : [finalSop, ...prev]);

      addToast(
        'success',
        'SPO Lama Berhasil Disimpan!',
        `Dokumen SPO Lama "${finalSop.title}" dengan nomor ${finalSop.sopNumber} berhasil disimpan ke database tanpa menerbitkan nomor urut baru.`
      );

      return finalSop;
    }

    // Calculate updated numbering config per division and unit
    const prevCounters = numberingConfig?.divisionCounters || {};
    const divCode = finalSop.divisionCode;
    const subCode = finalSop.subHierarchyCode || '';
    const unitKey = getUnitKey(divCode, subCode);

    // Collision prevention: ensure sequenceNumber and sopNumber are strictly unique in this unit
    const usedSequences = getUsedSequencesForUnit(sops, divCode, subCode, finalSop.effectiveDate ? finalSop.effectiveDate.slice(0, 4) : undefined);
    let allocatedSeq = finalSop.sequenceNumber || getNextSequenceNumber(numberingConfig, divCode, subCode, sops, finalSop.effectiveDate ? finalSop.effectiveDate.slice(0, 4) : undefined);

    if (usedSequences.has(allocatedSeq)) {
      // Collision detected with another registered document in this unit:
      // Allocate next lowest unused positive integer
      let nextAvailable = 1;
      while (usedSequences.has(nextAvailable)) {
        nextAvailable++;
      }
      allocatedSeq = nextAvailable;
      finalSop.sequenceNumber = allocatedSeq;

      // Re-generate standard number with unique sequence
      const paddedNum = getPaddedNumber(allocatedSeq, 3);
      const effectiveYear = finalSop.effectiveDate ? finalSop.effectiveDate.split('-')[0] : (SOEGIRI_HOSPITAL_INFO.year || '2026');
      finalSop.sopNumber = subCode
        ? `${divCode} / ${subCode} / ${paddedNum} / ${effectiveYear}`
        : `${divCode} / ${paddedNum} / ${effectiveYear}`;
    }

    const updatedConfig: NumberingConfig = {
      ...numberingConfig,
      currentCounter: Math.max((numberingConfig?.currentCounter || 0) + 1, allocatedSeq),
      divisionCounters: {
        ...prevCounters,
        [unitKey]: Math.max(prevCounters[unitKey] || 0, allocatedSeq),
        [divCode]: Math.max(prevCounters[divCode] || 0, allocatedSeq)
      }
    };

    // Persist first. The registration UI must wait for local database acknowledgement
    // before showing the success dialog; local state is updated only after the
    // local write succeeds.
    await registerSopAndNumberingToLocal(finalSop, updatedConfig);

    setNumberingConfig(updatedConfig);
    setSops((prev) => prev.some((s) => s.id === finalSop.id)
      ? prev.map((s) => (s.id === finalSop.id ? finalSop : s))
      : [finalSop, ...prev]);

    addToast(
      'success',
      'SPO Berhasil Didaftarkan!',
      `Nomor resmi ${finalSop.sopNumber} telah dialokasikan untuk "${finalSop.title}".`
    );

    return finalSop;
  };

  const handleIssueSopNumber = async (params: { divisionCode: string; subHierarchyCode?: string; dateStr?: string }): Promise<string> => {
    if (userSession?.role !== 'admin' && userSession?.role !== 'petugas') {
      throw new Error('Akses penerbitan nomor SPO ditolak.');
    }
    const effectiveDivision = String(params.divisionCode || '').trim().toUpperCase();
    if (!effectiveDivision || effectiveDivision === 'ALL') {
      throw new Error('Unit kerja yang dipilih tidak valid untuk penerbitan nomor SPO.');
    }

    const reserved = await reserveNextSopNumber({
      config: numberingConfig,
      divisionCode: effectiveDivision,
      subHierarchyCode: params.subHierarchyCode,
      dateStr: params.dateStr || new Date().toISOString().slice(0, 10),
      reservedBy: userSession?.name || userSession?.username || 'Administrator'
    });
    return reserved.sopNumber;
  };

  const handleSaveMaintenanceMode = async (enabled: boolean, message: string) => {
    if (userSession?.role !== 'admin') return;

    const updatedBy = userSession.name || userSession.username || 'Administrator';
    await setMaintenanceMode(enabled, message, updatedBy);

    setMaintenanceModeState({
      enabled,
      message,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });

    addToast(
      'success',
      enabled ? 'Mode Pemeliharaan Aktif' : 'Mode Pemeliharaan Dinonaktifkan',
      enabled
        ? 'Akses pengguna/petugas dialihkan ke layar pemeliharaan secara realtime.'
        : 'Akses normal telah dibuka kembali untuk semua pengguna.'
    );
  };

  const handleToggleMaintenanceMode = async () => {
    if (userSession?.role !== 'admin' || isChangingMaintenanceMode) return;
    setIsMaintenanceModalOpen(true);
  };

  const handleLogout = async () => {
    if (userSession) {
      await logoutUser(userSession).catch((err) => console.error('Error logging out from server:', err));
    }
    resetAllViewStates();
    clearAllFileLocalCache();
    setUserSession(null);
    setInactivityNotice(null);
    addToast('info', 'Sesi Berakhir', 'Anda telah keluar dari aplikasi dengan aman.');
  };

  // Edit SOP
  const handleUpdateSop = async (updatedSop: SopDocument) => {
    const isLegacy = updatedSop.documentType === 'LAMA' || updatedSop.isLegacySop;
    const normalizedDivision = (updatedSop.divisionCode || (updatedSop.sopNumber ? updatedSop.sopNumber.split('/')[0]?.trim() : 'PEL') || 'PEL').trim().toUpperCase();
    const normalizedHierarchy = (updatedSop.subHierarchyCode || '').trim().replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    const effectiveYear = updatedSop.effectiveDate?.slice(0, 4) || (updatedSop.createdAt ? String(new Date(updatedSop.createdAt).getFullYear()) : (SOEGIRI_HOSPITAL_INFO.year || '2026'));
    let normalizedSequence = typeof updatedSop.sequenceNumber === 'number' && updatedSop.sequenceNumber > 0 ? updatedSop.sequenceNumber : 1;
    let normalizedNumber = updatedSop.sopNumber || '';

    if (!isLegacy) {
      const previous = sops.find((s) => s.id === updatedSop.id);
      const previousHierarchy = (previous?.subHierarchyCode || '').trim();
      const previousDivision = (previous?.divisionCode || '').trim().toUpperCase();
      const previousYear = previous?.effectiveDate?.slice(0, 4) || (previous?.createdAt ? String(new Date(previous.createdAt).getFullYear()) : '');
      const unitChanged = previousDivision !== normalizedDivision || previousHierarchy !== normalizedHierarchy || previousYear !== effectiveYear;
      const used = getUsedSequencesForUnit(sops.filter((s) => s.id !== updatedSop.id), normalizedDivision, normalizedHierarchy, effectiveYear);
      if (unitChanged || used.has(normalizedSequence)) {
        normalizedSequence = getNextSequenceNumber(numberingConfig, normalizedDivision, normalizedHierarchy, sops.filter((s) => s.id !== updatedSop.id), effectiveYear);
      }
      const padded = getPaddedNumber(normalizedSequence, 3);
      normalizedNumber = normalizedHierarchy
        ? `${normalizedDivision} / ${normalizedHierarchy} / ${padded} / ${effectiveYear}`
        : `${normalizedDivision} / ${padded} / ${effectiveYear}`;
    }

    const finalUpdatedSop: SopDocument = {
      ...updatedSop,
      sopNumber: normalizedNumber,
      sequenceNumber: normalizedSequence,
      subHierarchyCode: normalizedHierarchy,
      divisionCode: normalizedDivision,
      divisionName: updatedSop.divisionName,
      categoryName: updatedSop.categoryName,
      status: isLegacy
        ? ((updatedSop.status === 'TIDAK_AKTIF' ? 'TIDAK_AKTIF' : 'AKTIF') as SopStatus)
        : (updatedSop.status || 'AKTIF'),
      ...(isLegacy ? { jenis_spo: 'EKSISTING' as const, documentType: 'LAMA' as const, isLegacySop: true } : {})
    };

    if (finalUpdatedSop.fileDataUrl) {
      saveFileToLocalCache(finalUpdatedSop.id, 'file', finalUpdatedSop.fileDataUrl);
    }
    if (finalUpdatedSop.oldFileDataUrl) {
      saveFileToLocalCache(finalUpdatedSop.id, 'oldFile', finalUpdatedSop.oldFileDataUrl);
    }

    setSops((prev) => prev.map((s) => (s.id === finalUpdatedSop.id ? finalUpdatedSop : s)));
    
    // Also update active detail view if it's currently open
    if (selectedSopForDetail?.id === finalUpdatedSop.id) {
      setSelectedSopForDetail(finalUpdatedSop);
    }

    try {
      await saveSopToLocal(finalUpdatedSop);
    } catch (err) {
      console.error('Error updating SOP in local database:', err);
    }

    addToast('success', 'Perubahan Disimpan', `Dokumen ${finalUpdatedSop.sopNumber} berhasil diperbarui.`);
  };

  // Delete SOP Handler (Opens Custom Confirm Modal)
  const handleDeleteSop = (id: string, title: string) => {
    const target = sops.find((s) => s.id === id);
    setSopToDelete({
      id,
      title,
      sopNumber: target?.sopNumber || id
    });
  };

  const confirmDeleteSop = async () => {
    if (!sopToDelete) return;
    const { id, title } = sopToDelete;

    try {
      // Persist the delete first. This prevents a delete racing with a
      // subsequent restore and ensures the UI only reflects confirmed state.
      await deleteSopFromLocal(id);
      deleteFileFromLocalCache(id);
      const nextSops = sops.filter((s) => s.id !== id);
      setSops(nextSops);

    if (nextSops.length === 0) {
      const resetConfig: NumberingConfig = {
        ...numberingConfig,
        currentCounter: 0,
        divisionCounters: {}
      };
      setNumberingConfig(resetConfig);
      saveConfigToLocal(resetConfig).catch((err) => console.error('Error resetting config in local database:', err));
      addToast('info', 'Penomoran Direset', `SPO "${title}" telah dihapus. Daftar SPO kini kosong dan penomoran otomatis di-reset dari awal (#001).`);
    } else {
      addToast('info', 'Dokumen Dihapus', `SPO "${title}" telah dihapus dari daftar.`);
    }

    if (selectedSopForDetail?.id === id) {
      setSelectedSopForDetail(null);
    }
    if (selectedSopForEdit?.id === id) {
      setSelectedSopForEdit(null);
    }
    setSopToDelete(null);
    } catch (error) {
      console.error('Error deleting SOP from local database:', error);
      addToast('error', 'Penghapusan Gagal', 'Dokumen tidak dihapus karena perubahan belum berhasil disimpan ke server.');
    }
  };

  const handleResetCountersToZero = () => {
    const resetConfig: NumberingConfig = {
      ...numberingConfig,
      currentCounter: 0,
      divisionCounters: {}
    };
    setNumberingConfig(resetConfig);
    saveConfigToLocal(resetConfig).catch((err) => console.error('Error resetting config in local database:', err));
    addToast('success', 'Penomoran Diatur Ulang', 'Penghitung (counter) penomoran SPO berhasil diatur ulang dari awal (#001).');
  };

  // Quick Status Update (Admin Only). AKTIF hanya melalui Pengesahan/Aktivasi.
  const handleUpdateStatus = (id: string, newStatus: SopStatus) => {
    if (userSession?.role !== 'admin') {
      addToast('error', 'Akses Ditolak', 'Hanya Administrator yang memiliki wewenang untuk mengubah status dokumen.');
      return;
    }
    const target = sops.find((s) => s.id === id);
    if (!target) return;
    const isExisting = target.documentType === 'LAMA' || target.jenis_spo === 'EKSISTING' || target.isLegacySop;
    if (newStatus === 'AKTIF') {
      if (isExisting) {
        // SPO Eksisting sudah sah dan bertanda tangan Direktur. Tidak perlu aktivasi ulang.
        const updated = { ...target, status: 'AKTIF' as SopStatus, updatedAt: new Date().toISOString() };
        setSops((prev) => prev.map((s) => s.id === id ? updated : s));
        if (selectedSopForDetail?.id === id) setSelectedSopForDetail(updated);
        saveSopToLocal(updated).catch((err) => console.error('Error updating existing SPO status:', err));
        addToast('success', 'SPO Eksisting Aktif', 'SPO Eksisting sudah merupakan dokumen sah dan tidak memerlukan pengesahan ulang.');
        return;
      }
      addToast('info', 'Gunakan Pengesahan', 'SPO Baru/Riviu hanya dapat menjadi Aktif melalui proses Pengesahan/Aktivasi.');
      setSelectedSopForActivation(target);
      return;
    }
    const updated = { ...target, status: newStatus, updatedAt: new Date().toISOString() };
    setSops((prev) => prev.map((s) => s.id === id ? updated : s));
    if (selectedSopForDetail?.id === id) setSelectedSopForDetail(updated);
    saveSopToLocal(updated).catch((err) => console.error('Error updating status in local database:', err));
    addToast('success', 'Status Diperbarui', `Status SPO diubah menjadi ${newStatus === 'TIDAK_AKTIF' ? 'Tidak Aktif' : 'Menunggu Pengesahan'}.`);
  };

  const handleConfirmActivation = async (sopId: string, activationData: {
    activatedAt: string; activatedBy: string; activationNotes: string;
    signedScanFileName?: string; signedScanFileSize?: number; signedScanFileType?: string; signedScanDataUrl?: string;
  }) => {
    if (userSession?.role !== 'admin') {
      addToast('error', 'Akses Ditolak', 'Hanya Admin Tata Naskah yang dapat mengaktifkan SPO.');
      return;
    }
    const target = sops.find((s) => s.id === sopId);
    if (!target || target.status !== 'MENUNGGU_PENGESAHAN') {
      addToast('error', 'Aktivasi Ditolak', 'Hanya SPO dengan status Menunggu Pengesahan yang dapat diaktifkan.');
      return;
    }
    const updated: SopDocument = {
      ...target, status: 'AKTIF', updatedAt: new Date().toISOString(),
      activatedAt: activationData.activatedAt, activatedBy: activationData.activatedBy,
      activationNotes: activationData.activationNotes, signedScanFileName: activationData.signedScanFileName,
      signedScanFileSize: activationData.signedScanFileSize, signedScanFileType: activationData.signedScanFileType,
      signedScanDataUrl: activationData.signedScanDataUrl,
    };
    try {
      if (activationData.signedScanDataUrl) await saveFileToLocalCache(sopId, 'signedScan', activationData.signedScanDataUrl);
      await saveSopToLocal(updated);
      setSops((prev) => prev.map((s) => s.id === sopId ? updated : s));
      setSelectedSopForDetail((prev) => prev?.id === sopId ? updated : prev);
      setSelectedSopForActivation(null);
      addToast('success', 'SPO Diaktifkan', `SPO ${updated.sopNumber} telah disahkan dan berstatus Aktif.`);
    } catch (err) {
      console.error('Error activating SOP:', err);
      addToast('error', 'Aktivasi Gagal', err instanceof Error ? err.message : 'Data aktivasi tidak dapat disimpan.');
    }
  };

  // Copy Number
  const handleCopyNumber = (num: string) => {
    addToast('info', 'Nomor Disalin', `Nomor ${num} telah disalin ke papan klip.`);
  };

  // Save Numbering Config
  const handleSaveConfig = (newConfig: NumberingConfig) => {
    setNumberingConfig(newConfig);
    saveConfigToLocal(newConfig).catch((err) => console.error('Error saving config to local database:', err));
    addToast('success', 'Format Penomoran Disimpan', 'Aturan penomoran otomatis berhasil diperbarui.');
  };

  const handleResetDefaultConfig = () => {
    setNumberingConfig(DEFAULT_NUMBERING_CONFIG);
    addToast('info', 'Pengaturan Diatur Ulang', 'Format penomoran dikembalikan ke Standar Baku RSUD Dr. Soegiri Lamongan.');
  };

  // Standardize All SOP Numbers manually (Admin Trigger)
  const handleStandardizeAllSopNumbers = () => {
    const { updatedSops, changedCount, changes, duplicateCount } = standardizeAllSops(sops);
    if (changedCount === 0) {
      addToast(
        'info',
        'Penomoran Sudah Standar Baku & Bebas Duplikat',
        'Semua nomor dokumen SPO yang terdaftar sudah 100% unik dan sesuai dengan Pedoman Tata Naskah RSUD Dr. Soegiri Lamongan.'
      );
      return;
    }

    setSops(updatedSops);
    updatedSops.forEach((s) => {
      if (changes.some((c) => c.newNumber === s.sopNumber)) {
        saveSopToLocal(s).catch((err) => console.error('Error saving standardized SOP to local database:', err));
      }
    });

    const summaryList = changes
      .slice(0, 4)
      .map((c) => `• ${c.oldNumber} ➔ ${c.newNumber}`)
      .join('\n');
    const remaining = changes.length > 4 ? `\n...dan ${changes.length - 4} dokumen lainnya.` : '';

    addToast(
      'success',
      `${changedCount} Nomor SPO Berhasil Disesuaikan!`,
      `${duplicateCount > 0 ? `Ditemukan & diperbaiki ${duplicateCount} nomor duplikat per unit.\n` : ''}Seluruh format nomor unit telah distandarkan:\n${summaryList}${remaining}`
    );
  };

  // User Management Handlers
  const handleSaveUser = async (userAcc: UserAccount) => {
    try {
      await saveUserToLocal(userAcc);
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === userAcc.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = userAcc;
          return updated;
        }
        return [...prev, userAcc];
      });
    } catch (e) {
      console.error('Failed to save user account:', e);
      throw e;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUserFromLocal(userId);
    } catch (e) {
      console.error('Failed to delete user account from local database:', e);
    } finally {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  // Self password update for Petugas / logged-in user
  const handleUpdateSelfPassword = async (
    currentPass: string, 
    newPass: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!userSession) {
      return { success: false, message: 'Sesi login tidak valid. Silakan login kembali.' };
    }

    if (!newPass || newPass.trim().length < 4) {
      return { success: false, message: 'Kata sandi baru minimal harus 4 karakter.' };
    }

    const result = await changeUserPassword(userSession.username, currentPass, newPass);
    if (result.success) {
      addToast('success', 'Kata Sandi Diperbarui', 'Kata sandi akun Anda berhasil diganti secara aman.');
    }
    return result;
  };


  // Avoid flashing the login page while a refresh session is being restored.
  if (isSessionRestoring) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Memulihkan sesi...</div>
      </div>
    );
  }

  // Render Login Page if no user session
  if (!userSession) {
    return (
      <>
        <LoginPage 
          onLogin={(session) => {
            resetAllViewStates();
            setInactivityNotice(null);
            setSessionKey(Date.now());
            persistClientSession(session);
            setUserSession(session);
          }} 
          inactivityNotice={inactivityNotice}
          maintenanceMode={maintenanceMode}
        />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  // Maintenance mode blocks non-admin users immediately and in real time.
  if (maintenanceMode.enabled && userSession.role !== 'admin') {
    return (
      <MaintenancePage
        message={maintenanceMode.message}
        onLogout={handleLogout}
      />
    );
  }

  // Render Petugas View if user role is 'petugas'
  if (userSession.role === 'petugas') {
    return (
      <div key={`session-petugas-${sessionKey}`} className="min-h-screen bg-slate-50 flex flex-col selection:bg-emerald-500 selection:text-white">
        <div className={Boolean(selectedSopForDetail) ? 'no-print' : ''}>
          <PetugasView
            key={`view-petugas-${sessionKey}`}
            userSession={userSession}
            onLogout={handleLogout}
            sops={sops}
            libraryDocuments={libraryDocuments}
            onAddSop={handleCreateSop}
            onIssueSopNumber={handleIssueSopNumber}
            numberingConfig={numberingConfig}
            divisions={divisions}
            categories={categories}
            onViewDetail={(sop) => setSelectedSopForDetail(sop)}
            onCopyNumber={handleCopyNumber}
            users={users}
            onUpdatePassword={handleUpdateSelfPassword}
            onShowToast={addToast}
          />
        </div>

        <SopDetailModal
          isOpen={Boolean(selectedSopForDetail)}
          sop={selectedSopForDetail}
          onClose={() => setSelectedSopForDetail(null)}
          onEdit={(sop) => {
            setSelectedSopForDetail(null);
            setSelectedSopForEdit(sop);
          }}
          onDelete={() => {}}
          onUpdateStatus={handleUpdateStatus}
          onCopyNumber={handleCopyNumber}
          userSession={userSession}
        />

        <EditSopModal
          key={selectedSopForEdit?.id || 'none'}
          isOpen={Boolean(selectedSopForEdit)}
          sop={selectedSopForEdit}
          onClose={() => setSelectedSopForEdit(null)}
          onSubmit={handleUpdateSop}
          divisions={divisions}
          categories={categories}
          userSession={userSession}
          sops={sops}
        />

        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  // Render Admin View for 'admin' role
  return (
    <div key={`session-admin-${sessionKey}`} className="min-h-screen bg-slate-50 text-slate-800 selection:bg-emerald-500 selection:text-white">
      <div className="flex min-h-screen">
        {/* Admin Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 no-print shadow-xs ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {/* Sidebar Header */}
          <div className="h-20 px-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <HospitalLogo size="sm" />
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-wider text-slate-900 truncate">SIDOKTER SOEGIRI</div>
                <div className="text-[11px] text-emerald-700 font-semibold truncate">RSUD Dr. Soegiri</div>
              </div>
            </div>
            <button type="button" onClick={() => setAdminSidebarOpen(false)} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Tutup menu"><X className="w-5 h-5" /></button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

            {/* NAVIGASI */}
            <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Navigasi
            </div>

            <button
              type="button"
              onClick={() => { setMainMenuTab('dashboard'); setAdminSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${mainMenuTab === 'dashboard' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold'}`}
            >
              <Home className={`w-4 h-4 ${mainMenuTab === 'dashboard' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => { setMainMenuTab('spo'); setAdminSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${mainMenuTab === 'spo' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold'}`}
            >
              <FileText className={`w-4 h-4 ${mainMenuTab === 'spo' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="flex-1 text-left">Dokumen SPO</span>
              <span className="text-[10px] font-bold text-slate-400">{sops.length}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMainMenuTab('sk'); setAdminSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${mainMenuTab === 'sk' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold'}`}
            >
              <FileText className={`w-4 h-4 ${mainMenuTab === 'sk' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="flex-1 text-left">Dokumen SK</span>
              <span className="text-[10px] font-bold text-slate-400">{skCount}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMainMenuTab('mou'); setAdminSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${mainMenuTab === 'mou' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold'}`}
            >
              <FileText className={`w-4 h-4 ${mainMenuTab === 'mou' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="flex-1 text-left">Dokumen MOU</span>
              <span className="text-[10px] font-bold text-slate-400">{mouCount}</span>
            </button>

            <button
              type="button"
              onClick={() => { setMainMenuTab('library'); setAdminSidebarOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${mainMenuTab === 'library' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold'}`}
            >
              <BookOpen className={`w-4 h-4 ${mainMenuTab === 'library' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="flex-1 text-left">Library</span>
              <span className="text-[10px] font-bold text-slate-400">{finalDocCount}</span>
            </button>

            {/* ADMIN & MANAJEMEN */}
            <div className="px-3 pt-6 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Admin &amp; Manajemen
            </div>

            <button
              type="button"
              onClick={() => { setAdminSidebarOpen(false); setIsMasterDataOpen(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs transition-all cursor-pointer"
            >
              <Database className="w-4 h-4 text-slate-400" />
              <span>Master Hirarki &amp; Unit</span>
            </button>

            <button
              type="button"
              onClick={() => { setAdminSidebarOpen(false); setIsUserManagementOpen(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs transition-all cursor-pointer"
            >
              <Users className="w-4 h-4 text-slate-400" />
              <span>Manajemen Petugas</span>
            </button>

            <button
              type="button"
              onClick={() => { setAdminSidebarOpen(false); setIsBackupRestoreOpen(true); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs transition-all cursor-pointer"
            >
              <DatabaseBackup className="w-4 h-4 text-slate-400" />
              <span>Backup &amp; Restore Data</span>
            </button>

            <button
              type="button"
              onClick={() => { setAdminSidebarOpen(false); setIsMaintenanceModalOpen(true); }}
              disabled={isChangingMaintenanceMode}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${maintenanceMode.enabled ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'} disabled:opacity-60`}
              title={maintenanceMode.enabled ? 'Kelola mode pemeliharaan (Aktif)' : 'Kelola mode pemeliharaan (Nonaktif)'}
            >
              <Wrench className="w-4 h-4 text-amber-600" />
              <span className="flex-1 text-left">Mode Pemeliharaan</span>
              <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${maintenanceMode.enabled ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                {maintenanceMode.enabled ? 'Aktif' : 'Off'}
              </span>
            </button>

          </nav>

          {/* Sidebar User Footer */}
          <div className="p-3 border-t border-slate-100">
            <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                  {(userSession?.name || userSession?.username || 'A')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{userSession?.name || 'Administrator'}</div>
                  <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Online</span>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={handleLogout} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {adminSidebarOpen && <button aria-label="Tutup sidebar" className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden no-print" onClick={() => setAdminSidebarOpen(false)} />}

        <div className="flex-1 min-w-0">
          <div className="lg:hidden h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between no-print sticky top-0 z-30">
            <button type="button" onClick={() => setAdminSidebarOpen(true)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Buka menu"><Menu className="w-5 h-5" /></button>
            <div className="font-extrabold text-sm text-slate-800">SIDOKTER SOEGIRI</div>
          </div>

          {/* Top Main Navigation Header */}
          <Header
            activeTab={mainMenuTab}
            onTabChange={(tab) => {
              setMainMenuTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            totalSopCount={sops.length}
            activeSopCount={activeSopCount}
            skCount={skCount}
            mouCount={mouCount}
            finalDocCount={finalDocCount}
            onOpenUpload={() => {
              setMainMenuTab('spo');
              setIsUploadOpen(true);
            }}
            onOpenPrintAll={() => setIsPrintRegisterOpen(true)}
            onOpenUserManagement={() => setIsUserManagementOpen(true)}
            userSession={userSession}
            onLogout={handleLogout}
          />

          {/* Main Container */}
          <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 ${isPrintRegisterOpen || Boolean(selectedSopForDetail) ? 'no-print' : ''}`}>
            
            {/* 1. DASHBOARD PAGE */}
            {mainMenuTab === 'dashboard' && (
              <DashboardOverviewPage
                sops={sops}
                documents={libraryDocuments}
                userSession={userSession}
                onNavigate={(tab) => setMainMenuTab(tab)}
                onOpenUploadSop={() => {
                  setMainMenuTab('spo');
                  setIsUploadOpen(true);
                }}
                onViewSop={(sop) => setSelectedSopForDetail(sop)}
              />
            )}

            {/* 2. SPO PAGE (Admin SPO Workspace) */}
            {mainMenuTab === 'spo' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Maintenance Banner if Active */}
                {maintenanceMode.enabled && (
                  <div className="rounded-3xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-amber-900 flex items-center gap-2">
                          <span>MODE PEMELIHARAAN SISTEM AKTIF</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold uppercase border border-amber-300">Live</span>
                        </div>
                        <div className="text-xs text-amber-800 mt-1 leading-relaxed">
                          {maintenanceMode.message || 'Akses pengguna dialihkan ke halaman pemeliharaan. Administrator tetap memiliki akses penuh.'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMaintenanceModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs shrink-0 self-start sm:self-center cursor-pointer"
                    >
                      Kelola Pengaturan
                    </button>
                  </div>
                )}

                {/* Fresh Welcome Hero Card */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>Workspace SPO RSUD Dr. Soegiri</span>
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Manajemen Standar Prosedur Operasional (SPO)
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
                      Kelola penomoran terpusat, verifikasi draf naskah, dan pengesahan SPO seluruh instalasi & unit kerja RSUD Dr. Soegiri.
                    </p>
                  </div>

                  {/* Quick Actions in Hero */}
                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsUploadOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm shadow-emerald-200 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Daftarkan SPO Baru</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPrintRegisterOpen(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      <span>Buku Register</span>
                    </button>
                  </div>
                </div>

                {/* Statistics Cards */}
                <DashboardStats
                  sops={sops}
                  pendingSignatureCount={(sops || []).filter((sop) => sop.status === 'MENUNGGU_PENGESAHAN').length}
                  onNewSop={() => setIsUploadOpen(true)}
                  onFilterByStatus={(status) => handleFilterChange({ status })}
                  activeStatusFilter={filters.status}
                />

                {/* Filter & Search Bar */}
                <SopFilterBar
                  filters={filters}
                  divisions={divisions}
                  categories={categories}
                  availableYears={availableYears}
                  totalResults={filteredAndSortedSops.length}
                  onFilterChange={handleFilterChange}
                  onResetFilters={handleResetFilters}
                  isAdmin={true}
                  onStandardizeAll={handleStandardizeAllSopNumbers}
                />

                {/* Documents List */}
                <SopTable
                  sops={filteredAndSortedSops}
                  viewMode={viewMode}
                  onSelectSop={(sop) => setSelectedSopForDetail(sop)}
                  onEditSop={(sop) => {
                    setSelectedSopForDetail(null);
                    setSelectedSopForEdit(sop);
                  }}
                  onDeleteSop={handleDeleteSop}
                  onOpenUpload={() => setIsUploadOpen(true)}
                  onResetCounters={handleResetCountersToZero}
                />
              </div>
            )}

            {/* 3. SK PAGE */}
            {mainMenuTab === 'sk' && (
              <SKPage 
                documents={libraryDocuments} 
                userSession={userSession} 
                onBack={() => setMainMenuTab('dashboard')} 
                onShowToast={addToast} 
              />
            )}

            {/* 4. MOU PAGE */}
            {mainMenuTab === 'mou' && (
              <MOUPage 
                documents={libraryDocuments} 
                userSession={userSession} 
                onBack={() => setMainMenuTab('dashboard')} 
                onShowToast={addToast} 
              />
            )}

            {/* 5. LIBRARY PAGE (Hanya Dokumen Final) */}
            {mainMenuTab === 'library' && (
              <FinalLibraryPage 
                sops={sops} 
                documents={libraryDocuments} 
                userSession={userSession} 
                onViewSop={(sop) => setSelectedSopForDetail(sop)} 
                onShowToast={addToast}
              />
            )}

            {/* 6. ADMIN HUB PAGE */}
            {mainMenuTab === 'admin' && (
              <AdminHubPage
                userSession={userSession}
                onLogout={handleLogout}
                onOpenMasterData={() => setIsMasterDataOpen(true)}
                onOpenUserManagement={() => setIsUserManagementOpen(true)}
                onOpenSecurity={() => setIsSecurityOpen(true)}
                onOpenBackupRestore={() => setIsBackupRestoreOpen(true)}
                onOpenMaintenance={() => setIsMaintenanceModalOpen(true)}
                onShowToast={addToast}
              />
            )}
          </main>

          <footer className="bg-white border-t border-slate-200/90 py-6 text-center text-xs text-slate-500 no-print mt-12">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div><strong>{SOEGIRI_HOSPITAL_INFO.hospitalName}</strong> • {SOEGIRI_HOSPITAL_INFO.government}</div>
              <div>SIDOKTER SOEGIRI • Sistem Dokumen Terpadu • 2026</div>
            </div>
          </footer>
        </div>
      </div>

      {/* Modals */}
      <UploadSopModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSubmit={handleCreateSop}
        divisions={divisions}
        categories={categories}
        numberingConfig={numberingConfig}
        sops={sops}
        userSession={userSession}
        onViewDetail={(sop) => setSelectedSopForDetail(sop)}
      />

      <SopDetailModal
        isOpen={Boolean(selectedSopForDetail)}
        sop={selectedSopForDetail}
        onClose={() => setSelectedSopForDetail(null)}
        onEdit={(sop) => {
          setSelectedSopForDetail(null);
          setSelectedSopForEdit(sop);
        }}
        onDelete={(sop) => handleDeleteSop(sop.id, sop.title)}
        onUpdateStatus={handleUpdateStatus}
        onCopyNumber={handleCopyNumber}
        onActivateSop={(sop) => {
          const isExisting = sop.documentType === 'LAMA' || sop.jenis_spo === 'EKSISTING' || sop.isLegacySop;
          if (!isExisting) setSelectedSopForActivation(sop);
        }}
        userSession={userSession}
      />

      <AktivasiSopModal
        isOpen={Boolean(selectedSopForActivation)}
        sop={selectedSopForActivation}
        adminSession={userSession}
        onClose={() => setSelectedSopForActivation(null)}
        onConfirmActivation={handleConfirmActivation}
      />

      <DeleteConfirmModal
        isOpen={Boolean(sopToDelete)}
        sopNumber={sopToDelete?.sopNumber}
        title={sopToDelete?.title}
        onClose={() => setSopToDelete(null)}
        onConfirm={confirmDeleteSop}
      />

      <EditSopModal
        key={selectedSopForEdit?.id || 'none'}
        isOpen={Boolean(selectedSopForEdit)}
        sop={selectedSopForEdit}
        onClose={() => setSelectedSopForEdit(null)}
        onSubmit={handleUpdateSop}
        divisions={divisions}
        categories={categories}
        userSession={userSession}
        sops={sops}
      />

      <PrintRegisterModal
        isOpen={isPrintRegisterOpen}
        onClose={() => setIsPrintRegisterOpen(false)}
        sops={sops}
        initialDivisionFilter={filters.division || 'ALL'}
      />

      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        users={users}
        onSaveUser={handleSaveUser}
        onDeleteUser={handleDeleteUser}
        onShowToast={addToast}
      />

      <SecurityAccountPanel
        isOpen={isSecurityOpen}
        userSession={userSession}
        isAdmin={true}
        onClose={() => setIsSecurityOpen(false)}
        onLogout={handleLogout}
        onShowToast={addToast}
      />

      <MasterDataModal isOpen={isMasterDataOpen} onClose={() => setIsMasterDataOpen(false)} />
      <BackupRestorePanel
        isOpen={isBackupRestoreOpen}
        onClose={() => setIsBackupRestoreOpen(false)}
        onBackup={handleAdminBackup}
        onRestore={handleAdminRestore}
        isRestoring={isRestoring}
        restoreProgress={restoreProgress}
      />
      <MaintenanceModal
        isOpen={isMaintenanceModalOpen}
        onClose={() => setIsMaintenanceModalOpen(false)}
        currentMode={maintenanceMode}
        onSave={handleSaveMaintenanceMode}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

    </div>
  );
}
