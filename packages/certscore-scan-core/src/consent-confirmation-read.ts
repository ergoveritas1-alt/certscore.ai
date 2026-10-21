/** Run already-required independent read-only witnesses together. An absent or
 * failed witness does not cancel another; callers retain the existing deadline,
 * target, semantic-state and provenance guards on every result. */
export function firstVerifiedConsentRead<T>(reads: Array<Promise<T | undefined>>): Promise<T | undefined> {
  return new Promise(resolve => {
    if (!reads.length) { resolve(undefined); return; }
    let remaining = reads.length;
    for (const read of reads) void read.catch(() => undefined).then(result => {
      remaining--;
      if (result !== undefined) resolve(result);
      else if (!remaining) resolve(undefined);
    });
  });
}
