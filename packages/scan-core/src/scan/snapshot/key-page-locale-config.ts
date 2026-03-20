import type { PageType } from "@website-signal-risk-scanner/shared";

export type SupportedKeyPageLocale = "de" | "en" | "es" | "fr" | "it" | "nl" | "pt" | "ru";
export type KeyPageType = Extract<PageType, "privacy_policy" | "terms_of_service" | "cookie_policy" | "accessibility_statement" | "contact">;

type LocaleDictionary = Record<KeyPageType | "legal_hub", string[]>;

const DEFAULT_LOCALE_ORDER: SupportedKeyPageLocale[] = ["en", "fr", "de", "es", "it", "nl", "pt", "ru"];

const LOCALE_SEGMENT_HINTS: Record<SupportedKeyPageLocale, string[]> = {
  en: ["en", "en-us", "en-gb"],
  fr: ["fr", "fr-fr", "france"],
  de: ["de", "de-de", "deutsch", "deutschland"],
  es: ["es", "es-es", "espanol", "espana"],
  it: ["it", "it-it", "italia"],
  nl: ["nl", "nl-nl", "nederlands"],
  pt: ["pt", "pt-br", "pt-pt", "br", "portugues", "brasil"]
  ,
  ru: ["ru", "ru-ru", "russia", "russian", "rus"]
};

const KEY_PAGE_KEYWORDS_BY_LOCALE: Record<SupportedKeyPageLocale, LocaleDictionary> = {
  en: {
    privacy_policy: ["privacy", "privacy policy", "data protection", "privacy notice"],
    terms_of_service: ["terms", "terms of service", "terms of use", "terms and conditions", "conditions of use"],
    cookie_policy: ["cookie", "cookie policy", "cookies"],
    accessibility_statement: ["accessibility", "accessibility statement", "accessibility declaration"],
    contact: ["contact", "contact us", "contact information"],
    legal_hub: ["legal", "legal notices", "legal information", "policies", "policy center", "privacy center"]
  },
  fr: {
    privacy_policy: ["confidentialite", "politique de confidentialite", "vie privee", "donnees personnelles", "protection des donnees"],
    terms_of_service: ["mentions legales", "conditions generales", "conditions d utilisation", "conditions generales d utilisation", "cgu", "cgv"],
    cookie_policy: ["cookies", "politique de cookies", "gestion des cookies"],
    accessibility_statement: ["accessibilite", "declaration d accessibilite"],
    contact: ["contact", "nous contacter"],
    legal_hub: ["mentions legales", "informations legales", "juridique", "politiques", "centre de confidentialite"]
  },
  de: {
    privacy_policy: ["datenschutz", "datenschutzerklarung", "datenschutzerklaerung", "datenschutzrichtlinie"],
    terms_of_service: ["agb", "nutzungsbedingungen", "allgemeine geschaftsbedingungen", "allgemeine geschaeftsbedingungen", "rechtliche hinweise"],
    cookie_policy: ["cookies", "cookie richtlinie", "cookie hinweise"],
    accessibility_statement: ["barrierefreiheit", "erklarung zur barrierefreiheit", "erklaerung zur barrierefreiheit"],
    contact: ["kontakt", "kontaktieren sie uns"],
    legal_hub: ["impressum", "rechtliches", "rechtliche hinweise", "richtlinien"]
  },
  es: {
    privacy_policy: ["privacidad", "politica de privacidad", "proteccion de datos"],
    terms_of_service: ["terminos", "condiciones", "terminos y condiciones", "aviso legal"],
    cookie_policy: ["cookies", "politica de cookies"],
    accessibility_statement: ["accesibilidad", "declaracion de accesibilidad"],
    contact: ["contacto", "contactanos", "contacte con nosotros"],
    legal_hub: ["legal", "aviso legal", "politicas", "centro de privacidad"]
  },
  it: {
    privacy_policy: ["privacy", "informativa sulla privacy", "privacy policy", "protezione dei dati"],
    terms_of_service: ["termini", "condizioni", "termini di servizio", "termini e condizioni", "note legali"],
    cookie_policy: ["cookie", "cookie policy", "informativa sui cookie"],
    accessibility_statement: ["accessibilita", "dichiarazione di accessibilita"],
    contact: ["contatti", "contattaci", "contatto"],
    legal_hub: ["legale", "note legali", "politiche", "centro privacy"]
  },
  nl: {
    privacy_policy: ["privacy", "privacybeleid", "gegevensbescherming"],
    terms_of_service: ["voorwaarden", "algemene voorwaarden", "gebruiksvoorwaarden", "juridische kennisgeving"],
    cookie_policy: ["cookie", "cookiebeleid", "cookies"],
    accessibility_statement: ["toegankelijkheid", "toegankelijkheidsverklaring"],
    contact: ["contact", "neem contact op"],
    legal_hub: ["juridisch", "juridische informatie", "beleid", "privacycentrum"]
  },
  pt: {
    privacy_policy: ["privacidade", "politica de privacidade", "protecao de dados", "protecao de dados pessoais"],
    terms_of_service: ["termos", "condicoes", "termos de uso", "termos e condicoes", "aviso legal"],
    cookie_policy: ["cookies", "politica de cookies"],
    accessibility_statement: ["acessibilidade", "declaracao de acessibilidade"],
    contact: ["contato", "contacto", "fale conosco", "fale connosco"],
    legal_hub: ["legal", "aviso legal", "politicas", "centro de privacidade"]
  },
  ru: {
    privacy_policy: [
      "конфиденциальность",
      "политика конфиденциальности",
      "защита данных",
      "privacy policy",
      "privacypolicy"
    ],
    terms_of_service: [
      "правила",
      "правила сервиса",
      "условия использования",
      "пользовательское соглашение",
      "pravila"
    ],
    cookie_policy: ["cookies", "cookie policy", "куки", "политика cookies"],
    accessibility_statement: ["доступность", "заявление о доступности", "accessibility"],
    contact: ["контакты", "обратная связь", "связаться с нами", "kontakty", "contact"],
    legal_hub: ["правовая информация", "документы", "юридическая информация", "правила", "legal"]
  }
};

const KEY_PAGE_PATH_GUESSES_BY_LOCALE: Record<SupportedKeyPageLocale, Record<KeyPageType, string[]>> = {
  en: {
    privacy_policy: ["/privacy", "/privacy-policy", "/legal/privacy", "/legal/privacy-policy", "/privacy-notice"],
    terms_of_service: ["/terms", "/terms-of-service", "/terms-of-use", "/terms-and-conditions", "/legal/terms"],
    cookie_policy: ["/cookies", "/cookie-policy", "/legal/cookies"],
    accessibility_statement: ["/accessibility", "/accessibility-statement"],
    contact: ["/contact", "/contact-us"]
  },
  fr: {
    privacy_policy: ["/politique-de-confidentialite", "/confidentialite", "/vie-privee"],
    terms_of_service: ["/mentions-legales", "/conditions-generales", "/conditions-generales-d-utilisation", "/cgu", "/cgv"],
    cookie_policy: ["/politique-de-cookies", "/cookies", "/gestion-des-cookies"],
    accessibility_statement: ["/accessibilite", "/declaration-accessibilite"],
    contact: ["/contact", "/nous-contacter"]
  },
  de: {
    privacy_policy: ["/datenschutz", "/datenschutzerklaerung", "/datenschutzerklaerung"],
    terms_of_service: ["/agb", "/nutzungsbedingungen", "/rechtliche-hinweise"],
    cookie_policy: ["/cookies", "/cookie-richtlinie"],
    accessibility_statement: ["/barrierefreiheit", "/erklaerung-zur-barrierefreiheit"],
    contact: ["/kontakt"]
  },
  es: {
    privacy_policy: ["/politica-de-privacidad", "/privacidad", "/proteccion-de-datos"],
    terms_of_service: ["/terminos-y-condiciones", "/terminos-de-uso", "/aviso-legal"],
    cookie_policy: ["/politica-de-cookies", "/cookies"],
    accessibility_statement: ["/accesibilidad", "/declaracion-de-accesibilidad"],
    contact: ["/contacto"]
  },
  it: {
    privacy_policy: ["/informativa-privacy", "/privacy", "/privacy-policy"],
    terms_of_service: ["/termini-e-condizioni", "/termini-di-servizio", "/note-legali"],
    cookie_policy: ["/cookie-policy", "/cookies", "/informativa-cookie"],
    accessibility_statement: ["/accessibilita", "/dichiarazione-di-accessibilita"],
    contact: ["/contatti", "/contatto"]
  },
  nl: {
    privacy_policy: ["/privacybeleid", "/privacy"],
    terms_of_service: ["/algemene-voorwaarden", "/gebruiksvoorwaarden", "/juridische-kennisgeving"],
    cookie_policy: ["/cookiebeleid", "/cookies"],
    accessibility_statement: ["/toegankelijkheid", "/toegankelijkheidsverklaring"],
    contact: ["/contact"]
  },
  pt: {
    privacy_policy: ["/politica-de-privacidade", "/privacidade", "/protecao-de-dados"],
    terms_of_service: ["/termos-e-condicoes", "/termos-de-uso", "/aviso-legal"],
    cookie_policy: ["/politica-de-cookies", "/cookies"],
    accessibility_statement: ["/acessibilidade", "/declaracao-de-acessibilidade"],
    contact: ["/contato", "/contacto"]
  },
  ru: {
    privacy_policy: ["/privacy-policy", "/privacypolicy", "/politika-konfidentsialnosti", "/конфиденциальность"],
    terms_of_service: ["/pravila", "/terms", "/usloviya-ispolzovaniya", "/правила"],
    cookie_policy: ["/cookies", "/cookie-policy", "/куки"],
    accessibility_statement: ["/accessibility", "/zayavlenie-o-dostupnosti", "/доступность"],
    contact: ["/contact", "/kontakty", "/контакты"]
  }
};

function uniq<T>(values: T[]) {
  return [...new Set(values)];
}

function resolveSupportedLocales(localeHints: string[]): SupportedKeyPageLocale[] {
  return uniq([
    ...localeHints.filter((locale): locale is SupportedKeyPageLocale => DEFAULT_LOCALE_ORDER.includes(locale as SupportedKeyPageLocale)),
    "en"
  ]);
}

export function normalizeLegalMatchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[%_]+/g, " ")
    .replace(/[^\p{L}\p{N}/.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocaleFromHtmlLanguage(language: string | null | undefined) {
  if (!language) {
    return null;
  }

  const normalized = language.toLowerCase();
  const match = DEFAULT_LOCALE_ORDER.find((locale) => normalized === locale || normalized.startsWith(`${locale}-`));
  return match ?? null;
}

export function inferLocaleHints(input: {
  homepageLanguage?: string | null;
  homepageUrl: string;
  links?: Array<{ href: string; text?: string | null }>;
}) {
  const hints = new Set<SupportedKeyPageLocale>();
  const htmlLocale = getLocaleFromHtmlLanguage(input.homepageLanguage);

  if (htmlLocale) {
    hints.add(htmlLocale);
  }

  const normalizedUrl = normalizeLegalMatchText(input.homepageUrl);
  for (const locale of DEFAULT_LOCALE_ORDER) {
    if (LOCALE_SEGMENT_HINTS[locale].some((hint) => normalizedUrl.includes(`/${hint}`) || normalizedUrl.includes(`-${hint}`))) {
      hints.add(locale);
    }
  }

  for (const link of input.links ?? []) {
    const normalizedLink = normalizeLegalMatchText(`${link.href} ${link.text ?? ""}`);
    for (const locale of DEFAULT_LOCALE_ORDER) {
      const dictionary = KEY_PAGE_KEYWORDS_BY_LOCALE[locale];
      const hasLocaleKeyword = Object.values(dictionary).some((keywords) =>
        keywords.some((keyword) => normalizedLink.includes(normalizeLegalMatchText(keyword)))
      );
      if (hasLocaleKeyword) {
        hints.add(locale);
      }
    }
  }

  if (hints.size === 0) {
    hints.add("en");
  }

  return [...hints.values()];
}

export function getLocalizedKeywords(pageType: KeyPageType | "legal_hub", localeHints: string[]) {
  const locales = resolveSupportedLocales(localeHints);
  return uniq(
    locales.flatMap((locale) => KEY_PAGE_KEYWORDS_BY_LOCALE[locale][pageType]).map((keyword) => normalizeLegalMatchText(keyword))
  );
}

export function getLocalizedPathGuesses(input: {
  homepageUrl: string;
  localeHints: string[];
  pageType: KeyPageType;
}) {
  const homepage = new URL(input.homepageUrl);
  const locales = resolveSupportedLocales(input.localeHints);
  const pathname = homepage.pathname.replace(/\/+$/, "");
  const localePrefix = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i)?.[0]?.replace(/\/+$/, "") ?? null;
  const guesses: string[] = [];

  for (const locale of locales) {
    for (const guess of KEY_PAGE_PATH_GUESSES_BY_LOCALE[locale][input.pageType]) {
      guesses.push(new URL(guess, homepage.origin).toString());
      if (localePrefix) {
        guesses.push(new URL(`${localePrefix}${guess}`, homepage.origin).toString());
      }
    }
  }

  return uniq(guesses);
}

export function scoreKeywordMatches(text: string, keywords: string[]) {
  const normalized = normalizeLegalMatchText(text);
  return keywords.reduce((score, keyword) => {
    if (!normalized.includes(keyword)) {
      return score;
    }

    return score + Math.max(4, keyword.length);
  }, 0);
}

export function getSupportedKeyPageTypes() {
  return ["privacy_policy", "terms_of_service", "cookie_policy", "accessibility_statement", "contact"] as const;
}
