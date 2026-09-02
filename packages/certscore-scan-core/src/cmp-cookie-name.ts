import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";

function boundedCookieName(value: string) {
  return value.trim().slice(0, 180);
}

/**
 * Matches an observed cookie to one exact canonical confirmation name plus any
 * tenant-suffix wildcard registered for that same canonical name. This keeps
 * action confirmation registry-bound while supporting CMPs such as
 * Consentmanager that append tenant identifiers to otherwise stable names.
 */
export function matchesCanonicalCmpCookieName(actualName: string, expectedName: string) {
  const actual = boundedCookieName(actualName);
  const expected = boundedCookieName(expectedName);
  if (!actual || !expected) return false;

  const patterns = new Set([expected]);
  for (const definition of KNOWN_CMP_REGISTRY) {
    for (const knownName of definition.cookieNames ?? []) {
      const known = boundedCookieName(knownName);
      if (
        known === expected ||
        (known.endsWith("*") && known.slice(0, -1).startsWith(expected)) ||
        (expected.endsWith("*") && expected.slice(0, -1).startsWith(known))
      ) {
        patterns.add(known);
      }
    }
  }

  return [...patterns].some((pattern) =>
    pattern.endsWith("*")
      ? actual.startsWith(pattern.slice(0, -1))
      : actual === pattern
  );
}
