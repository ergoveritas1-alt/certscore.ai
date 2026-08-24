import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type ConsentPreferenceCategory = "necessary" | "optional";

export type ConsentPreferenceCategoryTerm = {
  locale: SupportedPrivacyEvidenceLocale;
  category: ConsentPreferenceCategory;
  phrase: string;
};

const terms = (
  locale: SupportedPrivacyEvidenceLocale,
  category: ConsentPreferenceCategory,
  phrases: string[],
): ConsentPreferenceCategoryTerm[] => phrases.map((phrase) => ({ locale, category, phrase }));

/**
 * Canonical category-label vocabulary for retained preference-toggle state.
 * This registry classifies the category shown by the CMP; it does not decide
 * legal necessity or create a finding.
 */
export const CONSENT_PREFERENCE_CATEGORY_REGISTRY: ConsentPreferenceCategoryTerm[] = [
  ...terms("en", "necessary", ["necessary", "strictly necessary", "essential", "required", "always active", "always on"]),
  ...terms("en", "optional", ["optional", "analytics", "statistics", "performance", "functional", "marketing", "advertising", "personalisation", "personalization", "external media", "social media"]),
  ...terms("de", "necessary", ["notwendig", "notwendige", "essenziell", "essentiell", "technisch notwendig", "immer aktiv"]),
  ...terms("de", "optional", ["optional", "statistik", "analyse", "analytik", "performance", "funktional", "präferenzen", "marketing", "werbung", "personalisierung", "externe medien", "soziale medien"]),
  ...terms("fr", "necessary", ["nécessaire", "strictement nécessaire", "essentiel", "toujours actif"]),
  ...terms("fr", "optional", ["facultatif", "statistiques", "analyse", "fonctionnel", "marketing", "publicité", "personnalisation", "médias externes"]),
  ...terms("es", "necessary", ["necesarias", "estrictamente necesarias", "esenciales", "siempre activas"]),
  ...terms("es", "optional", ["opcionales", "estadísticas", "analítica", "funcionales", "marketing", "publicidad", "personalización", "medios externos"]),
  ...terms("it", "necessary", ["necessari", "strettamente necessari", "essenziali", "sempre attivi"]),
  ...terms("it", "optional", ["facoltativi", "statistiche", "analitici", "funzionali", "marketing", "pubblicità", "personalizzazione", "media esterni"]),
  ...terms("nl", "necessary", ["noodzakelijk", "strikt noodzakelijk", "essentieel", "altijd actief"]),
  ...terms("nl", "optional", ["optioneel", "statistieken", "analyse", "functioneel", "marketing", "advertenties", "personalisatie", "externe media"]),
  ...terms("pl", "necessary", ["niezbędne", "ściśle niezbędne", "konieczne", "zawsze aktywne"]),
  ...terms("pl", "optional", ["opcjonalne", "statystyka", "analityka", "funkcjonalne", "marketing", "reklamy", "personalizacja", "media zewnętrzne"]),
];

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function classifyConsentPreferenceCategoryLabel(label: string): ConsentPreferenceCategory | "unknown" {
  const normalized = normalize(label);
  if (!normalized) return "unknown";
  const matched = CONSENT_PREFERENCE_CATEGORY_REGISTRY.filter((term) =>
    normalized === normalize(term.phrase) || normalized.includes(normalize(term.phrase))
  );
  if (matched.some((term) => term.category === "optional")) return "optional";
  if (matched.some((term) => term.category === "necessary")) return "necessary";
  return "unknown";
}
