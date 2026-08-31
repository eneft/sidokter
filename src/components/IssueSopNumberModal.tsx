import React, { useEffect, useMemo, useState } from 'react';

type HierarchyOption = {
  id: string;
  label: string;
  divisionCode: string;
  subHierarchyCode: string;
  pathCodes?: string[];
  pathNames?: string[];
};

type IssueSopNumberModalProps = {
  open: boolean;
  title: string;
  effectiveDate: string;
  hierarchyOptions: HierarchyOption[];
  selectedHierarchyId: string;
  isIssuingNumber: boolean;
  onTitleChange: (value: string) => void;
  onEffectiveDateChange: (value: string) => void;
  onHierarchyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function IssueSopNumberModal({
  open,
  title,
  effectiveDate,
  hierarchyOptions,
  selectedHierarchyId,
  isIssuingNumber,
  onTitleChange,
  onEffectiveDateChange,
  onHierarchyChange,
  onClose,
  onSubmit,
}: IssueSopNumberModalProps) {
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isIssuingNumber) onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isIssuingNumber, onClose]);

  // Initialize the picker only when the modal opens. Do NOT re-initialize
  // when selectedHierarchyId changes: selecting an intermediate parent emits
  // an empty/synthetic id, and re-running this effect would reset the path to
  // the first level, causing the hierarchy selector to jump back repeatedly.
  useEffect(() => {
    if (!open) return;
    const current = hierarchyOptions.find((option) => option.id === selectedHierarchyId);
    if (current) {
      setSelectedDivision(current.divisionCode);
      setSelectedPath(current.pathCodes || []);
    } else {
      setSelectedDivision((previous) => previous || hierarchyOptions[0]?.divisionCode || '');
      setSelectedPath((previous) => previous.length ? previous : []);
    }
  }, [open, hierarchyOptions]);

  const divisions = useMemo(() => {
    const seen = new Set<string>();
    return hierarchyOptions.filter((option) => {
      if (seen.has(option.divisionCode)) return false;
      seen.add(option.divisionCode);
      return true;
    });
  }, [hierarchyOptions]);

  const branchOptions = useMemo(() => {
    const result: Array<Array<{ code: string; name: string; depth: number }>> = [];
    const divisionOptions = hierarchyOptions.filter((option) => option.divisionCode === selectedDivision);
    const maxDepth = Math.max(0, ...divisionOptions.map((option) => (option.pathCodes || []).length));

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const parentPath = selectedPath.slice(0, depth);
      const seen = new Set<string>();
      const options: Array<{ code: string; name: string; depth: number }> = [];

      divisionOptions.forEach((option) => {
        const codes = option.pathCodes || [];
        const names = option.pathNames || [];
        if (codes.length <= depth) return;
        if (!parentPath.every((code, index) => codes[index] === code)) return;
        const code = codes[depth];
        if (!code || seen.has(code)) return;
        seen.add(code);
        options.push({ code, name: names[depth] || code, depth });
      });
      result.push(options);
    }
    return result;
  }, [hierarchyOptions, selectedDivision, selectedPath]);

  const finalOption = hierarchyOptions.find(
    (option) => option.divisionCode === selectedDivision &&
      (option.pathCodes || []).length === selectedPath.length &&
      (option.pathCodes || []).every((code, index) => code === selectedPath[index])
  );

  const canSubmit =
    title.trim().length > 0 &&
    effectiveDate.trim().length > 0 &&
    !!finalOption &&
    !isIssuingNumber;

  if (!open) return null;

  const updatePath = (depth: number, value: string) => {
    const next = selectedPath.slice(0, depth);
    if (value) next.push(value);
    setSelectedPath(next);
    const final = hierarchyOptions.find(
      (option) => option.divisionCode === selectedDivision &&
        (option.pathCodes || []).length === next.length &&
        (option.pathCodes || []).every((code, index) => code === next[index])
    );
    onHierarchyChange(final?.id || `${selectedDivision}|${next.join('.')}`);
  };

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-sop-number-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isIssuingNumber) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="issue-sop-number-modal-title" className="text-lg font-black text-slate-900">
              Terbitkan Nomor SPO
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pilih hirarki sampai tingkat unit terakhir sebelum nomor SPO diterbitkan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isIssuingNumber}
            className="rounded-xl px-3 py-2 text-xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >×</button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Hirarki SPO</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <label className="mb-1.5 block text-[11px] font-bold text-slate-600">Pilih Cabang Akses</label>
                <select
                  value={selectedDivision}
                  disabled={isIssuingNumber}
                  onChange={(event) => {
                    const division = event.target.value;
                    setSelectedDivision(division);
                    setSelectedPath([]);
                    onHierarchyChange('');
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Pilih...</option>
                  {divisions.map((option) => (
                    <option key={option.divisionCode} value={option.divisionCode}>{option.label.split(' / ')[0]}</option>
                  ))}
                </select>
              </div>

              {branchOptions.slice(0, Math.min(branchOptions.length, selectedPath.length + 1)).map((options, depth) => {
                if (!options.length) return null;
                const value = selectedPath[depth] || '';
                const labels = ['Sub Bagian / Unit', 'Instalasi / Unit', 'Poli / Unit', 'Sub Unit'];
                return (
                  <div className="min-w-0" key={`issue-hierarchy-${depth}`}>
                    <label className="mb-1.5 block text-[11px] font-bold text-slate-600">
                      Pilih {labels[depth] || `Turunan ${depth + 1}`}
                    </label>
                    <select
                      value={value}
                      disabled={isIssuingNumber || !selectedDivision}
                      onChange={(event) => updatePath(depth, event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="">Pilih...</option>
                      {options.map((option) => (
                        <option key={`${depth}-${option.code}`} value={option.code}>{option.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {finalOption && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Hirarki Terpilih</div>
                <div className="mt-1 text-xs font-extrabold text-slate-800">
                  {finalOption.pathNames?.join(' → ') || finalOption.label}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Judul SPO <span className="text-red-500">*</span></label>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Contoh: SPO Pelayanan Pasien Rawat Jalan"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">Tanggal Berlaku <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => onEffectiveDateChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={isIssuingNumber} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100">Batal</button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isIssuingNumber ? 'Menerbitkan...' : 'Terbitkan Nomor'}
          </button>
        </div>
      </div>
    </div>
  );
}
