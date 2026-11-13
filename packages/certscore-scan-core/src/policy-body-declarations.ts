/** Bounded notice-identity evidence. This does not classify legal adequacy,
 * disclose individual Article 13 topics, or authorize omission findings. */
export function retainedPolicyBodyDeclarations(text: string, owner?: string) {
  const bounded = text.slice(0, 2500);
  const excluded = /<(?:script|style|html)\b/i.test(bounded) ||
    /\b(?:example|sample|template)\s+(?:privacy[- ]policy|privacy\s+notice)|\bprivacy[- ]policy\s+(?:example|sample|template)|\bnot\s+(?:descriptions?\s+of\s+)?our\s+(?:data|privacy)\s+practices|\bstatements?\s+are\s+examples?\s+for\s+other\s+(?:web)?sites\b/i.test(bounded);
  if (excluded) return { eligible: false, declarations: 0, explicitNonCollection: false };
  const normalizeSubject = (value: string) => value.normalize("NFKC").replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
  const normalizedOwner = owner ? normalizeSubject(owner) : "";
  const namedSubject = normalizedOwner.length >= 4 && normalizedOwner.length <= 160
    ? new RegExp("\\b" + normalizedOwner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(?:(?:will|never|also|may|not|do)\\s+){0,3}(?:collect|process|use|uses|store|retain|share|send|disclose|transfer)\\b", "i") : null;
  const evidence = new Set<string>();
  const statements = new Set<string>();
  let explicitNonCollection = false;
  const data = [
    ['account', /\b(?:accounts?|registration|profiles?)\b/i],
    ['email', /\be-?mail(?:\s+address)?\b/i],
    ['credentials', /\bpasswords?|credentials?\b/i],
    ['cookies', /\bcookies?\b/i],
    ['device', /\b(?:devices?|sessions?|ip addresses?)\b/i],
    ['content', /\b(?:prompts?|files?|code|content|command output)\b/i],
    ['personal_data', /\b(?:personal (?:data|information)|your (?:data|information))\b/i],
    ['logs', /\blog(?:\s+files?|s)\b/i],
  ] as const;
  const operations = [
    ['collection', /\b(?:collect|receive|request|requires?|gives?)\b/i],
    ['processing', /\b(?:process(?:ed)?|us(?:e|ed)|complete)\b/i],
    ['storage', /\b(?:stor(?:e|ed)|retain|keep|kept)\b/i],
    ['sharing', /\b(?:share|sen[dt]|disclos(?:e|ed)|transfer(?:red)?)\b/i],
    ['security', /\b(?:encrypt(?:ed)?|hash|secure|salt)\b/i],
    ['deletion', /\b(?:delete|revoke|remove)\b/i],
  ] as const;
  // Same-clause subject and data/operation binding avoids credit from a page's
  // navigation labels or disconnected glossary vocabulary. Each pair counts once.
  for (const clause of bounded.split(/[.!?\n]+/).slice(0, 32)) {
    if (clause.length > 600) continue;
    const ownDeclaration = /\bwe\s+(?:(?:do\s+not|never|also|may|will|only|do|not)\s+){0,3}(?:collect|receive|request|process|use|store|retain|keep|share|send|disclose|transfer|encrypt|hash|salt|delete|remove)\b/i.test(clause);
    const accountDeclaration = /\b(?:your|registration|account)\b/i.test(clause) &&
      /\b(?:our\s+(?:database|service|site)|(?:is|are)\s+(?:used|stored|processed)|requires?\s+an?\s+e-?mail)\b/i.test(clause);
    if (!ownDeclaration && !accountDeclaration && !namedSubject?.test(normalizeSubject(clause))) continue;
    if (/\bwe\s+do\s+not\s+(?:collect|process)\s+(?:any\s+)?(?:personal\s+(?:data|information)|cookies)\b/i.test(clause)) explicitNonCollection = true;
    let concrete = false;
    for (const [kind, pattern] of data) if (pattern.test(clause)) {
      for (const [operation, verb] of operations) if (verb.test(clause)) { evidence.add(`${kind}:${operation}`); concrete = true; }
    }
    if (concrete) statements.add(clause.trim().replace(/\s+/g, " ").toLowerCase());
  }
  return { eligible: evidence.size >= 2 && statements.size >= 2, declarations: evidence.size, explicitNonCollection };
}
