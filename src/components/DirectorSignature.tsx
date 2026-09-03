import React from 'react';
import { TTD_DIREKTUR_BASE64 } from '../images/ttd_direktur_base64';
import { HospitalStamp } from './HospitalStamp';
import { SopDocument } from '../types';
import { shouldShowSignatureAndStamp } from '../utils/documentUtils';

const ttdDirekturFallback = '/ttd_direktur.png';

interface DirectorSignatureProps {
  className?: string;
  showStamp?: boolean;
  stampClassName?: string;
  sop?: Partial<SopDocument> | null;
  showSignature?: boolean;
}

export const DirectorSignature: React.FC<DirectorSignatureProps> = ({
  className = "h-20 w-auto",
  showStamp = true,
  stampClassName,
  sop,
  showSignature,
}) => {
  // Hanya dokumen yg telah aktif saja yg ada ttd dan stamp, kecuali file berbentuk pdf
  if (showSignature === false) {
    return null;
  }
  if (sop && !shouldShowSignatureAndStamp(sop)) {
    return null;
  }

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Tanda Tangan Basah Asli Direktur RSUD Dr. Soegiri Lamongan */}
      <img
        src={TTD_DIREKTUR_BASE64 || ttdDirekturFallback}
        alt="Tanda Tangan Direktur RSUD Dr. Soegiri"
        className="w-auto h-full max-h-full object-contain pointer-events-none mix-blend-multiply relative z-10"
        style={{ backgroundColor: 'transparent' }}
        loading="eager"
        draggable={false}
      />

      {/* Stempel Cap Basah Resmi RSUD Dr. Soegiri - Posisi di sebelah kiri, overlap tanda tangan */}
      {showStamp && (
        <div
          className={`absolute -left-6 sm:-left-8 top-1/2 -translate-y-1/2 pointer-events-none z-20 mix-blend-multiply opacity-92 -rotate-[6deg] ${
            stampClassName || 'w-20 h-20 sm:w-[92px] sm:h-[92px]'
          }`}
          title="Stempel Basah Resmi RSUD Dr. Soegiri Lamongan"
        >
          <HospitalStamp className="w-full h-full" />
        </div>
      )}
    </div>
  );
};



