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

export const GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY: GdprTransparencyTopicPhrase[] = [
  ...en([
    direct("controller_contact", "data controller"),
    direct("controller_contact", "data controller contact"),
    equivalent("controller_contact", "controller operator of data"),
    equivalent("controller_contact", "controller of data"),
    equivalent("controller_contact", "privacy contact"),
    equivalent("controller_contact", "data protection contact"),
    equivalent("controller_contact", "questions related to data processing can be sent to privacy"),
    direct("dpo_contact", "data protection officer"),
    equivalent("dpo_contact", "dpo contact"),
    equivalent("dpo_contact", "contact our dpo"),
    direct("processing_purposes", "purposes of processing personal data"),
    direct("processing_purposes", "why we process personal data"),
    direct("processing_purposes", "use your personal data"),
    equivalent("processing_purposes", "uses personal data for the following goals"),
    equivalent("processing_purposes", "use personal data for the following goals"),
    direct("legal_basis", "legal basis for processing personal data"),
    direct("legal_basis", "lawful basis for processing personal data"),
    equivalent("legal_basis", "legitimate interests for processing personal data"),
    equivalent("legal_basis", "relevant legitimate interest"),
    equivalent("legal_basis", "presence of the relevant legitimate interest"),
    direct("recipients_or_vendor_categories", "recipients of personal data"),
    direct("recipients_or_vendor_categories", "categories of recipients of personal data"),
    direct("recipients_or_vendor_categories", "third parties with whom we share personal data"),
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
    equivalent("international_transfers", "data transfer to processors"),
    equivalent("international_transfers", "transfer data to processors located outside"),
    equivalent("international_transfers", "processors located outside"),
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
    equivalent("legal_basis", "законный интерес при обработке персональных данных"),
    direct("recipients_or_vendor_categories", "получатели персональных данных"),
    equivalent("recipients_or_vendor_categories", "категории получателей персональных данных"),
    equivalent("recipients_or_vendor_categories", "третьи лица которым мы передаем персональные данные"),
    direct("data_retention", "срок хранения персональных данных"),
    equivalent("data_retention", "период хранения персональных данных"),
    equivalent("data_retention", "храним персональные данные столько сколько необходимо"),
    direct("data_subject_rights", "права субъекта персональных данных"),
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
    equivalent("controller_contact", "個人データ管理者への連絡先"),
    direct("dpo_contact", "データ保護責任者"),
    equivalent("dpo_contact", "データ保護責任者への連絡先"),
    equivalent("dpo_contact", "dpoへのお問い合わせ"),
    direct("processing_purposes", "個人データを処理する目的"),
    direct("processing_purposes", "個人情報の利用目的"),
    equivalent("processing_purposes", "以下の目的で個人データを利用します"),
    direct("legal_basis", "個人データ処理の法的根拠"),
    direct("legal_basis", "個人データを処理する法的根拠"),
    equivalent("legal_basis", "個人データ処理における正当な利益"),
    direct("recipients_or_vendor_categories", "個人データの受領者"),
    equivalent("recipients_or_vendor_categories", "個人データの受領者のカテゴリー"),
    equivalent("recipients_or_vendor_categories", "個人データを共有する第三者"),
    direct("data_retention", "個人データの保存期間"),
    equivalent("data_retention", "個人情報の保有期間"),
    equivalent("data_retention", "必要な期間に限り個人データを保持します"),
    direct("data_subject_rights", "データ主体の権利"),
    equivalent("data_subject_rights", "個人データにアクセスする権利"),
    equivalent("data_subject_rights", "個人データの消去を求める権利"),
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
    equivalent("data_retention", "perioden som personuppgifterna sparas"),
    equivalent("data_retention", "sparar personuppgifter så länge som det är nödvändigt"),
    direct("data_subject_rights", "den registrerades rättigheter"),
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

function direct(topic: GdprTransparencyTopic, phrase: string): PhraseInput {
  return { phrase, strength: "direct", topic };
}

function equivalent(topic: GdprTransparencyTopic, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "equivalent", topic, variant };
}

function phraseScore(term: GdprTransparencyTopicPhrase, normalizedText: string): number {
  const phrase = normalizeGdprTransparencyText(term.phrase);
  if (!phrase || !phraseIncludes(normalizedText, phrase)) {
    return 0;
  }
  return 600 + phrase.length + strengthRank(term.strength) * 80;
}

function paddedIncludes(normalizedValue: string, phrase: string) {
  return ` ${normalizedValue} `.includes(` ${phrase} `);
}

function phraseIncludes(normalizedValue: string, phrase: string) {
  if (usesBoundarylessScript(phrase)) {
    return [...phrase].length >= 4 && normalizedValue.includes(phrase);
  }
  if (usesArabicScript(phrase)) {
    return paddedIncludes(normalizedValue, phrase) || arabicCliticIndex(normalizedValue, phrase) >= 0;
  }
  return paddedIncludes(normalizedValue, phrase);
}

function usesBoundarylessScript(value: string) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function usesArabicScript(value: string) {
  return /\p{Script=Arabic}/u.test(value);
}

function arabicCliticIndex(normalizedValue: string, phrase: string) {
  if ([...phrase].length < 8) {
    return -1;
  }
  for (const clitic of ["و", "ف", "ب", "ك", "ل"]) {
    const index = ` ${normalizedValue} `.indexOf(` ${clitic}${phrase} `);
    if (index >= 0) {
      return Math.max(0, index);
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
