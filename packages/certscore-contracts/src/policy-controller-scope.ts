import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "./privacy-evidence-locale-registry";

/** Exact target scope from retained localized text, never CDN/brand inference. */
export function classifyLocalizedPolicyControllerScope(input: { targetUrl: string; text: string }) {
  let host: string;
  try { host = new URL(input.targetUrl).hostname.replace(/^www\./, ""); } catch { return null; }
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const target = `(?:^|[^a-z0-9_.-])${escaped}(?=$|[^a-z0-9_.-])`;
  const opening = input.text.normalize("NFKC").replace(/\s+/g, " ").slice(0, 6000);
  for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
    if (!entry.policyControllerScopePatterns?.length || !entry.privacyPolicyLabels.some(label => opening.includes(label))) continue;
    for (const pattern of entry.policyControllerScopePatterns) {
      const match = new RegExp(pattern.replace("{target}", target), "iu").exec(opening);
      if (!match || /不适用|不包括|不涵盖|并非|不是/.test(match[0])) continue;
      return { locale: entry.locale, ownerEntity: match.groups?.controller, reasonCode: "exact_target_in_localized_controller_scope" as const };
    }
  }
  return null;
}
