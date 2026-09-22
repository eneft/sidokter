from pathlib import Path

path = Path('src/components/UserManagementModal.tsx')
text = path.read_text()

old_import = "import { subscribeToHierarchyMaster } from '../lib/hierarchyService';\n"
new_import = old_import + "import { mergeUserAssignments, getPrimaryUserAssignment } from '../lib/userAssignmentPolicy';\n"
assert text.count(old_import) == 1, f'import anchor count={text.count(old_import)}'
assert "userAssignmentPolicy" not in text
text = text.replace(old_import, new_import, 1)

old_block = """      const otherAssignments = assignments.filter((a) => a.divisionCode !== divisionCode || (a.hierarchyCode || '') !== (draftAssignment.hierarchyCode || ''));\n      const finalAssignments = role === 'admin'\n        ? []\n        : (assignments.length <= 1 ? [draftAssignment] : [draftAssignment, ...otherAssignments]);\n      const uniqueAssignments = finalAssignments.filter((a, idx, arr) => idx === arr.findIndex((x) => x.divisionCode === a.divisionCode && (x.hierarchyCode || '') === (a.hierarchyCode || '')));\n      const firstAssignment = draftAssignment;\n"""
new_block = """      // The picker represents a pending/selected assignment. Saving must merge it\n      // into the authoritative list instead of replacing the only existing\n      // hierarchy. This makes additional hierarchy access persist even when the\n      // Admin goes straight from selecting TARGET AKSES to Simpan Akun.\n      const uniqueAssignments = role === 'admin'\n        ? []\n        : mergeUserAssignments(assignments, draftAssignment);\n      const firstAssignment = getPrimaryUserAssignment(uniqueAssignments, draftAssignment);\n"""
assert text.count(old_block) == 1, f'assignment block count={text.count(old_block)}'
text = text.replace(old_block, new_block, 1)

old_hint = "Belum ada kewenangan tersimpan. Pilih hirarki di atas lalu klik <strong>Tambah Kewenangan Ini</strong>."
new_hint = "Belum ada kewenangan tersimpan. <strong>TARGET AKSES</strong> yang dipilih akan ikut disimpan saat Simpan Akun. Gunakan <strong>Tambah Kewenangan Ini</strong> untuk menambahkan lebih dari satu hirarki sebelum menyimpan."
assert text.count(old_hint) == 1, f'hint count={text.count(old_hint)}'
text = text.replace(old_hint, new_hint, 1)

path.write_text(text)
