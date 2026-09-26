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
`  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(hasAdminAccess ? 'tools' : 'password');`,
`  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(hasAdminAccess ? 'tools' : 'password');
  const [isSynchronizingNumbers, setIsSynchronizingNumbers] = useState(false);

  const handleRunNumberSynchronization = async () => {
    if (!onStandardizeAllNumbers || isSynchronizingNumbers) return;
    setIsSynchronizingNumbers(true);
    try {
      await Promise.resolve(onStandardizeAllNumbers());
    } finally {
      setIsSynchronizingNumbers(false);
    }
  };`,
  'add synchronization loading state'
);

replaceOnce(
`                  <button
                    type="button"
                    onClick={onStandardizeAllNumbers}
                    disabled={!onStandardizeAllNumbers}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-black transition-all cursor-pointer shadow-sm shadow-purple-200"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Jalankan Sinkronisasi Nomor Sekarang</span>
                  </button>`,
`                  <button
                    type="button"
                    onClick={handleRunNumberSynchronization}
                    disabled={!onStandardizeAllNumbers || isSynchronizingNumbers}
                    aria-busy={isSynchronizingNumbers}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-70 disabled:cursor-not-allowed text-white text-xs font-black transition-all cursor-pointer shadow-sm shadow-purple-200"
                  >
                    <RefreshCw className={'w-4 h-4 ' + (isSynchronizingNumbers ? 'animate-spin' : '')} />
                    <span>{isSynchronizingNumbers ? 'Sedang Menyinkronkan...' : 'Jalankan Sinkronisasi Nomor Sekarang'}</span>
                  </button>`,
  'replace synchronization action button'
);

replaceOnce(
`            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-6">`,
`            {isSynchronizingNumbers && (
              <div
                role="status"
                aria-live="polite"
                className="mt-5 flex items-start gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-purple-950 shadow-xs"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                </div>
                <div>
                  <div className="text-xs font-black">Sinkronisasi nomor sedang berjalan…</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-purple-800">
                    SIDOKTER sedang memproses dokumen, register Nomor Terbit, dan ledger penomoran di Firebase. Tunggu sampai muncul hasil berhasil atau gagal sebelum menjalankan proses lagi.
                  </p>
                </div>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-6">`,
  'add visible synchronization progress banner'
);

fs.writeFileSync(path, text);
console.log('Admin synchronization loading indicator patch applied.');
