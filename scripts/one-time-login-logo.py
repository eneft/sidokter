from pathlib import Path

path = Path('src/components/LoginPage.tsx')
source = path.read_text(encoding='utf-8')

old_desktop = '''                <div className="login-brand-title" aria-label="SIDOKTER">
                  <span className="login-brand-title-light">SIDO</span>
                  <span className="login-brand-title-accent">KTER</span>
                </div>'''
new_desktop = '''                <div className="login-brand-title" aria-label="SIDOKTER — Sistem Dokumen Terpadu">
                  <img
                    src="/sidokter-logo.webp"
                    alt="SIDOKTER — Sistem Dokumen Terpadu"
                    className="block h-auto w-full max-w-[430px] rounded-xl bg-white/95 px-3 py-2 object-contain shadow-sm"
                  />
                </div>'''

old_mobile = '''                  <div className="login-mobile-brand-title">
                    <span className="text-[#0e294b]">SIDO</span>
                    <span className="text-[#009b83]">KTER</span>
                  </div>'''
new_mobile = '''                  <div className="login-mobile-brand-title">
                    <img
                      src="/sidokter-logo.webp"
                      alt="SIDOKTER — Sistem Dokumen Terpadu"
                      className="block h-auto w-[190px] max-w-full object-contain"
                    />
                  </div>'''

for label, old, new in (
    ('desktop SIDOKTER title', old_desktop, new_desktop),
    ('mobile SIDOKTER title', old_mobile, new_mobile),
):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'guard failed: expected exactly one {label}, found {count}')
    source = source.replace(old, new)

if source.count('src="/sidokter-logo.webp"') != 2:
    raise SystemExit('guard failed: expected logo asset to be referenced exactly twice')

path.write_text(source, encoding='utf-8')
print('Login branding updated: desktop + mobile SIDOKTER text replaced by supplied logo asset.')
