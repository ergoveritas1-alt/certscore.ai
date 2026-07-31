export type ImpliedConsentLanguageMatch = {
  classifierId: string;
  confidence: number;
  excerpt: string;
};

export type ConsentLanguageClassification = {
  impliedConsentLanguageObserved: boolean;
  matches: ImpliedConsentLanguageMatch[];
};

const IMPLIED_CONSENT_PATTERNS = [
  {
    classifierId: "implied_consent.by_using_agree",
    pattern: /\bby\s+(?:using|accessing)\s+(?:this\s+)?(?:site|website|service|page)[^.!?]{0,100}\b(?:agree|accept|consent)\b/i,
  },
  {
    classifierId: "implied_consent.continuing_to_browse",
    pattern: /\bby\s+continuing\s+to\s+(?:browse|use|access)[^.!?]{0,100}\b(?:agree|accept|consent)\b/i,
  },
  {
    classifierId: "implied_consent.continued_use_constitutes",
    pattern: /\bcontinued\s+use[^.!?]{0,80}\bconstitutes?\s+(?:your\s+)?consent\b/i,
  },
  {
    classifierId: "implied_consent.if_continue_accept",
    pattern: /\bif\s+you\s+continue[^.!?]{0,100}\b(?:accept|agree|consent)\b/i,
  },
] as const;

function boundedExcerpt(text: string, start: number, length: number) {
  const from = Math.max(0, start - 80);
  const to = Math.min(text.length, start + length + 80);
  return text.slice(from, to).replace(/\s+/g, " ").trim().slice(0, 240);
}

export function classifyConsentLanguage(input: {
  text?: string | null;
}): ConsentLanguageClassification {
  const text = input.text?.trim() ?? "";
  const matches = IMPLIED_CONSENT_PATTERNS.flatMap(({ classifierId, pattern }) => {
    const match = pattern.exec(text);
    return match
      ? [{
          classifierId,
          confidence: 0.9,
          excerpt: boundedExcerpt(text, match.index, match[0].length),
        }]
      : [];
  });
  return {
    impliedConsentLanguageObserved: matches.length > 0,
    matches,
  };
}
