from pathlib import Path
import subprocess

# The first-stage applier is intentionally fail-closed and currently stops only
# when it reaches the stale regression-test text. Its source/template edits stay
# in the working tree. Run it, then verify those exact markers before applying
# the test-contract delta against the actual repository text.
result = subprocess.run(['python3', 'scripts/tmp-apply-toolbar-final-candidate.py'])
assert result.returncode != 0, 'first-stage applier unexpectedly completed; review before proceeding'

editor = Path('src/components/RichTextEditor.tsx').read_text()
template = Path('src/components/SopLiveTemplate.tsx').read_text()
test_path = Path('tests/live-editor-toolbar-regression.test.ts')
test = test_path.read_text()

# Prove the intended runtime edits happened before touching the test contract.
for marker in [
    "onHistoryCommand?: (command: RichTextHistoryCommand) => boolean",
    "onFormattingChange?.(next);",
    "const resetSelectedFigure = () => {",
    "onInput={(event) => {",
]:
    assert marker in editor, f'missing editor candidate marker: {marker}'
for marker in [
    "const handleSectionHistory = (section: LiveSectionId, command: 'undo' | 'redo') => {",
    "setDebouncedBlocks(buildOfficialBlocks(nextSections));",
    "onHistoryCommand={(command) => handleSectionHistory(cfg.id, command)}",
]:
    assert marker in template, f'missing template candidate marker: {marker}'

# First-stage already added the template source read before stopping.
assert test.count("const template = readFileSync('src/components/SopLiveTemplate.tsx', 'utf8');") == 1

old = """test('active Live SPO fragment ignores stale paginated prop echoes during local mutation', () => {
  const sync = editor.slice(editor.indexOf('// Sync value from prop'), editor.indexOf('// Recalculate overlay'));
  const input = editor.slice(editor.indexOf('const handleInput'), editor.indexOf('// Helper to reliably select'));
  assert.match(sync, /Date\\.now\\(\\) < localMutationUntilRef\\.current/);
  assert.match(sync, /ownsInteraction/);
  assert.match(sync, /return;/);
  assert.match(input, /localMutationUntilRef\\.current = Date\\.now\\(\\) \\+ 1500/);
});
"""
new = """test('active Live SPO fragment ignores only same-epoch stale echoes and accepts canonical repagination', () => {
  const sync = editor.slice(editor.indexOf('// Sync value from prop'), editor.indexOf('// Recalculate overlay'));
  assert.match(editor, /paginationEpoch\\?: object/);
  assert.match(editor, /lastPaginationEpochRef/);
  assert.match(sync, /const epochChanged = paginationEpoch !== lastPaginationEpochRef\\.current/);
  assert.match(sync, /!epochChanged/);
  assert.match(sync, /incoming === previousIncoming/);
  assert.match(sync, /lastPaginationEpochRef\\.current = paginationEpoch/);
  assert.doesNotMatch(editor, /localMutationUntilRef/);
});
"""
assert test.count(old) == 1, f'stale epoch test count={test.count(old)}'
test = test.replace(old, new, 1)

anchor = """test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
"""
addition = """test('shared multi-page history is logical-section scoped and table clicks reclaim toolbar ownership', () => {
  assert.match(editor, /onHistoryCommand\\?: \\(command: RichTextHistoryCommand\\) => boolean/);
  assert.match(editor, /isHistoryCommand && onHistoryCommand\\?\\.\\(command as RichTextHistoryCommand\\)/);
  assert.match(editor, /onFocus\\?\\.\\(\\);[\\s\\S]*const activeTable = activeCell\\.closest\\('table'\\)/);
  assert.match(editor, /onFormattingChange\\?\\.\\(next\\)/);
  assert.match(template, /const handleSectionHistory = \\(section: LiveSectionId, command: 'undo' \\| 'redo'\\)/);
  assert.match(template, /setDebouncedBlocks\\(buildOfficialBlocks\\(nextSections\\)\\)/);
  assert.match(template, /onHistoryCommand=\\{\\(command\\) => handleSectionHistory\\(cfg\\.id, command\\)\\}/);
});

test('image selection publishes shared toolbar context synchronously without parent update inside state updater', () => {
"""
assert test.count(anchor) == 1
assert "shared multi-page history is logical-section scoped" not in test
test = test.replace(anchor, addition, 1)
test_path.write_text(test)

print('Second-stage toolbar candidate contract applied successfully.')
