/** One run of the engine in this page session: when it started/ended and how many files were already done. */

export function sessionSummary(s, doneNow, now) {
  if (!s.startedAt) return { elapsedMs: 0, perSecond: 0 };
  const elapsedMs = Math.max(0, (s.endedAt || now) - s.startedAt);
  const saved = Math.max(0, doneNow - s.startDone);
  return { elapsedMs, perSecond: elapsedMs > 0 ? (saved / elapsedMs) * 1000 : 0 };
}
