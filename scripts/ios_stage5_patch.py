from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{label}: pattern not found in {path}')
    p.write_text(s.replace(old, new, 1))


Path('src/lib/nativeUx.ts').write_text(r'''import { App as CapacitorApp } from '@capacitor/app';
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
''')

Path('src/lib/nativeFileActions.ts').write_text(r'''import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isCapacitorNativeRuntime } from './runtimeEndpoints';

function safeNativeFileName(fileName: string): string {
  return (fileName || 'Dokumen_SIDOKTER.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 160);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca berkas.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareOrSaveBlobNative(blob: Blob, fileName: string): Promise<boolean> {
  if (!isCapacitorNativeRuntime() || !blob?.size) return false;
  try {
    const safeName = safeNativeFileName(fileName);
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path: safeName, data, directory: Directory.Cache, recursive: true });
    const uri = await Filesystem.getUri({ path: safeName, directory: Directory.Cache });
    await Share.share({
      title: safeName,
      text: 'Dokumen SIDOKTER SOEGIRI',
      files: [uri.uri],
      dialogTitle: 'Bagikan atau simpan dokumen'
    });
    return true;
  } catch (error) {
    console.warn('[nativeFileActions] Native share/save unavailable:', error);
    return false;
  }
}
''')

replace_once(
    'src/main.tsx',
    "import { getPersistedClientSession, refreshUserSessionProfile } from './lib/authService';",
    "import { getPersistedClientSession, refreshUserSessionProfile } from './lib/authService';\nimport { hideNativeSplash, initializeNativeUx } from './lib/nativeUx';",
    'main import'
)
replace_once(
    'src/main.tsx',
    "async function bootstrap(): Promise<void> {\n  await restoreFirebaseAuthBeforeRender();",
    "async function bootstrap(): Promise<void> {\n  await initializeNativeUx();\n  await restoreFirebaseAuthBeforeRender();",
    'main init'
)
replace_once(
    'src/main.tsx',
    "  );\n}\n\nvoid bootstrap();",
    "  );\n\n  requestAnimationFrame(() => { void hideNativeSplash(); });\n}\n\nvoid bootstrap();",
    'main splash'
)

replace_once(
    'src/utils/fileStorage.ts',
    "import { firebaseConfig } from '../lib/firebase';",
    "import { firebaseConfig } from '../lib/firebase';\nimport { shareOrSaveBlobNative } from '../lib/nativeFileActions';",
    'storage import'
)
replace_once(
    'src/utils/fileStorage.ts',
    "      const downloadBlob = (blob: Blob) => {\n        const blobUrl = URL.createObjectURL(blob);",
    "      const downloadBlob = async (blob: Blob) => {\n        if (await shareOrSaveBlobNative(blob, safeFileName)) return;\n        const blobUrl = URL.createObjectURL(blob);",
    'storage native share'
)
p = Path('src/utils/fileStorage.ts')
s = p.read_text()
s = s.replace('                  downloadBlob(cachedBlob);\n                  return;', '                  await downloadBlob(cachedBlob);\n                  return;')
s = s.replace('              downloadBlob(cachedBlob);\n              return;', '              await downloadBlob(cachedBlob);\n              return;')
s = s.replace('          downloadBlob(blob);\n          return;', '          await downloadBlob(blob);\n          return;')
p.write_text(s)

p = Path('src/ios-readiness.css')
s = p.read_text()
s += r'''

/* Native iOS runtime states. Activated only by nativeUx.ts. */
:root {
  --sidokter-keyboard-height: 0px;
}

.sidokter-native-ios.sidokter-keyboard-open [class~="fixed"][class~="inset-0"] {
  padding-bottom: max(var(--sidokter-safe-bottom), min(var(--sidokter-keyboard-height), 35vh));
}

.sidokter-native-ios[data-sidokter-network="offline"] body::before {
  content: "Koneksi terputus — perubahan online menunggu jaringan kembali";
  position: fixed;
  z-index: 2147483000;
  top: var(--sidokter-safe-top);
  left: max(0.5rem, var(--sidokter-safe-left));
  right: max(0.5rem, var(--sidokter-safe-right));
  min-height: 30px;
  padding: 6px 10px;
  border-radius: 0 0 10px 10px;
  background: rgba(15, 23, 42, 0.94);
  color: white;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  pointer-events: none;
}
'''
p.write_text(s)

replace_once(
    'capacitor.config.ts',
    "  webDir: 'dist',\n};",
    "  webDir: 'dist',\n  plugins: {\n    StatusBar: { overlaysWebView: false, style: 'LIGHT', backgroundColor: '#ffffff' },\n    Keyboard: { resize: 'native', autoBackdropColor: 'dom' },\n    SplashScreen: { launchAutoHide: false, launchShowDuration: 1200, backgroundColor: '#ffffff' }\n  },\n};",
    'capacitor config'
)

replace_once(
    'ios/App/App/Info.plist',
    "\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<true/>",
    "\t<key>UIStatusBarStyle</key>\n\t<string>UIStatusBarStyleDarkContent</string>\n\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<true/>",
    'status bar plist'
)

Path('tests/ios-native-ux-contract.test.ts').write_text(r'''import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const dep of ['@capacitor/app','@capacitor/network','@capacitor/keyboard','@capacitor/status-bar','@capacitor/splash-screen','@capacitor/filesystem','@capacitor/share','@capacitor/browser']) {
  assert.ok(pkg.dependencies?.[dep], `${dep} must be installed`);
}
const nativeUx = readFileSync('src/lib/nativeUx.ts','utf8');
assert.match(nativeUx, /appStateChange/);
assert.match(nativeUx, /networkStatusChange/);
assert.match(nativeUx, /keyboardWillShow/);
assert.match(nativeUx, /SplashScreen\.hide/);
const fileActions = readFileSync('src/lib/nativeFileActions.ts','utf8');
assert.match(fileActions, /Filesystem\.writeFile/);
assert.match(fileActions, /Share\.share/);
const storage = readFileSync('src/utils/fileStorage.ts','utf8');
assert.match(storage, /shareOrSaveBlobNative/);
console.log('iOS native UX contract OK');
''')

print('Stage 5 patch applied')
