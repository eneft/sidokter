from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)

# Remove Eventarc/Firestore trigger requirement. Official messages are generated
# directly from the trusted SPO mutation endpoints instead.
workflow_path = Path('functions/mailboxWorkflow.js')
workflow = workflow_path.read_text()
workflow = replace_once(
    workflow,
    "const { onDocumentWritten } = require('firebase-functions/v2/firestore');\n",
    "",
    'remove onDocumentWritten import'
)
pattern = r"\nconst sopMailboxWorkflow = onDocumentWritten\(\{.*?\n\}\);\n"
workflow, count = re.subn(pattern, "\n", workflow, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'remove sopMailboxWorkflow trigger: expected 1, got {count}')
workflow = replace_once(
    workflow,
    "  processSopWrite,\n  sopMailboxWorkflow,\n  clearNotificationMailbox,",
    "  processSopWrite,\n  clearNotificationMailbox,",
    'remove trigger export'
)
workflow_path.write_text(workflow)

main_path = Path('functions/main.js')
main = main_path.read_text()
main = main.replace("exports.sopMailboxWorkflow = mailboxWorkflow.sopMailboxWorkflow;\n", "")
main_path.write_text(main)

index_path = Path('functions/index.js')
index = index_path.read_text()
index = replace_once(
    index,
    "const { buildSopActivationTransition } = require('./sopActivationPolicy');\n",
    "const { buildSopActivationTransition } = require('./sopActivationPolicy');\nconst { processSopWrite } = require('./mailboxWorkflow');\n",
    'mailbox processor import'
)

index = replace_once(
    index,
    "      const hierarchyClaims = getUserHierarchyClaims(context.user);\n      let resultingSop = null;\n",
    "      const hierarchyClaims = getUserHierarchyClaims(context.user);\n      let resultingSop = null;\n      let previousSop = null;\n",
    'sop edit previous state variable'
)
index = replace_once(
    index,
    "          } else {\n            storedRaw = { id: snapshot.id, ...snapshot.data() };\n",
    "          } else {\n            storedRaw = { id: snapshot.id, ...snapshot.data() };\n",
    'sop edit existing marker'
)
# Capture authoritative state immediately before the trusted mutation.
index = replace_once(
    index,
    "          let next;\n          try {\n            next = buildTrustedSopContentUpdate({",
    "          previousSop = snapshot.exists ? { ...storedRaw } : null;\n\n          let next;\n          try {\n            next = buildTrustedSopContentUpdate({",
    'capture sop edit previous state'
)
index = replace_once(
    index,
    "      return json(res, 200, { success: true, sop: resultingSop, source: 'trusted-session' });\n    }\n\n    if (action === 'sop-activate') {",
    "      try {\n        await processSopWrite(previousSop, resultingSop, sopId);\n      } catch (mailError) {\n        console.error('Trusted mailbox delivery failed after SOP edit', {\n          sopId, actorUid: context.decoded.uid, code: mailError?.code, message: mailError?.message || String(mailError)\n        });\n      }\n\n      return json(res, 200, { success: true, sop: resultingSop, source: 'trusted-session' });\n    }\n\n    if (action === 'sop-activate') {",
    'sop edit mailbox hook'
)

index = replace_once(
    index,
    "      const successorRef = db.collection('sops').doc(sopId);\n      let transitionResult = null;\n",
    "      const successorRef = db.collection('sops').doc(sopId);\n      let transitionResult = null;\n      let activationPreviousSop = null;\n",
    'activation previous state variable'
)
index = replace_once(
    index,
    "          const storedSuccessor = { id: successorSnapshot.id, ...successorSnapshot.data() };\n\n          const authoritativePredecessorId",
    "          const storedSuccessor = { id: successorSnapshot.id, ...successorSnapshot.data() };\n          activationPreviousSop = { ...storedSuccessor };\n\n          const authoritativePredecessorId",
    'capture activation previous state'
)
index = replace_once(
    index,
    "      return json(res, 200, {\n        success: true,\n        successor: transitionResult.successor,",
    "      try {\n        await processSopWrite(activationPreviousSop, transitionResult.successor, sopId);\n      } catch (mailError) {\n        console.error('Trusted mailbox delivery failed after SPO activation', {\n          sopId, actorUid: context.decoded.uid, code: mailError?.code, message: mailError?.message || String(mailError)\n        });\n      }\n\n      return json(res, 200, {\n        success: true,\n        successor: transitionResult.successor,",
    'activation mailbox hook'
)

index = replace_once(
    index,
    "  let notification = null;\n  let resultingSop;\n\n  await db.runTransaction(async (transaction) => {",
    "  let notification = null;\n  let resultingSop;\n  let previousReviewSop = null;\n\n  await db.runTransaction(async (transaction) => {",
    'review previous state variable'
)
index = replace_once(
    index,
    "    const sop = snapshot.data() || {};\n    if (sop.status !== 'DRAFT')",
    "    const sop = snapshot.data() || {};\n    previousReviewSop = { ...sop, id: snapshot.id };\n    if (sop.status !== 'DRAFT')",
    'capture review previous state'
)
index = replace_once(
    index,
    "  // Audit is deliberately outside the workflow transaction: audit failure is\n  // non-fatal, while transition, history, and notification commit atomically.\n  await audit",
    "  try {\n    await processSopWrite(previousReviewSop, resultingSop, sopId);\n  } catch (mailError) {\n    logger.error('Trusted mailbox lifecycle update failed after SPO review transition', {\n      requestId, action, sopId, actorUid, code: mailError?.code, message: mailError?.message || String(mailError)\n    });\n  }\n\n  // Audit is deliberately outside the workflow transaction: audit failure is\n  // non-fatal, while transition, history, and notification commit atomically.\n  await audit",
    'review mailbox lifecycle hook'
)
index_path.write_text(index)

# Architecture test: server-authoritative delivery must not depend on Eventarc.
test_path = Path('tests/notification-architecture.test.cjs')
test = test_path.read_text()
if "const indexSource" not in test:
    test = replace_once(
        test,
        "const workflow = fs.readFileSync('functions/mailboxWorkflow.js', 'utf8');\n",
        "const workflow = fs.readFileSync('functions/mailboxWorkflow.js', 'utf8');\nconst indexSource = fs.readFileSync('functions/index.js', 'utf8');\nconst mainSource = fs.readFileSync('functions/main.js', 'utf8');\n",
        'architecture test source imports'
    )
append = r'''

test('workflow mail is generated inside existing trusted SPO backend actions without Eventarc', () => {
  assert.doesNotMatch(workflow, /onDocumentWritten/);
  assert.doesNotMatch(mainSource, /sopMailboxWorkflow/);
  assert.match(indexSource, /processSopWrite\(previousSop, resultingSop, sopId\)/);
  assert.match(indexSource, /processSopWrite\(activationPreviousSop, transitionResult\.successor, sopId\)/);
  assert.match(indexSource, /processSopWrite\(previousReviewSop, resultingSop, sopId\)/);
});
'''
if "without Eventarc" not in test:
    test += append
test_path.write_text(test)
