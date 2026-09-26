import { strict as assert } from 'node:assert';
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
