import React from 'react';
import { HospitalStamp } from './HospitalStamp';

const ttdDirekturAsset = '/ttd_direktur.png';

interface DirectorSignatureProps {
  className?: string;
  showStamp?: boolean;
  stampClassName?: string;
}

export const DirectorSignature: React.FC<DirectorSignatureProps> = ({
  className = "h-20 w-auto",
  showStamp = true,
  stampClassName,
}) => {
  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* Tanda Tangan Basah Asli Direktur RSUD Dr. Soegiri Lamongan */}
      <img
        src={ttdDirekturAsset}
        alt="Tanda Tangan Direktur RSUD Dr. Soegiri"
        className="w-auto h-full max-h-full object-contain pointer-events-none mix-blend-multiply relative z-10"
        style={{ backgroundColor: 'transparent' }}
        loading="eager"
        draggable={false}
      />

      {/* Stempel Cap Basah Resmi RSUD Dr. Soegiri - Posisi di sebelah kiri, overlap tanda tangan */}
      {showStamp && (
        <div
          className={`absolute -left-7 top-1/2 -translate-y-1/2 pointer-events-none z-20 mix-blend-multiply opacity-95 -rotate-[6deg] ${
            stampClassName || 'w-[88px] h-[88px]'
          }`}
          title="Stempel Basah Resmi RSUD Dr. Soegiri Lamongan"
        >
          <HospitalStamp className="w-full h-full" />
        </div>
      )}
    </div>
  );
};



