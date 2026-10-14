/** A narrow literal disclosure, not vendor inference or a complete service list.
 * Self-contained so the producer can use it inside its existing browser read. */
export function parseNamedCmpPartnerDisclosure(text: string) {
  if (typeof text !== "string" || text.length > 4096) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  const matches = [...normalized.matchAll(/\b(?:we|and) share your data with ([1-9][0-9]?) partners? \(([^()]{1,500})\)/gi)];
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  const prefix = normalized.slice(0, match.index).split(/[.!?]/).pop() ?? "";
  if (/\b(?:not|never|without|may|might|example|whether|if)\b/i.test(prefix)) return undefined;
  const names = match[2]!.split(/,\s*|\s+and\s+/i).map(name => name.trim());
  if (names.length !== Number(match[1]) || names.length > 20 || new Set(names).size !== names.length ||
      names.some(name => !/^[\p{L}\p{N}][\p{L}\p{N} &'’+\-]{0,79}$/u.test(name))) return undefined;
  return { version: "cmp_named_partner_disclosure.v1" as const, excerpt: match[0], names };
}
