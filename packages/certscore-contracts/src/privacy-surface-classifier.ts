import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type PrivacySurfaceType =
  | "privacy_policy"
  | "cookie_policy"
  | "california_notice"
  | "notice_at_collection"
  | "do_not_sell_or_share"
  | "your_privacy_choices"
  | "cookie_settings"
  | "consent_preferences"
  | "terms"
  | "ai_disclosure"
  | "accessibility_statement"
  | "unknown";

export type PrivacySurfaceMatchStrength =
  | "direct"
  | "equivalent"
  | "contextual"
  | "weak";

export type PrivacySurfacePhrase = {
  locale: SupportedPrivacyEvidenceLocale;
  phrase: string;
  surfaceType: Exclude<PrivacySurfaceType, "unknown">;
  strength: PrivacySurfaceMatchStrength;
  variant?: string;
  requiresPrivacyContext?: boolean;
  requiresPolicyContext?: boolean;
};

export type PrivacySurfaceClassifierInput = {
  linkText?: string | null;
  url?: string | null;
  title?: string | null;
  surroundingText?: string | null;
  localeHints?: SupportedPrivacyEvidenceLocale[];
};

export type PrivacySurfaceClassification = {
  confidence: number;
  contextSatisfied: boolean;
  matchedLocale?: SupportedPrivacyEvidenceLocale;
  matchedTerm?: string;
  matchStrength?: PrivacySurfaceMatchStrength;
  reasonCodes: string[];
  surfaceType: PrivacySurfaceType;
  variant?: string;
};

type PhraseInput = Omit<PrivacySurfacePhrase, "locale">;

const en = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "en", ...term }));
const de = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "de", ...term }));
const fr = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "fr", ...term }));
const es = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "es", ...term }));
const it = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "it", ...term }));
const nl = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "nl", ...term }));
const pl = (terms: PhraseInput[]) => terms.map((term): PrivacySurfacePhrase => ({ locale: "pl", ...term }));

export const PRIVACY_SURFACE_PHRASE_REGISTRY: PrivacySurfacePhrase[] = [
  ...en([
    direct("privacy_policy", "privacy policy"),
    direct("privacy_policy", "privacy notice"),
    direct("privacy_policy", "privacy statement"),
    equivalent("privacy_policy", "privacy"),
    direct("cookie_policy", "cookie policy"),
    direct("cookie_policy", "cookie notice"),
    direct("cookie_policy", "cookie statement"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "cookie settings"),
    direct("cookie_settings", "cookie preferences"),
    direct("consent_preferences", "consent preferences"),
    direct("consent_preferences", "preference center"),
    direct("consent_preferences", "privacy center"),
    direct("consent_preferences", "privacy settings"),
    direct("consent_preferences", "consent settings"),
    direct("your_privacy_choices", "your privacy choices"),
    direct("your_privacy_choices", "privacy choices"),
    direct("your_privacy_choices", "ad choices"),
    equivalent("your_privacy_choices", "your choices"),
    direct("do_not_sell_or_share", "do not sell or share"),
    direct("do_not_sell_or_share", "do not sell"),
    direct("do_not_sell_or_share", "do not share"),
    direct("notice_at_collection", "notice at collection"),
    direct("california_notice", "california privacy notice"),
    direct("california_notice", "state privacy rights"),
    direct("california_notice", "state privacy policy"),
    direct("terms", "terms"),
    direct("terms", "terms of service"),
    direct("terms", "terms and conditions"),
    direct("accessibility_statement", "accessibility statement"),
    direct("ai_disclosure", "ai disclosure"),
    direct("ai_disclosure", "ai disclosures"),
    equivalent("ai_disclosure", "artificial intelligence"),
    direct("cookie_settings", "manage cookies"),
    direct("cookie_settings", "manage cookies+"),
    direct("cookie_settings", "manage preferences"),
  ]),
  ...de([
    direct("privacy_policy", "datenschutzerklärung"),
    direct("privacy_policy", "datenschutzinformation"),
    equivalent("privacy_policy", "datenschutz"),
    direct("cookie_policy", "cookie-richtlinie"),
    direct("cookie_policy", "cookie hinweis"),
    direct("cookie_policy", "cookie-erklärung"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "cookie-einstellungen"),
    direct("cookie_settings", "cookie einstellungen"),
    direct("consent_preferences", "datenschutzeinstellungen"),
    direct("consent_preferences", "präferenzcenter"),
    direct("your_privacy_choices", "datenschutzoptionen"),
    direct("terms", "nutzungsbedingungen"),
    direct("terms", "allgemeine geschäftsbedingungen"),
  ]),
  ...fr([
    direct("privacy_policy", "politique de confidentialité"),
    direct("privacy_policy", "avis de confidentialité"),
    direct("privacy_policy", "protection des données personnelles"),
    direct("privacy_policy", "protection des données"),
    policyContextualEquivalent("privacy_policy", "confidentialité"),
    direct("cookie_policy", "politique relative aux cookies"),
    direct("cookie_policy", "politique cookies"),
    direct("cookie_policy", "avis relatif aux cookies"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "paramètres des cookies"),
    direct("cookie_settings", "préférences cookies"),
    direct("consent_preferences", "préférences de consentement"),
    direct("consent_preferences", "centre de préférences"),
    direct("your_privacy_choices", "choix de confidentialité"),
    direct("terms", "conditions d'utilisation"),
    direct("terms", "conditions générales"),
  ]),
  ...es([
    direct("privacy_policy", "política de privacidad"),
    direct("privacy_policy", "aviso de privacidad"),
    equivalent("privacy_policy", "privacidad"),
    direct("cookie_policy", "política de cookies"),
    direct("cookie_policy", "aviso de cookies"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "configuración de cookies"),
    direct("cookie_settings", "preferencias de cookies"),
    direct("consent_preferences", "preferencias de consentimiento"),
    direct("your_privacy_choices", "opciones de privacidad"),
    direct("terms", "términos y condiciones"),
    direct("terms", "condiciones de uso"),
  ]),
  ...it([
    direct("privacy_policy", "informativa sulla privacy"),
    direct("privacy_policy", "politica sulla privacy"),
    equivalent("privacy_policy", "privacy"),
    direct("cookie_policy", "informativa sui cookie"),
    direct("cookie_policy", "cookie policy"),
    direct("cookie_settings", "impostazioni cookie"),
    direct("cookie_settings", "preferenze cookie"),
    direct("consent_preferences", "preferenze di consenso"),
    direct("your_privacy_choices", "scelte sulla privacy"),
    direct("terms", "termini e condizioni"),
    direct("terms", "condizioni d'uso"),
  ]),
  ...nl([
    direct("privacy_policy", "privacybeleid"),
    direct("privacy_policy", "privacyverklaring"),
    direct("privacy_policy", "privacy reglement"),
    equivalent("privacy_policy", "privacy"),
    direct("cookie_policy", "cookiebeleid"),
    direct("cookie_policy", "cookieverklaring"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "cookie-instellingen"),
    direct("cookie_settings", "cookie instellingen"),
    direct("cookie_settings", "cookievoorkeuren"),
    direct("consent_preferences", "toestemmingsvoorkeuren"),
    direct("consent_preferences", "privacy-instellingen"),
    direct("your_privacy_choices", "privacykeuzes"),
    direct("terms", "algemene voorwaarden"),
    direct("terms", "gebruiksvoorwaarden"),
  ]),
  ...pl([
    direct("privacy_policy", "polityka prywatności"),
    direct("privacy_policy", "informacja o prywatności"),
    equivalent("privacy_policy", "prywatność"),
    direct("cookie_policy", "polityka plików cookie"),
    direct("cookie_policy", "polityka cookies"),
    direct("cookie_policy", "informacja o plikach cookie"),
    equivalent("cookie_policy", "cookies"),
    direct("cookie_settings", "ustawienia plików cookie"),
    direct("cookie_settings", "preferencje plików cookie"),
    direct("consent_preferences", "preferencje zgody"),
    direct("consent_preferences", "centrum preferencji"),
    direct("your_privacy_choices", "wybory dotyczące prywatności"),
    direct("terms", "regulamin"),
    direct("terms", "warunki korzystania"),
  ]),
];

const URL_SURFACE_PATTERNS: Array<{
  surfaceType: Exclude<PrivacySurfaceType, "unknown">;
  pattern: RegExp;
  variant?: string;
}> = [
  { surfaceType: "cookie_policy", pattern: /privacy[-_/]cookie[-_/]statement|privacy[-_/]and[-_/]cookies?|privacy[-_/]cookies?/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_-])privacy(?:[-_/]policy|[-_/]notice|[-_/]statement)?(?:$|[/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_-])privacy[-_/]statement(?:$|[/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])datenschutz(?:erkl[aä]rung|information)?(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:politique[-_\s/](?:de[-_\s/])?confidentialit[eé]|protection[-_\s/](?:des[-_\s/])?donn[eé]es(?:[-_\s/]personnelles)?)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:pol[ií]tica[-_\s/](?:de[-_\s/])?privacidad|protecci[oó]n[-_\s/](?:de[-_\s/])?datos|privacidad)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:informativa[-_\s/](?:sulla[-_\s/])?privacy|trattamento[-_\s/](?:dei[-_\s/])?dati|privacy)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:privacybeleid|privacyverklaring|privacy[-_\s/]reglement)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:polityka[-_\s/]prywatno(?:sci|ści)|prywatno(?:sc|ść))(?:$|[\s/?#._-])/i },
  { surfaceType: "cookie_policy", pattern: /(?:^|[/_-])cookies?(?:[-_/]policy|[-_/]notice|[-_/]statement)?(?:$|[/?#._-])/i },
  { surfaceType: "cookie_policy", pattern: /(?:^|[/_\s-])(?:cookie[-_\s/]richtlinie|politique[-_\s/](?:relative[-_\s/]aux[-_\s/])?cookies|pol[ií]tica[-_\s/](?:de[-_\s/])?cookies|informativa[-_\s/](?:sui[-_\s/])?cookie|cookiebeleid|polityka[-_\s/]plik[oó]w[-_\s/]cookie)(?:$|[\s/?#._-])/i },
  { surfaceType: "cookie_settings", pattern: /(?:^|[/_-])cookie[-_/](?:settings|preferences)(?:$|[/?#._-])/i },
  { surfaceType: "your_privacy_choices", pattern: /(?:your[-_/])?privacy[-_/]choices|yourprivacychoices|adchoices/i },
  { surfaceType: "do_not_sell_or_share", pattern: /do[-_/]not[-_/](?:sell|share)/i },
  { surfaceType: "notice_at_collection", pattern: /notice[-_/]at[-_/]collection/i },
  { surfaceType: "california_notice", pattern: /california[-_/]privacy|state[-_/]privacy/i },
  { surfaceType: "terms", pattern: /(?:^|[/_-])terms(?:[-_/](?:of[-_/]service|and[-_/]conditions|conditions|use))?(?:$|[/?#._-])/i },
  { surfaceType: "accessibility_statement", pattern: /accessibility(?:[-_/]statement)?|accesibilidad/i },
  { surfaceType: "ai_disclosure", pattern: /(?:^|[/_-])ai[-_/](?:disclosure|notice|policy)(?:$|[/?#._-])/i },
];

const PRIVACY_CONTEXT_PATTERN =
  /\b(privacy|cookie|cookies|consent|preferences?|settings|choices?|datenschutz|cookie|cookies|einwilligung|confidentialit[eé]|cookies?|consentement|privacidad|cookies?|consenso|privacy|cookie|cookies|toestemming|privacybeleid|cookiebeleid|prywatno[śs][ćc]|zgod[ay]|plik[oó]w cookie)\b/i;
const POLICY_CONTEXT_PATTERN =
  /\b(policy|notice|statement|legal|privacy|cookies?|data protection|personal data|datenschutz|datenschutzerkl[aä]rung|politique|mentions l[eé]gales|donn[eé]es personnelles|protection des donn[eé]es|vie priv[eé]e|pol[ií]tica|aviso legal|protecci[oó]n de datos|informativa|termini|privacybeleid|privacyverklaring|avg|polityka|regulamin|dane osobowe)\b/i;

export function classifyPrivacySurface(
  input: PrivacySurfaceClassifierInput,
): PrivacySurfaceClassification {
  const normalizedLinkText = normalizePrivacySurfaceText(input.linkText);
  const normalizedTitle = normalizePrivacySurfaceText(input.title);
  const normalizedSurrounding = normalizePrivacySurfaceText(input.surroundingText);
  const normalizedUrl = normalizePrivacySurfaceUrl(input.url);
  const labelText = uniqueStrings([normalizedLinkText, normalizedTitle].filter(Boolean)).join(" ");
  const haystack = uniqueStrings([labelText, normalizedSurrounding, normalizedUrl].filter(Boolean)).join(" ");
  const contextSatisfied = PRIVACY_CONTEXT_PATTERN.test(haystack);
  const policyContextSatisfied = POLICY_CONTEXT_PATTERN.test(uniqueStrings([
    normalizedSurrounding,
    normalizedUrl,
  ]).join(" "));

  if (!haystack) {
    return unknown(["empty_surface_evidence"]);
  }

  const localeHints = new Set(input.localeHints ?? []);
  const phrases = localeHints.size > 0
    ? PRIVACY_SURFACE_PHRASE_REGISTRY.filter((term) => localeHints.has(term.locale))
    : PRIVACY_SURFACE_PHRASE_REGISTRY;
  const phraseMatch = phrases
    .map((term) => ({
      term,
      score: phraseScore(term, labelText, contextSatisfied, policyContextSatisfied),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      strengthRank(right.term.strength) - strengthRank(left.term.strength) ||
      right.term.phrase.length - left.term.phrase.length
    )[0];

  const urlMatch = URL_SURFACE_PATTERNS
    .map((entry) => ({
      ...entry,
      score: entry.pattern.test(normalizedUrl) ? 540 : 0,
    }))
    .filter((entry) => entry.score > 0)[0];

  if (!phraseMatch && !urlMatch) {
    return unknown(["no_surface_match"]);
  }

  if (phraseMatch && (!urlMatch || phraseMatch.score >= urlMatch.score)) {
    return {
      confidence: confidenceFor(phraseMatch.term, contextSatisfied),
      contextSatisfied,
      matchedLocale: phraseMatch.term.locale,
      matchedTerm: phraseMatch.term.phrase,
      matchStrength: phraseMatch.term.strength,
      reasonCodes: uniqueStrings([
        `matched_${phraseMatch.term.surfaceType}`,
        `match_strength_${phraseMatch.term.strength}`,
        phraseMatch.term.variant ? `variant_${phraseMatch.term.variant}` : null,
        contextSatisfied ? "context_satisfied" : "context_not_satisfied",
        phraseMatch.term.requiresPolicyContext
          ? policyContextSatisfied ? "policy_context_satisfied" : "policy_context_not_satisfied"
          : null,
      ]),
      surfaceType: phraseMatch.term.surfaceType,
      variant: phraseMatch.term.variant,
    };
  }

  if (!urlMatch) {
    return unknown(["no_surface_match"]);
  }

  return {
    confidence: 0.74,
    contextSatisfied,
    matchStrength: "contextual",
    reasonCodes: uniqueStrings([
      `matched_${urlMatch.surfaceType}`,
      "matched_url_pattern",
      urlMatch.variant ? `variant_${urlMatch.variant}` : null,
      contextSatisfied ? "context_satisfied" : "context_not_satisfied",
    ]),
    surfaceType: urlMatch.surfaceType,
    variant: urlMatch.variant,
  };
}

export function normalizePrivacySurfaceText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/[.,;:!?()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePrivacySurfaceUrl(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const decoded = decodeURIComponent(`${parsed.pathname} ${parsed.hash}`).toLowerCase();
    return `${decoded} ${decoded.replace(/[-_/]+/g, " ")}`;
  } catch {
    return `${value.toLowerCase()} ${normalizePrivacySurfaceText(value.replace(/[-_/]+/g, " "))}`;
  }
}

function direct(surfaceType: Exclude<PrivacySurfaceType, "unknown">, phrase: string): PhraseInput {
  return { phrase, strength: "direct", surfaceType };
}

function equivalent(surfaceType: Exclude<PrivacySurfaceType, "unknown">, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "equivalent", surfaceType, variant };
}

function policyContextualEquivalent(surfaceType: Exclude<PrivacySurfaceType, "unknown">, phrase: string, variant?: string): PhraseInput {
  return { phrase, requiresPolicyContext: true, strength: "equivalent", surfaceType, variant };
}

function phraseScore(
  term: PrivacySurfacePhrase,
  normalizedLabel: string,
  contextSatisfied: boolean,
  policyContextSatisfied: boolean,
) {
  const phrase = normalizePrivacySurfaceText(term.phrase);
  if (!phrase) {
    return 0;
  }
  const exact = normalizedLabel === phrase;
  const labelMatch = !exact && phrase.length >= 5 && paddedIncludes(normalizedLabel, phrase);
  if (!exact && !labelMatch) {
    return 0;
  }
  if (term.requiresPrivacyContext && !contextSatisfied) {
    return 0;
  }
  if (term.requiresPolicyContext && !policyContextSatisfied) {
    return 0;
  }
  return (exact ? 1000 : 650) +
    phrase.length +
    strengthRank(term.strength) * 80 +
    (contextSatisfied ? 40 : 0);
}

function paddedIncludes(normalizedValue: string, phrase: string) {
  return ` ${normalizedValue} `.includes(` ${phrase} `);
}

function confidenceFor(term: PrivacySurfacePhrase, contextSatisfied: boolean) {
  const base =
    term.strength === "direct" ? 0.9 :
      term.strength === "equivalent" ? 0.82 :
        term.strength === "contextual" ? 0.74 :
          0.55;
  return Math.max(0.2, Math.min(0.95, contextSatisfied ? base : Math.min(base, 0.72)));
}

function strengthRank(strength: PrivacySurfaceMatchStrength) {
  switch (strength) {
    case "direct":
      return 4;
    case "equivalent":
      return 3;
    case "contextual":
      return 2;
    case "weak":
      return 1;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function unknown(reasonCodes: string[]): PrivacySurfaceClassification {
  return {
    confidence: 0.2,
    contextSatisfied: false,
    reasonCodes: uniqueStrings(reasonCodes),
    surfaceType: "unknown",
  };
}
