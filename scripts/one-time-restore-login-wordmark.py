from pathlib import Path

path = Path('src/components/LoginPage.tsx')
source = path.read_text(encoding='utf-8')

old_desktop = '''                <div className="login-brand-title" aria-label="SIDOKTER — Sistem Dokumen Terpadu">
                  <img
                    src="/sidokter-logo-v2.webp?v=20260923-0619"
                    alt="SIDOKTER — Sistem Dokumen Terpadu"
                    className="block h-auto w-full max-w-[430px] rounded-xl bg-white/95 px-3 py-2 object-contain shadow-sm"
                  />
                </div>'''
new_desktop = '''                <div className="login-brand-title" aria-label="SIDOKTER">
                  <span className="login-brand-title-light">SIDO</span>
                  <span className="login-brand-title-accent">KTER</span>
                </div>'''

old_mobile = '''                  <div className="login-mobile-brand-title">
                    <img
                      src="/sidokter-logo-v2.webp?v=20260923-0619"
                      alt="SIDOKTER — Sistem Dokumen Terpadu"
                      className="block h-auto w-[190px] max-w-full object-contain"
                    />
                  </div>'''
new_mobile = '''                  <div className="login-mobile-brand-title">
                    <span className="text-[#0e294b]">SIDO</span>
                    <span className="text-[#009b83]">KTER</span>
                  </div>'''

for label, old, new in (
    ('desktop logo block', old_desktop, new_desktop),
    ('mobile logo block', old_mobile, new_mobile),
):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'guard failed: expected exactly one {label}, found {count}')
    source = source.replace(old, new)

if 'sidokter-logo-v2.webp' in source:
    raise SystemExit('guard failed: v2 image reference remains in LoginPage')

path.write_text(source, encoding='utf-8')
print('Restored legacy SIDOKTER text wordmark on desktop and mobile login.')
