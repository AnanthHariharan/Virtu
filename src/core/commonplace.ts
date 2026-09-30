/**
 * The capture inbox.
 *
 * A capture is filed when a note names it in `files`, or when a triage
 * proposal for it was accepted as some other kind of entry (`resolved`).
 * Notes written before that link existed are matched by identical text, so
 * nothing already filed reappears in the inbox.
 *
 * Pure: no browser, no database.
 */

interface CaptureLike {
  client_id: string;
  raw: string | null;
  payload: { text: string } | null;
}

interface NoteLike {
  payload: { text: string; files?: string } | null;
}

export function captureText(c: CaptureLike): string {
  return (c.payload?.text ?? c.raw ?? "").trim();
}

export function unfiledCaptures<C extends CaptureLike>(
  captures: C[], notes: NoteLike[], resolved: ReadonlySet<string> = new Set()
): C[] {
  const filed = new Set<string>();
  const texts = new Set<string>();
  for (const n of notes) {
    if (n.payload?.files) filed.add(n.payload.files);
    if (n.payload?.text) texts.add(n.payload.text.trim());
  }
  return captures.filter(c => {
    const t = captureText(c);
    return t !== "" && !filed.has(c.client_id) && !resolved.has(c.client_id) && !texts.has(t);
  });
}
