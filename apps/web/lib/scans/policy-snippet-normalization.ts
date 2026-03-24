function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

const POLICY_SNIPPET_ANCHOR_PHRASES = [
  "On certain pages",
  "We collect and receive",
  "The right to",
  "These Terms of Use",
  "Dispute Resolution; Arbitration Agreement",
  "including the right to opt out"
] as const;

export function normalizePolicySnippet(snippet: string) {
  const collapsed = snippet.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }

  const anchored = POLICY_SNIPPET_ANCHOR_PHRASES.reduce((current, phrase) => {
    const index = current.indexOf(phrase);
    return index > 0 ? current.slice(index).trim() : current;
  }, collapsed);

  const firstToken = anchored.match(/^\S+/)?.[0] ?? "";
  const shouldTrimLeadingFragment =
    /^[a-z]/.test(anchored) &&
    (
      firstToken.length <= 2 ||
      /[-,;:]/.test(firstToken)
    );

  if (shouldTrimLeadingFragment) {
    const trimmed = anchored.slice(firstToken.length).trim();
    if (trimmed.length > 0) {
      return trimmed.replace(/^(on|and|or|of|to)\s+(?=where\b)/i, "");
    }
  }

  return anchored;
}

export function normalizePolicySnippetList(snippets: string[]) {
  return uniqueStrings(
    snippets
      .map((snippet) => normalizePolicySnippet(snippet))
      .filter((snippet): snippet is string => Boolean(snippet))
  );
}

export function normalizePolicyEvidenceSnippetsRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, normalizePolicySnippet(value) ?? value];
      }

      if (Array.isArray(value)) {
        const normalizedStrings = normalizePolicySnippetList(value.filter((entry): entry is string => typeof entry === "string"));
        if (normalizedStrings.length > 0 && normalizedStrings.length === value.filter((entry): entry is string => typeof entry === "string").length) {
          return [key, normalizedStrings];
        }
      }

      return [key, value];
    })
  );
}
