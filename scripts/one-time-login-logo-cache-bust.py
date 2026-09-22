from pathlib import Path

path = Path('src/components/LoginPage.tsx')
source = path.read_text(encoding='utf-8')
old = 'src="/sidokter-logo.webp"'
new = 'src="/sidokter-logo-v2.webp?v=20260923-0619"'
count = source.count(old)
if count != 2:
    raise SystemExit(f'guard failed: expected 2 old SIDOKTER logo refs, found {count}')
source = source.replace(old, new)
if source.count(new) != 2:
    raise SystemExit('guard failed: cache-busted logo ref was not written twice')
path.write_text(source, encoding='utf-8')
print('Updated desktop and mobile SIDOKTER login logo to cache-busted v2 asset.')
