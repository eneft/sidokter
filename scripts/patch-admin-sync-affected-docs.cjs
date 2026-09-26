'use strict';
const fs = require('fs');

const path = 'src/components/AdminHubPage.tsx';
let text = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  text = text.replace(from, to);
}

replaceOnce(
`  const syncAnalysis = useMemo(() => {
    if (!sops || sops.length === 0) return { changedCount: 0, duplicateCount: 0 };
    const res = standardizeAllSops(sops, numberReservations);
    return { changedCount: res.changedCount, duplicateCount: res.duplicateCount };
  }, [sops, numberReservations]);`,
`  const syncAnalysis = useMemo(() => {
    type AffectedDocument = {
      id: string;
      title: string;
      oldNumber: string;
      newNumber: string;
      divisionCode: string;
      hierarchyLabel: string;
      year: string;
      status: SopDocument['status'];
    };

    if (!sops || sops.length === 0) {
      return {
        changedCount: 0,
        duplicateCount: 0,
        affectedDocuments: [] as AffectedDocument[],
      };
    }

    const res = standardizeAllSops(sops, numberReservations);
    const updatedById = new Map(res.updatedSops.map((doc) => [doc.id, doc]));
    const affectedDocuments: AffectedDocument[] = [];

    for (const original of sops) {
      const updated = updatedById.get(original.id);
      if (!updated || updated.sopNumber === original.sopNumber) continue;

      const yearFromDate = String(original.effectiveDate || '').slice(0, 4);
      const yearFromNumber = String(original.sopNumber || '').match(/(\\d{4})\\s*$/)?.[1];
      const hierarchyLabel = Array.isArray(original.subHierarchyPath) && original.subHierarchyPath.length > 0
        ? original.subHierarchyPath.join(' › ')
        : original.hierarchyDescription || original.subHierarchyCode || original.divisionName || original.divisionCode || '-';

      affectedDocuments.push({
        id: original.id,
        title: original.title || 'Tanpa judul',
        oldNumber: original.sopNumber || '-',
        newNumber: updated.sopNumber || '-',
        divisionCode: original.divisionCode || '-',
        hierarchyLabel,
        year: /^\\d{4}$/.test(yearFromDate) ? yearFromDate : (yearFromNumber || '-'),
        status: original.status,
      });
    }

    return {
      changedCount: res.changedCount,
      duplicateCount: res.duplicateCount,
      affectedDocuments,
    };
  }, [sops, numberReservations]);`,
  'expand synchronization analysis with affected document details'
);

replaceOnce(
`            {/* Rules Banner */}
            <div className="mt-5 p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-950">`,
`            {syncAnalysis.affectedDocuments.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-xs">
                <div className="flex flex-col gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black text-amber-950">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span>Dokumen yang Akan Disinkronkan</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                      Periksa daftar berikut sebelum menjalankan sinkronisasi. Nomor saat ini akan diganti ke nomor target agar urutan kembali sekuensial.
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800">
                    {syncAnalysis.affectedDocuments.length} dokumen terdeteksi
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Dokumen</th>
                        <th className="px-4 py-3">Nomor Saat Ini</th>
                        <th className="px-4 py-3">Nomor Target</th>
                        <th className="px-4 py-3">Unit / Hirarki</th>
                        <th className="px-4 py-3">Tahun</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {syncAnalysis.affectedDocuments.map((doc) => (
                        <tr key={doc.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="max-w-[280px] text-xs font-black text-slate-900">{doc.title}</div>
                            <div className="mt-1 text-[10px] font-bold text-slate-400">{doc.divisionCode}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] font-black text-amber-900">
                              {doc.oldNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-mono text-[11px] font-black text-emerald-800">
                              {doc.newNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[260px] text-[11px] font-semibold leading-relaxed text-slate-700">{doc.hierarchyLabel}</div>
                          </td>
                          <td className="px-4 py-3 text-xs font-black text-slate-700">{doc.year}</td>
                          <td className="px-4 py-3">
                            <span className={
                              'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ' +
                              (doc.status === 'AKTIF'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : doc.status === 'DRAFT'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-slate-200 bg-slate-100 text-slate-700')
                            }>
                              {doc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rules Banner */}
            <div className="mt-5 p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-purple-950">`,
  'insert affected synchronization documents table'
);

fs.writeFileSync(path, text);
console.log('Affected synchronization documents UI patch applied.');
