import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  X, 
  FileText, 
  Calendar, 
  User, 
  Upload, 
  Trash2, 
  AlertCircle, 
  ShieldCheck, 
  Building2, 
  Stamp,
  FileCheck2
} from 'lucide-react';
import { SopDocument, UserSession } from '../types';
import { formatBytes } from '../utils/numbering';
import { SOEGIRI_HOSPITAL_INFO } from '../utils/soegiriStructure';

interface AktivasiSopModalProps {
  isOpen: boolean;
  sop: SopDocument | null;
  adminSession: UserSession | null;
  onClose: () => void;
  onConfirmActivation: (
    sopId: string, 
    activationData: {
      activatedAt: string;
      activatedBy: string;
      activationNotes: string;
      signedScanFileName?: string;
      signedScanFileSize?: number;
      signedScanFileType?: string;
      signedScanDataUrl?: string;
    }
  ) => void;
}

export const AktivasiSopModal: React.FC<AktivasiSopModalProps> = ({
  isOpen,
  sop,
  adminSession,
  onClose,
  onConfirmActivation,
}) => {
  const [confirmedPhysicalSignature, setConfirmedPhysicalSignature] = useState(false);
  const [activationDate, setActivationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adminName, setAdminName] = useState('');
  const [activationNotes, setActivationNotes] = useState('');
  const [selectedScanFile, setSelectedScanFile] = useState<File | null>(null);
  const [scanFileDataUrl, setScanFileDataUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (sop) {
      setConfirmedPhysicalSignature(false);
      setActivationDate(new Date().toISOString().split('T')[0]);
      setAdminName(adminSession?.name || 'Admin Tata Naskah');
      setActivationNotes('');
      setSelectedScanFile(null);
      setScanFileDataUrl('');
      setIsProcessing(false);
    }
  }, [sop, adminSession, isOpen]);

  if (!isOpen || !sop) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran berkas pindaian scan terlalu besar. Maksimal ukuran adalah 5 MB.");
      e.target.value = '';
      return;
    }

    setSelectedScanFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setScanFileDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearFile = () => {
    setSelectedScanFile(null);
    setScanFileDataUrl('');
    const input = document.getElementById('scan-file-input') as HTMLInputElement;
    if (input) input.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmedPhysicalSignature) {
      alert("Harap centang konfirmasi bahwa naskah fisik SPO telah bertanda tangan basah Direktur dan telah disetor ke Admin Tata Naskah.");
      return;
    }

    if (!adminName.trim()) {
      alert("Harap isi nama Petugas / Admin Tata Naskah penerima.");
      return;
    }

    setIsProcessing(true);

    try {
      onConfirmActivation(sop.id, {
        activatedAt: activationDate || new Date().toISOString().split('T')[0],
        activatedBy: adminName.trim(),
        activationNotes: activationNotes.trim() || `Telah disahkan dengan tanda tangan Direktur RSUD Dr. Soegiri (${SOEGIRI_HOSPITAL_INFO.director.name}) dan berkas fisik resmi diarsipkan di Bagian Tata Naskah.`,
        signedScanFileName: selectedScanFile?.name,
        signedScanFileSize: selectedScanFile?.size,
        signedScanFileType: selectedScanFile?.type,
        signedScanDataUrl: scanFileDataUrl || undefined,
      });
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 no-print animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-xs">
              <Stamp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Aktivasi Dokumen SPO</span>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-400 text-slate-950 rounded-full">
                  Admin Tata Naskah
                </span>
              </h2>
              <p className="text-xs text-emerald-200/90 font-medium">
                Pengesahan Tanda Tangan Direktur & Verifikasi Penyerahan Berkas Fisik
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Target SPO Information Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Informasi Dokumen SPO yang Diaktivasi
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                Status Saat Ini: BELUM AKTIF
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 flex-1">
                <div className="font-mono text-sm font-bold text-indigo-700">
                  {sop.sopNumber}
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                  {sop.title}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 flex-wrap">
                  <span className="flex items-center gap-1 font-medium">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {sop.divisionName} ({sop.divisionCode})
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Penyusun: {sop.creatorName}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Explanation Alert */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-3 text-amber-900 text-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Ketentuan Alur Pengesahan SPO RSUD Dr. Soegiri:</p>
              <p className="leading-relaxed text-amber-800">
                Dokumen yang telah didaftarkan dan mendapatkan nomor resmi belum berstatus <strong>AKTIF</strong> sampai naskah fisik dicetak, ditandatangani basah oleh Direktur (<strong>{SOEGIRI_HOSPITAL_INFO.director.name}</strong>), dan disetorkan ke Bagian Tata Naskah.
              </p>
            </div>
          </div>

          {/* Checklist Verification (Mandatory) */}
          <div className="p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                checked={confirmedPhysicalSignature}
                onChange={(e) => setConfirmedPhysicalSignature(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
              />
              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-bold text-emerald-950 block">
                  Konfirmasi Pengesahan Fisik & Penyerahan Berkas <span className="text-rose-600">*</span>
                </span>
                <p className="text-xs text-emerald-900/85 leading-relaxed">
                  Saya menyatakan dengan sebenarnya bahwa berkas naskah fisik SPO ini telah <strong>ditandatangani basah resmi oleh Direktur RSUD Dr. Soegiri</strong> dan dokumen fisiknya telah <strong>resmi disetorkan ke Admin Tata Naskah</strong> untuk diarsipkan.
                </p>
              </div>
            </label>
          </div>

          {/* Form Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Tanggal Aktivasi / Pengesahan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tanggal Pengesahan / Setor Fisik <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="date"
                required
                value={activationDate}
                onChange={(e) => setActivationDate(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Nama Admin Tata Naskah Penerima */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Petugas / Admin Tata Naskah <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Nama Admin Tata Naskah..."
                className="w-full text-xs sm:text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium"
              />
            </div>
          </div>

          {/* Upload Scan Bertandatangan Direktur (Optional but Recommended) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Unggah Pindaian Berkas Bertanda Tangan Direktur</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Sangat Dianjurkan (PDF / Scan)
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              Unggah pindaian/scan dokumen fisik SPO yang telah ada tanda tangan asli Direktur sebagai arsip digital resmi (Maks. 5 MB).
            </p>

            <div className="flex items-center gap-3 flex-wrap pt-1">
              <input
                id="scan-file-input"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
              />

              {selectedScanFile && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-800 font-semibold bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-emerald-700" />
                    <span>{selectedScanFile.name} ({formatBytes(selectedScanFile.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="p-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                    title="Hapus Berkas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Catatan Verifikasi / Nomor Arsip */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Catatan Pengesahan & Lokasi Penyimpanan Fisik (Opsional)
            </label>
            <textarea
              rows={2}
              value={activationNotes}
              onChange={(e) => setActivationNotes(e.target.value)}
              placeholder="Contoh: Berkas fisik asli telah disimpan di Binder Tata Naskah Sentral 2026, Lemari A Lantai 2..."
              className="w-full text-xs sm:text-sm border border-slate-300 rounded-xl px-3.5 py-2 text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!confirmedPhysicalSignature || isProcessing}
              className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer ${
                confirmedPhysicalSignature && !isProcessing
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isProcessing ? 'Memproses Aktivasi...' : 'Sahkan & Aktifkan SPO'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
