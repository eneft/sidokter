import { onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getDefaultSoegiriMasterCategories, setSoegiriMasterCategories, SoegiriCategory } from '../utils/soegiriStructure';

const DOC_REF = doc(db, 'system_config', 'hierarchy_master');

function normalize(value: any): SoegiriCategory[] {
  return Array.isArray(value) ? value.map((c: any) => ({ ...c, active: c?.active !== false })) : getDefaultSoegiriMasterCategories();
}

export function subscribeToHierarchyMaster(
  onData: (categories: SoegiriCategory[]) => void,
  onError?: (error: any) => void
) {
  let active = true;
  const apply = (data: any) => {
    if (!active) return;
    const categories = normalize(data?.categories);
    setSoegiriMasterCategories(categories);
    onData(categories);
  };

  const unsubscribe = onSnapshot(
    DOC_REF,
    snapshot => apply(snapshot.exists() ? snapshot.data() : {}),
    error => {
      const fallback = getDefaultSoegiriMasterCategories();
      setSoegiriMasterCategories(fallback);
      onData(fallback);
      onError?.(error);
    }
  );

  return () => { active = false; unsubscribe(); };
}

export async function saveHierarchyMaster(categories: SoegiriCategory[], updatedBy = 'admin') {
  const clean = normalize(JSON.parse(JSON.stringify(categories || [])));
  await setDoc(DOC_REF, {
    categories: clean,
    updatedAt: new Date().toISOString(),
    updatedBy
  }, { merge: true });
  setSoegiriMasterCategories(clean);
  return clean;
}

export async function getHierarchyMaster() {
  try {
    const snap = await getDoc(DOC_REF);
    const categories = normalize(snap.exists() ? snap.data() : {});
    setSoegiriMasterCategories(categories);
    return categories;
  } catch {
    const fallback = getDefaultSoegiriMasterCategories();
    setSoegiriMasterCategories(fallback);
    return fallback;
  }
}
