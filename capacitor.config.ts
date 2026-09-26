import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  // Provisional bundle identifier for the native shell. This can be changed
  // before Apple signing/App Store Connect registration without touching
  // SIDOKTER business logic or Firebase data.
  appId: 'id.go.lamongankab.rsudsoegiri.sidokter',
  appName: 'SIDOKTER SOEGIRI',
  webDir: 'dist',
  plugins: {
    StatusBar: { overlaysWebView: false, style: 'LIGHT', backgroundColor: '#ffffff' },
    Keyboard: { resize: KeyboardResize.Native, autoBackdropColor: 'dom' },
    SplashScreen: { launchAutoHide: false, launchShowDuration: 1200, backgroundColor: '#ffffff' }
  },
};

export default config;
