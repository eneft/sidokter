import { SoegiriCategory, SoegiriHierarchyNode } from './soegiriStructure';

export function getNodeChildren(node: SoegiriCategory | SoegiriHierarchyNode): SoegiriHierarchyNode[] {
  const genericChildren = Array.isArray(node.children) ? node.children : [];
  if (genericChildren.length > 0) return genericChildren;

  // Cloud normalization can legitimately produce `children: []` alongside a
  // populated legacy hierarchy (`subs` / `instalasis` / `polis` / `subUnits`).
  // Treat only a non-empty generic branch as authoritative so older master data
  // remains traversable while newer arbitrary-depth `children` still wins.
  for (const key of ['subs', 'instalasis', 'polis', 'subUnits'] as const) {
    const legacyChildren = (node as any)[key];
    if (Array.isArray(legacyChildren) && legacyChildren.length > 0) {
      return legacyChildren;
    }
  }

  return genericChildren;
}

export function findNodeByPath(root: SoegiriCategory | SoegiriHierarchyNode, codes: string[]): SoegiriHierarchyNode | SoegiriCategory | undefined {
  let current: any = root;
  for (const code of codes) {
    const next = getNodeChildren(current).find((n) => String(n.code) === String(code));
    if (!next) return undefined;
    current = next;
  }
  return current;
}

export interface FlattenedHierarchy {
  code: string;
  pathCodes: string[];
  pathNames: string[];
  label: string;
  depth: number;
  node: SoegiriHierarchyNode;
}

export function flattenHierarchy(category: SoegiriCategory): FlattenedHierarchy[] {
  const result: FlattenedHierarchy[] = [];
  const walk = (nodes: SoegiriHierarchyNode[], codes: string[], names: string[]) => {
    for (const node of nodes) {
      const nextCodes = [...codes, node.code];
      const nextNames = [...names, node.name];
      result.push({
        code: nextCodes.join('.'),
        pathCodes: nextCodes,
        pathNames: nextNames,
        label: nextNames.join(' → '),
        depth: nextCodes.length,
        node,
      });
      walk(getNodeChildren(node), nextCodes, nextNames);
    }
  };
  walk(getNodeChildren(category), [], []);
  return result;
}

export function flattenAllHierarchies(categories: SoegiriCategory[]): Array<FlattenedHierarchy & { divisionCode: string; divisionName: string }> {
  return categories.flatMap((category) => flattenHierarchy(category).map((item) => ({
    ...item,
    divisionCode: category.code,
    divisionName: category.name,
  })));
}

export function firstLeafPath(category: SoegiriCategory): string[] {
  const result: string[] = [];
  let nodes = getNodeChildren(category);
  while (nodes.length) {
    const node = nodes[0];
    result.push(node.code);
    nodes = getNodeChildren(node);
  }
  return result;
}

export function pathNamesForCodes(category: SoegiriCategory, codes: string[]): string[] {
  const names: string[] = [];
  let current: any = category;
  for (const code of codes) {
    const child = getNodeChildren(current).find((n) => n.code === code);
    if (!child) break;
    names.push(child.name);
    current = child;
  }
  return names;
}
