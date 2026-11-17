import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "@certscore/contracts";

const noticeTitles = new Set(PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap(entry =>
  [...entry.privacyPolicyLabels, ...entry.cookiePolicyLabels].map(label => label.normalize("NFKC").toLowerCase())));

/** Capture-time document-role exclusion. A positive match identifies explicit
 * editorial/product context; no match does not establish a governing policy.
 * Never run this over historical observations during report projection. */
export type NonGoverningPolicyReason =
  | "policy_document_purpose.v1-product"
  | "policy_document_purpose.v1-article";

export function nonGoverningPolicyDocumentReason(input: {
  title?: string;
  text: string;
}): NonGoverningPolicyReason | undefined {
  const title = (input.title ?? "").slice(0, 512).normalize("NFKC").trim();
  const lead = input.text.slice(0, 6000).normalize("NFKC");
  // Use the document's own title, not navigation labels or a parent URL path.
  // "Privacy Policy | Policy Generator" is a notice of a product, not the product.
  const identity = title.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim() ?? "";
  const productIdentity = /^(?:privacy|cookie)\s+policy\s+(?:generator|templates?)\b/i.test(identity) ||
    /^(?:website\s+)?(?:gdpr|data protection|privacy|cookie consent)\s+(?:website\s+)?(?:check(?:er)?|scanner|audit|tool)\b/i.test(identity);
  if (productIdentity && /\b(?:privacy|cookie)\s+(?:policy|notice|statement)$/i.test(identity)) return undefined;
  const productOffer = /\b(?:get|book|request)\s+(?:a\s+)?demo\b|\b(?:start|try)\s+(?:a\s+)?(?:\d+\s*day\s+)?free trial\b|\b(?:create|generate|manage)\s+(?:your\s+|and\s+manage\s+)?privacy policies\b|\b(?:scans?|checks?)\s+(?:your\s+)?websites?\b/i.test(lead);
  if (productIdentity && productOffer) return "policy_document_purpose.v1-product";

  // A policy can include guidance and a publication date. Require corroborated
  // article identity, and keep a clearly titled notice eligible even when its
  // footer advertises educational resources.
  const noticeTitle = noticeTitles.has(identity.toLowerCase()) || /^(?:our\s+|website\s+|customer\s+)?(?:privacy|cookie)\s+(?:policy|notice|statement)$/i.test(identity) ||
    /^(?:terms\s*(?:&|and)\s*privacy|privacy\s*(?:&|and)\s*terms)$/i.test(identity);
  if (noticeTitle) return undefined;
  const instructionalLead = /\b(?:we (?:show|explain|teach) (?:you )?how to|in this (?:article|guide|tutorial)|this (?:article|guide|tutorial) (?:explains|shows|covers)|learn how to)\b/i.test(lead);
  const articleTitle = /^(?:how to|a guide to|guide to|understanding)\b|\b(?:guide|tutorial|explained)\b|\bprivacy[- ]compliant\s+tracking\b/i.test(identity);
  const publicationMetadata = /\b(?:published|written)\s+by\b[^.!?\n]{0,180}\b\d{1,3}\s*min(?:ute)?s?\s+read\b/i.test(lead);
  if (instructionalLead && (articleTitle || publicationMetadata)) return "policy_document_purpose.v1-article";
  return undefined;
}
