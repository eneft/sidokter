from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)

# 1) Trusted authApi server boundary
p = Path('functions/index.js')
s = p.read_text()
s = replace_once(
    s,
    "const { validateNumberCorrection, buildAdminNumberUpdate } = require('./sopNumberUpdate');\n",
    "const { validateNumberCorrection, buildAdminNumberUpdate } = require('./sopNumberUpdate');\nconst { buildTrustedSopContentUpdate } = require('./sopEditContentPolicy');\n",
    'functions policy import',
)
s = replace_once(
    s,
    "const AUTH_API_BUILD = 'firebase-migration-fix-v5';",
    "const AUTH_API_BUILD = 'firebase-migration-fix-v6-trusted-sop-edit';",
    'auth api build marker',
)
anchor = """    if (action === 'migrate-sop-access') {\n      return await migrateSopAccessBoundary(req, res, context);\n    }\n"""
insert = """    if (action === 'sop-edit') {\n      const submitted = req.body?.sop || {};\n      const sopId = String(submitted.id || '').trim();\n      if (!sopId) return json(res, 400, { success: false, code: 'INVALID_SOP', message: 'Dokumen SPO tidak valid.' });\n\n      const sopRef = db.collection('sops').doc(sopId);\n      const hierarchyClaims = getUserHierarchyClaims(context.user);\n      let resultingSop = null;\n\n      try {\n        await db.runTransaction(async (transaction) => {\n          const snapshot = await transaction.get(sopRef);\n          if (!snapshot.exists) {\n            const error = new Error('SPO_NOT_FOUND');\n            error.sopEditStatus = 404;\n            error.sopEditCode = 'SOP_NOT_FOUND';\n            error.sopEditMessage = 'SPO tidak ditemukan atau sudah dihapus.';\n            throw error;\n          }\n\n          const storedRaw = { id: snapshot.id, ...snapshot.data() };\n          const stored = {\n            ...storedRaw,\n            accessKeys: Array.isArray(storedRaw.accessKeys) && storedRaw.accessKeys.length\n              ? storedRaw.accessKeys\n              : getSopAccessKeysServer(storedRaw),\n          };\n\n          let next;\n          try {\n            next = buildTrustedSopContentUpdate({\n              stored,\n              submitted,\n              actor: context.user,\n              hierarchyClaims,\n            });\n          } catch (policyError) {\n            const reason = String(policyError?.message || policyError || 'SOP_EDIT_DENIED');\n            const mapping = {\n              INVALID_SOP: [400, 'INVALID_SOP', 'Dokumen SPO tidak valid.'],\n              UNAUTHENTICATED: [401, 'UNAUTHENTICATED', 'Sesi login tidak valid. Silakan login kembali.'],\n              DRAFT_REQUIRED: [403, 'DRAFT_REQUIRED', 'Petugas hanya dapat mengedit SPO berstatus DRAFT.'],\n              HIERARCHY_DENIED: [403, 'HIERARCHY_DENIED', 'Anda tidak memiliki hak edit pada hirarki SPO ini.'],\n              NUMBER_CHANGE_REQUIRES_CORRECTION: [409, 'NUMBER_CHANGE_REQUIRES_CORRECTION', 'Perubahan nomor SPO harus melalui alur koreksi nomor Admin.'],\n            };\n            const [status, code, message] = mapping[reason] || [403, 'SOP_EDIT_DENIED', 'Perubahan SPO tidak diizinkan.'];\n            const error = new Error(reason);\n            error.sopEditStatus = status;\n            error.sopEditCode = code;\n            error.sopEditMessage = message;\n            throw error;\n          }\n\n          const writePayload = {\n            ...next,\n            fileDataUrl: FieldValue.delete(),\n            signedScanDataUrl: FieldValue.delete(),\n            oldFileDataUrl: FieldValue.delete(),\n          };\n          transaction.set(sopRef, writePayload, { merge: true });\n\n          const auditRef = db.collection('audit_logs').doc();\n          transaction.set(auditRef, {\n            id: auditRef.id,\n            action: 'SOP_EDITED',\n            documentId: stored.id,\n            documentNumber: stored.sopNumber || '',\n            documentStatus: stored.status || '',\n            actorUid: context.decoded.uid,\n            actorName: context.user.name || context.user.username || 'Pengguna SIDOKTER',\n            actorUsername: context.user.username || '',\n            actorRole: context.user.role,\n            timestamp: FieldValue.serverTimestamp(),\n            boundary: 'trusted-session',\n          });\n\n          resultingSop = { ...storedRaw, ...next };\n          delete resultingSop.fileDataUrl;\n          delete resultingSop.signedScanDataUrl;\n          delete resultingSop.oldFileDataUrl;\n        });\n      } catch (error) {\n        if (error?.sopEditStatus) {\n          return json(res, error.sopEditStatus, {\n            success: false,\n            code: error.sopEditCode,\n            message: error.sopEditMessage,\n          });\n        }\n        console.error('Trusted SOP edit failed', {\n          sopId,\n          actorUid: context.decoded.uid,\n          code: error?.code,\n          message: error?.message || String(error),\n        });\n        throw error;\n      }\n\n      return json(res, 200, { success: true, sop: resultingSop, source: 'trusted-session' });\n    }\n\n""" + anchor
s = replace_once(s, anchor, insert, 'authApi sop-edit insertion')
p.write_text(s)

# 2) Client edit boundary: no direct Firestore read/transaction for content save.
p = Path('src/lib/firestoreService.ts')
s = p.read_text()
import_anchor = "import { assertCanEditExistingSop, preserveSopWorkflowIdentity } from './sopEditPolicy';\n"
s = replace_once(
    s,
    import_anchor,
    import_anchor + "import { callAuthenticatedAuthApi } from './authService';\n",
    'client trusted auth import',
)
pattern = re.compile(r"export async function updateExistingSopInFirestore\(submitted: SopDocument, actor: UserSession\): Promise<SopDocument> \{.*?\n\}\n\n/\*\* Authoritative, all-or-nothing lifecycle transition for a Riviu\. \*/", re.S)
match = pattern.search(s)
if not match:
    raise SystemExit('client updateExistingSopInFirestore: function anchor not found')
replacement = """export async function updateExistingSopInFirestore(\n  submitted: SopDocument,\n  actor: UserSession,\n  originalSopNumber?: string,\n): Promise<SopDocument> {\n  if (!submitted?.id) throw new Error('Dokumen SPO tidak valid.');\n\n  // Number correction remains on its dedicated atomic backend boundary. For\n  // ordinary content edits, never perform a direct browser Firestore read: the\n  // trusted SIDOKTER session is authoritative and is validated by authApi.\n  const previousNumber = String(originalSopNumber ?? submitted.sopNumber ?? '').trim();\n  const submittedNumber = String(submitted.sopNumber || '').trim();\n  if (actor.role === 'admin' && previousNumber && previousNumber !== submittedNumber) {\n    try {\n      const callable = httpsCallable(functions, 'updateSopNumber');\n      const result = await callable({ sop: sanitizeForFirestore(submitted) });\n      const data = result.data as { sop?: SopDocument };\n      if (!data?.sop) throw new Error('Respons koreksi nomor SPO tidak valid.');\n      return data.sop;\n    } catch (error: any) {\n      throw getSopNumberUpdateError(error);\n    }\n  }\n\n  try {\n    const result = await callAuthenticatedAuthApi('sop-edit', {\n      sop: sanitizeForFirestore(submitted),\n    });\n    if (!result?.success || !result?.sop) {\n      throw new Error(result?.message || 'Respons penyimpanan SPO tidak valid.');\n    }\n    return result.sop as SopDocument;\n  } catch (error: any) {\n    const code = String(error?.code || '');\n    if (error?.status === 401 || code === 'UNAUTHENTICATED' || code === 'SESSION_REVOKED') {\n      throw new Error('Sesi login tidak valid atau telah berakhir. Silakan login kembali.');\n    }\n    throw error instanceof Error ? error : new Error(String(error || 'Gagal menyimpan perubahan SPO.'));\n  }\n}\n\n/** Authoritative, all-or-nothing lifecycle transition for a Riviu. */"""
s = s[:match.start()] + replacement + s[match.end():]
p.write_text(s)

# 3) Pass the cached canonical number so content edits never need a direct cloud
# read solely to discover whether a dedicated number correction is required.
p = Path('src/lib/sopService.ts')
s = p.read_text()
s = replace_once(
    s,
    "? await updateExistingSopInFirestore(next, options.editActor)\n",
    "? await updateExistingSopInFirestore(next, options.editActor, previous?.sopNumber)\n",
    'sop service original number routing',
)
p.write_text(s)

# 4) Make the permanent regression suite execute the new server policy + bridge.
p = Path('package.json')
s = p.read_text()
s = replace_once(
    s,
    '"test:sop-edit": "tsx --test tests/sop-edit-policy.test.ts && node --test functions/sopNumberUpdate.test.js",',
    '"test:sop-edit": "tsx --test tests/sop-edit-policy.test.ts && node --test functions/sopNumberUpdate.test.js functions/sopEditContentPolicy.test.js tests/sop-edit-trusted-boundary.test.cjs",',
    'package sop-edit regression command',
)
p.write_text(s)

print('Trusted SPO edit candidate applied successfully.')
