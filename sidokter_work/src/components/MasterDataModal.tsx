import React, { useEffect, useMemo, useState } from 'react';
import { 
  X, 
  Building2, 
  Plus, 
  Minus, 
  Save, 
  AlertTriangle, 
  Trash2,
  Layers,
  Check
} from 'lucide-react';
import { SOEGIRI_MASTER_CATEGORIES, SoegiriCategory, SoegiriHierarchyNode } from '../utils/soegiriStructure';
import { getNodeChildren } from '../utils/hierarchyTree';
import { getHierarchyMaster, saveHierarchyMaster } from '../lib/hierarchyService';

interface Props { 
  isOpen: boolean; 
  onClose: () => void; 
}

type ParentRef = { divisionCode: string; path: string[] };
type DeleteTarget = { divisionCode: string; path: string[]; node: SoegiriHierarchyNode };
type DeleteCategoryTarget = { category: SoegiriCategory };

function cloneCategories(source: SoegiriCategory[] = SOEGIRI_MASTER_CATEGORIES) { 
  return JSON.parse(JSON.stringify(source)) as SoegiriCategory[]; 
}

function findParentChildren(categories: SoegiriCategory[], parent: ParentRef): SoegiriHierarchyNode[] | null {
  const cat = categories.find(c => c.code === parent.divisionCode);
  if (!cat) return null;
  if (!parent.path.length) return (cat.children || []) as SoegiriHierarchyNode[];
  let node: any = cat;
  for (const code of parent.path) {
    node = getNodeChildren(node).find(n => n.code === code);
    if (!node) return null;
  }
  return (node.children || []) as SoegiriHierarchyNode[];
}

function deleteNodeByPath(categories: SoegiriCategory[], divisionCode: string, path: string[]): boolean {
  if (!path.length) return false;
  const cat = categories.find(c => c.code === divisionCode);
  if (!cat) return false;

  const targetCode = path[path.length - 1];
  const parentPath = path.slice(0, -1);

  let parentChildren: SoegiriHierarchyNode[] | undefined;
  if (parentPath.length === 0) {
    parentChildren = cat.children;
  } else {
    let current: any = cat;
    for (const code of parentPath) {
      current = getNodeChildren(current).find(n => n.code === code);
      if (!current) return false;
    }
    parentChildren = current.children;
  }

  if (!parentChildren) return false;
  const index = parentChildren.findIndex(n => n.code === targetCode);
  if (index === -1) return false;
  parentChildren.splice(index, 1);
  return true;
}

const TreeNode: React.FC<{
  node: SoegiriHierarchyNode;
  path: string[];
  onAdd: (path: string[]) => void;
  onDelete: (path: string[], node: SoegiriHierarchyNode) => void;
}> = ({ node, path, onAdd, onDelete }) => (
  <div className="ml-3 border-l border-slate-200 pl-3 py-1">
    <div className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md shrink-0">
          {node.code}
        </span>
        <span className="text-xs font-semibold text-slate-800 truncate">{node.name}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onAdd(path)}
          title="Tambah sub-hirarki (+)"
          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 hover:border-emerald-200 border border-transparent transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(path, node)}
          title="Hapus hirarki (-)"
          className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 hover:border-rose-200 border border-transparent transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    {getNodeChildren(node).map(child => (
      <TreeNode
        key={child.id}
        node={child}
        path={[...path, child.code]}
        onAdd={onAdd}
        onDelete={onDelete}
      />
    ))}
  </div>
);

export const MasterDataModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedDivision, setSelectedDivision] = useState(SOEGIRI_MASTER_CATEGORIES[0]?.code || '');
  const [draft, setDraft] = useState<SoegiriCategory[]>(cloneCategories());
  const [parent, setParent] = useState<ParentRef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<DeleteCategoryTarget | null>(null);
  
  // State for adding node
  const [name, setName] = useState('');
  const [manualCode, setManualCode] = useState('');
  
  // State for adding new Bagian/Bidang (Category)
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'bidang' | 'bagian' | 'komite' | 'satuan' | 'pokja'>('bidang');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const live = await getHierarchyMaster();
        if (cancelled || !live.length) return;
        setDraft(cloneCategories(live));
        setSelectedDivision((current) => live.some(c => c.code === current) ? current : live[0].code);
      } catch (e: any) {
        if (!cancelled) setMessage(e?.message || 'Gagal memuat master hirarki.');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const selected = draft.find(c => c.code === selectedDivision);
  const parentLabel = useMemo(() => {
    if (!parent) return '';
    const cat = draft.find(c => c.code === parent.divisionCode); 
    if (!cat) return '';
    let current: any = cat; 
    const names = [cat.name];
    for (const code of parent.path) { 
      const child = getNodeChildren(current).find(n => n.code === code); 
      if (!child) break; 
      names.push(`${child.code} ${child.name}`); 
      current = child; 
    }
    return names.join(' → ');
  }, [parent, draft]);

  if (!isOpen) return null;

  const resetForm = () => { 
    setParent(null); 
    setName(''); 
    setManualCode(''); 
    setMessage(''); 
    setDeleteTarget(null); 
    setDeleteCategoryTarget(null);
  };

  const startAdd = (path: string[]) => { 
    setParent({ divisionCode: selectedDivision, path }); 
    setName(''); 
    setManualCode(''); 
    setMessage(''); 
    setDeleteTarget(null); 
    setDeleteCategoryTarget(null);
    setIsAddingCategory(false);
  };

  const startDelete = (path: string[], node: SoegiriHierarchyNode) => {
    setDeleteTarget({ divisionCode: selectedDivision, path, node });
    setDeleteCategoryTarget(null);
    setMessage('');
  };

  const startDeleteCategory = (category: SoegiriCategory) => {
    setDeleteCategoryTarget({ category });
    setDeleteTarget(null);
    setMessage('');
  };

  const confirmDeleteCategory = async () => {
    if (!deleteCategoryTarget) return;
    const { category } = deleteCategoryTarget;

    if (draft.length <= 1) {
      setMessage('Tidak dapat menghapus, minimal harus ada 1 Bagian/Bidang dalam sistem.');
      setDeleteCategoryTarget(null);
      return;
    }

    const next = draft.filter(c => c.code !== category.code);
    try {
      setSaving(true);
      await saveHierarchyMaster(next, 'admin');
      setDraft(next);
      setDeleteCategoryTarget(null);
      if (selectedDivision === category.code) {
        setSelectedDivision(next[0]?.code || '');
      }
      resetForm();
      setMessage(`Bagian/Bidang "${category.code} - ${category.name}" berhasil dihapus.`);
    } catch (e: any) {
      setMessage(e?.message || 'Gagal menghapus Bagian/Bidang.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { divisionCode, path, node } = deleteTarget;
    const next = cloneCategories(draft);
    const deleted = deleteNodeByPath(next, divisionCode, path);
    if (!deleted) {
      setMessage('Hirarki tidak ditemukan atau sudah terhapus.');
      setDeleteTarget(null);
      return;
    }

    try {
      setSaving(true);
      await saveHierarchyMaster(next, 'admin');
      setDraft(next);
      setDeleteTarget(null);
      if (parent && parent.path.join('.').startsWith(path.join('.'))) {
        setParent(null);
      }
      setMessage(`Hirarki "${node.code} - ${node.name}" berhasil dihapus.`);
    } catch (e: any) {
      setMessage(e?.message || 'Gagal menghapus hirarki.');
    } finally {
      setSaving(false);
    }
  };

  const addNode = async () => {
    if (!parent || !name.trim()) { 
      setMessage('Pilih induk dan isi nama hirarki.'); 
      return; 
    }
    const next = cloneCategories(draft);
    const children = findParentChildren(next, parent); 
    if (!children) { 
      setMessage('Induk hirarki tidak ditemukan.'); 
      return; 
    }
    const siblings = children.map(c => Number(c.code)).filter(Number.isFinite);
    const code = manualCode.trim() || String(Math.max(0, ...siblings) + 1);
    if (children.some(c => c.code === code)) { 
      setMessage(`Kode ${code} sudah dipakai pada induk ini.`); 
      return; 
    }
    children.push({ 
      id: `hier-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, 
      code, 
      name: name.trim(), 
      active: true, 
      children: [] 
    });
    try { 
      setSaving(true); 
      await saveHierarchyMaster(next, 'admin'); 
      setDraft(next); 
      resetForm(); 
      setMessage(`Hirarki ${code} ${name.trim()} berhasil ditambahkan.`); 
    } catch (e: any) { 
      setMessage(e?.message || 'Gagal menyimpan.'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleAddCategory = async () => {
    const code = newCatCode.trim().toUpperCase();
    const catName = newCatName.trim();
    if (!code) {
      setMessage('Kode Bagian/Bidang wajib diisi.');
      return;
    }
    if (!catName) {
      setMessage('Nama Bagian/Bidang wajib diisi.');
      return;
    }
    if (draft.some(c => c.code.toUpperCase() === code)) {
      setMessage(`Kode "${code}" sudah terdaftar pada master data.`);
      return;
    }

    const newCategory: SoegiriCategory = {
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      number: draft.length + 1,
      code,
      name: catName,
      type: newCatType,
      active: true,
      children: []
    };

    const next = [...draft, newCategory];
    try {
      setSaving(true);
      await saveHierarchyMaster(next, 'admin');
      setDraft(next);
      setSelectedDivision(code);
      setIsAddingCategory(false);
      setNewCatCode('');
      setNewCatName('');
      setNewCatType('bidang');
      resetForm();
      setMessage(`Bagian/Bidang "${code} - ${catName}" berhasil ditambahkan.`);
    } catch (e: any) {
      setMessage(e?.message || 'Gagal menambahkan Bagian/Bidang.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900">Master Data & Hirarki SPO</h2>
              <p className="text-xs text-slate-500 mt-0.5">Kelola Bagian/Bidang dan struktur cabang unit kerja penomoran naskah.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          
          {/* Left Column: Bagian / Bidang List */}
          <div className="rounded-2xl border border-slate-200/90 overflow-hidden bg-slate-50/50 flex flex-col h-fit">
            
            {/* Header Bagian / Bidang with Add Button */}
            <div className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Bagian / Bidang</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingCategory(true);
                  setParent(null);
                  setDeleteTarget(null);
                  setDeleteCategoryTarget(null);
                  setMessage('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                title="Tambah Bagian/Bidang Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>

            {/* Inline Add Category Form */}
            {isAddingCategory && (
              <div className="p-3 bg-emerald-50/80 border-b border-emerald-200/90 space-y-2.5 animate-in fade-in duration-150">
                <div className="text-[11px] font-bold text-emerald-950 flex items-center justify-between">
                  <span>Tambah Bagian / Bidang Baru</span>
                  <button 
                    type="button" 
                    onClick={() => setIsAddingCategory(false)}
                    className="text-emerald-700 hover:text-emerald-950 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Kode Bagian / Bidang *</label>
                  <input
                    type="text"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: PEL, PEN, KEU"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-lg text-xs font-mono font-bold text-slate-900 outline-hidden uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Nama Bagian / Bidang *</label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Contoh: Bidang Pelayanan Medik"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-lg text-xs text-slate-900 outline-hidden font-medium"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Tipe Unit</label>
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 rounded-lg text-xs text-slate-800 outline-hidden font-medium"
                  >
                    <option value="bidang">Bidang</option>
                    <option value="bagian">Bagian</option>
                    <option value="komite">Komite</option>
                    <option value="satuan">Satuan</option>
                    <option value="pokja">Pokja</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingCategory(false)}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleAddCategory}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1 disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-3 h-3" />
                    <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* List of categories */}
            <div className="p-2 max-h-[55vh] overflow-y-auto space-y-1">
              {draft.map(c => {
                const isSelected = selectedDivision === c.code;
                return (
                  <div
                    key={c.id || c.code}
                    className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/90 font-bold shadow-2xs' 
                        : 'hover:bg-white text-slate-700 border border-transparent'
                    }`}
                    onClick={() => { 
                      setSelectedDivision(c.code); 
                      resetForm(); 
                      setIsAddingCategory(false);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold shrink-0">
                        {c.code}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startDeleteCategory(c);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all shrink-0 cursor-pointer"
                      title={`Hapus Bagian/Bidang ${c.code}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Hierarchy Details */}
          <div className="space-y-4 min-w-0">
            
            {/* Active Category Header Card */}
            <div className="rounded-2xl border border-slate-200/90 p-4 sm:p-5 bg-white shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">
                      {selected?.code}
                    </span>
                    <h3 className="text-sm sm:text-base font-black text-slate-900">{selected?.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Gunakan tombol <span className="font-bold text-emerald-700">+</span> untuk menambah sub-hirarki anak dan <span className="font-bold text-rose-600">-</span> untuk menghapus hirarki.
                  </p>
                </div>

                <button 
                  type="button" 
                  onClick={() => startAdd([])} 
                  className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-700 shadow-2xs transition-all cursor-pointer shrink-0 self-start sm:self-center"
                >
                  <Plus className="w-3.5 h-3.5" /> 
                  <span>Tambah Sub-Hirarki (+)</span>
                </button>
              </div>

              {/* Hierarchy Tree Viewer */}
              <div className="max-h-[48vh] overflow-y-auto pr-1">
                {selected?.children?.length ? (
                  selected.children.map(n => (
                    <TreeNode
                      key={n.id || n.code}
                      node={n}
                      path={[n.code]}
                      onAdd={startAdd}
                      onDelete={startDelete}
                    />
                  ))
                ) : (
                  <div className="text-xs text-slate-400 py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada sub-hirarki turunan di {selected?.name}. Klik <span className="font-bold text-emerald-700">"Tambah Sub-Hirarki (+)"</span> untuk membuat cabang pertama.
                  </div>
                )}
              </div>
            </div>

            {/* Confirm Delete Category Modal/Box */}
            {deleteCategoryTarget && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-rose-900">Konfirmasi Hapus Bagian / Bidang</div>
                    <div className="text-xs text-rose-700 mt-1">
                      Apakah Anda yakin ingin menghapus Bagian/Bidang <span className="font-mono font-bold">{deleteCategoryTarget.category.code}</span> ({deleteCategoryTarget.category.name}) beserta seluruh struktur hirarkinya?
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteCategoryTarget(null)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmDeleteCategory}
                    className="px-3.5 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{saving ? 'Menghapus…' : 'Ya, Hapus Bagian/Bidang'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Delete Sub-Hierarchy Node */}
            {deleteTarget && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-rose-900">Konfirmasi Hapus Hirarki</div>
                    <div className="text-xs text-rose-700 mt-1">
                      Apakah Anda yakin ingin menghapus hirarki <span className="font-mono font-bold">{deleteTarget.node.code}</span> (<span className="font-semibold">{deleteTarget.node.name}</span>)?
                      {deleteTarget.node.children && deleteTarget.node.children.length > 0 && (
                        <div className="mt-1 font-semibold text-rose-800">
                          ⚠️ Peringatan: {deleteTarget.node.children.length} sub-hirarki di bawahnya juga akan ikut terhapus.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmDelete}
                    className="px-3.5 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{saving ? 'Menghapus…' : 'Ya, Hapus Hirarki (-) '}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Form Add Sub-Hierarchy (+) */}
            {parent && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3 animate-in fade-in duration-150">
                <div>
                  <div className="text-[10px] font-bold uppercase text-emerald-800">Induk Hirarki</div>
                  <div className="text-xs font-bold text-emerald-950 mt-0.5">{parentLabel}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">Nama Hirarki *</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl px-3 py-2 text-xs bg-white outline-hidden font-medium"
                      placeholder="contoh: Imunologi / Hemodialisa"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">Kode Urut <span className="font-normal text-slate-500">(opsional, otomatis)</span></label>
                    <input
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value.replace(/[^0-9]/g,''))}
                      className="w-full border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 rounded-xl px-3 py-2 text-xs bg-white outline-hidden font-mono"
                      placeholder="otomatis (misal: 1, 2, 3)"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={resetForm} className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 transition-colors">Batal</button>
                  <button 
                    type="button" 
                    disabled={saving} 
                    onClick={addNode} 
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" /> 
                    <span>{saving ? 'Menyimpan…' : 'Simpan Hirarki'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Notification / Message Alert */}
            {message && (
              <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 font-medium flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{message}</span>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
