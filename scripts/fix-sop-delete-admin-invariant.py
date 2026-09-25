from pathlib import Path

path = Path('functions/index.js')
text = path.read_text(encoding='utf-8')
old = """          const isCreator = Boolean(
            (creatorUid && userUid && creatorUid === userUid) ||
            (createdBy && actorUsername && createdBy === actorUsername)
          );

          const deleteDecision = decideSopDeleteAction({
"""
new = """          const isCreator = Boolean(
            (creatorUid && userUid && creatorUid === userUid) ||
            (createdBy && actorUsername && createdBy === actorUsername)
          );

          // Preserve the long-standing fail-closed invariant explicitly at the
          // trusted boundary: any SPO that has ever been official requires Admin.
          // The pure policy below still owns the detailed archive/draft decision.
          const wasEverActive = stored.everActivated === true ||
            stored.status === 'AKTIF' ||
            stored.status === 'DIARSIPKAN' ||
            Boolean(stored.activatedAt);
          if (wasEverActive && !isAdmin) {
            const accessError = new Error('PERMISSION_DENIED');
            accessError.sopDeleteStatus = 403;
            accessError.sopDeleteCode = 'PERMISSION_DENIED';
            accessError.sopDeleteMessage = 'SPO yang pernah aktif hanya dapat dikelola penghapusannya oleh Administrator.';
            throw accessError;
          }

          const deleteDecision = decideSopDeleteAction({
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one delete guard insertion point, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('trusted SPO delete Admin invariant restored')
