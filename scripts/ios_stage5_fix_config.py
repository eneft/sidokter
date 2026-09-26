from pathlib import Path

p = Path('capacitor.config.ts')
s = p.read_text()
needle = "import type { CapacitorConfig } from '@capacitor/cli';"
if "KeyboardResize" not in s:
    if needle not in s:
        raise SystemExit('capacitor config import marker missing')
    s = s.replace(needle, needle + "\nimport { KeyboardResize } from '@capacitor/keyboard';", 1)
s = s.replace("resize: 'native'", 'resize: KeyboardResize.Native')
p.write_text(s)
print('Capacitor KeyboardResize config corrected')
