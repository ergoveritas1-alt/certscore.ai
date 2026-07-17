import {
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
  isSupportedPrivacyEvidenceLocale,
  type SupportedPrivacyEvidenceLocale
} from "@certscore/contracts";

export type PrimaryLanguageGuessInput = {
  contentLanguages?: Array<string | null | undefined>;
  declaredLanguages?: Array<string | null | undefined>;
  persistedPrimaryLanguages?: Array<string | null | undefined>;
  matchedLocales?: Array<string | null | undefined>;
  textSamples?: Array<string | null | undefined>;
  urls?: Array<string | null | undefined>;
};

export type PrimaryLanguageConfidence = "high" | "medium" | "low";
export type PrimaryLanguageSource = "declared" | "content_language" | "retained_text" | "retained_locale" | "persisted_primary" | "url_hint";
export type PrimaryLanguageGuess = {
  confidence: PrimaryLanguageConfidence;
  locale: SupportedPrivacyEvidenceLocale;
  source: PrimaryLanguageSource;
};

const LANGUAGE_ALIASES: Record<string, SupportedPrivacyEvidenceLocale> = {
  eng: "en",
  ger: "de",
  deu: "de",
  fre: "fr",
  fra: "fr",
  spa: "es",
  ita: "it",
  por: "pt",
  dut: "nl",
  nld: "nl",
  pol: "pl",
  rus: "ru",
  ukr: "uk",
  zho: "zh",
  chi: "zh",
  jpn: "ja",
  kor: "ko",
  ara: "ar",
  fas: "fa",
  per: "fa",
  heb: "he",
  gre: "el",
  ell: "el",
  nor: "nb",
  no: "nb",
  iw: "he",
  in: "id"
};

const COMMON_WORD_HINTS: Partial<Record<SupportedPrivacyEvidenceLocale, readonly string[]>> = {
  en: ["the", "and", "your", "with", "from", "this", "that", "for", "are", "our"],
  de: ["der", "die", "das", "und", "nicht", "mit", "für", "von", "ist", "ihre"],
  fr: ["les", "des", "une", "vous", "avec", "pour", "est", "dans", "votre", "nous"],
  es: ["los", "las", "una", "para", "con", "por", "que", "del", "sus", "nuestro"],
  it: ["gli", "della", "delle", "una", "con", "per", "che", "sono", "vostro", "nostro"],
  pt: ["uma", "para", "com", "que", "dos", "das", "seus", "nossa", "não", "você"],
  nl: ["het", "een", "voor", "met", "van", "niet", "zijn", "deze", "onze", "worden"],
  pl: ["oraz", "jest", "nie", "dla", "przez", "które", "stronie", "twoje", "nasze", "się"],
  tr: ["bir", "için", "ile", "değil", "olan", "sizin", "bizim", "olarak", "daha", "tüm"],
  sv: ["och", "för", "med", "inte", "som", "din", "vår", "detta", "från", "alla"],
  da: ["for", "med", "ikke", "som", "din", "vores", "dette", "fra", "alle", "siden"],
  nb: ["for", "med", "ikke", "som", "din", "vår", "dette", "fra", "alle", "siden"],
  fi: ["ja", "että", "sinun", "meidän", "kanssa", "tämä", "kaikki", "sivusto", "ovat", "tietoja"],
  cs: ["pro", "které", "jsou", "tato", "vaše", "naše", "stránky", "všech", "jako", "nebo"],
  ro: ["pentru", "care", "este", "acest", "dumneavoastră", "noastră", "toate", "site", "sau", "date"],
  hu: ["és", "hogy", "az", "egy", "nem", "ön", "oldal", "minden", "adatok", "számára"],
  ru: ["для", "или", "это", "ваши", "наши", "политика", "данные", "сайт", "которые", "все"],
  uk: ["для", "або", "це", "ваші", "наші", "політика", "дані", "сайт", "які", "усі"],
  bg: ["или", "това", "вашите", "нашите", "политика", "данни", "сайтът", "които", "всички", "може"]
};

function normalizeLanguageCode(value: string | null | undefined): SupportedPrivacyEvidenceLocale | null {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-") ?? "";
  if (!normalized || normalized === "und") return null;
  const exact = LANGUAGE_ALIASES[normalized] ?? normalized;
  if (isSupportedPrivacyEvidenceLocale(exact)) return exact;
  const base = exact.split("-")[0] ?? "";
  const aliasedBase = LANGUAGE_ALIASES[base] ?? base;
  return isSupportedPrivacyEvidenceLocale(aliasedBase) ? aliasedBase : null;
}

function normalizedText(value: string) {
  return ` ${value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

function countToken(text: string, token: string) {
  const needle = ` ${token.normalize("NFKC").toLowerCase()} `;
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0 && count < 4) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function parseUrl(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }
}

export function inferPrimaryLanguage(input: PrimaryLanguageGuessInput): PrimaryLanguageGuess | null {
  const scores = new Map<SupportedPrivacyEvidenceLocale, number>();
  const sources = new Map<SupportedPrivacyEvidenceLocale, Map<PrimaryLanguageSource, number>>();
  const addScore = (locale: SupportedPrivacyEvidenceLocale | null, score: number, source: PrimaryLanguageSource) => {
    if (locale) {
      scores.set(locale, (scores.get(locale) ?? 0) + score);
      const localeSources = sources.get(locale) ?? new Map<PrimaryLanguageSource, number>();
      localeSources.set(source, (localeSources.get(source) ?? 0) + score);
      sources.set(locale, localeSources);
    }
  };

  for (const declared of input.declaredLanguages ?? []) {
    addScore(normalizeLanguageCode(declared), 100, "declared");
  }
  for (const persisted of input.persistedPrimaryLanguages ?? []) {
    addScore(normalizeLanguageCode(persisted), 115, "persisted_primary");
  }
  for (const contentLanguage of input.contentLanguages ?? []) {
    addScore(normalizeLanguageCode(contentLanguage), 85, "content_language");
  }
  for (const matched of input.matchedLocales ?? []) {
    addScore(normalizeLanguageCode(matched), 12, "retained_locale");
  }

  for (const value of input.urls ?? []) {
    const parsed = parseUrl(value);
    if (!parsed) continue;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    for (const segment of parsed.pathname.split("/").filter(Boolean).slice(0, 3)) {
      addScore(normalizeLanguageCode(segment), 18, "url_hint");
    }
    for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
      if (entry.tldHints.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix))) {
        addScore(entry.locale, 16, "url_hint");
      }
    }
    if (/\.(?:uk|ie|us|au|nz)$/.test(hostname)) addScore("en", 16, "url_hint");
  }

  const rawText = (input.textSamples ?? []).filter((value): value is string => Boolean(value?.trim())).join(" ").slice(0, 20_000);
  const text = normalizedText(rawText);
  if (rawText) {
    if (/[ぁ-ゟ゠-ヿ]/u.test(rawText)) addScore("ja", 55, "retained_text");
    if (/[가-힣]/u.test(rawText)) addScore("ko", 55, "retained_text");
    if (/[ก-๙]/u.test(rawText)) addScore("th", 55, "retained_text");
    if (/[α-ωά-ώ]/iu.test(rawText)) addScore("el", 48, "retained_text");
    if (/[א-ת]/u.test(rawText)) addScore("he", 48, "retained_text");
    if (/[ऀ-ॿ]/u.test(rawText)) addScore("hi", 48, "retained_text");
    if (/[پچژگ]/u.test(rawText)) addScore("fa", 52, "retained_text");
    else if (/[\u0600-\u06ff]/u.test(rawText)) addScore("ar", 40, "retained_text");
    if (/[ђћљњџ]/iu.test(rawText)) addScore("sr", 48, "retained_text");
    if (/[一-鿿]/u.test(rawText) && !/[ぁ-ゟ゠-ヿ]/u.test(rawText)) addScore("zh", 34, "retained_text");

    for (const [locale, hints] of Object.entries(COMMON_WORD_HINTS) as Array<[SupportedPrivacyEvidenceLocale, readonly string[]]>) {
      const matches = hints.reduce((total, token) => total + countToken(text, token), 0);
      if (matches >= 2) addScore(locale, Math.min(30, matches * 3), "retained_text");
    }

    const phraseText = rawText.normalize("NFKC").toLowerCase();
    for (const entry of PRIVACY_EVIDENCE_LOCALE_REGISTRY) {
      const phrases = [
        ...entry.privacyPolicyLabels,
        ...entry.cookiePolicyLabels,
        ...entry.cookieSettingsLabels,
        ...entry.termsLabels,
        ...entry.contextHints,
        ...entry.consentControls.accept,
        ...entry.consentControls.reject,
        ...entry.consentControls.options,
        ...entry.consentControls.necessaryOnly
      ];
      const matchCount = new Set(phrases
        .map((phrase) => phrase.normalize("NFKC").toLowerCase())
        .filter((phrase) => phrase.length >= 4 && phraseText.includes(phrase))).size;
      if (matchCount > 0) addScore(entry.locale, Math.min(32, matchCount * 6), "retained_text");
    }
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const winner = ranked[0];
  if (!winner || winner[1] < 12) return null;
  const sourceScores = [...(sources.get(winner[0]) ?? new Map()).entries()].sort((left, right) => right[1] - left[1]);
  const source = sourceScores[0]?.[0];
  if (!source) return null;
  const margin = winner[1] - (ranked[1]?.[1] ?? 0);
  const confidence: PrimaryLanguageConfidence = source === "persisted_primary" || source === "declared" || source === "content_language"
    ? "high"
    : source === "retained_text" && winner[1] >= 30 && margin >= 8
      ? "high"
      : source === "retained_text" || source === "retained_locale"
        ? "medium"
        : "low";
  return { confidence, locale: winner[0], source };
}

export function guessPrimaryLanguage(input: PrimaryLanguageGuessInput): SupportedPrivacyEvidenceLocale | null {
  return inferPrimaryLanguage(input)?.locale ?? null;
}
