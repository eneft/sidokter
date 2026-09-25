const DASHBOARD_SEARCH_SELECTOR = 'input[placeholder^="Cari nomor, judul, kode sub-divisi"]';
const ACTIVE_ATTRIBUTE = 'data-sidokter-mobile-search';

/**
 * Keeps the dashboard quick-search usable when the iOS virtual keyboard opens.
 * This only changes mobile viewport/focus behaviour; search/filter business logic
 * remains owned by DashboardOverviewPage.
 */
export function installDashboardMobileSearchViewportFix(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  let activeSection: HTMLElement | null = null;
  let alignFrame = 0;

  const isMobile = () => window.matchMedia('(max-width: 639px)').matches;

  const syncVisualViewportHeight = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty(
      '--sidokter-mobile-search-vvh',
      `${Math.max(1, Math.round(height))}px`,
    );
  };

  const alignActiveSearch = (behavior: ScrollBehavior = 'auto') => {
    if (!activeSection || !isMobile()) return;
    syncVisualViewportHeight();
    window.cancelAnimationFrame(alignFrame);
    alignFrame = window.requestAnimationFrame(() => {
      activeSection?.scrollIntoView({ block: 'start', inline: 'nearest', behavior });
    });
  };

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(DASHBOARD_SEARCH_SELECTOR) || !isMobile()) return;

    activeSection = target.closest('section');
    if (!activeSection) return;

    activeSection.setAttribute(ACTIVE_ATTRIBUTE, 'true');
    syncVisualViewportHeight();

    // First move the compacted search shell into view, then align it again after
    // Safari finishes animating the virtual keyboard / visual viewport.
    window.setTimeout(() => alignActiveSearch('smooth'), 40);
    window.setTimeout(() => alignActiveSearch('auto'), 280);
  };

  const handleFocusOut = () => {
    window.setTimeout(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement && focused.matches(DASHBOARD_SEARCH_SELECTOR)) {
        return;
      }

      activeSection?.removeAttribute(ACTIVE_ATTRIBUTE);
      activeSection = null;
    }, 180);
  };

  const handleViewportChange = () => {
    syncVisualViewportHeight();
    if (activeSection && isMobile()) {
      alignActiveSearch('auto');
    }
  };

  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  window.visualViewport?.addEventListener('resize', handleViewportChange);
  window.visualViewport?.addEventListener('scroll', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);
  syncVisualViewportHeight();

  return () => {
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('focusout', handleFocusOut);
    window.visualViewport?.removeEventListener('resize', handleViewportChange);
    window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    window.removeEventListener('orientationchange', handleViewportChange);
    window.cancelAnimationFrame(alignFrame);
    activeSection?.removeAttribute(ACTIVE_ATTRIBUTE);
    document.documentElement.style.removeProperty('--sidokter-mobile-search-vvh');
  };
}
