import React from 'react';

interface HospitalStampProps {
  className?: string;
  size?: number;
  inkColor?: string;
}

/**
 * Stempel resmi RSUD Dr. Soegiri.
 * Menggunakan artwork stempel HD terbaru sebagai image asset.
 * Props lama dipertahankan agar tidak memutus pemanggil yang sudah ada.
 */
export const HospitalStamp: React.FC<HospitalStampProps> = ({
  className = "w-24 h-24",
  size,
}) => {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <div
      className={`relative inline-block select-none overflow-hidden ${className}`}
      style={sizeStyle}
      aria-hidden="true"
    >
      <img
        src="/logo_soegiri_stamp.png"
        alt="Stempel RSUD Dr. Soegiri Lamongan"
        className="block w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        loading="eager"
      />
    </div>
  );
};
