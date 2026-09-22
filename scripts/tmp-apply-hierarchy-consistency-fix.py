from pathlib import Path

path = Path('src/components/UserManagementModal.tsx')
text = path.read_text()

replacements = [
    ("const newSubCode = e.target.value;\n                          setSubCode(newSubCode);", "const newSubCode = e.target.value;\n                          setSelectedHierarchyOverride('');\n                          setSubCode(newSubCode);", 'sub selector'),
    ("const newInstCode = e.target.value;\n                          setInstCode(newInstCode);", "const newInstCode = e.target.value;\n                          setSelectedHierarchyOverride('');\n                          setInstCode(newInstCode);", 'installation selector'),
    ("const newPoliCode = e.target.value;\n                          setPoliCode(newPoliCode);", "const newPoliCode = e.target.value;\n                          setSelectedHierarchyOverride('');\n                          setPoliCode(newPoliCode);", 'unit selector'),
    ("const newSubUnitCode = e.target.value;\n                            setSubUnitCode(newSubUnitCode);", "const newSubUnitCode = e.target.value;\n                            setSelectedHierarchyOverride('');\n                            setSubUnitCode(newSubUnitCode);", 'sub-unit selector'),
    ("unitName: cleanUnit || 'Unit Kerja RSUD Dr. Soegiri',", "unitName: firstAssignment.unitName || cleanUnit || 'Unit Kerja RSUD Dr. Soegiri',", 'primary unit label'),
]

for old, new, label in replacements:
    count = text.count(old)
    assert count == 1, f'{label}: expected 1 match, found {count}'
    text = text.replace(old, new, 1)

path.write_text(text)
