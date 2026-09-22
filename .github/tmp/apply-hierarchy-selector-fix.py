from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1, label: str = '') -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        suffix = f' [{label}]' if label else ''
        raise SystemExit(f"FAIL-CLOSED {path}{suffix}: expected {expected} exact match(es), got {count}")
    p.write_text(text.replace(old, new, expected))

# 1. Generic tree traversal: an empty `children` array created by cloud
# normalization must not hide a populated legacy branch. A non-empty generic
# branch remains authoritative.
replace_exact(
    'src/utils/hierarchyTree.ts',
    """export function getNodeChildren(node: SoegiriCategory | SoegiriHierarchyNode): SoegiriHierarchyNode[] {\n  if (Array.isArray(node.children)) return node.children;\n  const legacy = (node as any).subs || (node as any).instalasis || (node as any).polis || (node as any).subUnits;\n  return Array.isArray(legacy) ? legacy : [];\n}\n""",
    """export function getNodeChildren(node: SoegiriCategory | SoegiriHierarchyNode): SoegiriHierarchyNode[] {\n  const genericChildren = Array.isArray(node.children) ? node.children : [];\n  if (genericChildren.length > 0) return genericChildren;\n\n  // Cloud normalization can legitimately produce `children: []` alongside a\n  // populated legacy hierarchy (`subs` / `instalasis` / `polis` / `subUnits`).\n  // Treat only a non-empty generic branch as authoritative so older master data\n  // remains traversable while newer arbitrary-depth `children` still wins.\n  for (const key of ['subs', 'instalasis', 'polis', 'subUnits'] as const) {\n    const legacyChildren = (node as any)[key];\n    if (Array.isArray(legacyChildren) && legacyChildren.length > 0) {\n      return legacyChildren;\n    }\n  }\n\n  return genericChildren;\n}\n""",
    label='tree resolver',
)

# 2. Account management must consume the same generic resolver as the full
# hierarchy picker, so cloud-created children under CSSD/other units appear in
# the visible cascade too.
replace_exact(
    'src/components/UserManagementModal.tsx',
    "import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES, SoegiriCategory, buildSubHierarchyCode, getSoegiriHierarchyInfo } from '../utils/soegiriStructure';\n",
    "import { SOEGIRI_HOSPITAL_INFO, SOEGIRI_MASTER_CATEGORIES, SoegiriCategory, buildSubHierarchyCode, getSoegiriHierarchyInfo } from '../utils/soegiriStructure';\nimport { getNodeChildren } from '../utils/hierarchyTree';\n",
    label='account import',
)
replace_exact(
    'src/components/UserManagementModal.tsx',
    """  // Active Category & Sub objects for cascading selects\n  const selectedCategory = categories.find(c => c.code === divisionCode);\n  const availableSubs = selectedCategory?.subs || [];\n  const selectedSub = availableSubs.find(s => s.code === subCode);\n  const availableInsts = selectedSub?.instalasis || [];\n  const selectedInst = availableInsts.find(i => i.code === instCode);\n  const availablePolis = selectedInst?.polis || [];\n  const selectedPoli = availablePolis.find(p => p.code === poliCode);\n  const availableSubUnits = selectedPoli?.subUnits || [];\n""",
    """  // Read every visible level through the same generic tree resolver used by\n  // HierarchyPicker. This keeps legacy masters and arbitrary-depth cloud\n  // `children` compatible instead of silently stopping at an instalasi.\n  const selectedCategory = categories.find(c => c.code === divisionCode);\n  const availableSubs = selectedCategory ? getNodeChildren(selectedCategory) : [];\n  const selectedSub = availableSubs.find(s => s.code === subCode);\n  const availableInsts = selectedSub ? getNodeChildren(selectedSub) : [];\n  const selectedInst = availableInsts.find(i => i.code === instCode);\n  const availablePolis = selectedInst ? getNodeChildren(selectedInst) : [];\n  const selectedPoli = availablePolis.find(p => p.code === poliCode);\n  const availableSubUnits = selectedPoli ? getNodeChildren(selectedPoli) : [];\n  const visibleHierarchyCode = selectedHierarchyOverride || [subCode, instCode, poliCode, subUnitCode].filter(Boolean).join('.');\n""",
    label='account cascade',
)
replace_exact(
    'src/components/UserManagementModal.tsx',
    "value={{ divisionCode, hierarchyCode: selectedHierarchyOverride, hierarchyPath: [] }}",
    "value={{ divisionCode, hierarchyCode: visibleHierarchyCode, hierarchyPath: [] }}",
    label='account picker sync',
)

# 3. Master hierarchy editor must mutate/render whichever child collection the
# generic resolver says is authoritative. Otherwise an empty generic array can
# make valid legacy roots look empty or prevent adding/deleting children.
replace_exact(
    'src/components/MasterDataModal.tsx',
    "if (!parent.path.length) return (cat.children || []) as SoegiriHierarchyNode[];",
    "if (!parent.path.length) return getNodeChildren(cat);",
    label='master root add',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "return (node.children || []) as SoegiriHierarchyNode[];",
    "return getNodeChildren(node);",
    label='master nested add',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "parentChildren = cat.children;",
    "parentChildren = getNodeChildren(cat);",
    label='master root delete',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "parentChildren = current.children;",
    "parentChildren = getNodeChildren(current);",
    label='master nested delete',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "  const selected = draft.find(c => c.code === selectedDivision);\n  const parentLabel = useMemo(() => {",
    "  const selected = draft.find(c => c.code === selectedDivision);\n  const selectedChildren = selected ? getNodeChildren(selected) : [];\n  const parentLabel = useMemo(() => {",
    label='master selected children',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "{selected?.children?.length ? (",
    "{selectedChildren.length ? (",
    label='master viewer condition',
)
replace_exact(
    'src/components/MasterDataModal.tsx',
    "selected.children.map(n => (",
    "selectedChildren.map(n => (",
    label='master viewer map',
)

print('Candidate hierarchy selector patch applied with exact-match guards.')
