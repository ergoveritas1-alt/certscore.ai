export const CONSENT_CONTROL_CANARY_VARIANTS = [
  "basic",
  "delayed",
  "shadow-dom",
  "localized-de",
  "partial",
] as const;

export type ConsentControlCanaryVariant = (typeof CONSENT_CONTROL_CANARY_VARIANTS)[number];

export type ConsentControlCanaryExpectation = {
  accept: boolean;
  locale: string;
  options: boolean;
  reject: boolean;
  renderMode: "direct" | "delayed" | "shadow_dom";
};

export const CONSENT_CONTROL_CANARY_EXPECTATIONS: Record<ConsentControlCanaryVariant, ConsentControlCanaryExpectation> = {
  basic: { accept: true, locale: "en", options: true, reject: true, renderMode: "direct" },
  delayed: { accept: true, locale: "en", options: true, reject: true, renderMode: "delayed" },
  "shadow-dom": { accept: true, locale: "en", options: true, reject: true, renderMode: "shadow_dom" },
  "localized-de": { accept: true, locale: "de", options: true, reject: true, renderMode: "direct" },
  partial: { accept: true, locale: "en", options: true, reject: false, renderMode: "direct" },
};

export function isConsentControlCanaryVariant(value: string): value is ConsentControlCanaryVariant {
  return (CONSENT_CONTROL_CANARY_VARIANTS as readonly string[]).includes(value);
}

export const CONSENT_CONTROL_CANARY_LABELS = {
  en: {
    accept: "Accept all",
    context: "We use cookies and similar technologies. Choose how optional cookies may be used.",
    options: "Cookie settings",
    reject: "Reject all",
    title: "Cookies and privacy choices",
  },
  de: {
    accept: "Akzeptieren",
    context: "Wir verwenden Cookies und ähnliche Technologien. Wählen Sie Ihre Einstellungen.",
    options: "Einstellungen",
    reject: "Ablehnen",
    title: "Cookie- und Datenschutzeinstellungen",
  },
} as const;
