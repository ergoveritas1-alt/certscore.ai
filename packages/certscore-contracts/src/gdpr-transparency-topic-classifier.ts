import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type GdprTransparencyTopic =
  | "controller_contact"
  | "dpo_contact"
  | "processing_purposes"
  | "legal_basis"
  | "recipients_or_vendor_categories"
  | "data_retention"
  | "data_subject_rights"
  | "international_transfers"
  | "supervisory_authority"
  | "automated_decision_making_or_profiling";

export type GdprTransparencyTopicMatchStrength =
  | "direct"
  | "equivalent"
  | "contextual"
  | "weak";

export type GdprTransparencyTopicPhrase = {
  locale: SupportedPrivacyEvidenceLocale;
  phrase: string;
  topic: GdprTransparencyTopic;
  strength: GdprTransparencyTopicMatchStrength;
  variant?: string;
};

export type GdprTransparencyTopicClassifierInput = {
  text?: string | null;
  localeHints?: SupportedPrivacyEvidenceLocale[];
  maxMatches?: number;
};

export type GdprTransparencyTopicMatch = {
  classifierProvenance: "gdpr_transparency_topic_classifier.v1";
  confidence: number;
  evidenceExcerpt: string;
  matchedLocale: SupportedPrivacyEvidenceLocale;
  matchedTerm: string;
  matchStrength: GdprTransparencyTopicMatchStrength;
  reasonCodes: string[];
  topic: GdprTransparencyTopic;
  variant?: string;
};

export type GdprTransparencyTopicClassification = {
  classifierProvenance: "gdpr_transparency_topic_classifier.v1";
  matches: GdprTransparencyTopicMatch[];
  reasonCodes: string[];
};

type PhraseInput = Omit<GdprTransparencyTopicPhrase, "locale">;

const MAX_EXCERPT_CHARS = 360;
const DEFAULT_MAX_MATCHES = 24;

const en = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "en", ...term }));
const de = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "de", ...term }));
const fr = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "fr", ...term }));
const es = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "es", ...term }));
const it = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "it", ...term }));
const nl = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "nl", ...term }));
const pl = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "pl", ...term }));

export const GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY: GdprTransparencyTopicPhrase[] = [
  ...en([
    direct("controller_contact", "data controller"),
    direct("controller_contact", "data controller contact"),
    equivalent("controller_contact", "privacy contact"),
    equivalent("controller_contact", "data protection contact"),
    direct("dpo_contact", "data protection officer"),
    equivalent("dpo_contact", "dpo contact"),
    equivalent("dpo_contact", "contact our dpo"),
    direct("processing_purposes", "purposes of processing personal data"),
    direct("processing_purposes", "why we process personal data"),
    direct("processing_purposes", "use your personal data"),
    direct("legal_basis", "legal basis for processing personal data"),
    direct("legal_basis", "lawful basis for processing personal data"),
    equivalent("legal_basis", "legitimate interests for processing personal data"),
    direct("recipients_or_vendor_categories", "recipients of personal data"),
    direct("recipients_or_vendor_categories", "categories of recipients of personal data"),
    direct("recipients_or_vendor_categories", "third parties with whom we share personal data"),
    equivalent("recipients_or_vendor_categories", "service providers that process personal data"),
    direct("data_retention", "retention period for personal data"),
    direct("data_retention", "retain personal data"),
    equivalent("data_retention", "as long as necessary for processing"),
    direct("data_subject_rights", "right to access your personal data"),
    direct("data_subject_rights", "right to erasure of personal data"),
    direct("data_subject_rights", "right to object to processing"),
    direct("international_transfers", "international transfers of personal data"),
    equivalent("international_transfers", "transfer personal data outside the european economic area"),
    direct("international_transfers", "personal data outside the european economic area"),
    equivalent("international_transfers", "standard contractual clauses for personal data transfers"),
    direct("supervisory_authority", "right to lodge a complaint with a supervisory authority"),
    direct("supervisory_authority", "lodge a complaint with a supervisory authority"),
    direct("automated_decision_making_or_profiling", "automated decision-making using personal data"),
    equivalent("automated_decision_making_or_profiling", "automated decision-making for data processing"),
    equivalent("automated_decision_making_or_profiling", "profiling of personal data"),
    equivalent("automated_decision_making_or_profiling", "profiling for data processing"),
  ]),
  ...de([
    direct("controller_contact", "verantwortlicher für die datenverarbeitung"),
    direct("controller_contact", "verantwortlich für die datenverarbeitung"),
    direct("controller_contact", "kontakt zum verantwortlichen für datenschutz"),
    equivalent("controller_contact", "datenschutz kontakt"),
    equivalent("controller_contact", "kontakt zum datenschutz"),
    equivalent("dpo_contact", "unser datenschutzbeauftragter"),
    equivalent("dpo_contact", "datenschutzbeauftragten erreichen"),
    equivalent("dpo_contact", "kontakt zum datenschutzbeauftragten"),
    direct("processing_purposes", "zwecke der verarbeitung personenbezogener daten"),
    equivalent("processing_purposes", "welche zwecke wir verfolgen"),
    direct("legal_basis", "rechtsgrundlage für die verarbeitung personenbezogener daten"),
    direct("legal_basis", "auf welcher rechtsgrundlage die verarbeitung basiert"),
    equivalent("legal_basis", "berechtigte interessen für die verarbeitung personenbezogener daten"),
    direct("recipients_or_vendor_categories", "empfänger personenbezogener daten"),
    equivalent("recipients_or_vendor_categories", "welche empfänger von daten es geben kann"),
    equivalent("recipients_or_vendor_categories", "kategorien von empfängern personenbezogener daten"),
    equivalent("recipients_or_vendor_categories", "dienstleister die personenbezogene daten verarbeiten"),
    direct("data_retention", "speicherdauer personenbezogener daten"),
    equivalent("data_retention", "wie lange ihre informationen gespeichert werden"),
    equivalent("data_retention", "solange dies für die verarbeitung erforderlich ist"),
    direct("data_subject_rights", "recht auf auskunft über personenbezogene daten"),
    equivalent("data_subject_rights", "recht auf löschung personenbezogener daten"),
    direct("international_transfers", "übermittlung personenbezogener daten in ein drittland"),
    equivalent("international_transfers", "standardvertragsklauseln für die übermittlung personenbezogener daten"),
    direct("supervisory_authority", "recht auf beschwerde bei einer aufsichtsbehörde"),
    equivalent("supervisory_authority", "beschwerde bei einer aufsichtsbehörde"),
    direct("automated_decision_making_or_profiling", "automatisierte entscheidungsfindung mit personenbezogenen daten"),
    equivalent("automated_decision_making_or_profiling", "profiling personenbezogener daten"),
  ]),
  ...fr([
    direct("controller_contact", "responsable du traitement"),
    direct("controller_contact", "contact du responsable du traitement"),
    equivalent("controller_contact", "contact confidentialité"),
    equivalent("controller_contact", "contact protection des données"),
    direct("dpo_contact", "délégué à la protection des données"),
    equivalent("dpo_contact", "contact dpo"),
    direct("processing_purposes", "finalités du traitement des données personnelles"),
    equivalent("processing_purposes", "finalités du traitement"),
    equivalent("processing_purposes", "pour quelles raisons collectons-nous des données personnelles"),
    equivalent("processing_purposes", "nous collectons des données personnelles pour les raisons principales suivantes"),
    direct("legal_basis", "base juridique du traitement des données personnelles"),
    direct("legal_basis", "base légale du traitement des données personnelles"),
    equivalent("legal_basis", "base légale du traitement"),
    equivalent("legal_basis", "fondement légal pour la collecte de données"),
    equivalent("legal_basis", "fondement légal pour le faire"),
    equivalent("legal_basis", "intérêt légitime pour traiter les données personnelles"),
    direct("recipients_or_vendor_categories", "destinataires des données personnelles"),
    equivalent("recipients_or_vendor_categories", "catégories de destinataires des données personnelles"),
    equivalent("recipients_or_vendor_categories", "prestataires qui traitent des données personnelles"),
    equivalent("recipients_or_vendor_categories", "prestataires et sous-traitants"),
    equivalent("recipients_or_vendor_categories", "sous-traitants qui traitent des données personnelles"),
    direct("data_retention", "durée de conservation des données personnelles"),
    equivalent("data_retention", "conservons vos données personnelles"),
    equivalent("data_retention", "données personnelles sont conservées"),
    equivalent("data_retention", "conservées pendant la durée nécessaire"),
    direct("data_subject_rights", "droit d'accès aux données personnelles"),
    equivalent("data_subject_rights", "droit à l'effacement des données personnelles"),
    equivalent("data_subject_rights", "vous disposez du droit de"),
    direct("international_transfers", "transferts internationaux de données personnelles"),
    equivalent("international_transfers", "données personnelles transférées hors de l'union européenne"),
    equivalent("international_transfers", "transférées hors de l'union européenne"),
    equivalent("international_transfers", "transférées en dehors de l'union européenne"),
    equivalent("international_transfers", "données personnelles hors de l'espace économique européen"),
    direct("supervisory_authority", "droit d'introduire une réclamation auprès d'une autorité de contrôle"),
    equivalent("supervisory_authority", "introduire une réclamation auprès d'une autorité de contrôle"),
    direct("automated_decision_making_or_profiling", "décision automatisée utilisant des données personnelles"),
    equivalent("automated_decision_making_or_profiling", "profilage des données personnelles"),
  ]),
  ...es([
    direct("controller_contact", "responsable del tratamiento"),
    direct("controller_contact", "contacto del responsable del tratamiento"),
    equivalent("controller_contact", "contacto de privacidad"),
    equivalent("controller_contact", "contacto de protección de datos"),
    direct("dpo_contact", "delegado de protección de datos"),
    equivalent("dpo_contact", "contacto dpo"),
    direct("processing_purposes", "finalidades del tratamiento de datos personales"),
    direct("legal_basis", "base jurídica del tratamiento de datos personales"),
    equivalent("legal_basis", "intereses legítimos para tratar datos personales"),
    direct("recipients_or_vendor_categories", "destinatarios de datos personales"),
    equivalent("recipients_or_vendor_categories", "categorías de destinatarios de datos personales"),
    equivalent("recipients_or_vendor_categories", "proveedores de servicios que tratan datos personales"),
    direct("data_retention", "plazo de conservación de datos personales"),
    equivalent("data_retention", "conservamos datos personales"),
    direct("data_subject_rights", "derecho de acceso a datos personales"),
    equivalent("data_subject_rights", "derecho de supresión de datos personales"),
    direct("international_transfers", "transferencias internacionales de datos personales"),
    equivalent("international_transfers", "datos personales fuera del espacio económico europeo"),
    direct("supervisory_authority", "derecho a presentar una reclamación ante una autoridad de control"),
    direct("supervisory_authority", "presentar una reclamación ante la agencia española de protección de datos"),
    equivalent("supervisory_authority", "presentar una reclamación ante una autoridad de control"),
    direct("automated_decision_making_or_profiling", "decisiones automatizadas con datos personales"),
    equivalent("automated_decision_making_or_profiling", "elaboración de perfiles de datos personales"),
  ]),
  ...it([
    direct("controller_contact", "titolare del trattamento"),
    direct("controller_contact", "titolari del trattamento dei dati personali"),
    direct("controller_contact", "contatto del titolare del trattamento"),
    equivalent("controller_contact", "contatto privacy"),
    equivalent("controller_contact", "contatto protezione dati"),
    direct("dpo_contact", "responsabile della protezione dei dati"),
    equivalent("dpo_contact", "contatto dpo"),
    direct("processing_purposes", "finalità del trattamento dei dati personali"),
    equivalent("processing_purposes", "tratta i tuoi dati per le seguenti finalità"),
    direct("legal_basis", "base giuridica del trattamento dei dati personali"),
    equivalent("legal_basis", "legittimo interesse per trattare dati personali"),
    direct("recipients_or_vendor_categories", "destinatari dei dati personali"),
    equivalent("recipients_or_vendor_categories", "destinatari dei tuoi dati"),
    equivalent("recipients_or_vendor_categories", "categorie di destinatari dei dati personali"),
    equivalent("recipients_or_vendor_categories", "fornitori di servizi che trattano dati personali"),
    direct("data_retention", "periodo di conservazione dei dati personali"),
    equivalent("data_retention", "conserviamo dati personali"),
    direct("data_subject_rights", "diritto di accesso ai dati personali"),
    equivalent("data_subject_rights", "diritto alla cancellazione dei dati personali"),
    direct("international_transfers", "trasferimenti internazionali di dati personali"),
    equivalent("international_transfers", "dati personali fuori dallo spazio economico europeo"),
    direct("supervisory_authority", "diritto di proporre reclamo all'autorità di controllo"),
    equivalent("supervisory_authority", "proporre reclamo all'autorità di controllo"),
    direct("automated_decision_making_or_profiling", "decisioni automatizzate con dati personali"),
    equivalent("automated_decision_making_or_profiling", "profilazione dei dati personali"),
  ]),
  ...nl([
    direct("controller_contact", "verwerkingsverantwoordelijke"),
    direct("controller_contact", "contact met verwerkingsverantwoordelijke"),
    equivalent("controller_contact", "privacycontact"),
    equivalent("controller_contact", "contact gegevensbescherming"),
    direct("dpo_contact", "functionaris voor gegevensbescherming"),
    equivalent("dpo_contact", "contact met fg"),
    direct("processing_purposes", "doeleinden van de verwerking van persoonsgegevens"),
    direct("legal_basis", "rechtsgrondslag voor de verwerking van persoonsgegevens"),
    equivalent("legal_basis", "gerechtvaardigd belang voor verwerking van persoonsgegevens"),
    equivalent("legal_basis", "gerechtvaardigd belang bij het verwerken van persoonsgegevens"),
    direct("recipients_or_vendor_categories", "ontvangers van persoonsgegevens"),
    equivalent("recipients_or_vendor_categories", "categorieën van ontvangers van persoonsgegevens"),
    equivalent("recipients_or_vendor_categories", "dienstverleners die persoonsgegevens verwerken"),
    equivalent("recipients_or_vendor_categories", "uw persoonsgegevens niet delen met derden"),
    direct("data_retention", "bewaartermijn van persoonsgegevens"),
    equivalent("data_retention", "bewaren persoonsgegevens"),
    equivalent("data_retention", "persoonsgegevens niet langer bewaren dan noodzakelijk"),
    direct("data_subject_rights", "recht op inzage in persoonsgegevens"),
    equivalent("data_subject_rights", "recht op verwijdering van persoonsgegevens"),
    equivalent("data_subject_rights", "bezwaar te maken tegen het verwerken van uw persoonsgegevens"),
    direct("international_transfers", "internationale doorgiften van persoonsgegevens"),
    equivalent("international_transfers", "internationale doorgifte van gegevens worden er maatregelen genomen om een adequaat beschermingsniveau"),
    equivalent("international_transfers", "persoonsgegevens buiten de europese economische ruimte"),
    direct("supervisory_authority", "recht om klacht in te dienen bij een toezichthoudende autoriteit"),
    equivalent("supervisory_authority", "klacht indienen bij een toezichthoudende autoriteit"),
    equivalent("supervisory_authority", "klacht indienen bij de autoriteit persoonsgegevens"),
    direct("automated_decision_making_or_profiling", "geautomatiseerde besluitvorming met persoonsgegevens"),
    equivalent("automated_decision_making_or_profiling", "profilering van persoonsgegevens"),
  ]),
  ...pl([
    direct("controller_contact", "administrator danych"),
    direct("controller_contact", "administratorem danych osobowych"),
    direct("controller_contact", "kontakt do administratora danych"),
    equivalent("controller_contact", "kontakt w sprawie prywatności"),
    equivalent("controller_contact", "kontakt w sprawie ochrony danych"),
    direct("dpo_contact", "inspektor ochrony danych"),
    direct("dpo_contact", "administrator wyznaczył inspektora ochrony danych"),
    equivalent("dpo_contact", "kontakt z iod"),
    direct("processing_purposes", "cele przetwarzania danych osobowych"),
    direct("processing_purposes", "cele oraz podstawy prawne przetwarzania danych"),
    equivalent("processing_purposes", "przetwarzać dane osobowe użytkowników w celu"),
    direct("legal_basis", "podstawa prawna przetwarzania danych osobowych"),
    direct("legal_basis", "podstawy prawne przetwarzania danych"),
    equivalent("legal_basis", "na podstawie art 6 ust 1 lit"),
    equivalent("legal_basis", "uzasadniony interes w przetwarzaniu danych osobowych"),
    direct("recipients_or_vendor_categories", "odbiorcy danych osobowych"),
    direct("recipients_or_vendor_categories", "odbiorcy danych i zaufani partnerzy"),
    equivalent("recipients_or_vendor_categories", "kategorie odbiorców danych osobowych"),
    equivalent("recipients_or_vendor_categories", "kategoriom odbiorców"),
    equivalent("recipients_or_vendor_categories", "dostawcy usług przetwarzający dane osobowe"),
    direct("data_retention", "okres przechowywania danych osobowych"),
    direct("data_retention", "przez jaki okres będą przechowywane twoje dane osobowe"),
    equivalent("data_retention", "przechowujemy dane osobowe"),
    direct("data_subject_rights", "prawo dostępu do danych osobowych"),
    equivalent("data_subject_rights", "prawo do usunięcia danych osobowych"),
    equivalent("data_subject_rights", "praw osób których dane dotyczą"),
    direct("international_transfers", "transfery międzynarodowe danych osobowych"),
    equivalent("international_transfers", "dane osobowe poza europejski obszar gospodarczy"),
    equivalent("international_transfers", "dane osobowe użytkownika mogą być przekazywane do państw"),
    direct("supervisory_authority", "prawo do wniesienia skargi do organu nadzorczego"),
    direct("supervisory_authority", "skargę dotyczącą przetwarzania danych osobowych do organu nadzorczego"),
    equivalent("supervisory_authority", "organem nadzorczym jest prezes urzędu ochrony danych osobowych"),
    equivalent("supervisory_authority", "wnieść skargę do organu nadzorczego"),
    direct("automated_decision_making_or_profiling", "zautomatyzowane podejmowanie decyzji z użyciem danych osobowych"),
    equivalent("automated_decision_making_or_profiling", "automatycznemu przetwarzaniu danych"),
    equivalent("automated_decision_making_or_profiling", "profilowanie danych osobowych"),
  ]),
];

export function classifyGdprTransparencyTopics(
  input: GdprTransparencyTopicClassifierInput,
): GdprTransparencyTopicClassification {
  const normalizedText = normalizeGdprTransparencyText(input.text);
  if (!normalizedText) {
    return {
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      matches: [],
      reasonCodes: ["empty_text"],
    };
  }

  const localeHints = new Set(input.localeHints ?? []);
  const phrases = localeHints.size > 0
    ? GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY.filter((term) => localeHints.has(term.locale))
    : GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY;
  const matches = phrases
    .map((term) => ({ term, score: phraseScore(term, normalizedText) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      strengthRank(right.term.strength) - strengthRank(left.term.strength) ||
      right.term.phrase.length - left.term.phrase.length
    );

  const selected = new Map<GdprTransparencyTopic, GdprTransparencyTopicMatch>();
  for (const { term } of matches) {
    if (selected.has(term.topic)) {
      continue;
    }
    selected.set(term.topic, {
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      confidence: confidenceFor(term),
      evidenceExcerpt: boundedEvidenceExcerpt(input.text ?? "", term.phrase),
      matchedLocale: term.locale,
      matchedTerm: term.phrase,
      matchStrength: term.strength,
      reasonCodes: uniqueStrings([
        `matched_${term.topic}`,
        `match_strength_${term.strength}`,
        term.variant ? `variant_${term.variant}` : null,
      ]),
      topic: term.topic,
      variant: term.variant,
    });
    if (selected.size >= Math.max(1, input.maxMatches ?? DEFAULT_MAX_MATCHES)) {
      break;
    }
  }

  return {
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    matches: [...selected.values()],
    reasonCodes: selected.size > 0 ? ["topic_match_observed"] : ["no_topic_match"],
  };
}

export function normalizeGdprTransparencyText(value: string | null | undefined): string {
  return decodeCommonHtmlEntities(value ?? "")
    .normalize("NFKC")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, "\"")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/[.,;:!?()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeCommonHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, codepoint: string) => {
      const parsed = Number(codepoint);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, codepoint: string) => {
      const parsed = Number.parseInt(codepoint, 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, entity: string) =>
      COMMON_HTML_ENTITY_REPLACEMENTS[entity.toLowerCase()] ?? match
    );
}

const COMMON_HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  amp: "&",
  apos: "'",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  aring: "å",
  atilde: "ã",
  auml: "ä",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  quot: "\"",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
  mdash: "-",
  ndash: "-",
  nbsp: " ",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
};

function direct(topic: GdprTransparencyTopic, phrase: string): PhraseInput {
  return { phrase, strength: "direct", topic };
}

function equivalent(topic: GdprTransparencyTopic, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "equivalent", topic, variant };
}

function phraseScore(term: GdprTransparencyTopicPhrase, normalizedText: string): number {
  const phrase = normalizeGdprTransparencyText(term.phrase);
  if (!phrase || !paddedIncludes(normalizedText, phrase)) {
    return 0;
  }
  return 600 + phrase.length + strengthRank(term.strength) * 80;
}

function paddedIncludes(normalizedValue: string, phrase: string) {
  return ` ${normalizedValue} `.includes(` ${phrase} `);
}

function confidenceFor(term: GdprTransparencyTopicPhrase) {
  const base =
    term.strength === "direct" ? 0.9 :
      term.strength === "equivalent" ? 0.82 :
        term.strength === "contextual" ? 0.74 :
          0.55;
  return Math.max(0.2, Math.min(0.95, base));
}

function strengthRank(strength: GdprTransparencyTopicMatchStrength) {
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

function boundedEvidenceExcerpt(text: string, phrase: string): string {
  const normalizedPhrase = normalizeGdprTransparencyText(phrase);
  const sourceText = decodedEvidenceText(text);
  if (!sourceText) {
    return "";
  }
  const searchIndex = buildEvidenceSearchIndex(sourceText);
  const matchIndex = normalizedPhrase ? paddedIndexOf(searchIndex.normalized, normalizedPhrase) : -1;
  if (matchIndex < 0) {
    return sourceText.slice(0, MAX_EXCERPT_CHARS);
  }
  const sourceMatchStart = searchIndex.sourceIndexes[matchIndex] ?? 0;
  const start = Math.max(0, sourceMatchStart - Math.floor(MAX_EXCERPT_CHARS / 3));
  return sourceText.slice(start, start + MAX_EXCERPT_CHARS).trim();
}

function decodedEvidenceText(text: string): string {
  return decodeCommonHtmlEntities(text)
    .normalize("NFKC")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEvidenceSearchIndex(sourceText: string) {
  let normalized = "";
  const sourceIndexes: number[] = [];

  const append = (value: string, sourceIndex: number) => {
    for (const char of value) {
      const normalizedChar =
        /\s/u.test(char) ? " " :
          /[-–—]/u.test(char) ? "-" :
            /[.,;:!?()[\]{}]+/u.test(char) ? " " :
              char
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, "")
                .toLowerCase();
      if (!normalizedChar) {
        continue;
      }
      for (const outputChar of normalizedChar) {
        const collapsedOutput = /\s/u.test(outputChar) ? " " : outputChar;
        if (collapsedOutput === " " && (normalized.length === 0 || normalized.endsWith(" "))) {
          continue;
        }
        normalized += collapsedOutput;
        sourceIndexes.push(sourceIndex);
      }
    }
  };

  for (let index = 0; index < sourceText.length;) {
    const char = sourceText[index] ?? "";
    append(char.normalize("NFKC"), index);
    index += char.length;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    sourceIndexes.pop();
  }

  return { normalized, sourceIndexes };
}

function paddedIndexOf(normalizedValue: string, phrase: string) {
  const index = ` ${normalizedValue} `.indexOf(` ${phrase} `);
  return index < 0 ? -1 : index;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
