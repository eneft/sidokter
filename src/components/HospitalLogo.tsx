import React, { useState } from 'react';

const logoImg = '/logo_soegiri_transparent.png';

interface HospitalLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  imgClassName?: string;
}

export const HospitalLogo: React.FC<HospitalLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  imgClassName
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-14 h-14',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const dimensionClass = imgClassName || sizeClasses[size];

  return (
    <div className={`inline-flex items-center gap-3 shrink-0 ${className}`}>
      {!imgError ? (
        <img
          src={logoImg}
          alt="Logo RSUD Dr. Soegiri Lamongan"
          className={`${dimensionClass} object-contain select-none`}
          loading="eager"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`${dimensionClass} rounded-full bg-emerald-50 border border-emerald-600/40 flex flex-col items-center justify-center p-1 text-emerald-800 shrink-0 select-none`}>
          <svg viewBox="0 0 24 24" className="w-full h-full fill-current" stroke="none">
            <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/>
          </svg>
        </div>
      )}

      {showText && (
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
            PEMERINTAH KABUPATEN LAMONGAN
          </span>
          <span className="text-sm font-extrabold uppercase text-slate-950">
            RSUD Dr. SOEGIRI LAMONGAN
          </span>
        </div>
      )}
    </div>
  );
};