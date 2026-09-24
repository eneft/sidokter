from pathlib import Path

path = Path('src/components/NotificationModal.tsx')
text = path.read_text()

marker = """  const latestHumanMail = selected
    ? [...selected.messages].reverse().find(isHumanMail) || null
    : null;
"""
replacement = marker + """
  const insertSuggestion = (suggestion: string) => {
    setReplyBody((current) =>
      `${current}${current.trim() ? ' ' : ''}${suggestion}.`
    );
  };
"""
if marker not in text:
    raise SystemExit('latestHumanMail marker not found')
text = text.replace(marker, replacement, 1)

old = "onClick={() => setReplyBody((current) => `${current}${current.trim() ? ' ' : ''}${suggestion}.`)}"
new = "onClick={() => insertSuggestion(suggestion)}"
if old not in text:
    raise SystemExit('suggestion button marker not found')
text = text.replace(old, new, 1)

path.write_text(text)
