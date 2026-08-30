import React, { useEffect, useState } from 'react';

const ttdDirekturImg = '/ttd_direktur.jpeg';

interface DirectorSignatureProps {
  className?: string;
  showCap?: boolean;
}

export const DirectorSignature: React.FC<DirectorSignatureProps> = ({
  className = "h-16 w-auto",
  showCap = false,
}) => {
  const [transparentDataUrl, setTransparentDataUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  // Otomatis hapus background putih menjadi transparan (Alpha 0) agar tulisan di bawahnya tetap terbaca jelas
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = ttdDirekturImg;
    img.onload = () => {
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          setImgFailed(true);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setTransparentDataUrl(ttdDirekturImg);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Loop setiap piksel: ubah piksel putih/terang menjadi transparan
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Hitung tingkat kecerahan (luminance)
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

          if (brightness > 220) {
            // Putih penuh -> transparan 100%
            data[i + 3] = 0;
          } else if (brightness > 160) {
            // Anti-aliasing tepi goresan tinta agar halus
            const alphaFactor = (220 - brightness) / 60;
            data[i + 3] = Math.floor(data[i + 3] * alphaFactor);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        setTransparentDataUrl(canvas.toDataURL('image/png'));
      } catch {
        setTransparentDataUrl(ttdDirekturImg);
      }
    };
    img.onerror = () => {
      setImgFailed(true);
    };
  }, []);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Optional Official Hospital Stamp (Cap Dinas RSUD Dr. Soegiri) behind/beside signature */}
      {showCap && (
        <div className="absolute -left-3 -top-1 w-14 h-14 rounded-full border-2 border-indigo-700/40 flex flex-col items-center justify-center p-0.5 pointer-events-none rotate-[-12deg] opacity-70">
          <div className="w-full h-full rounded-full border border-dashed border-indigo-700/40 flex flex-col items-center justify-center text-[5px] font-bold text-indigo-800 leading-tight text-center">
            <span>PEMKAB LAMONGAN</span>
            <span className="text-[6px] font-black my-0.5">RSUD Dr. SOEGIRI</span>
            <span>DIREKTUR</span>
          </div>
        </div>
      )}

      {/* Tanda tangan dengan latar belakang transparan murni atau fallback SVG */}
      {!imgFailed ? (
        <img
          src={transparentDataUrl || ttdDirekturImg}
          alt="Tanda Tangan Direktur RSUD Dr. Soegiri"
          className="w-auto h-full max-h-full object-contain pointer-events-none mix-blend-multiply"
          style={{ backgroundColor: 'transparent' }}
          loading="eager"
          onError={() => setImgFailed(true)}
          draggable={false}
        />
      ) : (
        <svg
          viewBox="0 0 160 60"
          className="w-32 h-14 text-slate-800 pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 12 42 C 28 20, 36 12, 48 38 C 54 50, 62 10, 72 32 C 80 48, 92 18, 108 30 C 122 40, 140 24, 152 28" />
          <path d="M 38 48 C 65 42, 110 38, 148 44" strokeWidth="1.8" />
        </svg>
      )}
    </div>
  );
};


