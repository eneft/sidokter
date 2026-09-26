import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Keyboard } from '@capacitor/keyboard';
import { Network } from '@capacitor/network';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { getPersistedClientSession, refreshUserSessionProfile } from './authService';
import { isCapacitorNativeRuntime } from './runtimeEndpoints';

let initialized = false;

function setNetworkState(connected: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.sidokterNetwork = connected ? 'online' : 'offline';
  window.dispatchEvent(new CustomEvent('sidokter:network', { detail: { connected } }));
}

function setKeyboardState(open: boolean, height = 0) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('sidokter-keyboard-open', open);
  document.documentElement.style.setProperty('--sidokter-keyboard-height', `${Math.max(0, height)}px`);
}

async function refreshSessionOnResume() {
  const session = getPersistedClientSession();
  if (!session?.sessionId) return;
  await refreshUserSessionProfile(session).catch(() => null);
}

export async function initializeNativeUx(): Promise<void> {
  if (initialized || !isCapacitorNativeRuntime()) return;
  initialized = true;
  document.documentElement.classList.add('sidokter-native-ios');

  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);

  const initialNetwork = await Network.getStatus().catch(() => ({ connected: true, connectionType: 'unknown' as const }));
  setNetworkState(initialNetwork.connected);

  await Network.addListener('networkStatusChange', status => setNetworkState(status.connected));
  await Keyboard.addListener('keyboardWillShow', info => setKeyboardState(true, info.keyboardHeight));
  await Keyboard.addListener('keyboardWillHide', () => setKeyboardState(false, 0));
  await CapacitorApp.addListener('appStateChange', state => {
    document.documentElement.classList.toggle('sidokter-app-background', !state.isActive);
    if (state.isActive) {
      void refreshSessionOnResume();
      window.dispatchEvent(new CustomEvent('sidokter:native-resume'));
    }
  });

  document.addEventListener('click', event => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.target !== '_blank') return;
    const href = anchor.href;
    if (!/^https?:\/\//i.test(href)) return;
    event.preventDefault();
    void Browser.open({ url: href });
  }, true);
}

export async function hideNativeSplash(): Promise<void> {
  if (!isCapacitorNativeRuntime()) return;
  await SplashScreen.hide().catch(() => undefined);
}
