import type { GpcResponseAssessment } from "@certscore/contracts";
import { classifyChoiceCookie } from "./choice-cookie-classification";
import { cookieInventoryClassification } from "./runtime-inventory-projection";

export function readGpcCookieIdentity(encoded: string) {
  // The comparison producer stores only [name, domain, path]. Never render opaque legacy keys.
  try {
    const parts: unknown = JSON.parse(encoded);
    if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(part => typeof part === "string")) return null;
    const [name, domain, path] = parts as [string, string, string];
    if (!name || !domain || domain.length > 253 || !path.startsWith("/")) return null;
    const classification = classifyChoiceCookie(name, domain);
    return { key: encoded, name, domain, path, category: classification.category, essentiality: classification.essentiality, inventoryEvidence: cookieInventoryClassification(new Set([classification.essentiality])) };
  } catch {
    return null;
  }
}

export function gpcCookieInventory(assessment: GpcResponseAssessment) {
  if (assessment.contractVersion === "certscore.gpc-response-assessment.v1") return [];
  const cookies = assessment.comparison.deltas.cookies;
  return [...new Set([...cookies.shared, ...cookies.gpcOnly])].map(readGpcCookieIdentity).filter(row => row !== null);
}
