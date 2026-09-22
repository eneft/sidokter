import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HIERARCHY_FILE = path.resolve(DATA_DIR, 'hierarchy_master.json');
const CONFIG_FILE = path.resolve(process.cwd(), 'firebase-applet-config.json');

let firestoreProjectId = process.env.FIREBASE_PROJECT_ID || 'sidokter-soegiri';
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (parsed.projectId) firestoreProjectId = parsed.projectId;
  }
} catch {}

const CANONICAL_CLOUD_HIERARCHY_API_URL = `https://asia-southeast2-${firestoreProjectId}.cloudfunctions.net/hierarchyApiV2`;

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
    // 1. Ambil dari canonical Cloud Functions hierarchyApiV2 (mengakses Firestore via firebase-admin)
    try {
      const cloudRes = await fetch(CANONICAL_CLOUD_HIERARCHY_API_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (cloudRes.ok) {
        const cloudData: any = await cloudRes.json();
        const list = Array.isArray(cloudData?.categories) ? cloudData.categories : [];
        if (list.length > 0) {
          try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), 'utf-8');
          } catch {}

          res.json({ success: true, source: 'cloud_functions', categories: list });
          return;
        }
      }
    } catch {
      // Cloud functions network error or timeout, proceed to local and client SDK fallback
    }

    // 2. Baca dari file lokal server
    if (fs.existsSync(HIERARCHY_FILE)) {
      try {
        const raw = fs.readFileSync(HIERARCHY_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          res.json({ success: true, source: 'local_file', categories: list });
          return;
        }
      } catch {}
    }

    // 3. Fallback baca langsung dari Firestore jika tersedia
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
            try {
              if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
              fs.writeFileSync(HIERARCHY_FILE, JSON.stringify(list, null, 2), 'utf-8');
            } catch {}

            res.json({ success: true, source: 'firestore', categories: list });
            return;
          }
        }
      } catch (fErr: any) {
        if (fErr?.code !== 'permission-denied' && !fErr?.message?.includes('permissions')) {
          console.warn('[hierarchyHandler] Server Firestore get notice:', fErr?.message || fErr);
        }
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

    // 2. Forward ke Cloud Functions hierarchyApiV2 (dengan header otorisasi)
    let firestoreSynced = false;
    try {
      const forwardHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      if (req.headers.authorization) forwardHeaders.authorization = String(req.headers.authorization);
      if (req.headers['x-soegiri-auth-uid']) forwardHeaders['x-soegiri-auth-uid'] = String(req.headers['x-soegiri-auth-uid']);
      if (req.headers['x-session-id']) forwardHeaders['x-session-id'] = String(req.headers['x-session-id']);
      if (req.headers['x-soegiri-session-id']) forwardHeaders['x-soegiri-session-id'] = String(req.headers['x-soegiri-session-id']);
      if (req.headers['x-user-username']) forwardHeaders['x-user-username'] = String(req.headers['x-user-username']);

      const cloudRes = await fetch(CANONICAL_CLOUD_HIERARCHY_API_URL, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify({ categories: list, updatedBy }),
        signal: AbortSignal.timeout(15000)
      });
      if (cloudRes.ok) {
        const cloudJson: any = await cloudRes.json();
        if (cloudJson?.success === true) {
          firestoreSynced = true;
        }
      }
    } catch {}

    // 3. Cadangan: simpan ke Firestore via Client SDK jika Cloud Functions tidak merespons
    if (!firestoreSynced) {
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
        } catch (fErr: any) {
          if (fErr?.code !== 'permission-denied' && !fErr?.message?.includes('permissions')) {
            console.warn('[hierarchyHandler] Server Firestore save notice:', fErr?.message || fErr);
          }
        }
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
