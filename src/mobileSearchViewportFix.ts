const DASHBOARD_SEARCH_SELECTOR = 'input[placeholder^="Cari nomor, judul, kode sub-divisi"]';
const ACTIVE_ATTRIBUTE = 'data-sidokter-mobile-search';

/**
 * iOS Safari shrinks the visual viewport when the keyboard opens. Keep the
 * dashboard quick-search near the top of that viewport without rewriting the
 * dashboard layout or moving the suggestion panel into normal document flow.
 */
export function installDashboardMobileSearchViewportFix(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  let activeSection: HTMLElement | null = null;
  let activeSearchShell: HTMLElement | null = null;
  let alignFrame = 0;
  const timers: number[] = [];

  const isMobile = () => window.matchMedia('(max-width: 639px)').matches;

  const syncVisualViewportHeight = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty(
      '--sidokter-mobile-search-vvh',
      `${Math.max(1, Math.round(height))}px`,
    );
  };

  const clearTimers = () => {
    while (timers.length > 0) {
      const timer = timers.pop();
      if (timer) window.clearTimeout(timer);
    }
  };

  const alignSearchShell = (behavior: ScrollBehavior = 'auto') => {
    if (!activeSearchShell || !isMobile()) return;
    syncVisualViewportHeight();
    window.cancelAnimationFrame(alignFrame);
    alignFrame = window.requestAnimationFrame(() => {
      activeSearchShell?.scrollIntoView({
        block: 'start',
        inline: 'nearest',
        behavior,
      });
    });
  };

  const scheduleAlignment = () => {
    clearTimers();
    timers.push(window.setTimeout(() => alignSearchShell('smooth'), 60));
    timers.push(window.setTimeout(() => alignSearchShell('auto'), 320));
  };

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(DASHBOARD_SEARCH_SELECTOR) || !isMobile()) return;

    activeSection = target.closest('section');
    activeSearchShell = target.closest('div.mt-6.max-w-3xl');
    if (!activeSection || !activeSearchShell) return;

    activeSection.setAttribute(ACTIVE_ATTRIBUTE, 'true');
    syncVisualViewportHeight();
    scheduleAlignment();
  };

  const handleFocusOut = () => {
    timers.push(window.setTimeout(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLInputElement && focused.matches(DASHBOARD_SEARCH_SELECTOR)) {
        return;
      }

      activeSection?.removeAttribute(ACTIVE_ATTRIBUTE);
      activeSection = null;
      activeSearchShell = null;
    }, 220));
  };

  const handleViewportResize = () => {
    syncVisualViewportHeight();
    if (activeSearchShell && isMobile()) {
      alignSearchShell('auto');
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(DASHBOARD_SEARCH_SELECTOR) || !isMobile()) return;

    // DashboardOverviewPage already handles Enter/Escape for suggestion state.
    // Blurring here only closes the iOS keyboard so the normal result section
    // becomes fully visible after the user confirms/cancels the search.
    if (event.key === 'Enter' || event.key === 'Escape') {
      window.setTimeout(() => target.blur(), 0);
    }
  };

  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  document.addEventListener('keydown', handleKeyDown);
  window.visualViewport?.addEventListener('resize', handleViewportResize);
  window.addEventListener('orientationchange', handleViewportResize);
  syncVisualViewportHeight();

  return () => {
    clearTimers();
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('focusout', handleFocusOut);
    document.removeEventListener('keydown', handleKeyDown);
    window.visualViewport?.removeEventListener('resize', handleViewportResize);
    window.removeEventListener('orientationchange', handleViewportResize);
    window.cancelAnimationFrame(alignFrame);
    activeSection?.removeAttribute(ACTIVE_ATTRIBUTE);
    document.documentElement.style.removeProperty('--sidokter-mobile-search-vvh');
  };
}
