import type { SupportedGdprTransparencyLocale } from "./supported-languages";

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
  locale: SupportedGdprTransparencyLocale;
  phrase: string;
  topic: GdprTransparencyTopic;
  strength: GdprTransparencyTopicMatchStrength;
  variant?: string;
};

export type GdprTransparencyTopicClassifierInput = {
  text?: string | null;
  localeHints?: SupportedGdprTransparencyLocale[];
  maxMatches?: number;
};

export type GdprTransparencyTopicMatch = {
  classifierProvenance: "gdpr_transparency_topic_classifier.v1";
  confidence: number;
  evidenceExcerpt: string;
  matchedLocale: SupportedGdprTransparencyLocale;
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
const pt = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "pt", ...term }));
const ru = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "ru", ...term }));
const ja = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "ja", ...term }));
const zh = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "zh", ...term }));
const ar = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "ar", ...term }));
const sv = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "sv", ...term }));
const ro = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "ro", ...term }));
const cs = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "cs", ...term }));
const el = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "el", ...term }));
const hu = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "hu", ...term }));
const da = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "da", ...term }));
const fi = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "fi", ...term }));
const sk = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "sk", ...term }));
const bg = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "bg", ...term }));
const hr = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "hr", ...term }));
const nb = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "nb", ...term }));
const sl = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "sl", ...term }));
const lt = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "lt", ...term }));
const lv = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "lv", ...term }));
const et = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "et", ...term }));
const uk = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "uk", ...term }));
const tr = (terms: PhraseInput[]) => terms.map((term): GdprTransparencyTopicPhrase => ({ locale: "tr", ...term }));

export const GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY: GdprTransparencyTopicPhrase[] = [
  ...en([
    direct("controller_contact", "data controller"),
    direct("controller_contact", "data controller contact"),
    equivalent("controller_contact", "controller operator of data"),
    equivalent("controller_contact", "controller of data"),
    equivalent("controller_contact", "privacy contact"),
    equivalent("controller_contact", "data protection contact"),
    equivalent("controller_contact", "questions related to data processing can be sent to privacy"),
    equivalent("controller_contact", "questions about this privacy policy"),
    equivalent("controller_contact", "attention privacy officer"),
    direct("dpo_contact", "data protection officer"),
    equivalent("dpo_contact", "dpo contact"),
    equivalent("dpo_contact", "contact our dpo"),
    equivalent("dpo_contact", "privacy counsel"),
    direct("processing_purposes", "purposes of processing personal data"),
    direct("processing_purposes", "why we process personal data"),
    direct("processing_purposes", "use your personal data"),
    equivalent("processing_purposes", "purposes for which we use the information"),
    equivalent("processing_purposes", "use the information for the purposes for which it was collected"),
    equivalent("processing_purposes", "use the information for the purposes for which it is provided"),
    equivalent("processing_purposes", "how we use your personal information"),
    equivalent("processing_purposes", "uses personal data for the following goals"),
    equivalent("processing_purposes", "use personal data for the following goals"),
    direct("legal_basis", "legal basis for processing personal data"),
    direct("legal_basis", "lawful basis for processing personal data"),
    equivalent("legal_basis", "legal basis on which we hold and use your data"),
    equivalent("legal_basis", "our lawful bases include"),
    equivalent("legal_basis", "needed to fulfill a contract"),
    equivalent("legal_basis", "comply with our legal obligations"),
    equivalent("legal_basis", "legitimate interests for processing personal data"),
    equivalent("legal_basis", "relevant legitimate interest"),
    equivalent("legal_basis", "presence of the relevant legitimate interest"),
    direct("recipients_or_vendor_categories", "recipients of personal data"),
    direct("recipients_or_vendor_categories", "categories of recipients of personal data"),
    direct("recipients_or_vendor_categories", "third parties with whom we share personal data"),
    direct("recipients_or_vendor_categories", "share personal information with third parties"),
    equivalent("recipients_or_vendor_categories", "share personal information with service providers"),
    equivalent("recipients_or_vendor_categories", "service providers that process personal data"),
    equivalent("recipients_or_vendor_categories", "subcontractors and service providers"),
    equivalent("recipients_or_vendor_categories", "processors receive"),
    equivalent("recipients_or_vendor_categories", "our affiliates service providers third parties"),
    equivalent("recipients_or_vendor_categories", "our affiliates service providers and third parties"),
    direct("data_retention", "retention period for personal data"),
    direct("data_retention", "retain personal data"),
    equivalent("data_retention", "as long as necessary for processing"),
    direct("data_subject_rights", "right to access your personal data"),
    direct("data_subject_rights", "right to erasure of personal data"),
    direct("data_subject_rights", "right to object to processing"),
    direct("data_subject_rights", "rights of data subject"),
    direct("international_transfers", "international transfers of personal data"),
    direct("international_transfers", "international transfers of data"),
    equivalent("international_transfers", "data transfer to processors"),
    equivalent("international_transfers", "transfer your personal data outside your jurisdiction"),
    equivalent("international_transfers", "transfers of your data outside the eea"),
    equivalent("international_transfers", "transfer data to processors located outside"),
    equivalent("international_transfers", "processors located outside"),
    equivalent("international_transfers", "transfer personal data outside the european economic area"),
    direct("international_transfers", "personal data outside the european economic area"),
    equivalent("international_transfers", "transferred to and processed in the united states or other jurisdictions"),
    equivalent("international_transfers", "transferred to or processed in the united states or other jurisdictions"),
    equivalent("international_transfers", "standard contractual clauses for personal data transfers"),
    direct("supervisory_authority", "right to lodge a complaint with a supervisory authority"),
    direct("supervisory_authority", "lodge a complaint with a supervisory authority"),
    equivalent("supervisory_authority", "right to complain to your data protection authority"),
    equivalent("supervisory_authority", "complain to your data protection authority"),
    equivalent("supervisory_authority", "lodge a complaint with an e.u. data protection authority"),
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
    direct("legal_basis", "base juridique du traitement des données personnelles"),
    direct("legal_basis", "base légale du traitement des données personnelles"),
    equivalent("legal_basis", "base légale du traitement"),
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
    direct("international_transfers", "transferts internationaux de données personnelles"),
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
    equivalent("processing_purposes", "utilizamos sus datos personales para"),
    equivalent("processing_purposes", "usamos sus datos personales para"),
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
    direct("processing_purposes", "finalità del trattamento"),
    equivalent("processing_purposes", "tratta i tuoi dati per le seguenti finalità"),
    direct("legal_basis", "base giuridica del trattamento dei dati personali"),
    direct("legal_basis", "base giuridica", "requires_privacy_context"),
    equivalent("legal_basis", "legittimo interesse per trattare dati personali"),
    direct("recipients_or_vendor_categories", "destinatari dei dati personali"),
    equivalent("recipients_or_vendor_categories", "destinatari dei tuoi dati"),
    equivalent("recipients_or_vendor_categories", "categorie di destinatari dei dati personali"),
    equivalent("recipients_or_vendor_categories", "fornitori di servizi che trattano dati personali"),
    equivalent("recipients_or_vendor_categories", "responsabili del trattamento"),
    direct("data_retention", "periodo di conservazione dei dati personali"),
    equivalent("data_retention", "periodo di conservazione", "requires_privacy_context"),
    equivalent("data_retention", "conservazione dei dati"),
    equivalent("data_retention", "conserviamo dati personali"),
    direct("data_subject_rights", "diritti degli interessati"),
    direct("data_subject_rights", "diritto di accesso ai dati personali"),
    equivalent("data_subject_rights", "diritto alla cancellazione dei dati personali"),
    direct("international_transfers", "trasferimenti internazionali di dati personali"),
    equivalent("international_transfers", "trasferimenti extra ue"),
    equivalent("international_transfers", "paesi extra ue"),
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
  ...pt([
    direct("controller_contact", "controlador dos dados pessoais"),
    direct("controller_contact", "responsável pelo tratamento de dados pessoais"),
    equivalent("controller_contact", "contato do controlador"),
    equivalent("controller_contact", "contato de privacidade"),
    direct("dpo_contact", "encarregado de proteção de dados"),
    equivalent("dpo_contact", "contato do encarregado"),
    equivalent("dpo_contact", "contato do dpo"),
    direct("processing_purposes", "finalidades do tratamento de dados pessoais"),
    direct("processing_purposes", "finalidade do tratamento de dados pessoais"),
    equivalent("processing_purposes", "utilizamos seus dados pessoais para"),
    equivalent("processing_purposes", "usamos seus dados pessoais para"),
    direct("legal_basis", "base legal para o tratamento de dados pessoais"),
    direct("legal_basis", "bases legais para o tratamento de dados pessoais"),
    equivalent("legal_basis", "fundamento jurídico para o tratamento de dados pessoais", "pt_pt"),
    equivalent("legal_basis", "legítimo interesse para tratar dados pessoais"),
    direct("recipients_or_vendor_categories", "destinatários dos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "categorias de destinatários dos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "terceiros com quem compartilhamos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "prestadores de serviços que tratam dados pessoais"),
    direct("data_retention", "prazo de conservação dos dados pessoais"),
    direct("data_retention", "período de retenção dos dados pessoais"),
    equivalent("data_retention", "pelo tempo necessário para o tratamento"),
    direct("data_subject_rights", "direito de acesso aos dados pessoais"),
    equivalent("data_subject_rights", "direito à eliminação dos dados pessoais"),
    equivalent("data_subject_rights", "direitos do titular dos dados pessoais"),
    direct("international_transfers", "transferências internacionais de dados pessoais"),
    equivalent("international_transfers", "dados pessoais fora do espaço econômico europeu"),
    equivalent("international_transfers", "cláusulas contratuais padrão para transferências de dados pessoais"),
    direct("supervisory_authority", "direito de apresentar reclamação à autoridade nacional de proteção de dados"),
    equivalent("supervisory_authority", "reclamação à autoridade nacional de proteção de dados"),
    equivalent("supervisory_authority", "reclamação à anpd"),
    equivalent("supervisory_authority", "reclamação à comissão nacional de proteção de dados", "pt_pt"),
    equivalent("supervisory_authority", "apresentar reclamação a uma autoridade de controlo", "pt_pt"),
    direct("automated_decision_making_or_profiling", "decisões automatizadas com dados pessoais"),
    equivalent("automated_decision_making_or_profiling", "tratamento automatizado de dados pessoais"),
    equivalent("automated_decision_making_or_profiling", "elaboração de perfis com dados pessoais"),
  ]),
  ...ru([
    direct("controller_contact", "оператор персональных данных"),
    direct("controller_contact", "ответственный за обработку персональных данных"),
    equivalent("controller_contact", "контакт по вопросам защиты персональных данных"),
    direct("dpo_contact", "сотрудник по защите данных"),
    equivalent("dpo_contact", "должностное лицо по защите данных"),
    equivalent("dpo_contact", "контакт ответственного по защите данных"),
    direct("processing_purposes", "цели обработки персональных данных"),
    equivalent("processing_purposes", "обрабатываем персональные данные для"),
    equivalent("processing_purposes", "используем ваши персональные данные для"),
    direct("legal_basis", "правовые основания обработки персональных данных"),
    direct("legal_basis", "правовое основание для обработки персональных данных"),
    equivalent("legal_basis", "правовых основаниях обработки персональных данных", "inflected"),
    equivalent("legal_basis", "законный интерес при обработке персональных данных"),
    direct("recipients_or_vendor_categories", "получатели персональных данных"),
    equivalent("recipients_or_vendor_categories", "категории получателей персональных данных"),
    equivalent("recipients_or_vendor_categories", "третьи лица которым мы передаем персональные данные"),
    direct("data_retention", "срок хранения персональных данных"),
    equivalent("data_retention", "сроки хранения персональных данных", "inflected"),
    equivalent("data_retention", "сроках хранения персональных данных", "inflected"),
    equivalent("data_retention", "период хранения персональных данных"),
    equivalent("data_retention", "храним персональные данные столько сколько необходимо"),
    direct("data_subject_rights", "права субъекта персональных данных"),
    equivalent("data_subject_rights", "правами субъектов персональных данных", "inflected"),
    equivalent("data_subject_rights", "правах субъектов персональных данных", "inflected"),
    equivalent("data_subject_rights", "право на доступ к персональным данным"),
    equivalent("data_subject_rights", "право на удаление персональных данных"),
    direct("international_transfers", "трансграничная передача персональных данных"),
    equivalent("international_transfers", "трансграничную передачу персональных данных"),
    equivalent("international_transfers", "передача персональных данных за пределы европейской экономической зоны"),
    equivalent("international_transfers", "стандартные договорные положения для передачи персональных данных"),
    direct("supervisory_authority", "право подать жалобу в надзорный орган"),
    equivalent("supervisory_authority", "жалоба в орган по защите данных"),
    equivalent("supervisory_authority", "обратиться с жалобой в надзорный орган"),
    direct("automated_decision_making_or_profiling", "автоматизированное принятие решений с использованием персональных данных"),
    equivalent("automated_decision_making_or_profiling", "автоматизированная обработка персональных данных"),
    equivalent("automated_decision_making_or_profiling", "профилирование персональных данных"),
  ]),
  ...ja([
    direct("controller_contact", "個人データの管理者"),
    direct("controller_contact", "個人情報取扱事業者"),
    equivalent("controller_contact", "個人情報保護方針"),
    equivalent("controller_contact", "個人データ管理者への連絡先"),
    equivalent("controller_contact", "個人情報に関するお問い合わせ"),
    direct("dpo_contact", "データ保護責任者"),
    equivalent("dpo_contact", "データ保護責任者への連絡先"),
    equivalent("dpo_contact", "dpoへのお問い合わせ"),
    direct("processing_purposes", "個人データを処理する目的"),
    direct("processing_purposes", "個人情報の利用目的"),
    equivalent("processing_purposes", "利用目的の範囲内"),
    equivalent("processing_purposes", "以下の目的で個人データを利用します"),
    direct("legal_basis", "個人データ処理の法的根拠"),
    direct("legal_basis", "個人データを処理する法的根拠"),
    equivalent("legal_basis", "個人データ処理における正当な利益"),
    direct("recipients_or_vendor_categories", "個人データの受領者"),
    equivalent("recipients_or_vendor_categories", "個人データの受領者のカテゴリー"),
    equivalent("recipients_or_vendor_categories", "個人データを共有する第三者"),
    equivalent("recipients_or_vendor_categories", "個人情報の第三者提供"),
    direct("data_retention", "個人データの保存期間"),
    equivalent("data_retention", "個人情報の保有期間"),
    equivalent("data_retention", "必要な期間に限り個人データを保持します"),
    direct("data_subject_rights", "データ主体の権利"),
    equivalent("data_subject_rights", "個人データにアクセスする権利"),
    equivalent("data_subject_rights", "個人データの消去を求める権利"),
    equivalent("data_subject_rights", "個人情報の開示、訂正、削除"),
    direct("international_transfers", "個人データの国際移転"),
    equivalent("international_transfers", "欧州経済領域外への個人データの移転"),
    equivalent("international_transfers", "個人データ移転のための標準契約条項"),
    direct("supervisory_authority", "監督機関に苦情を申し立てる権利"),
    equivalent("supervisory_authority", "データ保護機関に苦情を申し立てる"),
    equivalent("supervisory_authority", "監督当局への苦情"),
    direct("automated_decision_making_or_profiling", "個人データを用いた自動意思決定"),
    equivalent("automated_decision_making_or_profiling", "個人データの自動処理"),
    equivalent("automated_decision_making_or_profiling", "個人データのプロファイリング"),
  ]),
  ...zh([
    direct("controller_contact", "个人数据控制者"),
    direct("controller_contact", "个人信息处理者"),
    equivalent("controller_contact", "个人数据控制者的联系方式"),
    direct("dpo_contact", "数据保护官"),
    equivalent("dpo_contact", "数据保护负责人的联系方式"),
    equivalent("dpo_contact", "联系数据保护官"),
    direct("processing_purposes", "处理个人数据的目的"),
    direct("processing_purposes", "处理个人信息的目的"),
    equivalent("processing_purposes", "我们出于以下目的使用您的个人数据"),
    direct("legal_basis", "处理个人数据的法律依据"),
    direct("legal_basis", "个人数据处理的法律基础"),
    equivalent("legal_basis", "处理个人数据的合法利益"),
    direct("recipients_or_vendor_categories", "个人数据的接收方"),
    equivalent("recipients_or_vendor_categories", "个人数据接收方的类别"),
    equivalent("recipients_or_vendor_categories", "与其共享个人数据的第三方"),
    direct("data_retention", "个人数据的保存期限"),
    equivalent("data_retention", "个人信息的保留期限"),
    equivalent("data_retention", "仅在必要期间保留个人数据"),
    direct("data_subject_rights", "数据主体的权利"),
    equivalent("data_subject_rights", "访问个人数据的权利"),
    equivalent("data_subject_rights", "删除个人数据的权利"),
    direct("international_transfers", "个人数据的跨境传输"),
    equivalent("international_transfers", "向欧洲经济区以外传输个人数据"),
    equivalent("international_transfers", "个人数据传输的标准合同条款"),
    direct("supervisory_authority", "向监管机构投诉的权利"),
    equivalent("supervisory_authority", "向数据保护机构提出投诉"),
    equivalent("supervisory_authority", "向监督机关投诉"),
    direct("automated_decision_making_or_profiling", "使用个人数据进行自动化决策"),
    equivalent("automated_decision_making_or_profiling", "个人数据的自动化处理"),
    equivalent("automated_decision_making_or_profiling", "对个人数据进行画像分析"),
    equivalent("controller_contact", "個人資料控制者", "zh_hant"),
    equivalent("dpo_contact", "資料保護長", "zh_hant"),
    equivalent("dpo_contact", "資料保護長的聯絡方式", "zh_hant"),
    equivalent("processing_purposes", "處理個人資料的目的", "zh_hant"),
    equivalent("legal_basis", "處理個人資料的法律依據", "zh_hant"),
    equivalent("recipients_or_vendor_categories", "個人資料接收者的類別", "zh_hant"),
    equivalent("data_retention", "個人資料的保存期限", "zh_hant"),
    equivalent("data_subject_rights", "資料當事人的權利", "zh_hant"),
    equivalent("international_transfers", "個人資料的跨境傳輸", "zh_hant"),
    equivalent("supervisory_authority", "向監管機構投訴的權利", "zh_hant"),
    equivalent("automated_decision_making_or_profiling", "使用個人資料進行自動化決策", "zh_hant"),
  ]),
  ...ar([
    direct("controller_contact", "مراقب البيانات الشخصية"),
    direct("controller_contact", "المتحكم في البيانات الشخصية"),
    equivalent("controller_contact", "بيانات الاتصال بمراقب البيانات"),
    direct("dpo_contact", "مسؤول حماية البيانات"),
    equivalent("dpo_contact", "بيانات الاتصال بمسؤول حماية البيانات"),
    equivalent("dpo_contact", "التواصل مع مسؤول حماية البيانات"),
    direct("processing_purposes", "أغراض معالجة البيانات الشخصية"),
    equivalent("processing_purposes", "نعالج بياناتك الشخصية من أجل"),
    equivalent("processing_purposes", "نستخدم بياناتك الشخصية للأغراض التالية"),
    direct("legal_basis", "الأساس القانوني لمعالجة البيانات الشخصية"),
    direct("legal_basis", "الأسس القانونية لمعالجة البيانات الشخصية"),
    equivalent("legal_basis", "المصلحة المشروعة في معالجة البيانات الشخصية"),
    direct("recipients_or_vendor_categories", "مستلمو البيانات الشخصية"),
    equivalent("recipients_or_vendor_categories", "فئات مستلمي البيانات الشخصية"),
    equivalent("recipients_or_vendor_categories", "الأطراف الثالثة التي نشارك معها البيانات الشخصية"),
    direct("data_retention", "مدة الاحتفاظ بالبيانات الشخصية"),
    equivalent("data_retention", "فترة الاحتفاظ بالبيانات الشخصية"),
    equivalent("data_retention", "نحتفظ بالبيانات الشخصية طالما كان ذلك ضروريا"),
    direct("data_subject_rights", "حقوق صاحب البيانات"),
    equivalent("data_subject_rights", "الحق في الوصول إلى البيانات الشخصية"),
    equivalent("data_subject_rights", "الحق في محو البيانات الشخصية"),
    direct("international_transfers", "النقل الدولي للبيانات الشخصية"),
    equivalent("international_transfers", "نقل البيانات الشخصية خارج المنطقة الاقتصادية الأوروبية"),
    equivalent("international_transfers", "البنود التعاقدية القياسية لنقل البيانات الشخصية"),
    direct("supervisory_authority", "الحق في تقديم شكوى إلى سلطة رقابية"),
    equivalent("supervisory_authority", "تقديم شكوى إلى هيئة حماية البيانات"),
    equivalent("supervisory_authority", "شكوى لدى السلطة الإشرافية"),
    direct("automated_decision_making_or_profiling", "اتخاذ القرارات الآلية باستخدام البيانات الشخصية"),
    equivalent("automated_decision_making_or_profiling", "المعالجة الآلية للبيانات الشخصية"),
    equivalent("automated_decision_making_or_profiling", "التنميط باستخدام البيانات الشخصية"),
  ]),
  ...sv([
    direct("controller_contact", "personuppgiftsansvarig"),
    direct("controller_contact", "kontaktuppgifter till den personuppgiftsansvarige"),
    equivalent("controller_contact", "kontakt för dataskyddsfrågor"),
    direct("dpo_contact", "dataskyddsombud"),
    equivalent("dpo_contact", "kontaktuppgifter till dataskyddsombudet"),
    equivalent("dpo_contact", "kontakta vårt dataskyddsombud"),
    direct("processing_purposes", "ändamålen med behandlingen av personuppgifter"),
    equivalent("processing_purposes", "behandlar personuppgifter för följande ändamål"),
    equivalent("processing_purposes", "använder dina personuppgifter för att"),
    direct("legal_basis", "rättslig grund för behandling av personuppgifter"),
    direct("legal_basis", "laglig grund för behandling av personuppgifter"),
    equivalent("legal_basis", "berättigat intresse för behandling av personuppgifter"),
    direct("recipients_or_vendor_categories", "mottagare av personuppgifter"),
    equivalent("recipients_or_vendor_categories", "kategorier av mottagare av personuppgifter"),
    equivalent("recipients_or_vendor_categories", "tredje parter som vi delar personuppgifter med"),
    direct("data_retention", "lagringstid för personuppgifter"),
    equivalent("data_retention", "personuppgifternas lagringstid", "definite_form"),
    equivalent("data_retention", "perioden som personuppgifterna sparas"),
    equivalent("data_retention", "sparar personuppgifter så länge som det är nödvändigt"),
    direct("data_subject_rights", "den registrerades rättigheter"),
    equivalent("data_subject_rights", "de registrerades rättigheter", "plural_definite_form"),
    equivalent("data_subject_rights", "rätt till tillgång till personuppgifter"),
    equivalent("data_subject_rights", "rätt till radering av personuppgifter"),
    direct("international_transfers", "internationella överföringar av personuppgifter"),
    equivalent("international_transfers", "personuppgifter utanför europeiska ekonomiska samarbetsområdet"),
    equivalent("international_transfers", "standardavtalsklausuler för överföring av personuppgifter"),
    direct("supervisory_authority", "rätt att lämna in klagomål till en tillsynsmyndighet"),
    equivalent("supervisory_authority", "klagomål till integritetsskyddsmyndigheten"),
    equivalent("supervisory_authority", "klaga hos en tillsynsmyndighet"),
    direct("automated_decision_making_or_profiling", "automatiserat beslutsfattande med personuppgifter"),
    equivalent("automated_decision_making_or_profiling", "automatiserad behandling av personuppgifter"),
    equivalent("automated_decision_making_or_profiling", "profilering av personuppgifter"),
  ]),
  ...ro([
    direct("controller_contact", "operatorul de date cu caracter personal"),
    equivalent("controller_contact", "datele de contact ale operatorului"),
    equivalent("controller_contact", "operatorul datelor cu caracter personal", "definite_form"),
    direct("dpo_contact", "responsabilul cu protecția datelor"),
    equivalent("dpo_contact", "datele de contact ale responsabilului cu protecția datelor"),
    equivalent("dpo_contact", "contacta responsabilul cu protecția datelor"),
    direct("processing_purposes", "scopurile prelucrării datelor cu caracter personal"),
    equivalent("processing_purposes", "prelucrăm datele cu caracter personal în următoarele scopuri"),
    direct("legal_basis", "temeiul juridic al prelucrării datelor cu caracter personal"),
    equivalent("legal_basis", "baza legală pentru prelucrarea datelor cu caracter personal"),
    direct("recipients_or_vendor_categories", "destinatarii datelor cu caracter personal"),
    equivalent("recipients_or_vendor_categories", "categoriile de destinatari ai datelor cu caracter personal"),
    direct("data_retention", "perioada de păstrare a datelor cu caracter personal"),
    equivalent("data_retention", "perioada pentru care vor fi stocate datele cu caracter personal"),
    direct("data_subject_rights", "drepturile persoanei vizate"),
    equivalent("data_subject_rights", "dreptul de acces la datele cu caracter personal"),
    direct("international_transfers", "transferuri internaționale de date cu caracter personal"),
    equivalent("international_transfers", "transferurile internaționale de date cu caracter personal", "definite_form"),
    equivalent("international_transfers", "transferul datelor cu caracter personal către o țară terță"),
    direct("supervisory_authority", "dreptul de a depune o plângere la o autoritate de supraveghere"),
    equivalent("supervisory_authority", "plângere în fața unei autorități de supraveghere"),
    direct("automated_decision_making_or_profiling", "proces decizional automatizat privind datele cu caracter personal"),
    equivalent("automated_decision_making_or_profiling", "procesul decizional automatizat privind datele cu caracter personal", "definite_form"),
    equivalent("automated_decision_making_or_profiling", "crearea de profiluri cu date cu caracter personal"),
  ]),
  ...cs([
    direct("controller_contact", "správce osobních údajů"),
    equivalent("controller_contact", "kontaktní údaje správce"),
    direct("dpo_contact", "pověřenec pro ochranu osobních údajů"),
    equivalent("dpo_contact", "kontaktní údaje pověřence pro ochranu osobních údajů"),
    equivalent("dpo_contact", "kontaktovat pověřence pro ochranu osobních údajů"),
    direct("processing_purposes", "účely zpracování osobních údajů"),
    equivalent("processing_purposes", "osobní údaje zpracováváme pro následující účely"),
    direct("legal_basis", "právní základ pro zpracování osobních údajů"),
    equivalent("legal_basis", "právní titul zpracování osobních údajů"),
    direct("recipients_or_vendor_categories", "příjemci osobních údajů"),
    equivalent("recipients_or_vendor_categories", "kategorie příjemců osobních údajů"),
    direct("data_retention", "doba uložení osobních údajů"),
    equivalent("data_retention", "dobu uložení osobních údajů", "accusative"),
    equivalent("data_retention", "doba uchovávání osobních údajů"),
    equivalent("data_retention", "dobu uchovávání osobních údajů", "accusative"),
    direct("data_subject_rights", "práva subjektu údajů"),
    equivalent("data_subject_rights", "právo na přístup k osobním údajům"),
    direct("international_transfers", "mezinárodní předávání osobních údajů"),
    equivalent("international_transfers", "předání osobních údajů do třetí země"),
    direct("supervisory_authority", "právo podat stížnost u dozorového úřadu"),
    equivalent("supervisory_authority", "stížnost k dozorovému úřadu"),
    direct("automated_decision_making_or_profiling", "automatizované rozhodování včetně profilování"),
    equivalent("automated_decision_making_or_profiling", "automatizované rozhodování s použitím osobních údajů"),
  ]),
  ...el([
    direct("controller_contact", "υπεύθυνος επεξεργασίας δεδομένων προσωπικού χαρακτήρα"),
    equivalent("controller_contact", "στοιχεία επικοινωνίας του υπευθύνου επεξεργασίας"),
    direct("dpo_contact", "υπεύθυνος προστασίας δεδομένων"),
    equivalent("dpo_contact", "στοιχεία επικοινωνίας του υπευθύνου προστασίας δεδομένων"),
    equivalent("dpo_contact", "επικοινωνήσετε με τον υπεύθυνο προστασίας δεδομένων"),
    direct("processing_purposes", "σκοπούς της επεξεργασίας δεδομένων προσωπικού χαρακτήρα"),
    equivalent("processing_purposes", "επεξεργαζόμαστε δεδομένα προσωπικού χαρακτήρα για τους ακόλουθους σκοπούς"),
    direct("legal_basis", "νομική βάση για την επεξεργασία δεδομένων προσωπικού χαρακτήρα"),
    equivalent("legal_basis", "νομική βάση της επεξεργασίας δεδομένων προσωπικού χαρακτήρα"),
    direct("recipients_or_vendor_categories", "αποδέκτες των δεδομένων προσωπικού χαρακτήρα"),
    equivalent("recipients_or_vendor_categories", "κατηγορίες αποδεκτών των δεδομένων προσωπικού χαρακτήρα"),
    direct("data_retention", "διάστημα αποθήκευσης των δεδομένων προσωπικού χαρακτήρα"),
    equivalent("data_retention", "περίοδο διατήρησης των δεδομένων προσωπικού χαρακτήρα", "official_inflection"),
    equivalent("data_retention", "περίοδος διατήρησης των δεδομένων προσωπικού χαρακτήρα"),
    direct("data_subject_rights", "δικαιώματα του υποκειμένου των δεδομένων"),
    equivalent("data_subject_rights", "δικαίωμα πρόσβασης στα δεδομένα προσωπικού χαρακτήρα"),
    direct("international_transfers", "διεθνείς διαβιβάσεις δεδομένων προσωπικού χαρακτήρα"),
    equivalent("international_transfers", "διαβίβαση δεδομένων προσωπικού χαρακτήρα σε τρίτη χώρα"),
    direct("supervisory_authority", "δικαίωμα υποβολής καταγγελίας σε εποπτική αρχή"),
    equivalent("supervisory_authority", "υποβάλει καταγγελία σε εποπτική αρχή"),
    direct("automated_decision_making_or_profiling", "αυτοματοποιημένη λήψη αποφάσεων με δεδομένα προσωπικού χαρακτήρα"),
    equivalent("automated_decision_making_or_profiling", "κατάρτιση προφίλ με δεδομένα προσωπικού χαρακτήρα"),
  ]),
  ...hu([
    direct("controller_contact", "személyes adatok adatkezelője"),
    equivalent("controller_contact", "az adatkezelő elérhetőségei"),
    direct("dpo_contact", "adatvédelmi tisztviselő"),
    equivalent("dpo_contact", "az adatvédelmi tisztviselő elérhetőségei"),
    equivalent("dpo_contact", "kapcsolatba léphet az adatvédelmi tisztviselővel"),
    direct("processing_purposes", "személyes adatok kezelésének célja"),
    equivalent("processing_purposes", "személyes adatok kezelésének célját", "accusative"),
    equivalent("processing_purposes", "személyes adatokat a következő célokból kezeljük"),
    direct("legal_basis", "adatkezelés jogalapja"),
    equivalent("legal_basis", "személyes adatok kezelésének jogalapja"),
    equivalent("legal_basis", "adatkezelés jogalapját", "accusative"),
    direct("recipients_or_vendor_categories", "személyes adatok címzettjei"),
    equivalent("recipients_or_vendor_categories", "személyes adatok címzettjeinek kategóriái"),
    equivalent("recipients_or_vendor_categories", "személyes adatok címzettjeinek kategóriáit", "accusative"),
    direct("data_retention", "személyes adatok tárolásának időtartama"),
    equivalent("data_retention", "személyes adatok tárolásának időtartamát", "accusative"),
    equivalent("data_retention", "személyes adatok megőrzési ideje"),
    direct("data_subject_rights", "érintett jogai"),
    equivalent("data_subject_rights", "érintett jogait", "accusative"),
    equivalent("data_subject_rights", "személyes adatokhoz való hozzáférés joga"),
    direct("international_transfers", "személyes adatok nemzetközi továbbítása"),
    equivalent("international_transfers", "személyes adatok nemzetközi továbbítását", "accusative"),
    equivalent("international_transfers", "személyes adatok harmadik országba történő továbbítása"),
    direct("supervisory_authority", "panasz benyújtásának joga valamely felügyeleti hatósághoz"),
    equivalent("supervisory_authority", "panasz benyújtásának jogát valamely felügyeleti hatósághoz", "accusative"),
    equivalent("supervisory_authority", "panaszt tehet a felügyeleti hatóságnál"),
    direct("automated_decision_making_or_profiling", "automatizált döntéshozatal személyes adatok felhasználásával"),
    equivalent("automated_decision_making_or_profiling", "automatizált döntéshozatal ideértve a profilalkotást"),
    equivalent("automated_decision_making_or_profiling", "személyes adatok felhasználásával történő automatizált döntéshozatalt", "accusative"),
  ]),
  ...da([
    direct("controller_contact", "den dataansvarlige"),
    equivalent("controller_contact", "kontaktoplysninger for den dataansvarlige"),
    direct("dpo_contact", "databeskyttelsesrådgiver"),
    equivalent("dpo_contact", "kontaktoplysninger for databeskyttelsesrådgiveren"),
    equivalent("dpo_contact", "kontakte vores databeskyttelsesrådgiver"),
    direct("processing_purposes", "formålene med behandlingen af personoplysninger"),
    equivalent("processing_purposes", "behandler personoplysninger til følgende formål"),
    direct("legal_basis", "retsgrundlaget for behandlingen af personoplysninger"),
    equivalent("legal_basis", "retsgrundlag for behandling af personoplysninger"),
    direct("recipients_or_vendor_categories", "modtagere af personoplysninger"),
    equivalent("recipients_or_vendor_categories", "kategorier af modtagere af personoplysninger"),
    direct("data_retention", "opbevaringsperiode for personoplysninger"),
    equivalent("data_retention", "opbevaringsperioden for personoplysninger", "definite_form"),
    equivalent("data_retention", "det tidsrum personoplysningerne vil blive opbevaret"),
    direct("data_subject_rights", "den registreredes rettigheder"),
    equivalent("data_subject_rights", "ret til indsigt i personoplysninger"),
    direct("international_transfers", "internationale overførsler af personoplysninger"),
    equivalent("international_transfers", "overføre personoplysninger til et tredjeland"),
    direct("supervisory_authority", "ret til at indgive en klage til en tilsynsmyndighed"),
    equivalent("supervisory_authority", "retten til at indgive en klage til en tilsynsmyndighed", "definite_form"),
    equivalent("supervisory_authority", "klage til datatilsynet"),
    direct("automated_decision_making_or_profiling", "automatiserede afgørelser med personoplysninger"),
    equivalent("automated_decision_making_or_profiling", "automatiserede afgørelser herunder profilering"),
  ]),
  ...fi([
    direct("controller_contact", "rekisterinpitäjä"),
    equivalent("controller_contact", "rekisterinpitäjän yhteystiedot"),
    direct("dpo_contact", "tietosuojavastaava"),
    equivalent("dpo_contact", "tietosuojavastaavan yhteystiedot"),
    equivalent("dpo_contact", "ottaa yhteyttä tietosuojavastaavaan"),
    direct("processing_purposes", "henkilötietojen käsittelyn tarkoitukset"),
    equivalent("processing_purposes", "käsittelemme henkilötietoja seuraaviin tarkoituksiin"),
    direct("legal_basis", "henkilötietojen käsittelyn oikeusperuste"),
    equivalent("legal_basis", "henkilötietojen käsittelyn oikeusperusteen", "inflected"),
    equivalent("legal_basis", "käsittelyn oikeusperuste"),
    direct("recipients_or_vendor_categories", "henkilötietojen vastaanottajat"),
    equivalent("recipients_or_vendor_categories", "henkilötietojen vastaanottajaryhmät"),
    direct("data_retention", "henkilötietojen säilytysaika"),
    equivalent("data_retention", "henkilötietojen säilytysajan", "inflected"),
    equivalent("data_retention", "henkilötietojen säilytyksen kesto"),
    direct("data_subject_rights", "rekisteröidyn oikeudet"),
    equivalent("data_subject_rights", "oikeus saada pääsy henkilötietoihin"),
    direct("international_transfers", "henkilötietojen kansainväliset siirrot"),
    equivalent("international_transfers", "henkilötietojen siirto kolmanteen maahan"),
    direct("supervisory_authority", "oikeus tehdä valitus valvontaviranomaiselle"),
    equivalent("supervisory_authority", "oikeuden tehdä valitus valvontaviranomaiselle", "inflected"),
    equivalent("supervisory_authority", "valitus tietosuojaviranomaiselle"),
    direct("automated_decision_making_or_profiling", "automatisoitu päätöksenteko mukaan lukien profilointi"),
    equivalent("automated_decision_making_or_profiling", "automatisoidun päätöksenteon mukaan lukien profilointi", "inflected"),
    equivalent("automated_decision_making_or_profiling", "automatisoidut päätökset henkilötietojen perusteella"),
  ]),
  ...sk([
    direct("controller_contact", "prevádzkovateľ osobných údajov"),
    equivalent("controller_contact", "kontaktné údaje prevádzkovateľa"),
    direct("dpo_contact", "zodpovedná osoba pre ochranu osobných údajov"),
    equivalent("dpo_contact", "kontaktné údaje zodpovednej osoby"),
    equivalent("dpo_contact", "kontaktovať zodpovednú osobu"),
    direct("processing_purposes", "účely spracúvania osobných údajov"),
    equivalent("processing_purposes", "osobné údaje spracúvame na tieto účely"),
    direct("legal_basis", "právny základ spracúvania osobných údajov"),
    equivalent("legal_basis", "právny základ spracovania osobných údajov"),
    direct("recipients_or_vendor_categories", "príjemcovia osobných údajov"),
    equivalent("recipients_or_vendor_categories", "kategórie príjemcov osobných údajov"),
    direct("data_retention", "doba uchovávania osobných údajov"),
    equivalent("data_retention", "dobu uchovávania osobných údajov", "accusative"),
    equivalent("data_retention", "lehota uchovávania osobných údajov"),
    direct("data_subject_rights", "práva dotknutej osoby"),
    equivalent("data_subject_rights", "právo na prístup k osobným údajom"),
    direct("international_transfers", "medzinárodné prenosy osobných údajov"),
    equivalent("international_transfers", "prenos osobných údajov do tretej krajiny"),
    direct("supervisory_authority", "právo podať sťažnosť dozornému orgánu"),
    equivalent("supervisory_authority", "sťažnosť dozornému orgánu"),
    direct("automated_decision_making_or_profiling", "automatizované rozhodovanie vrátane profilovania"),
    equivalent("automated_decision_making_or_profiling", "automatizované rozhodovanie s osobnými údajmi"),
  ]),
  ...bg([
    direct("controller_contact", "администратор на лични данни"),
    equivalent("controller_contact", "данни за контакт на администратора"),
    equivalent("controller_contact", "данните за контакт на администратора", "definite_form"),
    direct("dpo_contact", "длъжностно лице по защита на данните"),
    equivalent("dpo_contact", "данни за контакт на длъжностното лице по защита на данните"),
    equivalent("dpo_contact", "данните за контакт на длъжностното лице по защита на данните", "definite_form"),
    equivalent("dpo_contact", "свържете се с длъжностното лице по защита на данните"),
    direct("processing_purposes", "целите на обработването на лични данни"),
    equivalent("processing_purposes", "обработваме лични данни за следните цели"),
    direct("legal_basis", "правното основание за обработването на лични данни"),
    equivalent("legal_basis", "правно основание за обработване на лични данни"),
    direct("recipients_or_vendor_categories", "получателите на лични данни"),
    equivalent("recipients_or_vendor_categories", "категориите получатели на лични данни"),
    direct("data_retention", "срокът за съхранение на личните данни"),
    equivalent("data_retention", "срока за съхранение на личните данни", "oblique_form"),
    equivalent("data_retention", "периодът на съхранение на личните данни"),
    direct("data_subject_rights", "правата на субекта на данните"),
    equivalent("data_subject_rights", "право на достъп до личните данни"),
    direct("international_transfers", "международно предаване на лични данни"),
    equivalent("international_transfers", "международното предаване на лични данни", "definite_form"),
    equivalent("international_transfers", "предаване на лични данни на трета държава"),
    direct("supervisory_authority", "право на жалба до надзорен орган"),
    equivalent("supervisory_authority", "правото на жалба до надзорен орган", "definite_form"),
    equivalent("supervisory_authority", "подаде жалба до надзорен орган"),
    direct("automated_decision_making_or_profiling", "автоматизирано вземане на решения включително профилиране"),
    equivalent("automated_decision_making_or_profiling", "автоматизираното вземане на решения включително профилиране", "definite_form"),
    equivalent("automated_decision_making_or_profiling", "автоматизирани решения с лични данни"),
  ]),
  ...hr([
    direct("controller_contact", "voditelj obrade osobnih podataka"),
    equivalent("controller_contact", "kontaktni podaci voditelja obrade"),
    direct("dpo_contact", "službenik za zaštitu podataka"),
    equivalent("dpo_contact", "kontaktni podaci službenika za zaštitu podataka"),
    equivalent("dpo_contact", "kontaktirati službenika za zaštitu podataka"),
    direct("processing_purposes", "svrhe obrade osobnih podataka"),
    equivalent("processing_purposes", "osobne podatke obrađujemo u sljedeće svrhe"),
    direct("legal_basis", "pravna osnova za obradu osobnih podataka"),
    equivalent("legal_basis", "pravnu osnovu za obradu osobnih podataka", "accusative"),
    equivalent("legal_basis", "pravni temelj obrade osobnih podataka"),
    direct("recipients_or_vendor_categories", "primatelji osobnih podataka"),
    equivalent("recipients_or_vendor_categories", "kategorije primatelja osobnih podataka"),
    direct("data_retention", "razdoblje pohrane osobnih podataka"),
    equivalent("data_retention", "rok čuvanja osobnih podataka"),
    direct("data_subject_rights", "prava ispitanika"),
    equivalent("data_subject_rights", "pravo na pristup osobnim podacima"),
    direct("international_transfers", "međunarodni prijenosi osobnih podataka"),
    equivalent("international_transfers", "međunarodne prijenose osobnih podataka", "accusative"),
    equivalent("international_transfers", "prijenos osobnih podataka u treću zemlju"),
    direct("supervisory_authority", "pravo na podnošenje pritužbe nadzornom tijelu"),
    equivalent("supervisory_authority", "pritužba nadzornom tijelu"),
    direct("automated_decision_making_or_profiling", "automatizirano donošenje odluka uključujući izradu profila"),
    equivalent("automated_decision_making_or_profiling", "automatizirane odluke s osobnim podacima"),
  ]),
  ...nb([
    direct("controller_contact", "behandlingsansvarlig for personopplysninger"),
    equivalent("controller_contact", "kontaktopplysninger til den behandlingsansvarlige"),
    direct("dpo_contact", "personvernombud"),
    equivalent("dpo_contact", "personvernombudets kontaktopplysninger"),
    equivalent("dpo_contact", "kontakte personvernombudet"),
    direct("processing_purposes", "formålene med behandlingen av personopplysninger"),
    equivalent("processing_purposes", "behandler personopplysninger for følgende formål"),
    direct("legal_basis", "rettslig grunnlag for behandling av personopplysninger"),
    equivalent("legal_basis", "behandlingens rettslige grunnlag"),
    direct("recipients_or_vendor_categories", "mottakere av personopplysninger"),
    equivalent("recipients_or_vendor_categories", "kategorier av mottakere av personopplysninger"),
    direct("data_retention", "lagringsperiode for personopplysninger"),
    equivalent("data_retention", "hvor lenge personopplysningene lagres"),
    direct("data_subject_rights", "den registrertes rettigheter"),
    equivalent("data_subject_rights", "rett til innsyn i personopplysninger"),
    direct("international_transfers", "internasjonale overføringer av personopplysninger"),
    equivalent("international_transfers", "overføring av personopplysninger til et tredjeland"),
    direct("supervisory_authority", "rett til å klage til en tilsynsmyndighet"),
    equivalent("supervisory_authority", "klage til datatilsynet"),
    direct("automated_decision_making_or_profiling", "automatiserte avgjørelser herunder profilering"),
    equivalent("automated_decision_making_or_profiling", "automatiserte avgjørelser med personopplysninger"),
  ]),
  ...sl([
    direct("controller_contact", "upravljavec osebnih podatkov"),
    equivalent("controller_contact", "kontaktni podatki upravljavca"),
    direct("dpo_contact", "pooblaščena oseba za varstvo podatkov"),
    equivalent("dpo_contact", "kontaktni podatki pooblaščene osebe za varstvo podatkov"),
    equivalent("dpo_contact", "stopite v stik s pooblaščeno osebo za varstvo podatkov"),
    direct("processing_purposes", "nameni obdelave osebnih podatkov"),
    equivalent("processing_purposes", "namene obdelave osebnih podatkov", "accusative"),
    equivalent("processing_purposes", "osebne podatke obdelujemo za naslednje namene"),
    direct("legal_basis", "pravna podlaga za obdelavo osebnih podatkov"),
    equivalent("legal_basis", "pravno podlago za obdelavo osebnih podatkov", "accusative"),
    equivalent("legal_basis", "pravni temelj obdelave osebnih podatkov"),
    direct("recipients_or_vendor_categories", "prejemniki osebnih podatkov"),
    equivalent("recipients_or_vendor_categories", "kategorije prejemnikov osebnih podatkov"),
    direct("data_retention", "obdobje hrambe osebnih podatkov"),
    equivalent("data_retention", "čas hrambe osebnih podatkov"),
    direct("data_subject_rights", "pravice posameznika na katerega se nanašajo osebni podatki"),
    equivalent("data_subject_rights", "pravica do dostopa do osebnih podatkov"),
    direct("international_transfers", "mednarodni prenosi osebnih podatkov"),
    equivalent("international_transfers", "mednarodne prenose osebnih podatkov", "accusative"),
    equivalent("international_transfers", "prenos osebnih podatkov v tretjo državo"),
    direct("supervisory_authority", "pravica do vložitve pritožbe pri nadzornem organu"),
    equivalent("supervisory_authority", "pravico do vložitve pritožbe pri nadzornem organu", "accusative"),
    equivalent("supervisory_authority", "pritožba nadzornemu organu"),
    direct("automated_decision_making_or_profiling", "avtomatizirano sprejemanje odločitev vključno z oblikovanjem profilov"),
    equivalent("automated_decision_making_or_profiling", "avtomatizirane odločitve z osebnimi podatki"),
  ]),
  ...lt([
    direct("controller_contact", "asmens duomenų valdytojas"),
    equivalent("controller_contact", "duomenų valdytojo kontaktiniai duomenys"),
    direct("dpo_contact", "duomenų apsaugos pareigūnas"),
    equivalent("dpo_contact", "duomenų apsaugos pareigūno kontaktiniai duomenys"),
    equivalent("dpo_contact", "susisiekti su duomenų apsaugos pareigūnu"),
    direct("processing_purposes", "asmens duomenų tvarkymo tikslai"),
    equivalent("processing_purposes", "asmens duomenų tvarkymo tikslus", "accusative"),
    equivalent("processing_purposes", "asmens duomenis tvarkome šiais tikslais"),
    direct("legal_basis", "teisinis asmens duomenų tvarkymo pagrindas"),
    equivalent("legal_basis", "teisinį asmens duomenų tvarkymo pagrindą", "accusative"),
    equivalent("legal_basis", "duomenų tvarkymo teisinis pagrindas"),
    direct("recipients_or_vendor_categories", "asmens duomenų gavėjai"),
    equivalent("recipients_or_vendor_categories", "asmens duomenų gavėjų kategorijos"),
    equivalent("recipients_or_vendor_categories", "asmens duomenų gavėjų kategorijas", "accusative"),
    direct("data_retention", "asmens duomenų saugojimo laikotarpis"),
    equivalent("data_retention", "asmens duomenų saugojimo laikotarpį", "accusative"),
    equivalent("data_retention", "asmens duomenų saugojimo trukmė"),
    direct("data_subject_rights", "duomenų subjekto teisės"),
    equivalent("data_subject_rights", "teisė susipažinti su asmens duomenimis"),
    direct("international_transfers", "tarptautinis asmens duomenų perdavimas"),
    equivalent("international_transfers", "tarptautinį asmens duomenų perdavimą", "accusative"),
    equivalent("international_transfers", "asmens duomenų perdavimas į trečiąją valstybę"),
    direct("supervisory_authority", "teisė pateikti skundą priežiūros institucijai"),
    equivalent("supervisory_authority", "skundas valstybinei duomenų apsaugos inspekcijai"),
    direct("automated_decision_making_or_profiling", "automatizuotas sprendimų priėmimas įskaitant profiliavimą"),
    equivalent("automated_decision_making_or_profiling", "automatizuotą sprendimų priėmimą įskaitant profiliavimą", "accusative"),
    equivalent("automated_decision_making_or_profiling", "automatizuoti sprendimai naudojant asmens duomenis"),
  ]),
  ...lv([
    direct("controller_contact", "personas datu pārzinis"),
    equivalent("controller_contact", "pārziņa kontaktinformācija"),
    direct("dpo_contact", "datu aizsardzības speciālists"),
    equivalent("dpo_contact", "datu aizsardzības speciālista kontaktinformācija"),
    equivalent("dpo_contact", "sazināties ar datu aizsardzības speciālistu"),
    direct("processing_purposes", "personas datu apstrādes nolūki"),
    equivalent("processing_purposes", "personas datu apstrādes nolūkus", "accusative"),
    equivalent("processing_purposes", "personas datus apstrādājam šādiem nolūkiem"),
    direct("legal_basis", "personas datu apstrādes juridiskais pamats"),
    equivalent("legal_basis", "personas datu apstrādes juridisko pamatu", "accusative"),
    equivalent("legal_basis", "apstrādes tiesiskais pamats"),
    direct("recipients_or_vendor_categories", "personas datu saņēmēji"),
    equivalent("recipients_or_vendor_categories", "personas datu saņēmēju kategorijas"),
    direct("data_retention", "personas datu glabāšanas laikposms"),
    equivalent("data_retention", "personas datu glabāšanas laikposmu", "accusative"),
    equivalent("data_retention", "personas datu glabāšanas termiņš"),
    direct("data_subject_rights", "datu subjekta tiesības"),
    equivalent("data_subject_rights", "tiesības piekļūt personas datiem"),
    direct("international_transfers", "personas datu starptautiska nosūtīšana"),
    equivalent("international_transfers", "personas datu starptautisku nosūtīšanu", "accusative"),
    equivalent("international_transfers", "personas datu nosūtīšana uz trešo valsti"),
    direct("supervisory_authority", "tiesības iesniegt sūdzību uzraudzības iestādei"),
    equivalent("supervisory_authority", "sūdzība datu valsts inspekcijai"),
    direct("automated_decision_making_or_profiling", "automatizēta lēmumu pieņemšana tostarp profilēšana"),
    equivalent("automated_decision_making_or_profiling", "automatizētu lēmumu pieņemšanu tostarp profilēšanu", "accusative"),
    equivalent("automated_decision_making_or_profiling", "automatizēti lēmumi ar personas datiem"),
  ]),
  ...et([
    direct("controller_contact", "isikuandmete vastutav töötleja"),
    equivalent("controller_contact", "vastutava töötleja kontaktandmed"),
    direct("dpo_contact", "andmekaitsespetsialist"),
    equivalent("dpo_contact", "andmekaitsespetsialisti kontaktandmed"),
    equivalent("dpo_contact", "võtta ühendust andmekaitsespetsialistiga"),
    direct("processing_purposes", "isikuandmete töötlemise eesmärgid"),
    equivalent("processing_purposes", "isikuandmete töötlemise eesmärke", "partitive"),
    equivalent("processing_purposes", "töötleme isikuandmeid järgmistel eesmärkidel"),
    direct("legal_basis", "isikuandmete töötlemise õiguslik alus"),
    equivalent("legal_basis", "isikuandmete töötlemise õiguslikku alust", "partitive"),
    equivalent("legal_basis", "töötlemise õiguslik alus"),
    direct("recipients_or_vendor_categories", "isikuandmete vastuvõtjad"),
    equivalent("recipients_or_vendor_categories", "isikuandmete vastuvõtjate kategooriad"),
    equivalent("recipients_or_vendor_categories", "isikuandmete vastuvõtjate kategooriaid", "partitive"),
    direct("data_retention", "isikuandmete säilitamise ajavahemik"),
    equivalent("data_retention", "isikuandmete säilitamise ajavahemikku", "partitive"),
    equivalent("data_retention", "isikuandmete säilitamise tähtaeg"),
    direct("data_subject_rights", "andmesubjekti õigused"),
    equivalent("data_subject_rights", "andmesubjekti õigusi", "partitive"),
    equivalent("data_subject_rights", "õigus tutvuda isikuandmetega"),
    direct("international_transfers", "isikuandmete rahvusvaheline edastamine"),
    equivalent("international_transfers", "isikuandmete rahvusvahelist edastamist", "partitive"),
    equivalent("international_transfers", "isikuandmete edastamine kolmandasse riiki"),
    direct("supervisory_authority", "õigus esitada kaebus järelevalveasutusele"),
    equivalent("supervisory_authority", "õigust esitada kaebus järelevalveasutusele", "partitive"),
    equivalent("supervisory_authority", "kaebus andmekaitse inspektsioonile"),
    direct("automated_decision_making_or_profiling", "automatiseeritud otsuste tegemine sealhulgas profiilianalüüs"),
    equivalent("automated_decision_making_or_profiling", "automatiseeritud otsuste tegemist sealhulgas profiilianalüüsi", "partitive"),
    equivalent("automated_decision_making_or_profiling", "automatiseeritud otsused isikuandmetega"),
  ]),
  ...uk([
    direct("controller_contact", "володілець персональних даних"),
    equivalent("controller_contact", "контактні дані володільця персональних даних"),
    equivalent("controller_contact", "контролер персональних даних"),
    direct("dpo_contact", "відповідальна особа із захисту даних"),
    equivalent("dpo_contact", "контактні дані відповідальної особи із захисту даних"),
    equivalent("dpo_contact", "зв'язатися з уповноваженим із захисту даних"),
    direct("processing_purposes", "цілі обробки персональних даних"),
    equivalent("processing_purposes", "обробляємо персональні дані для таких цілей"),
    direct("legal_basis", "правова підстава для обробки персональних даних"),
    equivalent("legal_basis", "правову підставу для обробки персональних даних", "accusative"),
    equivalent("legal_basis", "правові підстави обробки персональних даних"),
    direct("recipients_or_vendor_categories", "одержувачі персональних даних"),
    equivalent("recipients_or_vendor_categories", "категорії одержувачів персональних даних"),
    direct("data_retention", "строк зберігання персональних даних"),
    equivalent("data_retention", "період зберігання персональних даних"),
    direct("data_subject_rights", "права суб'єкта персональних даних"),
    equivalent("data_subject_rights", "право на доступ до персональних даних"),
    direct("international_transfers", "міжнародна передача персональних даних"),
    equivalent("international_transfers", "міжнародну передачу персональних даних", "accusative"),
    equivalent("international_transfers", "передача персональних даних до третьої країни"),
    direct("supervisory_authority", "право подати скаргу до наглядового органу"),
    equivalent("supervisory_authority", "скарга до органу із захисту даних"),
    direct("automated_decision_making_or_profiling", "автоматизоване прийняття рішень включаючи профілювання"),
    equivalent("automated_decision_making_or_profiling", "автоматизовані рішення з використанням персональних даних"),
  ]),
  ...tr([
    direct("controller_contact", "kişisel veri sorumlusu"),
    equivalent("controller_contact", "veri sorumlusunun iletişim bilgileri"),
    direct("dpo_contact", "veri koruma görevlisi"),
    equivalent("dpo_contact", "veri koruma görevlisinin iletişim bilgileri"),
    equivalent("dpo_contact", "veri koruma görevlisiyle iletişime geçin"),
    direct("processing_purposes", "kişisel verilerin işlenme amaçları"),
    equivalent("processing_purposes", "kişisel verilerin işlenme amaçlarını", "accusative"),
    equivalent("processing_purposes", "kişisel verileri aşağıdaki amaçlarla işliyoruz"),
    direct("legal_basis", "kişisel verilerin işlenmesinin hukuki dayanağı"),
    equivalent("legal_basis", "kişisel verilerin işlenmesinin hukuki dayanağını", "accusative"),
    equivalent("legal_basis", "kişisel verilerin işlenmesinin hukuki sebebi"),
    direct("recipients_or_vendor_categories", "kişisel verilerin alıcıları"),
    equivalent("recipients_or_vendor_categories", "kişisel veri alıcılarının kategorileri"),
    equivalent("recipients_or_vendor_categories", "kişisel veri alıcılarının kategorilerini", "accusative"),
    direct("data_retention", "kişisel verilerin saklama süresi"),
    equivalent("data_retention", "kişisel verilerin saklama süresini", "accusative"),
    equivalent("data_retention", "kişisel verilerin muhafaza süresi"),
    direct("data_subject_rights", "ilgili kişinin hakları"),
    equivalent("data_subject_rights", "ilgili kişinin haklarını", "accusative"),
    equivalent("data_subject_rights", "kişisel verilere erişim hakkı"),
    direct("international_transfers", "kişisel verilerin uluslararası aktarımı"),
    equivalent("international_transfers", "kişisel verilerin uluslararası aktarımını", "accusative"),
    equivalent("international_transfers", "kişisel verilerin yurt dışına aktarılması"),
    direct("supervisory_authority", "denetim makamına şikayette bulunma hakkı"),
    equivalent("supervisory_authority", "denetim makamına şikayette bulunma hakkını", "accusative"),
    equivalent("supervisory_authority", "kişisel verileri koruma kuruluna şikayet"),
    direct("automated_decision_making_or_profiling", "otomatik karar verme ve profilleme"),
    equivalent("automated_decision_making_or_profiling", "otomatik karar verme ve profillemeyi", "accusative"),
    equivalent("automated_decision_making_or_profiling", "kişisel verilerle otomatik karar alma"),
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
  const privacyDisclosureContext = hasPrivacyDisclosureContext(normalizedText);
  const matches = matchedGdprTransparencyPhraseIndexes(normalizedText)
    .map((index) => NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES[index])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter(({ term }) => localeHints.size === 0 || localeHints.has(term.locale))
    .map(({ normalizedPhrase, term }) => ({
      term,
      score: phraseScore({
        normalizedPhrase,
        privacyDisclosureContext,
        term,
      }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      strengthRank(right.term.strength) - strengthRank(left.term.strength) ||
      right.term.phrase.length - left.term.phrase.length
    );
  const evidenceSourceText = matches.length > 0 ? decodedEvidenceText(input.text ?? "") : "";
  const evidenceSearchIndex = evidenceSourceText ? buildEvidenceSearchIndex(evidenceSourceText) : undefined;

  const selected = new Map<GdprTransparencyTopic, GdprTransparencyTopicMatch>();
  for (const { term } of matches) {
    if (selected.has(term.topic)) {
      continue;
    }
    selected.set(term.topic, {
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      confidence: confidenceFor(term),
      evidenceExcerpt: boundedEvidenceExcerptFromIndex(evidenceSourceText, evidenceSearchIndex, term.phrase),
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
    .replace(/[.,;:!?()[\]{}。、，；：！？（）،؛؟]+/g, " ")
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

function direct(topic: GdprTransparencyTopic, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "direct", topic, variant };
}

function equivalent(topic: GdprTransparencyTopic, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "equivalent", topic, variant };
}

const NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES = GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY.map((term) => {
  const normalizedPhrase = normalizeGdprTransparencyText(term.phrase);
  return {
    boundarylessScript: usesBoundarylessScript(normalizedPhrase),
    normalizedPhrase,
    term,
    usesArabic: usesArabicScript(normalizedPhrase),
  };
});

type GdprTransparencyPhraseTrieNode = {
  failure: number;
  next: Map<string, number>;
  outputs: number[];
};

const GDPR_TRANSPARENCY_PHRASE_TRIE = buildGdprTransparencyPhraseTrie();

function phraseScore(input: {
  normalizedPhrase: string;
  privacyDisclosureContext: boolean;
  term: GdprTransparencyTopicPhrase;
}): number {
  if (input.term.variant === "requires_privacy_context" && !input.privacyDisclosureContext) {
    return 0;
  }
  return 600 + input.normalizedPhrase.length + strengthRank(input.term.strength) * 80;
}

function hasPrivacyDisclosureContext(normalizedText: string) {
  return /\b(?:privacy|gdpr|dati personali|protezione dei dati|titolare del trattamento|responsabili? del trattamento|diritti degli interessati|articolo (?:6|13|28|44))\b/i.test(normalizedText);
}

function usesBoundarylessScript(value: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function usesArabicScript(value: string) {
  return /\p{Script=Arabic}/u.test(value);
}

function buildGdprTransparencyPhraseTrie(): GdprTransparencyPhraseTrieNode[] {
  const nodes: GdprTransparencyPhraseTrieNode[] = [{ failure: 0, next: new Map(), outputs: [] }];
  NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES.forEach(({ normalizedPhrase }, phraseIndex) => {
    if (!normalizedPhrase) return;
    let nodeIndex = 0;
    for (const character of normalizedPhrase) {
      let nextIndex = nodes[nodeIndex]?.next.get(character);
      if (nextIndex === undefined) {
        nextIndex = nodes.length;
        nodes[nodeIndex]?.next.set(character, nextIndex);
        nodes.push({ failure: 0, next: new Map(), outputs: [] });
      }
      nodeIndex = nextIndex;
    }
    nodes[nodeIndex]?.outputs.push(phraseIndex);
  });

  const queue: number[] = [];
  for (const childIndex of nodes[0]?.next.values() ?? []) {
    queue.push(childIndex);
  }
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const nodeIndex = queue[queueIndex];
    const node = nodeIndex === undefined ? undefined : nodes[nodeIndex];
    if (!node) continue;
    for (const [character, childIndex] of node.next) {
      queue.push(childIndex);
      let failureIndex = node.failure;
      while (failureIndex !== 0 && !nodes[failureIndex]?.next.has(character)) {
        failureIndex = nodes[failureIndex]?.failure ?? 0;
      }
      const fallback = nodes[failureIndex]?.next.get(character);
      nodes[childIndex]!.failure = fallback !== undefined && fallback !== childIndex ? fallback : 0;
      nodes[childIndex]!.outputs.push(...(nodes[nodes[childIndex]!.failure]?.outputs ?? []));
    }
  }
  return nodes;
}

function matchedGdprTransparencyPhraseIndexes(normalizedText: string): number[] {
  const matched = new Set<number>();
  let nodeIndex = 0;
  let codeUnitOffset = 0;
  for (const character of normalizedText) {
    while (nodeIndex !== 0 && !GDPR_TRANSPARENCY_PHRASE_TRIE[nodeIndex]?.next.has(character)) {
      nodeIndex = GDPR_TRANSPARENCY_PHRASE_TRIE[nodeIndex]?.failure ?? 0;
    }
    nodeIndex = GDPR_TRANSPARENCY_PHRASE_TRIE[nodeIndex]?.next.get(character) ?? 0;
    const matchEnd = codeUnitOffset + character.length;
    for (const phraseIndex of GDPR_TRANSPARENCY_PHRASE_TRIE[nodeIndex]?.outputs ?? []) {
      const entry = NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES[phraseIndex];
      if (!entry) continue;
      const matchStart = matchEnd - entry.normalizedPhrase.length;
      if (gdprTransparencyPhraseBoundaryMatches(normalizedText, matchStart, matchEnd, entry)) {
        matched.add(phraseIndex);
      }
    }
    codeUnitOffset = matchEnd;
  }
  return [...matched];
}

function gdprTransparencyPhraseBoundaryMatches(
  normalizedText: string,
  matchStart: number,
  matchEnd: number,
  entry: (typeof NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES)[number],
): boolean {
  if (entry.boundarylessScript) {
    return [...entry.normalizedPhrase].length >= 4;
  }
  const afterMatches = matchEnd === normalizedText.length || normalizedText[matchEnd] === " ";
  if (!afterMatches) return false;
  if (matchStart === 0 || normalizedText[matchStart - 1] === " ") return true;
  if (!entry.usesArabic || [...entry.normalizedPhrase].length < 8) return false;
  const precedingCharacter = normalizedText[matchStart - 1];
  return precedingCharacter !== undefined &&
    ["و", "ف", "ب", "ك", "ل"].includes(precedingCharacter) &&
    (matchStart === 1 || normalizedText[matchStart - 2] === " ");
}

function arabicCliticIndex(normalizedValue: string, phrase: string): number {
  if ([...phrase].length < 8) return -1;
  for (const clitic of ["و", "ف", "ب", "ك", "ل"]) {
    const cliticPhrase = `${clitic}${phrase}`;
    let index = normalizedValue.indexOf(cliticPhrase);
    while (index >= 0) {
      const afterIndex = index + cliticPhrase.length;
      if (
        (index === 0 || normalizedValue[index - 1] === " ") &&
        (afterIndex === normalizedValue.length || normalizedValue[afterIndex] === " ")
      ) {
        return index;
      }
      index = normalizedValue.indexOf(cliticPhrase, index + 1);
    }
  }
  return -1;
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

function boundedEvidenceExcerptFromIndex(
  sourceText: string,
  searchIndex: ReturnType<typeof buildEvidenceSearchIndex> | undefined,
  phrase: string,
): string {
  const normalizedPhrase = normalizeGdprTransparencyText(phrase);
  if (!sourceText || !searchIndex) {
    return "";
  }
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
  const normalizedChunks: string[] = [];
  let normalizedLength = 0;
  let lastNormalizedCharacter = "";
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
        if (collapsedOutput === " " && (normalizedLength === 0 || lastNormalizedCharacter === " ")) {
          continue;
        }
        normalizedChunks.push(collapsedOutput);
        normalizedLength += collapsedOutput.length;
        lastNormalizedCharacter = collapsedOutput;
        sourceIndexes.push(sourceIndex);
      }
    }
  };

  for (let index = 0; index < sourceText.length;) {
    const char = sourceText[index] ?? "";
    append(char.normalize("NFKC"), index);
    index += char.length;
  }

  if (lastNormalizedCharacter === " ") {
    normalizedChunks.pop();
    sourceIndexes.pop();
  }

  return { normalized: normalizedChunks.join(""), sourceIndexes };
}

function paddedIndexOf(normalizedValue: string, phrase: string) {
  if (usesBoundarylessScript(phrase)) {
    return normalizedValue.indexOf(phrase);
  }
  if (usesArabicScript(phrase)) {
    const directIndex = ` ${normalizedValue} `.indexOf(` ${phrase} `);
    return directIndex >= 0 ? directIndex : arabicCliticIndex(normalizedValue, phrase);
  }
  const index = ` ${normalizedValue} `.indexOf(` ${phrase} `);
  return index < 0 ? -1 : index;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
