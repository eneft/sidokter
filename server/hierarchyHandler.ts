import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HIERARCHY_FILE = path.resolve(DATA_DIR, 'hierarchy_master.json');
const CONFIG_FILE = path.resolve(process.cwd(), 'firebase-applet-config.json');

let serverFirestoreDb: any = null;
async function getServerFirestore() {
  if (serverFirestoreDb) return serverFirestoreDb;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      const app = getApps().length === 0 ? initializeApp({
        projectId: config.projectId,
        appId: config.appId,
        apiKey: config.apiKey,
        authDomain: config.authDomain
      }) : getApp();
      serverFirestoreDb = getFirestore(app, config.firestoreDatabaseId || '(default)');
      return serverFirestoreDb;
    }
  } catch (err) {
    console.warn('[hierarchyHandler] Server Firestore init notice:', err);
  }
  return null;
}

export async function handleHierarchyGet(_req: Request, res: Response): Promise<void> {
  try {
    // 1. Coba baca dari Firestore di server jika tersedia
    const db = await getServerFirestore();
    if (db) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'system_config', 'hierarchy_master'));
        if (snap.exists()) {
          const val = snap.data()?.value;
          let list: any[] = [];
          if (Array.isArray(val)) {
            list = val;
          } else if (val && typeof val === 'object') {
            const keys = Object.keys(val).sort((a, b) => Number(a) - Number(b));
            list = keys.map((k) => val[k]).filter(Boolean);
          }
          if (list.length > 0) {
            // Backup ke file lokal server
            try {
              if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
              fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), 'utf-8');
            } catch {}

            res.json({ success: true, source: 'firestore', categories: list });
            return;
          }
        }
      } catch (fErr) {
        console.warn('[hierarchyHandler] Server Firestore get error:', fErr);
      }
    }

    // 2. Fallback baca dari file lokal server
    if (fs.existsSync(HIERARCHY_FILE)) {
      const raw = fs.readFileSync(HIERARCHY_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        res.json({ success: true, source: 'local_file', categories: list });
        return;
      }
    }

    res.json({ success: true, source: 'empty', categories: [] });
  } catch (err: any) {
    console.error('[hierarchyHandler] GET error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Gagal memuat hierarki.' });
  }
}

export async function handleHierarchySave(req: Request, res: Response): Promise<void> {
  try {
    const { categories, updatedBy } = req.body || {};
    let list: any[] = [];
    if (Array.isArray(categories)) {
      list = categories;
    } else if (categories && typeof categories === 'object') {
      const keys = Object.keys(categories).sort((a, b) => Number(a) - Number(b));
      list = keys.map((k) => categories[k]).filter(Boolean);
    }

    if (!list.length) {
      res.status(400).json({ success: false, message: 'Data kategori tidak boleh kosong.' });
      return;
    }

    // 1. Simpan ke file lokal server
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (fsErr) {
      console.warn('[hierarchyHandler] Simpan file lokal warning:', fsErr);
    }

    // 2. Simpan ke Firestore di server
    let firestoreSynced = false;
    const db = await getServerFirestore();
    if (db) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'system_config', 'hierarchy_master'), {
          id: 'hierarchy_master',
          value: list,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy || 'admin'
        }, { merge: true });
        firestoreSynced = true;
      } catch (fErr) {
        console.warn('[hierarchyHandler] Server Firestore save error:', fErr);
      }
    }

    res.json({
      success: true,
      count: list.length,
      firestoreSynced,
      message: `Hierarki dengan ${list.length} kategori berhasil disimpan.`
    });
  } catch (err: any) {
    console.error('[hierarchyHandler] POST error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Gagal menyimpan hierarki.' });
  }
}
