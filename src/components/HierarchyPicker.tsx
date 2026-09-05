import React, { useMemo, useState, useEffect } from 'react';
import { SOEGIRI_MASTER_CATEGORIES, SoegiriCategory } from '../utils/soegiriStructure';
import { flattenHierarchy } from '../utils/hierarchyTree';
import { subscribeToHierarchyMaster } from '../lib/hierarchyService';

export interface HierarchySelectionValue {
  divisionCode: string;
  hierarchyCode: string;
  hierarchyPath: string[];
}

interface Props {
  value?: HierarchySelectionValue;
  onChange: (value: HierarchySelectionValue) => void;
  allowedDivisionCodes?: string[];
  allowedHierarchyCodes?: Record<string, string | undefined>;
  disabled?: boolean;
  includeRoot?: boolean;
  label?: string;
}

export const HierarchyPicker: React.FC<Props> = ({
  value,
  onChange,
  allowedDivisionCodes,
  allowedHierarchyCodes,
  disabled,
  includeRoot = true,
  label = 'Hirarki'
}) => {
  const [categories, setCategories] = useState<SoegiriCategory[]>(() => SOEGIRI_MASTER_CATEGORIES);

  useEffect(() => {
    return subscribeToHierarchyMaster((cats) => {
      setCategories(cats);
    });
  }, []);

  const options = useMemo(() => {
    const cats = categories.filter(c => c.active !== false && (!allowedDivisionCodes?.length || allowedDivisionCodes.includes(c.code)));
    const rows: Array<{ value: string; label: string; divisionCode: string; hierarchyCode: string; path: string[]; depth: number }> = [];
    cats.forEach((cat) => {
      if (includeRoot) rows.push({ value: `${cat.code}|`, label: `${cat.code} — ${cat.name} (Semua hirarki)`, divisionCode: cat.code, hierarchyCode: '', path: [], depth: 0 });
      flattenHierarchy(cat).filter(x => x.node.active !== false).forEach((item) => {
        const locked = allowedHierarchyCodes?.[cat.code];
        if (locked && !(item.code === locked || item.code.startsWith(`${locked}.`))) return;
        rows.push({ value: `${cat.code}|${item.code}`, label: `${cat.code} / ${item.code} — ${item.pathNames.join(' → ')}`, divisionCode: cat.code, hierarchyCode: item.code, path: item.pathNames, depth: item.depth });
      });
    });
    return rows;
  }, [allowedDivisionCodes?.join(','), JSON.stringify(allowedHierarchyCodes), includeRoot, categories]);

  const current = `${value?.divisionCode || ''}|${value?.hierarchyCode || ''}`;
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-700 mb-1">{label}</label>
      <select
        disabled={disabled}
        value={current}
        onChange={(e) => {
          const row = options.find(o => o.value === e.target.value);
          if (!row) return;
          onChange({ divisionCode: row.divisionCode, hierarchyCode: row.hierarchyCode, hierarchyPath: row.path });
        }}
        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="">-- Pilih hirarki --</option>
        {options.map(o => <option key={o.value} value={o.value}>{'　'.repeat(Math.min(o.depth, 6))}{o.label}</option>)}
      </select>
    </div>
  );
};
