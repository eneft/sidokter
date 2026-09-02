import React, { useState, useEffect } from 'react';
import { 
  X, 
  UserPlus, 
  Users, 
  Key, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Building2, 
  Shield, 
  UserCheck, 
  Search,
  Lock,
  User as UserIcon
} from 'lucide-react';
import { UserAccount, UserAssignment, UserRole } from '../types';
import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES, SoegiriCategory, buildSubHierarchyCode, getSoegiriHierarchyInfo } from '../utils/soegiriStructure';
import { subscribeToHierarchyMaster } from '../lib/hierarchyService';
import { HierarchyPicker } from './HierarchyPicker';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  onSaveUser: (user: UserAccount) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  users,
  onSaveUser,
  onDeleteUser,
  onShowToast
}) => {
  const [categories, setCategories] = useState<SoegiriCategory[]>(() => SOEGIRI_MASTER_CATEGORIES);

  useEffect(() => {
    return subscribeToHierarchyMaster((cats) => {
      setCategories(cats);
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [badges, setBadges] = useState<string[]>([]);
  const [divisionCode, setDivisionCode] = useState<string>('PEL');
  const [divisionCodes, setDivisionCodes] = useState<string[]>(['PEL']);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [subCode, setSubCode] = useState<string>('');
  const [instCode, setInstCode] = useState<string>('');
  const [poliCode, setPoliCode] = useState<string>('');
  const [subUnitCode, setSubUnitCode] = useState<string>('');
  const [selectedHierarchyOverride, setSelectedHierarchyOverride] = useState<string>('');
  const [unitName, setUnitName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Active Category & Sub objects for cascading selects
  const selectedCategory = categories.find(c => c.code === divisionCode);
  const availableSubs = selectedCategory?.subs || [];
  const selectedSub = availableSubs.find(s => s.code === subCode);
  const availableInsts = selectedSub?.instalasis || [];
  const selectedInst = availableInsts.find(i => i.code === instCode);
  const availablePolis = selectedInst?.polis || [];
  const selectedPoli = availablePolis.find(p => p.code === poliCode);
  const availableSubUnits = selectedPoli?.subUnits || [];

  if (!isOpen) return null;

  const handleOpenCreateForm = () => {
    setEditingUserId(null);
    setUsername('');
    setPassword('');
    setName('');
    setRole('user');
    setBadges([]);
    setDivisionCode('PEL');
    setDivisionCodes(['PEL']);
    setAssignments([]);
    setSubCode('');
    setInstCode('');
    setPoliCode('');
    setSubUnitCode('');
    setSelectedHierarchyOverride('');
    setUnitName('Bidang Pelayanan');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (user: UserAccount) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setPassword(''); // Leave empty so admin only inputs if changing password
    setName(user.name);
    setRole(user.role);
    setBadges(Array.isArray(user.badges) ? user.badges : []);
    const legacyDivision = user.divisionCode || (user.role === 'admin' ? 'ALL' : 'PEL');
    const legacyAssignments: UserAssignment[] = Array.isArray(user.assignments) && user.assignments.length
      ? user.assignments
      : (Array.isArray(user.divisionCodes) && user.divisionCodes.length
        ? user.divisionCodes.map((code, index) => ({
            id: `legacy-${code}-${index}`,
            divisionCode: code,
            unitName: user.unitName,
            subCode: index === 0 ? user.subCode : undefined,
            instCode: index === 0 ? user.instCode : undefined,
            poliCode: index === 0 ? user.poliCode : undefined,
            subUnitCode: index === 0 ? user.subUnitCode : undefined,
            hierarchyCode: index === 0 ? [user.subCode, user.instCode, user.poliCode, user.subUnitCode].filter(Boolean).join('.') || undefined : undefined
          }))
        : [{ id: `legacy-${legacyDivision}`, divisionCode: legacyDivision, unitName: user.unitName, subCode: user.subCode, instCode: user.instCode, poliCode: user.poliCode, subUnitCode: user.subUnitCode, hierarchyCode: [user.subCode, user.instCode, user.poliCode, user.subUnitCode].filter(Boolean).join('.') || undefined }]);
    
    const primary = legacyAssignments[0];
    let resolvedSub = user.subCode || primary?.subCode || '';
    let resolvedInst = user.instCode || primary?.instCode || '';
    let resolvedPoli = user.poliCode || primary?.poliCode || '';
    let resolvedSubUnit = user.subUnitCode || primary?.subUnitCode || '';

    if (primary?.hierarchyCode && (!resolvedSub || !resolvedInst || !resolvedPoli)) {
      const parts = primary.hierarchyCode.split('.');
      if (!resolvedSub && parts[0]) resolvedSub = parts[0];
      if (!resolvedInst && parts[1]) resolvedInst = parts[1];
      if (!resolvedPoli && parts[2]) resolvedPoli = parts[2];
      if (!resolvedSubUnit && parts[3]) resolvedSubUnit = parts[3];
    }

    // Do not infer hierarchy from unit/name text. Existing assignment data
    // is authoritative; a division-only assignment intentionally remains broad.

    setAssignments(user.role === 'admin' ? [] : legacyAssignments.filter((a) => a.divisionCode && a.divisionCode !== 'ALL'));
    setDivisionCode(legacyDivision);
    setDivisionCodes(user.role === 'admin' ? ['ALL'] : Array.from(new Set(legacyAssignments.map((a) => a.divisionCode))));
    setSubCode(resolvedSub);
    setInstCode(resolvedInst);
    setPoliCode(resolvedPoli);
    setSubUnitCode(resolvedSubUnit);
    setSelectedHierarchyOverride(primary?.hierarchyCode || '');
    setUnitName(user.unitName || 'Unit Kerja RSUD Dr. Soegiri');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPassword = password.trim();
    const cleanUnit = unitName.trim();

    if (!cleanUsername) {
      setFormError('Username wajib diisi.');
      return;
    }

    if (!cleanName) {
      setFormError('Nama lengkap user wajib diisi.');
      return;
    }

    if (!editingUserId && !cleanPassword) {
      setFormError('Kata sandi wajib diisi untuk akun baru.');
      return;
    }

    if (cleanPassword && (cleanPassword.length < 8 || !/[A-Z]/.test(cleanPassword) || !/[a-z]/.test(cleanPassword) || !/[0-9]/.test(cleanPassword))) {
      setFormError('Kata sandi minimal 8 karakter dan harus mengandung huruf besar, huruf kecil, serta angka.');
      return;
    }

    // Check duplicate username if creating or changing username
    const existing = users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.id !== editingUserId
    );
    if (existing) {
      setFormError(`Username "${cleanUsername}" sudah digunakan. Gunakan username lain.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const currentDraftHierarchy = selectedHierarchyOverride || buildSubHierarchyCode({ categoryCode: divisionCode, hierarchyCode: selectedHierarchyOverride, subCode, instalasiCode: instCode, poliCode, subUnitCode });
      const draftAssignment: UserAssignment = {
        id: `assignment-${divisionCode}-${currentDraftHierarchy || 'ROOT'}`,
        divisionCode,
        unitName: cleanUnit || undefined,
        subCode: subCode || undefined,
        instCode: instCode || undefined,
        poliCode: poliCode || undefined,
        subUnitCode: subUnitCode || undefined,
        hierarchyCode: currentDraftHierarchy || undefined,
        hierarchyPath: getSoegiriHierarchyInfo({ categoryCode: divisionCode, hierarchyCode: currentDraftHierarchy, subCode, instalasiCode: instCode, poliCode, subUnitCode }).path
      };
      
      const otherAssignments = assignments.filter((a) => a.divisionCode !== divisionCode || (a.hierarchyCode || '') !== (draftAssignment.hierarchyCode || ''));
      const finalAssignments = role === 'admin'
        ? []
        : (assignments.length <= 1 ? [draftAssignment] : [draftAssignment, ...otherAssignments]);
      const uniqueAssignments = finalAssignments.filter((a, idx, arr) => idx === arr.findIndex((x) => x.divisionCode === a.divisionCode && (x.hierarchyCode || '') === (a.hierarchyCode || '')));
      const firstAssignment = draftAssignment;
      const userPayload: UserAccount = {
        id: editingUserId || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        username: cleanUsername,
        name: cleanName,
        role: role,
        divisionCode: role === 'admin' ? 'ALL' : firstAssignment.divisionCode,
        divisionCodes: role === 'admin' ? ['ALL'] : Array.from(new Set(uniqueAssignments.map((a) => a.divisionCode))),
        assignments: role === 'admin' ? undefined : uniqueAssignments,
        badges: role === 'admin' ? [] : badges.filter((b) => String(b).toUpperCase() === 'STRUKTURAL'),
        subCode: role === 'admin' ? undefined : (firstAssignment.subCode || undefined),
        instCode: role === 'admin' ? undefined : (firstAssignment.instCode || undefined),
        poliCode: role === 'admin' ? undefined : (firstAssignment.poliCode || undefined),
        subUnitCode: role === 'admin' ? undefined : (firstAssignment.subUnitCode || undefined),
        unitName: cleanUnit || 'Unit Kerja RSUD Dr. Soegiri',
        createdAt: editingUserId
          ? (users.find(u => u.id === editingUserId)?.createdAt || new Date().toISOString())
          : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Only attach password if newly created or explicitly changed by admin
      if (cleanPassword) {
        userPayload.password = cleanPassword;
      }

      await onSaveUser(userPayload);
      onShowToast(
        'success',
        editingUserId ? 'Akun Diperbarui' : 'Akun User Dibuat',
        `Akun "${cleanUsername}" (${cleanName}) berhasil ${editingUserId ? 'diperbarui' : 'ditambahkan'}.`
      );
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'Gagal menyimpan data akun. Coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (user: UserAccount) => {
    if (user.username === 'admin') {
      onShowToast('error', 'Akses Ditolak', 'Akun Administrator utama tidak dapat dihapus.');
      return;
    }
    setUserToDelete(user);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteUser(userToDelete.id);
      onShowToast('success', 'Akun Dihapus', `Akun user "${userToDelete.username}" (${userToDelete.name}) berhasil dihapus.`);
      setUserToDelete(null);
    } catch (err) {
      onShowToast('error', 'Gagal Menghapus', 'Gagal menghapus akun dari database.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.unitName && u.unitName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Kelola Akun User & Pengguna</h2>
              <p className="text-xs text-slate-500">
                Tambah, edit, dan atur kata sandi akun user penginput SPO RSUD Dr. Soegiri
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari berdasarkan nama, username, atau unit..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleOpenCreateForm}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Buat Akun User Baru</span>
            </button>
          </div>

          {/* Inline Add / Edit Form Modal/Box */}
          {isFormOpen && (
            <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-700" />
                  <h3 className="text-sm font-bold text-indigo-950">
                    {editingUserId ? 'Edit Akun User' : 'Formulir Akun User Baru'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded bg-white/80 hover:bg-white"
                >
                  Batal
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                  ⚠️ {formError}
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username Log In <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="contoh: user_pelayanan"
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Username digunakan saat masuk ke sistem</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi (Password) <span className="text-rose-500">{editingUserId ? '' : '*'}</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingUserId ? "Kosongkan jika tidak ingin diubah" : "contoh: user123"}
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, dan angka.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap User <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="contoh: Budi Santoso, A.Md.Kep"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* Role / Hak Akses */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Role / Hak Akses
                  </label>
                  <select
                    value={role}
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      setRole(newRole);
                      if (newRole === 'admin') {
                        setDivisionCode('ALL');
                        setSubCode('');
                        setInstCode('');
                        setPoliCode('');
                      } else if (divisionCode === 'ALL') {
                        setDivisionCode('PEL');
                                            setSubCode('');
                        setInstCode('');
                        setPoliCode('');
                        setUnitName('Bidang Pelayanan');
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="user">User (Input & Lihat SPO Bidang/Unit)</option>
                    <option value="admin">Admin (Akses Penuh Management)</option>
                  </select>
                </div>

                {/* Elevated Document Access Badge */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Badge Akses Dokumen
                  </label>
                  <label className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={badges.includes('STRUKTURAL')}
                      onChange={(e) => setBadges(e.target.checked ? ['STRUKTURAL'] : [])}
                      disabled={role === 'admin'}
                      className="accent-emerald-600"
                    />
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      STRUKTURAL
                    </span>
                  </label>
                  <p className="text-[10px] text-slate-500 mt-1">Badge STRUKTURAL memiliki prioritas di atas hirarki dan memberi akses ke seluruh dokumen SPO.</p>
                </div>

                {/* Cascading Hierarchy Selection (Bidang -> Sub -> Instalasi -> Unit) */}
                <div className="sm:col-span-2 bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      Akses Spesifikasi Hierarki Unit Kerja User
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Batasi bidang/instalasi/unit yang dapat diakses oleh user ini
                    </span>
                  </div>

                  <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                    <HierarchyPicker
                      value={{ divisionCode, hierarchyCode: selectedHierarchyOverride, hierarchyPath: [] }}
                      onChange={(v) => {
                        setDivisionCode(v.divisionCode); setSelectedHierarchyOverride(v.hierarchyCode);
                        const parts = v.hierarchyCode.split('.').filter(Boolean);
                        setSubCode(parts[0] || ''); setInstCode(parts[1] || ''); setPoliCode(parts[2] || ''); setSubUnitCode(parts[3] || '');
                        const cat = categories.find(c => c.code === v.divisionCode);
                        if (cat) setUnitName(v.hierarchyPath.length ? `${cat.name} - ${v.hierarchyPath[v.hierarchyPath.length - 1]}` : cat.name);
                      }}
                      disabled={role === 'admin'}
                      label="Pilih Hirarki Lengkap"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">Bisa sampai kedalaman berapa pun. Pilihan ini menjadi sumber kode penomoran User.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Level 1: Bidang / Bagian / Komite */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        1. Bidang / Bagian / Pokja <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={divisionCode}
                        onChange={(e) => {
                          const newDiv = e.target.value;
                          setSelectedHierarchyOverride('');
                          setDivisionCode(newDiv);
                          setSubCode('');
                          setInstCode('');
                          setPoliCode('');
                          const cat = categories.find((c) => c.code === newDiv);
                          setUnitName(cat ? cat.name : 'Semua Bidang');
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="ALL">ALL - Semua Bidang (Akses Global)</option>
                        {categories.map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {cat.number}. {cat.name} ({cat.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Level 2: Sub-Bidang / Sub-Bagian */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        2. Sub-Bidang / Kelompok
                      </label>
                      <select
                        disabled={!availableSubs.length || divisionCode === 'ALL'}
                        value={subCode}
                        onChange={(e) => {
                          const newSubCode = e.target.value;
                          setSubCode(newSubCode);
                          setInstCode('');
                          setPoliCode('');
                          const sub = availableSubs.find((s) => s.code === newSubCode);
                          if (sub) {
                            setUnitName(`${selectedCategory?.name || ''} - ${sub.name}`);
                          } else {
                            setUnitName(selectedCategory?.name || '');
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Semua Sub-Bidang --</option>
                        {availableSubs.map((sub) => (
                          <option key={sub.code} value={sub.code}>
                            Sub {sub.code}: {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Level 3: Instalasi */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        3. Instalasi
                      </label>
                      <select
                        disabled={!availableInsts.length || !subCode || divisionCode === 'ALL'}
                        value={instCode}
                        onChange={(e) => {
                          const newInstCode = e.target.value;
                          setInstCode(newInstCode);
                          setPoliCode('');
                          const inst = availableInsts.find((i) => i.code === newInstCode);
                          if (inst) {
                            setUnitName(`${selectedCategory?.name || ''} - ${selectedSub?.name || ''} - ${inst.name}`);
                          } else {
                            setUnitName(selectedSub ? `${selectedCategory?.name || ''} - ${selectedSub.name}` : selectedCategory?.name || '');
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Semua Instalasi --</option>
                        {availableInsts.map((inst) => (
                          <option key={inst.code} value={inst.code}>
                            Inst {inst.code}: {inst.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Level 4: Unit / Poliklinik */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        4. Unit / Poliklinik
                      </label>
                      <select
                        disabled={!availablePolis.length || !instCode || divisionCode === 'ALL'}
                        value={poliCode}
                        onChange={(e) => {
                          const newPoliCode = e.target.value;
                          setPoliCode(newPoliCode);
                          const poli = availablePolis.find((p) => p.code === newPoliCode);
                          if (poli) {
                            setUnitName(`${selectedCategory?.name || ''} - ${selectedInst?.name || ''} - ${poli.name}`);
                          } else {
                            setUnitName(selectedInst ? `${selectedCategory?.name || ''} - ${selectedInst.name}` : selectedCategory?.name || '');
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Semua Unit / Poliklinik --</option>
                        {availablePolis.map((p) => (
                          <option key={p.code} value={p.code}>
                            Unit {p.code}: {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Level 5: Sub-Unit / Spesialisasi Lab */}
                    {availableSubUnits.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold text-purple-900 mb-1">
                          5. Sub-Unit / Spesialisasi Lab
                        </label>
                        <select
                          disabled={!poliCode || divisionCode === 'ALL'}
                          value={subUnitCode}
                          onChange={(e) => {
                            const newSubUnitCode = e.target.value;
                            setSubUnitCode(newSubUnitCode);
                            const su = availableSubUnits.find((u) => u.code === newSubUnitCode);
                            if (su) {
                              setUnitName(`${selectedCategory?.name || ''} - ${selectedPoli?.name || ''} - ${su.name}`);
                            } else if (selectedPoli) {
                              setUnitName(`${selectedCategory?.name || ''} - ${selectedInst?.name || ''} - ${selectedPoli.name}`);
                            }
                          }}
                          className="w-full bg-purple-50 border border-purple-300 rounded-lg px-2.5 py-1.5 text-xs text-purple-950 font-bold focus:ring-2 focus:ring-purple-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                        >
                          <option value="">-- Semua Sub-Unit --</option>
                          {availableSubUnits.map((su) => (
                            <option key={su.code} value={su.code}>
                              Sub {su.code}: {su.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Multi-hierarchy access assignments */}
                  {role === 'user' && (
                    <div className="border-t border-slate-200 pt-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700">Kewenangan / Jabatan SPO</label>
                          <p className="text-[10px] text-slate-500">Satu akun dapat memiliki beberapa hirarki sekaligus, misalnya PEL 1.2.1 dan PEN 2.4.</p>
                        </div>
                        <button type="button" onClick={() => {
                          const hierarchyCode = selectedHierarchyOverride || buildSubHierarchyCode({ categoryCode: divisionCode, hierarchyCode: selectedHierarchyOverride, subCode, instalasiCode: instCode, poliCode, subUnitCode });
                          const info = getSoegiriHierarchyInfo({ categoryCode: divisionCode, hierarchyCode, subCode, instalasiCode: instCode, poliCode, subUnitCode });
                          const next: UserAssignment = {
                            id: `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            divisionCode, subCode: subCode || undefined, instCode: instCode || undefined, poliCode: poliCode || undefined, subUnitCode: subUnitCode || undefined,
                            hierarchyCode: hierarchyCode || undefined, hierarchyPath: info.path, unitName: unitName.trim() || info.label || selectedCategory?.name
                          };
                          setAssignments((prev) => prev.some((a) => a.divisionCode === next.divisionCode && (a.hierarchyCode || '') === (next.hierarchyCode || '')) ? prev : [...prev, next]);
                          setDivisionCodes((prev) => Array.from(new Set([...prev, divisionCode])));
                        }} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg">
                          + Tambah Kewenangan Ini
                        </button>
                      </div>
                      {assignments.length > 0 ? (
                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                          {assignments.map((assignment, index) => (
                            <div key={assignment.id} className="bg-white border border-indigo-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] font-extrabold text-indigo-900">{index + 1}. {assignment.divisionCode} {assignment.hierarchyCode ? `• ${assignment.hierarchyCode}` : '• Semua hirarki'}</div>
                                <div className="text-[10px] text-slate-500 truncate">{assignment.hierarchyPath?.join(' → ') || assignment.unitName || 'Seluruh turunan unit'}</div>
                              </div>
                              <button type="button" onClick={() => setAssignments((prev) => prev.filter((a) => a.id !== assignment.id))} className="text-rose-600 hover:text-rose-700 text-[10px] font-bold">Hapus</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-800">Belum ada kewenangan tersimpan. Pilih hirarki di atas lalu klik <strong>Tambah Kewenangan Ini</strong>.</div>
                      )}
                    </div>
                  )}

                  {/* Summary Preview Box */}
                  <div className="bg-indigo-50/80 border border-indigo-100 p-2.5 rounded-lg text-xs text-indigo-950 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold uppercase text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                        Target Akses:
                      </span>
                      <span className="font-semibold text-indigo-900">
                        {divisionCode === 'ALL'
                          ? 'Akses Global (Semua Bidang)'
                          : `${selectedCategory?.name || divisionCode}${selectedSub ? ' > ' + selectedSub.name : ''}${selectedInst ? ' > ' + selectedInst.name : ''}${selectedPoli ? ' > ' + selectedPoli.name : ''}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Label Nama Unit Kerja
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={unitName}
                      onChange={(e) => setUnitName(e.target.value)}
                      placeholder="contoh: Poli Jantung / Rawat Inap / Farmasi"
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Saving...' : 'Simpan Akun User'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* User Account List Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Nama User</th>
                  <th className="px-4 py-3">Akses Bidang SPO</th>
                  <th className="px-4 py-3">Rincian Unit</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Badge</th>
                  <th className="px-4 py-3">Kata Sandi</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400 italic">
                      Tidak ada akun user yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const catInfo = categories.find(c => c.code === u.divisionCode);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{u.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {u.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              u.divisionCode === 'ALL' || !u.divisionCode
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}
                          >
                            {u.divisionCode === 'ALL' || !u.divisionCode ? (
                              <span>🌐 SEMUA BIDANG</span>
                            ) : (
                              <span>
                                📁 {u.divisionCode} - {catInfo?.name || u.divisionCode}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {u.unitName || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-slate-100 text-slate-800 border border-slate-200'
                            }`}
                          >
                            {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            <span>{u.role === 'admin' ? 'ADMINISTRATOR' : 'USER'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {Array.isArray(u.badges) && u.badges.includes('STRUKTURAL') ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Shield className="w-3 h-3" /> STRUKTURAL
                            </span>
                          ) : <span className="text-[10px] text-slate-400">-</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                          {u.passwordHash ? '••••••••' : 'Belum di-hash'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEditForm(u)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Akun & Password"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {u.username !== 'admin' && (
                              <button
                                onClick={() => handleDeleteClick(u)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Hapus Akun"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Total {users.length} akun terdaftar di sistem RSUD Dr. Soegiri.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>

      {/* Confirmation Modal for Deleting User */}
      {userToDelete && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Hapus Akun User?</h3>
                <p className="text-xs text-slate-500">Konfirmasi Penghapusan Akses</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p>Apakah Anda yakin ingin menghapus akun user berikut?</p>
              <p className="font-bold text-slate-900 text-sm">{userToDelete.name}</p>
              <p className="font-mono text-slate-600">Username: <span className="font-bold text-slate-900">{userToDelete.username}</span></p>
              <p className="text-slate-500">Unit: {userToDelete.unitName || '-'}</p>
            </div>

            <p className="text-[11px] text-rose-600 font-medium">
              ⚠️ Akun ini tidak akan dapat digunakan untuk masuk ke sistem lagi.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Akun'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
