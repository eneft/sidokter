import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SopLiveTemplate } from '../../src/components/SopLiveTemplate';

function Fixture({ seed }: { seed: string; key?: number }) {
  const [prosedur, setProsedur] = useState(seed);
  const [fields, setFields] = useState<Record<string, string>>({});
  (window as any).__savedProcedure = prosedur;
  const other: Record<string, any> = {};
  for (const field of ['pengertian', 'tujuan', 'kebijakan', 'alur', 'unitTerkait']) {
    other[field] = fields[field] || '';
    other[`on${field[0].toUpperCase()}${field.slice(1)}Change`] = (value: string) =>
      setFields(old => ({ ...old, [field]: value }));
  }
  return <SopLiveTemplate {...other} title="UJI PENGETIKAN SPO" onTitleChange={() => {}}
    sopNumber="UJI / 1 / 001 / 2026" version="00" effectiveDate="2026-10-08"
    onEffectiveDateChange={() => {}} approverName="Direktur"
    prosedur={prosedur} onProsedurChange={setProsedur} />;
}
const root = createRoot(document.getElementById('live-app')!);
let mountId = 0;
(window as any).__mountLive = (seed = '') => root.render(<Fixture key={++mountId} seed={seed} />);
(window as any).__mountLive();
