export type ConsentControlIntent =
  | "accept"
  | "reject"
  | "options"
  | "privacy_opt_out"
  | "unknown";

export type ConsentControlLocale = "en" | "de" | "fr";

export type ConsentControlMatchStrength =
  | "direct"
  | "equivalent"
  | "contextual"
  | "weak";

export type ConsentControlTerm = {
  locale: ConsentControlLocale;
  phrase: string;
  intent: Exclude<ConsentControlIntent, "unknown">;
  strength: ConsentControlMatchStrength;
  variant?: string;
  requiresConsentContext?: boolean;
  requiresPreferenceContext?: boolean;
  requiresContinueConsentContext?: boolean;
};

export type ConsentControlLabelClassifierInput = {
  label?: string | null;
  ariaLabel?: string | null;
  title?: string | null;
  value?: string | null;
  contextText?: string | null;
  localeHints?: ConsentControlLocale[];
  hasConsentContext?: boolean;
  hasPreferenceContext?: boolean;
};

export type ConsentControlLabelClassification = {
  intent: ConsentControlIntent;
  confidence: number;
  matchedTerm?: string;
  matchedLocale?: ConsentControlLocale;
  matchStrength?: ConsentControlMatchStrength;
  variant?: string;
  reasonCodes: string[];
  contextSatisfied: boolean;
};

type TermInput = Omit<ConsentControlTerm, "locale">;

const CONTEXT_HINT_PATTERN =
  /\b(cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|optional|essential|necessary|cmp|onetrust|trustarc|didomi|usercentrics|cookiebot|optanon|datenschutz|cookies?|einwilligung|zustimmung|präferenzen|einstellungen|choix|confidentialit[eé]|pr[eé]f[eé]rences?|consentement|finalit[eé]s)\b/i;

const PRIVACY_OPT_OUT_HINT_PATTERN =
  /\b(do not sell|do not share|sale|share|targeted advertising|privacy rights?|legitimate interest|berechtigtem interesse|widerspruch|opposition|int[eé]r[eê]t l[eé]gitime|droit d['’]opposition)\b/i;

const CONTINUE_AS_ACCEPT_CONTEXT_PATTERN =
  /\b(?:by\s+(?:using|continuing(?:\s+to\s+use)?|accessing|remaining\s+on)\s+(?:this\s+)?(?:site|website|service|page)|(?:using|continuing(?:\s+to\s+use)?|accessing|remaining\s+on)\s+(?:this\s+)?(?:site|website|service|page)\s+(?:means|constitutes|indicates)|you\s+(?:consent|agree)\s+to\s+(?:these\s+)?cookies?)\b/i;

const en = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "en", ...term }));
const de = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "de", ...term }));
const fr = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "fr", ...term }));

export const consentControlTerms: ConsentControlTerm[] = [
  ...en([
    ...direct("accept", "accept"),
    ...direct("accept", "accept all"),
    ...direct("accept", "allow all"),
    ...direct("accept", "agree"),
    ...direct("accept", "i agree"),
    ...direct("accept", "consent"),
    ...direct("accept", "accept cookies"),
    ...direct("accept", "accept all cookies"),
    ...direct("accept", "allow cookies"),
    ...direct("accept", "agree and continue"),
    ...direct("accept", "accept and continue"),
    equivalent("accept", "allow analytics", "category_analytics"),
    equivalent("accept", "accept analytics", "category_analytics"),
    equivalent("accept", "enable analytics", "category_analytics"),
    contextual("accept", "continue", { requiresContinueConsentContext: true, variant: "continue_as_accept" }),
    weak("accept", "ok", { requiresConsentContext: true }),
    weak("accept", "got it", { requiresConsentContext: true }),

    ...direct("reject", "reject"),
    ...direct("reject", "reject all"),
    ...direct("reject", "decline"),
    ...direct("reject", "decline all"),
    ...direct("reject", "refuse"),
    ...direct("reject", "refuse all"),
    ...direct("reject", "deny"),
    ...direct("reject", "deny all"),
    ...direct("reject", "disagree"),
    ...direct("reject", "i disagree"),
    ...direct("reject", "do not agree"),
    ...direct("reject", "do not consent"),
    ...direct("reject", "do not accept"),
    equivalent("reject", "continue without accepting"),
    equivalent("reject", "continue without consent"),
    equivalent("reject", "continue without agreeing"),
    equivalent("reject", "continue without cookies"),
    equivalent("reject", "use necessary cookies only", "necessary_only"),
    equivalent("reject", "necessary cookies only", "necessary_only"),
    equivalent("reject", "essential cookies only", "necessary_only"),
    equivalent("reject", "only necessary", "necessary_only"),
    equivalent("reject", "only essential", "necessary_only"),
    equivalent("reject", "strictly necessary only", "necessary_only"),
    equivalent("reject", "accept necessary only", "necessary_only"),
    equivalent("reject", "accept essential only", "necessary_only"),
    equivalent("reject", "accept necessary", "necessary_only"),
    equivalent("reject", "accept essential", "necessary_only"),
    equivalent("reject", "save necessary only", "necessary_only"),
    ...direct("reject", "reject optional"),
    ...direct("reject", "reject optional cookies"),
    ...direct("reject", "reject non-essential cookies"),
    equivalent("reject", "reject analytics", "category_analytics"),
    equivalent("reject", "deny analytics", "category_analytics"),
    equivalent("reject", "disable analytics", "category_analytics"),
    ...direct("reject", "do not allow"),
    ...direct("reject", "do not allow all"),
    ...direct("reject", "disable all"),
    ...direct("reject", "disable optional"),
    ...direct("reject", "turn off all"),
    ...direct("reject", "turn off optional"),
    weak("reject", "no thanks", { requiresConsentContext: true }),
    weak("reject", "no, thanks", { requiresConsentContext: true }),
    weak("reject", "not now", { requiresConsentContext: true }),
    weak("reject", "skip", { requiresConsentContext: true }),

    contextual("options", "manage", { requiresConsentContext: true }),
    ...direct("options", "manage preferences"),
    ...direct("options", "manage options"),
    ...direct("options", "manage choices"),
    ...direct("options", "cookie settings"),
    ...direct("options", "privacy settings"),
    contextual("options", "preferences", { requiresConsentContext: true }),
    contextual("options", "customize", { requiresConsentContext: true }),
    ...direct("options", "customize choices"),
    ...direct("options", "more options"),
    contextual("options", "options", { requiresConsentContext: true }),
    contextual("options", "settings", { requiresConsentContext: true }),
    contextual("options", "configure", { requiresConsentContext: true }),
    contextual("options", "choose", { requiresConsentContext: true }),
    ...direct("options", "preference center"),
    ...direct("options", "privacy center"),
    ...direct("options", "privacy preference center"),
    contextual("options", "save choices", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "save my choices", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "confirm my choices", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "learn more", { requiresConsentContext: true }),
    contextual("options", "details", { requiresConsentContext: true }),

    ...direct("privacy_opt_out", "do not sell"),
    ...direct("privacy_opt_out", "do not share"),
    ...direct("privacy_opt_out", "do not sell or share"),
    ...direct("privacy_opt_out", "your privacy choices"),
    ...direct("privacy_opt_out", "privacy choices"),
    ...direct("privacy_opt_out", "review all privacy and ad settings"),
    ...direct("privacy_opt_out", "opt out"),
    ...direct("privacy_opt_out", "opt-out"),
    ...direct("privacy_opt_out", "opt-out form"),
    ...direct("privacy_opt_out", "opt out of sale"),
    ...direct("privacy_opt_out", "opt out of sharing"),
    ...direct("privacy_opt_out", "targeted advertising choices"),
    ...direct("privacy_opt_out", "limit use of sensitive personal information"),
    ...direct("privacy_opt_out", "submit data request"),
    ...direct("privacy_opt_out", "your us state privacy rights"),
    ...direct("privacy_opt_out", "us state privacy rights"),
    ...direct("privacy_opt_out", "your state privacy rights"),
    ...direct("privacy_opt_out", "state privacy rights"),
    ...direct("privacy_opt_out", "your data privacy rights"),
    ...direct("privacy_opt_out", "data privacy rights"),
    ...direct("privacy_opt_out", "object"),
    ...direct("privacy_opt_out", "object to all"),
    ...direct("privacy_opt_out", "object to legitimate interest"),
  ]),
  ...de([
    ...direct("accept", "akzeptieren"),
    ...direct("accept", "alle akzeptieren"),
    ...direct("accept", "alles akzeptieren"),
    ...direct("accept", "zustimmen"),
    ...direct("accept", "ich stimme zu"),
    ...direct("accept", "einverstanden"),
    ...direct("accept", "erlauben"),
    ...direct("accept", "alle erlauben"),
    ...direct("accept", "cookies akzeptieren"),
    ...direct("accept", "alle cookies akzeptieren"),
    ...direct("accept", "akzeptieren und fortfahren"),
    weak("accept", "ok", { requiresConsentContext: true }),
    weak("accept", "ja", { requiresConsentContext: true }),

    ...direct("reject", "ablehnen"),
    ...direct("reject", "alle ablehnen"),
    ...direct("reject", "ablehnen aller"),
    ...direct("reject", "nicht akzeptieren"),
    ...direct("reject", "nicht zustimmen"),
    ...direct("reject", "ich stimme nicht zu"),
    ...direct("reject", "keine zustimmung"),
    equivalent("reject", "ohne zustimmung fortfahren"),
    equivalent("reject", "ohne akzeptieren fortfahren"),
    equivalent("reject", "ohne cookies fortfahren"),
    equivalent("reject", "nur notwendige cookies", "necessary_only"),
    equivalent("reject", "nur erforderliche cookies", "necessary_only"),
    equivalent("reject", "nur essenzielle cookies", "necessary_only"),
    equivalent("reject", "nur essentielle cookies", "necessary_only"),
    equivalent("reject", "nur technisch notwendige cookies", "necessary_only"),
    equivalent("reject", "technisch notwendige cookies", "necessary_only"),
    equivalent("reject", "notwendige cookies verwenden", "necessary_only"),
    equivalent("reject", "erforderliche cookies verwenden", "necessary_only"),
    equivalent("reject", "nur notwendige akzeptieren", "necessary_only"),
    equivalent("reject", "nur erforderliche akzeptieren", "necessary_only"),
    equivalent("reject", "nur essenzielle akzeptieren", "necessary_only"),
    ...direct("reject", "optionale cookies ablehnen"),
    ...direct("reject", "nicht erforderliche cookies ablehnen"),
    ...direct("reject", "alle nicht notwendigen ablehnen"),
    ...direct("reject", "marketing cookies ablehnen"),
    ...direct("reject", "statistik cookies ablehnen"),
    ...direct("reject", "alle deaktivieren"),
    ...direct("reject", "optionale deaktivieren"),
    ...direct("reject", "deaktivieren"),

    contextual("options", "einstellungen", { requiresConsentContext: true }),
    ...direct("options", "cookie-einstellungen"),
    ...direct("options", "cookie einstellungen"),
    ...direct("options", "datenschutzeinstellungen"),
    ...direct("options", "privatsphäre-einstellungen"),
    contextual("options", "präferenzen", { requiresConsentContext: true }),
    ...direct("options", "einstellungen verwalten"),
    ...direct("options", "auswahl verwalten"),
    contextual("options", "optionen", { requiresConsentContext: true }),
    ...direct("options", "weitere optionen"),
    contextual("options", "anpassen", { requiresConsentContext: true }),
    contextual("options", "konfigurieren", { requiresConsentContext: true }),
    ...direct("options", "präferenzcenter"),
    ...direct("options", "datenschutzcenter"),
    contextual("options", "auswahl speichern", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "meine auswahl speichern", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "einstellungen speichern", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "auswahl bestätigen", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "meine auswahl bestätigen", { requiresPreferenceContext: true, variant: "save_preferences" }),
    contextual("options", "mehr erfahren", { requiresConsentContext: true }),
    contextual("options", "details", { requiresConsentContext: true }),

    ...direct("privacy_opt_out", "widersprechen"),
    ...direct("privacy_opt_out", "allen widersprechen"),
    ...direct("privacy_opt_out", "berechtigtem interesse widersprechen"),
    ...direct("privacy_opt_out", "widerspruch"),
    ...direct("privacy_opt_out", "opt-out"),
    ...direct("privacy_opt_out", "abmelden"),
    ...direct("privacy_opt_out", "nicht verkaufen"),
    ...direct("privacy_opt_out", "nicht weitergeben"),
    ...direct("privacy_opt_out", "datenschutzoptionen"),
  ]),
  ...fr([
    ...direct("accept", "accepter"),
    ...direct("accept", "tout accepter"),
    ...direct("accept", "accepter tout"),
    ...direct("accept", "j'accepte"),
    ...direct("accept", "j’accepte"),
    ...direct("accept", "je consens"),
    ...direct("accept", "donner mon accord"),
    ...direct("accept", "d'accord"),
    ...direct("accept", "d’accord"),
    ...direct("accept", "oui, j'accepte"),
    ...direct("accept", "oui, j’accepte"),
    ...direct("accept", "continuer avec tout"),
    ...direct("accept", "autoriser"),
    ...direct("accept", "tout autoriser"),
    ...direct("accept", "accepter les cookies"),
    ...direct("accept", "accepter tous les cookies"),
    ...direct("accept", "accepter les cookies optionnels"),
    ...direct("accept", "accepter les recommandations"),
    ...direct("accept", "accepter et continuer"),
    ...direct("accept", "enregistrer et accepter"),
    weak("accept", "ok", { requiresConsentContext: true }),
    weak("accept", "oui", { requiresConsentContext: true }),
    weak("accept", "continuer", { requiresConsentContext: true }),

    ...direct("reject", "refuser"),
    ...direct("reject", "tout refuser"),
    ...direct("reject", "refuser tout"),
    ...direct("reject", "je refuse"),
    ...direct("reject", "ne pas accepter"),
    ...direct("reject", "ne pas consentir"),
    ...direct("reject", "je ne consens pas"),
    ...direct("reject", "sans consentement"),
    equivalent("reject", "continuer sans accepter"),
    equivalent("reject", "continuer sans consentir"),
    equivalent("reject", "continuer sans cookies"),
    equivalent("reject", "continuer sans accepter les cookies"),
    equivalent("reject", "continuer sans consentement"),
    equivalent("reject", "uniquement les cookies nécessaires", "necessary_only"),
    equivalent("reject", "cookies nécessaires uniquement", "necessary_only"),
    equivalent("reject", "cookies essentiels uniquement", "necessary_only"),
    equivalent("reject", "cookies strictement nécessaires", "necessary_only"),
    equivalent("reject", "seulement les cookies nécessaires", "necessary_only"),
    equivalent("reject", "seulement les cookies essentiels", "necessary_only"),
    equivalent("reject", "accepter uniquement les nécessaires", "necessary_only"),
    equivalent("reject", "n’accepter que les cookies nécessaires", "necessary_only"),
    equivalent("reject", "n'accepter que les cookies nécessaires", "necessary_only"),
    ...direct("reject", "refuser les cookies"),
    ...direct("reject", "refuser les cookies optionnels"),
    ...direct("reject", "refuser les cookies non essentiels"),
    ...direct("reject", "désactiver tout"),
    ...direct("reject", "tout désactiver"),
    ...direct("reject", "désactiver les options"),
    ...direct("reject", "tout rejeter"),
    ...direct("reject", "rejeter tout"),
    ...direct("reject", "tout refuser et continuer"),

    contextual("options", "paramètres", { requiresConsentContext: true }),
    contextual("options", "préférences", { requiresConsentContext: true }),
    ...direct("options", "gestion des préférences"),
    ...direct("options", "gérer mes choix"),
    ...direct("options", "gérer les choix"),
    ...direct("options", "gérer le consentement"),
    ...direct("options", "gérer mes préférences"),
    ...direct("options", "gérer les préférences"),
    ...direct("options", "gérer les cookies"),
    contextual("options", "paramétrer", { requiresConsentContext: true }),
    contextual("options", "configurer", { requiresConsentContext: true }),
    contextual("options", "personnaliser", { requiresConsentContext: true }),
    ...direct("options", "personnaliser mes choix"),
    contextual("options", "choisir", { requiresConsentContext: true }),
    contextual("options", "faire un choix", { requiresConsentContext: true }),
    contextual("options", "mes choix", { requiresConsentContext: true }),
    contextual("options", "vos choix", { requiresConsentContext: true }),
    contextual("options", "options", { requiresConsentContext: true }),
    ...direct("options", "paramètres des cookies"),
    ...direct("options", "préférences cookies"),
    ...direct("options", "gestion des cookies"),
    ...direct("options", "choisir les finalités"),
    ...direct("options", "choisir les partenaires"),
    ...direct("options", "préférences de confidentialité"),
    ...direct("options", "paramètres de confidentialité"),
    ...direct("options", "paramètres de consentement"),
    ...direct("options", "centre de préférences"),
    ...direct("options", "centre de confidentialité"),
    ...direct("options", "modifier mes choix"),
    ...direct("options", "modifier mes préférences"),
    ...direct("options", "choix de confidentialité"),
    contextual("options", "plus d'options", { requiresConsentContext: true }),
    contextual("options", "plus d’options", { requiresConsentContext: true }),
    contextual("options", "plus d'informations", { requiresConsentContext: true }),
    contextual("options", "plus d’informations", { requiresConsentContext: true }),
    contextual("options", "en savoir plus", { requiresConsentContext: true }),
    contextual("options", "détails", { requiresConsentContext: true }),
    contextual("options", "voir les détails", { requiresConsentContext: true }),
    contextual("options", "enregistrer mes choix", { requiresPreferenceContext: true, variant: "save_preferences" }),

    ...direct("privacy_opt_out", "s'opposer"),
    ...direct("privacy_opt_out", "s’opposer"),
    ...direct("privacy_opt_out", "s'opposer à tout"),
    ...direct("privacy_opt_out", "s’opposer à tout"),
    ...direct("privacy_opt_out", "opposition à l'intérêt légitime"),
    ...direct("privacy_opt_out", "opposition à l’intérêt légitime"),
    ...direct("privacy_opt_out", "ne pas vendre"),
    ...direct("privacy_opt_out", "ne pas partager"),
    ...direct("privacy_opt_out", "ne pas vendre ni partager"),
    ...direct("privacy_opt_out", "mes choix de confidentialité"),
    ...direct("privacy_opt_out", "droit d’opposition"),
    ...direct("privacy_opt_out", "droit d'opposition"),
    ...direct("privacy_opt_out", "opt-out"),
  ]),
];

export function classifyConsentControlLabel(
  input: ConsentControlLabelClassifierInput,
): ConsentControlLabelClassification {
  const labelText = [
    input.label,
    input.ariaLabel,
    input.title,
    input.value,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(" ");
  const normalizedLabel = normalizeConsentControlText(labelText);
  const normalizedContext = normalizeConsentControlText(input.contextText ?? "");
  const reasonCodes: string[] = [];
  const hasConsentContext = input.hasConsentContext === true ||
    CONTEXT_HINT_PATTERN.test(input.contextText ?? "");
  const hasPreferenceContext = input.hasPreferenceContext === true ||
    hasConsentContext && /\b(preference|preferences|settings|choices?|options|purpose|purposes|präferenzen|einstellungen|auswahl|optionen|choix|param[eè]tres|pr[eé]f[eé]rences?|finalit[eé]s)\b/i.test(input.contextText ?? "");
  const hasContinueConsentContext = CONTINUE_AS_ACCEPT_CONTEXT_PATTERN.test(input.contextText ?? "");

  if (!normalizedLabel) {
    return unknown(["empty_label"]);
  }
  if (normalizedLabel.length > 220) {
    return unknown(["label_too_long"]);
  }
  if (PRIVACY_OPT_OUT_HINT_PATTERN.test(`${labelText} ${input.contextText ?? ""}`)) {
    reasonCodes.push("privacy_opt_out_context");
  }

  const localeHints = new Set(input.localeHints ?? []);
  const terms = localeHints.size > 0
    ? consentControlTerms.filter((term) => localeHints.has(term.locale))
    : consentControlTerms;
  const match = terms
    .map((term) => ({ term, score: termScore(term, normalizedLabel, hasConsentContext, hasPreferenceContext, hasContinueConsentContext) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      strengthRank(right.term.strength) - strengthRank(left.term.strength) ||
      right.term.phrase.length - left.term.phrase.length
    )[0];

  if (!match) {
    return unknown(reasonCodes.length > 0 ? reasonCodes : ["no_term_match"]);
  }

  const contextSatisfied = contextRequirementSatisfied(match.term, hasConsentContext, hasPreferenceContext, hasContinueConsentContext);
  const confidence = confidenceFor(match.term, contextSatisfied);
  return {
    intent: match.term.intent,
    confidence,
    matchedTerm: match.term.phrase,
    matchedLocale: match.term.locale,
    matchStrength: match.term.strength,
    variant: match.term.variant,
    reasonCodes: uniqueStrings([
      ...reasonCodes,
      `matched_${match.term.intent}`,
      `match_strength_${match.term.strength}`,
      match.term.variant ? `variant_${match.term.variant}` : null,
      match.term.requiresConsentContext ? "requires_consent_context" : null,
      match.term.requiresPreferenceContext ? "requires_preference_context" : null,
      match.term.requiresContinueConsentContext ? "requires_continue_consent_context" : null,
      contextSatisfied ? "context_satisfied" : "context_not_satisfied",
    ]),
    contextSatisfied,
  };
}

export function normalizeConsentControlText(value: string | null | undefined): string {
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

function direct(intent: Exclude<ConsentControlIntent, "unknown">, phrase: string): TermInput[] {
  return [{ intent, phrase, strength: "direct" }];
}

function equivalent(intent: Exclude<ConsentControlIntent, "unknown">, phrase: string, variant?: string): TermInput {
  return { intent, phrase, strength: "equivalent", variant };
}

function contextual(
  intent: Exclude<ConsentControlIntent, "unknown">,
  phrase: string,
  options: Pick<ConsentControlTerm, "requiresConsentContext" | "requiresPreferenceContext" | "requiresContinueConsentContext" | "variant"> = {},
): TermInput {
  return { intent, phrase, strength: "contextual", ...options };
}

function weak(
  intent: Exclude<ConsentControlIntent, "unknown">,
  phrase: string,
  options: Pick<ConsentControlTerm, "requiresConsentContext" | "requiresPreferenceContext"> = {},
): TermInput {
  return { intent, phrase, strength: "weak", ...options };
}

function termScore(
  term: ConsentControlTerm,
  normalizedLabel: string,
  hasConsentContext: boolean,
  hasPreferenceContext: boolean,
  hasContinueConsentContext: boolean,
) {
  const phrase = normalizeConsentControlText(term.phrase);
  if (!phrase) {
    return 0;
  }
  const exact = normalizedLabel === phrase;
  const phraseMatch = !exact && phrase.length >= 8 && paddedIncludes(normalizedLabel, phrase);
  if (term.strength === "weak" && !exact) {
    return 0;
  }
  if (!exact && !phraseMatch) {
    return 0;
  }
  const contextSatisfied = contextRequirementSatisfied(term, hasConsentContext, hasPreferenceContext, hasContinueConsentContext);
  if (!contextSatisfied && (term.intent === "options" || term.strength === "contextual")) {
    return 0;
  }
  return (exact ? 1000 : 500) + phrase.length + strengthRank(term.strength) * 100 + (contextSatisfied ? 50 : 0);
}

function paddedIncludes(normalizedLabel: string, phrase: string) {
  return ` ${normalizedLabel} `.includes(` ${phrase} `);
}

function contextRequirementSatisfied(
  term: ConsentControlTerm,
  hasConsentContext: boolean,
  hasPreferenceContext: boolean,
  hasContinueConsentContext: boolean,
) {
  return (term.requiresConsentContext !== true || hasConsentContext) &&
    (term.requiresPreferenceContext !== true || hasPreferenceContext) &&
    (term.requiresContinueConsentContext !== true || hasContinueConsentContext);
}

function confidenceFor(term: ConsentControlTerm, contextSatisfied: boolean) {
  const base =
    term.strength === "direct" ? 0.91 :
      term.strength === "equivalent" ? 0.9 :
        term.strength === "contextual" ? 0.78 :
          0.52;
  return Math.max(0.2, Math.min(0.95, contextSatisfied ? base : Math.min(base, 0.42)));
}

function strengthRank(strength: ConsentControlMatchStrength) {
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

function unknown(reasonCodes: string[]): ConsentControlLabelClassification {
  return {
    intent: "unknown",
    confidence: 0.2,
    reasonCodes: uniqueStrings(reasonCodes),
    contextSatisfied: false,
  };
}
