import { documentedChoiceCookie, resolveCanonicalCookieClassification } from "@certscore/vendor-resolver";
import type { CookieClassification } from "@certscore/contracts";

type Essentiality = CookieClassification["essentiality"];

/** Purpose of a positively observed cookie in a choice inventory. The saved
 * evidence and its versioned scoring classification remain independently readable. */
export function classifyChoiceCookie(name: string, domain?: string, retained?: {
  purpose?: string; essentiality?: Essentiality; nonEssential: boolean;
}): { category: string; essentiality: Essentiality } {
  const documented = documentedChoiceCookie(name);
  if (documented) return documented;
  if (retained?.nonEssential || retained?.essentiality === "non_essential") {
    return { category: retained.purpose ?? "unknown", essentiality: "non_essential" };
  }
  if (retained?.essentiality === "essential") {
    return { category: retained.purpose ?? "unknown", essentiality: "essential" };
  }
  const classified = resolveCanonicalCookieClassification(name, { cookieDomain: domain });
  return { category: classified.category === "unknown" ? retained?.purpose ?? "unknown" : classified.category, essentiality: classified.essentiality };
}
