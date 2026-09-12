import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Info } from 'lucide-react';

export interface AdminTooltipProps {
  content: string;
  title?: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  align?: 'start' | 'center' | 'end';
  delayMs?: number;
  disabled?: boolean;
  showNativeTitle?: boolean;
}

interface PositionCoords {
  top: number;
  left: number;
  actualSide: 'top' | 'bottom' | 'left' | 'right';
}

export const AdminTooltip: React.FC<AdminTooltipProps> = ({
  content,
  title,
  children,
  side = 'top',
  className = '',
  align = 'center',
  delayMs = 50,
  disabled = false,
  showNativeTitle = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<PositionCoords | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback((): PositionCoords | null => {
    if (!triggerRef.current) return null;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Approximate or measured tooltip box dimensions
    const tooltipWidth = tooltipRef.current?.offsetWidth || 260;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 60;
    const gap = 8;

    let targetSide: 'top' | 'bottom' | 'left' | 'right' = (side as 'top' | 'bottom' | 'left' | 'right') || 'top';

    // Viewport collision auto-flip
    if (targetSide === 'top' && rect.top - tooltipHeight - gap < 8) {
      targetSide = 'bottom';
    } else if (targetSide === 'bottom' && rect.bottom + tooltipHeight + gap > viewportHeight - 8) {
      targetSide = 'top';
    } else if (targetSide === 'left' && rect.left - tooltipWidth - gap < 8) {
      targetSide = 'right';
    } else if (targetSide === 'right' && rect.right + tooltipWidth + gap > viewportWidth - 8) {
      targetSide = 'left';
    }

    let top = 0;
    let left = 0;

    if (targetSide === 'top') {
      top = rect.top - tooltipHeight - gap;
      if (align === 'start') left = rect.left;
      else if (align === 'end') left = rect.right - tooltipWidth;
      else left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (targetSide === 'bottom') {
      top = rect.bottom + gap;
      if (align === 'start') left = rect.left;
      else if (align === 'end') left = rect.right - tooltipWidth;
      else left = rect.left + rect.width / 2 - tooltipWidth / 2;
    } else if (targetSide === 'left') {
      left = rect.left - tooltipWidth - gap;
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
    } else if (targetSide === 'right') {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
    }

    // Strict viewport boundaries clamping
    left = Math.max(10, Math.min(left, viewportWidth - tooltipWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - tooltipHeight - 10));

    return { top, left, actualSide: targetSide };
  }, [side, align]);

  const showTooltip = () => {
    if (disabled || !content) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const initialPos = calculatePosition();
      setCoords(initialPos);
      setIsVisible(true);
    }, delayMs);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled || !content) return;
    const target = e.target as HTMLElement;
    // If it's an inline help hint or badge, allow toggling with click
    if (target && target.closest('[role="button"]') && !target.closest('button')) {
      if (isVisible) {
        hideTooltip();
      } else {
        const pos = calculatePosition();
        setCoords(pos);
        setIsVisible(true);
      }
    } else {
      // For action buttons, dismiss tooltip upon click so it does not linger
      hideTooltip();
    }
  };

  // Re-measure and adjust once rendered
  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const refinedPos = calculatePosition();
      if (refinedPos) {
        setCoords(refinedPos);
      }
    }
  }, [isVisible, calculatePosition]);

  // Event listeners: close on outside click, window resize, or container scroll
  useEffect(() => {
    if (!isVisible) return;

    const handleScrollOrResize = () => {
      hideTooltip();
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        hideTooltip();
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isVisible]);

  const tooltipElement = isVisible && coords && typeof document !== 'undefined' ? (
    createPortal(
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{
          position: 'fixed',
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          zIndex: 99999,
          pointerEvents: 'none',
        }}
        className="animate-in fade-in zoom-in-95 duration-100 ease-out select-none max-w-xs sm:max-w-sm"
      >
        <div className="relative bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-700/80 p-2.5 text-left ring-1 ring-black/20">
          {title && (
            <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-400 mb-1 tracking-tight">
              <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{title}</span>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-200 font-medium">
            {content}
          </p>
        </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <div
      ref={triggerRef}
      className={`inline-flex items-center ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onClick={handleClick}
      title={showNativeTitle ? (title ? `${title}: ${content}` : content) : undefined}
    >
      {children}
      {tooltipElement}
    </div>
  );
};

/**
 * An inline help badge with tooltip for form fields, table headers, or cards
 */
export const AdminHelpHint: React.FC<{
  text: string;
  title?: string;
  className?: string;
}> = ({ text, title, className = '' }) => {
  return (
    <AdminTooltip content={text} title={title || 'Petunjuk Bantuan'} side="top">
      <span
        tabIndex={0}
        role="button"
        aria-label={title || 'Petunjuk Bantuan'}
        className={`inline-flex items-center justify-center p-0.5 rounded-full text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-help transition-colors ${className}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>
    </AdminTooltip>
  );
};

// Aliases for clear semantic usage across user and administrative views
export const AppTooltip = AdminTooltip;
export const HelpHint = AdminHelpHint;

