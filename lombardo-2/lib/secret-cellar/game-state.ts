export function toggleDiscardedBottle(
  current: ReadonlySet<string>,
  candidateId: string,
) {
  const next = new Set(current);
  if (next.has(candidateId)) next.delete(candidateId);
  else next.add(candidateId);
  return next;
}

export function selectActiveBottle(
  discarded: ReadonlySet<string>,
  candidateId: string,
) {
  return discarded.has(candidateId) ? "" : candidateId;
}
