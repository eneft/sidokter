from pathlib import Path

path = Path('src/components/NotificationModal.tsx')
text = path.read_text()
old = """function threadKeyFor(item: AppNotification): string {
  const explicit = String(item.metadata?.threadKey || item.metadata?.correlationId || '').trim();
  if (explicit) return explicit;
  if (item.documentId && item.type === 'review') return `sop-review:${item.documentId}`;
  if (item.documentId && ['proposal', 'activation', 'assignment'].includes(item.type)) {
    return `sop-workflow:${item.documentId}`;
  }
  return item.id;
}
"""
new = """function threadKeyFor(item: AppNotification): string {
  const explicitThread = String(item.metadata?.threadKey || '').trim();
  if (explicitThread) return explicitThread;

  // All review/correction conversation for one SPO belongs to one thread,
  // including legacy replies whose correlationId used an individual event key.
  if (item.documentId && item.type === 'review') return `sop-review:${item.documentId}`;
  if (item.documentId && ['proposal', 'activation', 'assignment'].includes(item.type)) {
    return `sop-workflow:${item.documentId}`;
  }

  const correlationId = String(item.metadata?.correlationId || '').trim();
  return correlationId || item.id;
}
"""
if old not in text:
    raise SystemExit('threadKeyFor marker not found')
path.write_text(text.replace(old, new, 1))
