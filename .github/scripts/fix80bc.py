from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count == 0 and new in text:
        print(f"{label}: already patched")
        return
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))
    print(f"{label}: patched")


index_old = """          const snapshot = await transaction.get(sopRef);
          let stored;
          if (!snapshot.exists) {
            const userUid = String(context.user?.id || context.user?.authUid || '').trim();
            const baseKeys = getSopAccessKeysServer(submitted);
            stored = {
              id: sopId,
              status: 'DRAFT',
              title: String(submitted.title || 'Draft SPO').trim(),
              createdAt: new Date().toISOString(),
              createdBy: context.user?.username || 'user',
              accessKeys: baseKeys,
              authorizedUids: userUid ? [userUid] : [],
              ...submitted,
            };
          } else {
            const storedRaw = { id: snapshot.id, ...snapshot.data() };
            stored = {
              ...storedRaw,
              accessKeys: Array.isArray(storedRaw.accessKeys) && storedRaw.accessKeys.length
                ? storedRaw.accessKeys
                : getSopAccessKeysServer(storedRaw),
            };
          }
"""
index_new = """          const snapshot = await transaction.get(sopRef);
          let storedRaw;
          let stored;
          if (!snapshot.exists) {
            const userUid = String(context.decoded?.uid || context.user?.id || context.user?.authUid || '').trim();
            const baseKeys = getSopAccessKeysServer(submitted);
            storedRaw = {
              ...submitted,
              id: sopId,
              status: 'DRAFT',
              title: String(submitted.title || 'Draft SPO').trim(),
              createdAt: submitted.createdAt || new Date().toISOString(),
              createdBy: context.user?.username || 'user',
              creatorUid: userUid,
              accessKeys: baseKeys,
              authorizedUids: userUid ? [userUid] : [],
            };
            stored = storedRaw;
          } else {
            storedRaw = { id: snapshot.id, ...snapshot.data() };
            stored = {
              ...storedRaw,
              accessKeys: Array.isArray(storedRaw.accessKeys) && storedRaw.accessKeys.length
                ? storedRaw.accessKeys
                : getSopAccessKeysServer(storedRaw),
            };
          }
"""
replace_once('functions/index.js', index_old, index_new, 'sop-edit storedRaw scope')

delete_old = """          const stored = { id: snapshot.id, ...snapshot.data() };
          const isAdmin = context.user?.role === 'admin';
          const userUid = String(context.user?.id || context.user?.authUid || context.decoded?.uid || '').trim();
          const isCreator = stored.createdBy === context.user?.username || (Array.isArray(stored.authorizedUids) && stored.authorizedUids.includes(userUid));

          if (!isAdmin && !isCreator) {
            const error = new Error('PERMISSION_DENIED');
            error.sopDeleteStatus = 403;
            error.sopDeleteCode = 'PERMISSION_DENIED';
            error.sopDeleteMessage = 'Anda tidak memiliki hak akses untuk menghapus dokumen SPO ini.';
            throw error;
          }

          const wasEverActive = stored.everActivated === true || stored.status === 'AKTIF' || stored.status === 'DIARSIPKAN' || Boolean(stored.activatedAt);
"""
delete_new = """          const stored = { id: snapshot.id, ...snapshot.data() };
          const isAdmin = normalizeRole(context.user?.role) === 'admin';
          const userUid = String(context.decoded?.uid || context.user?.id || context.user?.authUid || '').trim();
          const actorUsername = normalizeUsername(context.user?.username);
          const creatorUid = String(stored.creatorUid || '').trim();
          const createdBy = normalizeUsername(stored.createdBy);
          const isCreator = Boolean(
            (creatorUid && userUid && creatorUid === userUid) ||
            (createdBy && actorUsername && createdBy === actorUsername)
          );

          const wasEverActive = stored.everActivated === true || stored.status === 'AKTIF' || stored.status === 'DIARSIPKAN' || Boolean(stored.activatedAt);

          if (wasEverActive && !isAdmin) {
            const error = new Error('PERMISSION_DENIED');
            error.sopDeleteStatus = 403;
            error.sopDeleteCode = 'PERMISSION_DENIED';
            error.sopDeleteMessage = 'SPO yang pernah aktif hanya dapat diarsipkan oleh Administrator.';
            throw error;
          }

          if (!wasEverActive && !isAdmin && !isCreator) {
            const error = new Error('PERMISSION_DENIED');
            error.sopDeleteStatus = 403;
            error.sopDeleteCode = 'PERMISSION_DENIED';
            error.sopDeleteMessage = 'Anda hanya dapat menghapus permanen DRAFT yang Anda buat sendiri.';
            throw error;
          }
"""
replace_once('functions/index.js', delete_old, delete_new, 'sop-delete ownership')

clean_old = """    const cleanSop = sanitizeForFirestore({
      ...sop,
      ...(sop.status === 'AKTIF' || sop.status === 'DIARSIPKAN' || sop.everActivated ? { everActivated: true } : {}),
"""
clean_new = """    const cleanSop = sanitizeForFirestore({
      ...sop,
      creatorUid: (sop as any).creatorUid || currentUid || undefined,
      createdBy: (sop as any).createdBy || currentSessionRaw?.username || 'user',
      ...(sop.status === 'AKTIF' || sop.status === 'DIARSIPKAN' || sop.everActivated ? { everActivated: true } : {}),
"""
replace_once('src/lib/firestoreService.ts', clean_old, clean_new, 'new SPO creator identity')

draft_old = """          createdAt: cleanSop.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          authorizedUids: authorizedUids.length ? authorizedUids : (currentUid ? [currentUid] : []),
"""
draft_new = """          createdAt: cleanSop.createdAt || new Date().toISOString(),
          creatorUid: currentUid || undefined,
          createdBy: currentSessionRaw?.username || 'user',
          updatedAt: new Date().toISOString(),
          authorizedUids: authorizedUids.length ? authorizedUids : (currentUid ? [currentUid] : []),
"""
replace_once('src/lib/firestoreService.ts', draft_old, draft_new, 'initial DRAFT creator identity')
