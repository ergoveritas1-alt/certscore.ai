import type { SupportedGdprTransparencyLocale } from "./supported-languages";
import { PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "./privacy-evidence-locale-registry";

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
  section?: {
    body?: string | null;
    heading?: string | null;
  } | null;
  localeHints?: SupportedGdprTransparencyLocale[];
  maxMatches?: number;
  retainLocaleAlternatives?: boolean;
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

type GdprTransparencySemanticRule = {
  bodyPattern?: RegExp;
  confidence?: number;
  headingPattern?: RegExp;
  locale: SupportedGdprTransparencyLocale;
  matchedTerm: string;
  pattern?: RegExp;
  sectionOnly?: boolean;
  topic: GdprTransparencyTopic;
  variant?: "semantic_clause" | "section_semantic_clause";
};

const MAX_EXCERPT_CHARS = 360;
const DEFAULT_MAX_MATCHES = 24;

/** Canonical precision-first clause rules for wording too variable to list as literal headings. */
const GDPR_TRANSPARENCY_SEMANTIC_RULES: readonly GdprTransparencySemanticRule[] = [
  {
    locale: "en",
    matchedTerm: "automated decision-making or profiling disclosure",
    pattern: /\bwe\b.{0,80}\b(?:do not|will not|use|perform|carry out)\b.{0,180}\b(?:profiling|profiled|automated decision(?:-making| making|s)?|solely automated)\b.{0,180}\b(?:personal (?:data|information)|user data|data about you|your data|your information|legal effects?|significantly affects?|similarly significant effects?)\b|\bwe\b.{0,80}\b(?:use|process)\b.{0,180}\b(?:personal (?:data|information)|user data|data about you|your data|your information)\b.{0,180}\b(?:profiling|profiled|automated decision(?:-making| making|s)?|solely automated)\b|\b(?:profiling|profiled|automated decision(?:-making| making|s)?|solely automated)\b.{0,180}\b(?:we|the company)\b.{0,120}\b(?:do not|does not|will not|use|perform|carry out|make decisions?)\b.{0,180}\b(?:personal (?:data|information)|user data|data about you|your data|your information|legal effects?|significantly affects?|similarly significant effects?|login|account)\b/i,
    topic: "automated_decision_making_or_profiling",
  },
  {
    locale: "en",
    matchedTerm: "explicit automated processing or profiling disclosure",
    pattern: /\b(?:this (?:site|website|service|platform|application|app|fixture)|the (?:site|website|service|platform|application|app))\b.{0,100}\b(?:do(?:es)? not|will not)\b.{0,100}\b(?:use|conduct|perform|carry out|engage in)\b.{0,180}\b(?:profiling|automated decision(?:-making| making|s)?|solely automated (?:processing|decision))\b.{0,220}\b(?:legal effects?|significantly affects?|similarly significant effects?|eligibility|credit|insurance|employment|access to (?:a )?service)\b|\b(?:personal data|personal information|user data|your data|your information)\b.{0,140}\b(?:is|are) subject to\b.{0,100}\b(?:automatic|automated) processing\b.{0,100}\bprofiling\b|\b(?:personal data|personal information|your data|your information)\b.{0,220}\bprofiling\b.{0,220}\bdecisions?\b.{0,140}\b(?:legal effects?|significantly affects?|similarly significant effects?)\b.{0,220}\bwe\b.{0,60}\b(?:do not|will not)\b.{0,80}\b(?:conduct|perform|carry out|engage in) such processing\b/i,
    topic: "automated_decision_making_or_profiling",
  },
  {
    locale: "en",
    matchedTerm: "international or cross-border transfer disclosure",
    pattern: /\b(?:personal (?:data|information)|your data|your information|data|information)\b.{0,180}\b(?:transferred|processed|stored|hosted|accessed)\b.{0,180}\b(?:outside (?:the )?(?:eu|eea|european union|european economic area|uk|united kingdom)|third countr(?:y|ies)|foreign countr(?:y|ies)|united states|other countries|other jurisdictions)\b|\b(?:standard contractual clauses?|\bsccs?\b|adequacy decision|data privacy framework|cross-border transfers?|international transfers?)\b.{0,260}\b(?:personal (?:data|information)|your data|your information|data|information|transfer|safeguards?)\b/i,
    topic: "international_transfers",
  },
  {
    locale: "en",
    matchedTerm: "processing legal-basis clause",
    pattern: /\b(?:process|processing|use|using|collect|collecting|hold|holding)\b.{0,160}\b(?:personal data|personal information|your data|your information|data|information)\b.{0,180}\b(?:consent|performance of (?:a|the) contract|contractual necessity|legal obligation|legitimate interests?|public task|public interest|vital interests?)\b|\b(?:consent|performance of (?:a|the) contract|contractual necessity|legal obligation|legitimate interests?|public task|public interest|vital interests?)\b.{0,180}\b(?:basis|process|processing|use|using|collect|collecting|hold|holding)\b.{0,160}\b(?:personal data|personal information|your data|your information|data|information)\b|\b(?:personal data|personal information)\b.{0,180}\b(?:obtain|obtains|rely|relies|based)\b.{0,80}\bconsent\b/i,
    topic: "legal_basis",
  },
  {
    locale: "en",
    matchedTerm: "personal-data retention period or criterion",
    pattern: /\b(?:personal data|personal information|your data|your information|account (?:data|information)|records?)\b.{0,160}\b(?:retain(?:ed)?|keep|kept|store(?:d)?|delete(?:d)?|erase(?:d)?|anonymi[sz](?:e|ed))\b.{0,180}\b(?:for \d+|for (?:one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|months?|years?)|as long as (?:necessary|required|you (?:use|maintain)|the account)|until (?:the account|you|closure|termination)|account (?:lifetime|closure|termination)|no longer (?:necessary|required)|purpose(?:s)?|legal obligation|applicable law)\b|\b(?:retain(?:ed)?|keep|kept|store(?:d)?)\b.{0,120}\b(?:personal data|personal information|your data|your information|account (?:data|information)|records?)\b.{0,180}\b(?:for \d+|as long as|until|account (?:lifetime|closure|termination)|no longer than necessary|required by law)\b/i,
    topic: "data_retention",
  },
  {
    locale: "en",
    matchedTerm: "named recipient or meaningful recipient category",
    pattern: /\b(?:share|disclose|provide|transfer|send|make available)\b.{0,140}\b(?:personal data|personal information|your data|your information|information|data)\b.{0,180}\b(?:service providers?|processors?|subprocessors?|suppliers?|payment processors?|payment (?:and )?delivery service providers?|hosting providers?|cloud providers?|analytics providers?|analytics partners?|advertising partners?|advertising networks?|social media providers?|delivery providers?|professional advisers?|affiliates?|group companies|law enforcement|regulators?)\b|\b(?:service providers?|processors?|subprocessors?|suppliers?|payment processors?|hosting providers?|cloud providers?|analytics providers?|analytics partners?|advertising partners?|advertising networks?|social media providers?|delivery providers?|professional advisers?|affiliates?|group companies)\b.{0,180}\b(?:receive|access|process|handle|share|disclose|provide)\b.{0,140}\b(?:personal data|personal information|your data|your information|information|data)\b/i,
    topic: "recipients_or_vendor_categories",
  },
  {
    locale: "en",
    matchedTerm: "specific personal-data processing purpose",
    pattern: /\b(?:personal data|personal information|your data|your information|contact details|account data|technical data|information we collect|data we collect)\b.{0,120}\b(?:is|are|may be|will be)?\s*(?:used|processed|collected)\b.{0,100}\b(?:to|for)\b.{0,140}\b(?:provide|deliver|operate|maintain|improve|develop|communicate|respond|process payments?|fulfil|fulfill|protect|secure|prevent|detect|measure|analy[sz]e|support|administer|manage|authenticate)\b|\b(?:we|the company)\s+(?:use|process|collect)\b.{0,100}\b(?:personal data|personal information|your data|your information|information|data)\b.{0,100}\b(?:to|for)\b.{0,140}\b(?:provide|deliver|operate|maintain|improve|develop|communicate|respond|process payments?|fulfil|fulfill|protect|secure|prevent|detect|measure|analy[sz]e|support|administer|manage|authenticate)\b/i,
    topic: "processing_purposes",
  },
  {
    locale: "en",
    matchedTerm: "enumerated data-subject rights disclosure",
    pattern: /\bright to (?:access|know|obtain|delete|erasure|correct|rectification|restrict|object|portability)\b.{0,240}\bright to (?:access|know|obtain|delete|erasure|correct|rectification|restrict|object|portability)\b|\b(?:access|correct|delete|erase|restrict|object to|portability of)\b.{0,120}\b(?:personal data|personal information|your data|your information)\b.{0,180}\b(?:right|request)\b/i,
    topic: "data_subject_rights",
  },
  {
    locale: "en",
    matchedTerm: "supervisory-authority complaint disclosure",
    pattern: /\b(?:right to )?(?:complain|file|make|lodge|submit)\b.{0,100}\b(?:data protection|supervisory|privacy|regulatory) (?:authority|regulator|commission)\b|\b(?:information commissioner(?:'s office)?|data protection authority|supervisory authority)\b.{0,100}\b(?:complain|complaint|file|lodge|submit)\b/i,
    topic: "supervisory_authority",
  },
  {
    locale: "en",
    matchedTerm: "controller identity and contact disclosure",
    pattern: /\b(?:acts as|is|are) (?:a |the )?(?:data )?controller\b.{0,260}\b(?:email|e-mail|mailing address|postal address|contact us|@[a-z0-9.-]+\.[a-z]{2,})\b|\b(?:email|e-mail|mailing address|postal address|contact us|@[a-z0-9.-]+\.[a-z]{2,})\b.{0,260}\b(?:acts as|is|are) (?:a |the )?(?:data )?controller\b/i,
    topic: "controller_contact",
  },
  {
    locale: "en",
    matchedTerm: "data-protection officer contact disclosure",
    pattern: /\b(?:data protection officer|data privacy officer|office of the data privacy officer|\bdpo\b)\b.{0,180}\b(?:email|e-mail|phone|telephone|contact|write|@[a-z0-9.-]+\.[a-z]{2,})\b|\b(?:email|e-mail|phone|telephone|contact|write|@[a-z0-9.-]+\.[a-z]{2,})\b.{0,180}\b(?:data protection officer|data privacy officer|\bdpo\b)\b/i,
    topic: "dpo_contact",
  },
  {
    locale: "en",
    matchedTerm: "section-bound processing purposes",
    headingPattern: /\b(?:how|why|purposes? for which|purposes? of)\b.{0,80}\b(?:use|process|collect|processing|information|data)\b|\bdata we process\b/i,
    bodyPattern: /\b(?:use|process|collect|provide|operate|maintain|improve|respond|support|deliver|prevent|detect|secure|analy[sz]e|market|advertis|payment|newsletter|survey)\b/i,
    sectionOnly: true,
    topic: "processing_purposes",
    variant: "section_semantic_clause",
  },
  {
    locale: "en",
    matchedTerm: "section-bound legal basis",
    headingPattern: /\b(?:legal|lawful) bas(?:is|es)\b|\bpurposes? and (?:legal|lawful) bas(?:is|es)\b/i,
    bodyPattern: /\b(?:consent|contract|legal obligation|legitimate interests?|public task|public interest|vital interests?|art(?:icle)?\.? 6)\b/i,
    sectionOnly: true,
    topic: "legal_basis",
    variant: "section_semantic_clause",
  },
  {
    locale: "en",
    matchedTerm: "section-bound recipient categories",
    headingPattern: /\b(?:sharing|disclos(?:ure|ing)|recipients?|suppliers?|service providers?|third parties)\b/i,
    bodyPattern: /\b(?:service providers?|processors?|subprocessors?|suppliers?|payment processors?|hosting providers?|analytics partners?|advertising networks?|delivery providers?|professional advisers?|affiliates?|regulators?|authorities)\b/i,
    sectionOnly: true,
    topic: "recipients_or_vendor_categories",
    variant: "section_semantic_clause",
  },
  {
    locale: "en",
    matchedTerm: "section-bound retention period or criterion",
    headingPattern: /\b(?:retention|how long|storage period|keeping your (?:data|information))\b/i,
    bodyPattern: /\b(?:indefinitely|\d+\s*(?:days?|weeks?|months?|years?)|one|two|three|four|five|six|seven|eight|nine|ten)\b.{0,60}\b(?:days?|weeks?|months?|years?|after|until|necessary|required)\b|\b(?:as long as|no longer than|until|after account closure|account lifetime|required by law)\b/i,
    sectionOnly: true,
    topic: "data_retention",
    variant: "section_semantic_clause",
  },
  {
    locale: "en",
    matchedTerm: "section-bound automated decision-making disclosure",
    headingPattern: /\b(?:automated decision(?:-making| making)?|profiling)\b/i,
    bodyPattern: /\b(?:we|the company|personal data|personal information|user data)\b.{0,220}\b(?:do not|does not|will not|use|perform|carry out|automatic decision|profiling|legal effects?|significantly affects?)\b/i,
    sectionOnly: true,
    topic: "automated_decision_making_or_profiling",
    variant: "section_semantic_clause",
  },
  {
    locale: "de",
    matchedTerm: "konkrete zwecke der datenverarbeitung",
    pattern: /\b(?:datenverarbeitung erfolgt zu folgenden zwecken|wir verarbeiten\b.{0,140}\b(?:personenbezogene daten|ihre daten|daten)\b.{0,100}\b(?:um|fur|zu)\b.{0,180}\b(?:durchzufuhren|abzuwickeln|bereitzustellen|beantworten|erfullen|behandeln|verwalten))\b/i,
    topic: "processing_purposes",
  },
  {
    locale: "de",
    matchedTerm: "vertragliche oder vorvertragliche rechtsgrundlage",
    pattern: /\b(?:verarbeiten|verarbeitung|datenverarbeitung)\b.{0,220}\b(?:durchfuhrung vorvertraglicher maßnahmen|erfullung (?:eines|des) vertrags|durchfuhrung (?:eines|des) vertrags|vertragserfullung|abschluss (?:eines|des) vertrages)\b|\b(?:durchfuhrung vorvertraglicher maßnahmen|erfullung (?:eines|des) vertrags|durchfuhrung (?:eines|des) vertrags|vertragserfullung|abschluss (?:eines|des) vertrages)\b.{0,220}\b(?:verarbeiten|verarbeitung|datenverarbeitung|personenbezogene daten|ihre daten)\b/i,
    topic: "legal_basis",
  },
  {
    locale: "de",
    matchedTerm: "benannter empfänger personenbezogener daten",
    pattern: /\b(?:soziales? netzwerk|plattform|anbieter|dienstleister|auftragsverarbeiter)\b.{0,260}\b(?:erhalt|empfangt|verarbeitet|zugriff|ubermittelt|weitergegeben)\b.{0,180}\b(?:ip-adresse|personenbezogene daten|ihre daten|informationen|daten)\b|\b(?:ip-adresse|personenbezogene daten|ihre daten|informationen|daten)\b.{0,180}\b(?:erhalt|empfangt|verarbeitet|zugriff|ubermittelt|weitergegeben)\b.{0,260}\b(?:soziales? netzwerk|plattform|anbieter|dienstleister|auftragsverarbeiter)\b/i,
    topic: "recipients_or_vendor_categories",
  },
  {
    locale: "de",
    matchedTerm: "datenübermittlung an einen empfänger außerhalb des ewr",
    pattern: /\b(?:usa|vereinigte staaten|drittland|außerhalb (?:der )?(?:eu|ewr|europaischen union|europaischen wirtschaftsraums))\b.{0,500}\b(?:direkte verbindung|server|ubermittelt|weitergegeben|erhalt|empfangt)\b.{0,220}\b(?:ip-adresse|personenbezogene daten|ihre daten|informationen|daten)\b/i,
    topic: "international_transfers",
  },
  {
    locale: "de",
    matchedTerm: "personenbezogene daten werden fur einen konkreten zweck verwendet",
    pattern: /\b(?:personenbezogen(?:e|en|er|es) daten|ihre daten)\b.{0,100}\b(?:verwendet|verarbeitet|genutzt)\b.{0,80}\b(?:um|zur|zum|fur)\b.{0,160}\b(?:verwalten|bearbeiten|beantworten|bereitstellen|durchfuhren|abwickeln|erfullen|schutzen|verbessern|kommunizieren)\b/i,
    topic: "processing_purposes",
  },
  {
    locale: "de",
    matchedTerm: "personenbezogene daten werden einem auftragsverarbeiter übermittelt",
    pattern: /\b(?:personenbezogen(?:e|en|er|es) daten|ihre daten|die daten)\b.{0,120}\b(?:an|gegenuber)\b.{0,100}\b(?:dienstleister|auftragsverarbeiter|anbieter|dritte|plattform|soziales? netzwerk)\b.{0,100}\b(?:ubermittelt|weitergegeben|offengelegt|zuganglich gemacht|verarbeitet)\b/i,
    topic: "recipients_or_vendor_categories",
  },
  {
    locale: "de",
    matchedTerm: "einwilligung gesetzliche pflicht oder berechtigtes interesse als rechtsgrundlage",
    pattern: /\b(?:verarbeitung|verarbeiten|datenverarbeitung)\b.{0,220}\b(?:auf grundlage (?:ihrer|einer) einwilligung|zur erfullung (?:einer|gesetzlicher|rechtlicher) verpflichtung(?:en)?|aufgrund (?:unserer|eines|berechtigter) berechtigten? interessen?|im offentlichen interesse|zum schutz lebenswichtiger interessen)\b|\b(?:einwilligung|gesetzliche verpflichtung(?:en)?|rechtliche verpflichtung(?:en)?|berechtigte interessen?|offentliches interesse|lebenswichtige interessen?)\b.{0,180}\b(?:rechtsgrundlage|grundlage der verarbeitung|verarbeiten|verarbeitung|datenverarbeitung)\b/i,
    topic: "legal_basis",
  },
  {
    locale: "de",
    matchedTerm: "aufbewahrungsdauer oder löschkriterium für personenbezogene daten",
    pattern: /\b(?:personenbezogen(?:e|en|er|es) daten|ihre daten|die daten|von uns verarbeiteten daten)\b.{0,120}\b(?:speichern|gespeichert|aufbewahren|aufbewahrt|loschen|geloscht)\b.{0,180}\b(?:solange|so lange|bis|sobald|nach ablauf|fur \d+|gesetzliche aufbewahrungsfrist(?:en)?|nicht mehr erforderlich|zweck (?:entfallt|erreicht))\b|\b(?:speichern|aufbewahren)\b.{0,100}\b(?:personenbezogen(?:e|en|er|es) daten|ihre daten|die daten)\b.{0,140}\b(?:solange|so lange|bis|fur \d+|gesetzliche aufbewahrungsfrist(?:en)?|erforderlich)\b/i,
    topic: "data_retention",
  },
  {
    locale: "de",
    matchedTerm: "beschwerderecht bei einer datenschutzaufsichtsbehörde",
    pattern: /\b(?:recht|moglichkeit)\b.{0,60}\b(?:auf|zur|eine) beschwerde\b.{0,100}\b(?:datenschutz)?aufsichtsbehorde\b|\b(?:bei|an) (?:einer|die|der zustandigen) (?:datenschutz)?aufsichtsbehorde\b.{0,100}\b(?:beschweren|beschwerde einlegen|beschwerde einzureichen)\b/i,
    topic: "supervisory_authority",
  },
  {
    locale: "de",
    matchedTerm: "ausdrückliche angabe zu automatisierten entscheidungen oder profiling",
    pattern: /\b(?:automatisierte entscheidungsfindung|automatisierte entscheidungen|ausschließlich automatisierte entscheidungen|profiling)\b.{0,180}\b(?:findet nicht statt|finden nicht statt|wird nicht eingesetzt|werden nicht eingesetzt|setzen wir nicht ein|setzen wir ein|verwenden wir nicht|verwenden wir|rechtliche wirkung|erheblich beeintrachtigt)\b|\b(?:wir|der verantwortliche)\b.{0,80}\b(?:verwenden|nutzen|setzen)\b.{0,80}\b(?:kein|keine|nicht|automatisierte|profiling)\b.{0,100}\b(?:automatisierte entscheidungsfindung|automatisierte entscheidungen|profiling)\b/i,
    topic: "automated_decision_making_or_profiling",
  },
  ...([
    {
      locale: "fr",
      purpose: /\b(?:nous traitons|les donnees sont traitees|(?:donnees personnelles|vos donnees)\b.{0,80}\b(?:sont|seront)\b.{0,30}\b(?:utilisees|traitees))\b.{0,140}\b(?:donnees personnelles|vos donnees|donnees|pour|afin de)\b.{0,100}\b(?:pour|afin de|gerer|repondre|fournir|executer|proteger|ameliorer)\b/i,
      legalBasis: /\b(?:traitement|traitons|donnees personnelles)\b.{0,220}\b(?:execution (?:d'un|du) contrat|mesures precontractuelles|votre consentement|une obligation legale|nos interets legitimes|l'interet public|interets vitaux)\b|\b(?:execution (?:d'un|du) contrat|mesures precontractuelles|consentement|obligation legale|interets legitimes|interet public|interets vitaux)\b.{0,180}\b(?:base legale|fondement|traitement|traitons|donnees personnelles)\b/i,
      recipient: /\b(?:prestataire|sous-traitant|tiers|plateforme|reseau social)\b.{0,180}\b(?:recoit|recoivent|traite|traitent|accede|accedent)\b.{0,140}\b(?:donnees personnelles|vos donnees|donnees|adresse ip)\b|\b(?:donnees personnelles|vos donnees)\b.{0,100}\b(?:sont|seront)\b.{0,30}\b(?:transmises|communiquees|divulguees)\b.{0,140}\b(?:prestataire|sous-traitant|tiers|plateforme|reseau social)\b/i,
      transfer: /\b(?:transfert|transferees|transmission)\b.{0,180}\b(?:etats-unis|hors (?:de )?(?:l'union europeenne|ue|eee)|pays tiers)\b|\b(?:etats-unis|hors (?:de )?(?:l'union europeenne|ue|eee)|pays tiers)\b.{0,180}\b(?:donnees personnelles|vos donnees|donnees|transfert|transferees)\b/i,
      retention: /\b(?:donnees personnelles|vos donnees|les donnees)\b.{0,120}\b(?:conservees|stockees|supprimees|effacees)\b.{0,160}\b(?:aussi longtemps que|tant que|jusqu'a|pendant \d+|duree necessaire|delai legal|obligation de conservation)\b/i,
      complaint: /\b(?:droit|possibilite)\b.{0,60}\b(?:introduire|deposer|former)\b.{0,40}\b(?:une )?reclamation\b.{0,100}\b(?:autorite de controle|cnil)\b|\b(?:autorite de controle|cnil)\b.{0,100}\b(?:reclamation|plainte)\b/i,
      automated: /\b(?:decision automatis(?:ee|ees)|prise de decision automatisee|profilage)\b.{0,160}\b(?:n'est pas utilise|ne sont pas utilisees|n'a pas lieu|aucun|utilisons|effets? juridiques?|affecte sensiblement)\b/i,
    },
    {
      locale: "es",
      purpose: /\b(?:tratamos|se tratan|(?:datos personales|sus datos|tus datos)\b.{0,80}\b(?:se utilizan|seran utilizados|son tratados))\b.{0,140}\b(?:datos personales|sus datos|tus datos|datos|para|con el fin de)\b.{0,100}\b(?:para|con el fin de|gestionar|responder|prestar|proporcionar|cumplir|proteger|mejorar)\b/i,
      legalBasis: /\b(?:tratamiento|tratamos|datos personales)\b.{0,220}\b(?:ejecucion (?:de un|del) contrato|medidas precontractuales|su consentimiento|una obligacion legal|intereses legitimos|interes publico|intereses vitales)\b|\b(?:ejecucion (?:de un|del) contrato|medidas precontractuales|consentimiento|obligacion legal|intereses legitimos|interes publico|intereses vitales)\b.{0,180}\b(?:base juridica|fundamento|tratamiento|tratamos|datos personales)\b/i,
      recipient: /\b(?:proveedor|encargado del tratamiento|tercero|plataforma|red social)\b.{0,180}\b(?:recibe|reciben|trata|tratan|accede|acceden)\b.{0,140}\b(?:datos personales|sus datos|tus datos|datos|direccion ip)\b|\b(?:datos personales|sus datos|tus datos)\b.{0,100}\b(?:se transmiten|seran comunicados|se comunican|se ceden)\b.{0,140}\b(?:proveedor|encargado del tratamiento|tercero|plataforma|red social)\b/i,
      transfer: /\b(?:transferencia|transferidos|transmision)\b.{0,180}\b(?:estados unidos|fuera (?:de )?(?:la union europea|ue|eee)|tercer pais)\b|\b(?:estados unidos|fuera (?:de )?(?:la union europea|ue|eee)|tercer pais)\b.{0,180}\b(?:datos personales|sus datos|datos|transferencia|transferidos)\b/i,
      retention: /\b(?:datos personales|sus datos|tus datos|los datos)\b.{0,120}\b(?:se conservan|seran conservados|se almacenan|se suprimen|se eliminan)\b.{0,160}\b(?:mientras|durante \d+|hasta que|plazo necesario|tiempo necesario|obligacion legal|plazos? legales?)\b/i,
      complaint: /\b(?:derecho|posibilidad)\b.{0,60}\b(?:presentar|interponer|formular)\b.{0,40}\b(?:una )?reclamacion\b.{0,100}\b(?:autoridad de control|agencia de proteccion de datos)\b|\b(?:autoridad de control|agencia de proteccion de datos)\b.{0,100}\b(?:reclamacion|queja)\b/i,
      automated: /\b(?:decision(?:es)? automatizada(?:s)?|toma de decisiones automatizada|elaboracion de perfiles|perfilado)\b.{0,160}\b(?:no se utiliza|no se realizan|no tiene lugar|utilizamos|efectos? juridicos?|afecta significativamente)\b/i,
    },
    {
      locale: "it",
      purpose: /\b(?:trattiamo|sono trattati|(?:dati personali|i suoi dati|i tuoi dati)\b.{0,80}\b(?:sono|saranno)\b.{0,30}\b(?:utilizzati|trattati))\b.{0,140}\b(?:dati personali|i suoi dati|i tuoi dati|dati|per|al fine di)\b.{0,100}\b(?:per|al fine di|gestire|rispondere|fornire|eseguire|proteggere|migliorare)\b/i,
      legalBasis: /\b(?:trattamento|trattiamo|dati personali)\b.{0,220}\b(?:esecuzione (?:di un|del) contratto|misure precontrattuali|suo consenso|obbligo legale|interessi legittimi|interesse pubblico|interessi vitali)\b|\b(?:esecuzione (?:di un|del) contratto|misure precontrattuali|consenso|obbligo legale|interessi legittimi|interesse pubblico|interessi vitali)\b.{0,180}\b(?:base giuridica|fondamento|trattamento|trattiamo|dati personali)\b/i,
      recipient: /\b(?:fornitore|responsabile del trattamento|terzo|piattaforma|social network)\b.{0,180}\b(?:riceve|ricevono|tratta|trattano|accede|accedono)\b.{0,140}\b(?:dati personali|i suoi dati|i tuoi dati|dati|indirizzo ip)\b|\b(?:dati personali|i suoi dati|i tuoi dati)\b.{0,100}\b(?:sono|saranno)\b.{0,30}\b(?:trasmessi|comunicati|divulgati)\b.{0,140}\b(?:fornitore|responsabile del trattamento|terzo|piattaforma|social network)\b/i,
      transfer: /\b(?:trasferimento|trasferiti|trasmissione)\b.{0,180}\b(?:stati uniti|fuori (?:dall'|della )?(?:unione europea|ue|see)|paese terzo)\b|\b(?:stati uniti|fuori (?:dall'|della )?(?:unione europea|ue|see)|paese terzo)\b.{0,180}\b(?:dati personali|i suoi dati|dati|trasferimento|trasferiti)\b/i,
      retention: /\b(?:dati personali|i suoi dati|i tuoi dati|i dati)\b.{0,120}\b(?:sono conservati|saranno conservati|sono memorizzati|sono cancellati)\b.{0,160}\b(?:finche|per \d+|fino a quando|tempo necessario|periodo necessario|obbligo legale|termini di conservazione)\b/i,
      complaint: /\b(?:diritto|possibilita)\b.{0,60}\b(?:proporre|presentare|inoltrare)\b.{0,40}\b(?:un )?reclamo\b.{0,100}\b(?:autorita di controllo|garante per la protezione dei dati)\b|\b(?:autorita di controllo|garante per la protezione dei dati)\b.{0,100}\b(?:reclamo|segnalazione)\b/i,
      automated: /\b(?:decision(?:e|i) automatizzat(?:a|e)|processo decisionale automatizzato|profilazione)\b.{0,160}\b(?:non viene utilizzat[oa]|non sono effettuate|non ha luogo|utilizziamo|effetti? giuridici?|incide significativamente)\b/i,
    },
    {
      locale: "nl",
      purpose: /\b(?:wij verwerken|worden verwerkt|(?:persoonsgegevens|uw gegevens|jouw gegevens)\b.{0,80}\b(?:worden|zijn)\b.{0,30}\b(?:gebruikt|verwerkt))\b.{0,140}\b(?:persoonsgegevens|uw gegevens|jouw gegevens|gegevens|om|voor)\b.{0,100}\b(?:om|voor|beheren|beantwoorden|leveren|uitvoeren|beschermen|verbeteren)\b/i,
      legalBasis: /\b(?:verwerking|verwerken|persoonsgegevens)\b.{0,220}\b(?:uitvoering van (?:een|de) overeenkomst|precontractuele maatregelen|uw toestemming|wettelijke verplichting|gerechtvaardigde belangen|algemeen belang|vitale belangen)\b|\b(?:toestemming|wettelijke verplichting|gerechtvaardigde belangen|algemeen belang|vitale belangen)\b.{0,180}\b(?:rechtsgrond|grondslag|verwerking|verwerken|persoonsgegevens)\b/i,
      recipient: /\b(?:dienstverlener|verwerker|derde|platform|sociaal netwerk)\b.{0,180}\b(?:ontvangt|ontvangen|verwerkt|verwerken|toegang)\b.{0,140}\b(?:persoonsgegevens|uw gegevens|jouw gegevens|gegevens|ip-adres)\b|\b(?:persoonsgegevens|uw gegevens|jouw gegevens)\b.{0,100}\b(?:worden|zullen worden)\b.{0,30}\b(?:doorgegeven|verstrekt|gedeeld)\b.{0,140}\b(?:dienstverlener|verwerker|derde|platform|sociaal netwerk)\b/i,
      transfer: /\b(?:doorgifte|overdracht|overgedragen)\b.{0,180}\b(?:verenigde staten|buiten (?:de )?(?:eu|eer|europese unie)|derde land)\b|\b(?:verenigde staten|buiten (?:de )?(?:eu|eer|europese unie)|derde land)\b.{0,180}\b(?:persoonsgegevens|uw gegevens|gegevens|doorgifte|overgedragen)\b/i,
      retention: /\b(?:persoonsgegevens|uw gegevens|jouw gegevens|de gegevens)\b.{0,120}\b(?:worden bewaard|zullen worden bewaard|worden opgeslagen|worden verwijderd)\b.{0,160}\b(?:zolang|totdat|gedurende \d+|niet langer dan|nodig|wettelijke bewaartermijn)\b/i,
      complaint: /\b(?:recht|mogelijkheid)\b.{0,60}\b(?:een )?klacht\b.{0,30}\b(?:in te dienen|indienen|neer te leggen|neerleggen)\b.{0,100}\b(?:toezichthoudende autoriteit|autoriteit persoonsgegevens)\b|\b(?:toezichthoudende autoriteit|autoriteit persoonsgegevens)\b.{0,100}\b(?:klacht indienen|klacht)\b/i,
      automated: /\b(?:geautomatiseerde besluitvorming|geautomatiseerde beslissingen|profilering)\b.{0,160}\b(?:wordt niet gebruikt|vindt niet plaats|maken geen gebruik|gebruiken wij|rechtsgevolgen|aanmerkelijk treft)\b/i,
    },
    {
      locale: "pl",
      purpose: /\b(?:przetwarzamy|sa przetwarzane|(?:dane osobowe|panstwa dane|twoje dane)\b.{0,80}\b(?:sa|beda)\b.{0,30}\b(?:wykorzystywane|przetwarzane))\b.{0,140}\b(?:dane osobowe|panstwa dane|twoje dane|dane|w celu|aby)\b.{0,100}\b(?:w celu|aby|zarzadzania|odpowiedzi|swiadczenia|wykonania|ochrony|ulepszenia)\b/i,
      legalBasis: /\b(?:przetwarzanie|przetwarzamy|dane osobowe)\b.{0,220}\b(?:wykonani[ea] umowy|działania przed zawarciem umowy|panstwa zgody|zgody|obowiazku prawnego|prawnie uzasadnionych interesow|interesu publicznego|zywotnych interesow)\b|\b(?:zgoda|obowiazek prawny|prawnie uzasadnione interesy|interes publiczny|zywotne interesy)\b.{0,180}\b(?:podstawa prawna|przetwarzanie|przetwarzamy|dane osobowe)\b/i,
      recipient: /\b(?:usługodawca|podmiot(?:owi)? przetwarzajac(?:y|emu)|strona trzecia|platforma|serwis społecznosciowy)\b.{0,180}\b(?:otrzymuje|otrzymuja|przetwarza|przetwarzaja|dostep)\b.{0,140}\b(?:dane osobowe|panstwa dane|twoje dane|dane|adres ip)\b|\b(?:dane osobowe|panstwa dane|twoje dane)\b.{0,100}\b(?:sa|beda)\b.{0,30}\b(?:przekazywane|udostepniane)\b.{0,140}\b(?:usługodawca|podmiot(?:owi)? przetwarzajac(?:y|emu)|strona trzecia|platforma)\b/i,
      transfer: /\b(?:przekazywanie|przekazane|transfer)\b.{0,180}\b(?:stany zjednoczone|stanow zjednoczonych|poza (?:ue|eog|unia europejska)|panstwo trzecie)\b|\b(?:stany zjednoczone|stanow zjednoczonych|poza (?:ue|eog|unia europejska)|panstwo trzecie)\b.{0,180}\b(?:dane osobowe|panstwa dane|dane|przekazywanie|przekazane)\b/i,
      retention: /\b(?:dane osobowe|panstwa dane|twoje dane|dane)\b.{0,120}\b(?:sa przechowywane|beda przechowywane|zostana usuniete|sa usuwane)\b.{0,160}\b(?:tak długo jak|dopoki|przez \d+|do czasu|nie dłużej niz|niezbedne|ustawowy okres)\b/i,
      complaint: /\b(?:prawo|mozliwosc)\b.{0,60}\b(?:wniesienia|złozenia|zlozenia)\b.{0,30}\bskargi\b.{0,100}\b(?:organu nadzorczego|prezesa urzedu ochrony danych osobowych)\b|\b(?:organ nadzorczy|prezes urzedu ochrony danych osobowych)\b.{0,100}\b(?:skarga|wniesc skarge|złozyc skarge|zlozyc skarge)\b/i,
      automated: /\b(?:zautomatyzowane podejmowanie decyzji|decyzje podejmowane automatycznie|profilowanie)\b.{0,160}\b(?:nie jest stosowane|nie stosujemy|nie odbywa sie|stosujemy|skutki prawne|istotnie wpływa)\b/i,
    },
    {
      locale: "pt",
      purpose: /\b(?:tratamos|sao tratados|(?:dados pessoais|seus dados)\b.{0,80}\b(?:sao|serao)\b.{0,30}\b(?:utilizados|tratados))\b.{0,140}\b(?:dados pessoais|seus dados|dados|para|a fim de)\b.{0,100}\b(?:para|a fim de|gerir|responder|fornecer|executar|proteger|melhorar)\b/i,
      legalBasis: /\b(?:tratamento|tratamos|dados pessoais)\b.{0,220}\b(?:execucao (?:de um|do) contrato|diligencias pre-contratuais|seu consentimento|obrigacao legal|interesses legitimos|interesse publico|interesses vitais)\b|\b(?:consentimento|obrigacao legal|interesses legitimos|interesse publico|interesses vitais)\b.{0,180}\b(?:base juridica|fundamento|tratamento|tratamos|dados pessoais)\b/i,
      recipient: /\b(?:prestador de servicos|subcontratante|terceiro|plataforma|rede social)\b.{0,180}\b(?:recebe|recebem|trata|tratam|acede|acedem|acessa|acessam)\b.{0,140}\b(?:dados pessoais|seus dados|dados|endereco ip)\b|\b(?:dados pessoais|seus dados)\b.{0,100}\b(?:sao|serao)\b.{0,30}\b(?:transmitidos|comunicados|partilhados)\b.{0,140}\b(?:prestador de servicos|subcontratante|terceiro|plataforma|rede social)\b/i,
      transfer: /\b(?:transferencia|transferidos|transmissao)\b.{0,180}\b(?:estados unidos|fora (?:da )?(?:uniao europeia|ue|eee)|pais terceiro)\b|\b(?:estados unidos|fora (?:da )?(?:uniao europeia|ue|eee)|pais terceiro)\b.{0,180}\b(?:dados pessoais|seus dados|dados|transferencia|transferidos)\b/i,
      retention: /\b(?:dados pessoais|seus dados|os dados)\b.{0,120}\b(?:sao conservados|serao conservados|sao armazenados|sao apagados|sao eliminados)\b.{0,160}\b(?:enquanto|durante \d+|ate que|tempo necessario|periodo necessario|obrigacao legal|prazo legal)\b/i,
      complaint: /\b(?:direito|possibilidade)\b.{0,60}\b(?:apresentar|interpor)\b.{0,30}\b(?:uma )?reclamacao\b.{0,100}\b(?:autoridade de controlo|autoridade nacional de protecao de dados|cnpd)\b|\b(?:autoridade de controlo|autoridade nacional de protecao de dados|cnpd)\b.{0,100}\b(?:reclamacao|queixa)\b/i,
      automated: /\b(?:decis(?:ao|oes) automatizada(?:s)?|tomada de decisoes automatizada|definicao de perfis)\b.{0,160}\b(?:nao e utilizada|nao sao realizadas|nao ocorre|utilizamos|efeitos? juridicos?|afeta significativamente)\b/i,
    },
  ] as const).flatMap(({ locale, purpose, legalBasis, recipient, transfer, retention, complaint, automated }) => [
    { locale, matchedTerm: "specific personal-data processing purpose", pattern: purpose, topic: "processing_purposes" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "processing legal-basis clause", pattern: legalBasis, topic: "legal_basis" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "named recipient or meaningful recipient category", pattern: recipient, topic: "recipients_or_vendor_categories" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "international or cross-border transfer disclosure", pattern: transfer, topic: "international_transfers" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "personal-data retention period or criterion", pattern: retention, topic: "data_retention" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "supervisory-authority complaint disclosure", pattern: complaint, topic: "supervisory_authority" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "automated decision-making or profiling disclosure", pattern: automated, topic: "automated_decision_making_or_profiling" as const, variant: "semantic_clause" as const },
  ]),
  ...([
    {
      locale: "ro",
      purpose: /\b(?:datele (?:cu caracter personal|personale)|datele dumneavoastra)\b.{0,100}\b(?:sunt|vor fi)\b.{0,30}\b(?:folosite|utilizate|prelucrate)\b.{0,80}\b(?:pentru a|in scopul)\b.{0,120}\b(?:gestiona|raspunde|furniza|executa|proteja|imbunatati)\b/i,
      legalBasis: /\b(?:prelucrarea|prelucram)\b.{0,180}\b(?:se bazeaza pe|in baza|pe baza)\b.{0,100}\b(?:consimtamant|obligati(?:e|i) legal(?:a|e)|interes(?:ul|e) legitim(?:e)?|interes public|interese vitale)\b/i,
      recipient: /\b(?:datele (?:cu caracter personal|personale)|datele dumneavoastra)\b.{0,100}\b(?:sunt|vor fi)\b.{0,30}\b(?:transmise|dezvaluite|comunicate)\b.{0,120}\b(?:furnizor|persoan(?:a|e) imputernicit(?:a|e)|terte parti|platforma)\b/i,
      retention: /\b(?:pastram|stocam|conservam)\b.{0,100}\b(?:datele (?:cu caracter personal|personale)|datele dumneavoastra)\b.{0,140}\b(?:atat timp cat|pana cand|pentru \d+|cat timp|necesar|obligatie legala)\b|\b(?:datele (?:cu caracter personal|personale)|datele dumneavoastra)\b.{0,100}\b(?:sunt pastrate|vor fi pastrate|sunt stocate|vor fi sterse)\b.{0,140}\b(?:atat timp cat|pana cand|pentru \d+|necesar|termen legal)\b/i,
      complaint: /\b(?:puteti|aveti dreptul sa)\b.{0,60}\b(?:depune|formula|inainta)\b.{0,30}\b(?:o )?plangere\b.{0,100}\b(?:autoritat(?:e|ea) de supraveghere|autoritatea nationala de supraveghere)\b/i,
      automated: /\b(?:proces decizional automatizat|decizii automatizate|crearea de profiluri|profilare)\b.{0,140}\b(?:nu este utilizat|nu sunt utilizate|nu are loc|utilizam|efecte juridice|afecteaza semnificativ)\b|\b(?:nu utilizam|nu folosim)\b.{0,100}\b(?:proces decizional automatizat|decizii automatizate|crearea de profiluri|profilare)\b/i,
    },
    {
      locale: "cs",
      purpose: /\b(?:osobni udaje|vase osobni udaje)\b.{0,100}\b(?:pouzivame|jsou pouzivany|zpracovavame|jsou zpracovavany)\b.{0,80}\b(?:k|pro|aby)\b.{0,120}\b(?:sprave|vyrizeni|poskytovani|plneni|ochrane|zlepseni)\b/i,
      legalBasis: /\b(?:zpracovani|zpracovavame)\b.{0,180}\b(?:je zalozeno na|se zaklada na|na zaklade)\b.{0,100}\b(?:souhlasu|pravni povinnosti|opravneneho zajmu|verejneho zajmu|zivotne dulezitych zajmu)\b/i,
      recipient: /\b(?:osobni udaje|vase osobni udaje)\b.{0,100}\b(?:predavame|jsou predavany|poskytujeme|jsou poskytovany)\b.{0,120}\b(?:poskytovatelum sluzeb|zpracovatelum|tretim stranam|platforme)\b/i,
      retention: /\b(?:uchovavame|ukladame)\b.{0,100}\b(?:osobni udaje|vase osobni udaje)\b.{0,140}\b(?:po dobu nezbytne nutnou|dokud|do doby|po dobu \d+|vyzaduje zakon)\b|\b(?:osobni udaje|vase osobni udaje)\b.{0,100}\b(?:jsou uchovavany|budou uchovavany|jsou smazany)\b.{0,140}\b(?:po dobu nezbytne nutnou|dokud|do doby|po dobu \d+)\b/i,
      complaint: /\b(?:muzete|mate pravo)\b.{0,60}\b(?:podat|vznést|vznest)\b.{0,30}\bstiznost\b.{0,100}\b(?:dozoroveho uradu|uradu pro ochranu osobnich udaju)\b/i,
      automated: /\b(?:automatizovane rozhodovani|automatizovana rozhodnuti|profilovani)\b.{0,140}\b(?:neprovadime|neni pouzivano|neprobiha|pouzivame|pravni ucinky|vyznamne ovlivnuje)\b|\b(?:neprovadime|nepouzivame)\b.{0,100}\b(?:automatizovane rozhodovani|automatizovana rozhodnuti|profilovani)\b/i,
    },
    {
      locale: "el",
      purpose: /(?:τα προσωπικα δεδομενα|τα δεδομενα σας).{0,100}(?:χρησιμοποιουνται|υποβαλλονται σε επεξεργασια).{0,80}(?:για να|για τη|με σκοπο).{0,120}(?:διαχειριση|απαντηση|παροχη|εκτελεση|προστασια|βελτιωση)/i,
      legalBasis: /(?:η επεξεργασια|επεξεργαζομαστε).{0,180}(?:βασιζεται στη|με βαση|στηριζεται στη).{0,100}(?:συγκαταθεση|νομικη υποχρεωση|εννομο συμφερον|δημοσιο συμφερον|ζωτικο συμφερον)/i,
      recipient: /(?:τα προσωπικα δεδομενα|τα δεδομενα σας).{0,100}(?:διαβιβαζονται|κοινοποιουνται|γνωστοποιουνται).{0,120}(?:εκτελουντα την επεξεργασια|παροχο υπηρεσιων|τριτο μερος|πλατφορμα)/i,
      retention: /(?:διατηρουμε|αποθηκευουμε).{0,100}(?:τα προσωπικα δεδομενα|τα δεδομενα σας).{0,140}(?:για οσο|εως οτου|για \d+|αναγκαιο|νομικη υποχρεωση)|(?:τα προσωπικα δεδομενα|τα δεδομενα σας).{0,100}(?:διατηρουνται|θα διατηρηθουν|διαγραφονται).{0,140}(?:για οσο|εως οτου|για \d+|αναγκαιο)/i,
      complaint: /(?:μπορειτε|εχετε το δικαιωμα να).{0,60}(?:υποβαλετε|καταθεσετε).{0,30}καταγγελια.{0,100}(?:εποπτικη αρχη|αρχη προστασιας δεδομενων)/i,
      automated: /(?:αυτοματοποιημενη ληψη αποφασεων|αυτοματοποιημενες αποφασεις|καταρτιση προφιλ).{0,140}(?:δεν χρησιμοποιειται|δεν πραγματοποιειται|δεν λαμβανει χωρα|χρησιμοποιουμε|εννομα αποτελεσματα|επηρεαζει σημαντικα)|(?:δεν χρησιμοποιουμε|δεν εφαρμοζουμε).{0,100}(?:αυτοματοποιημενη ληψη αποφασεων|αυτοματοποιημενες αποφασεις|καταρτιση προφιλ)/i,
    },
    {
      locale: "hu",
      purpose: /\b(?:szemelyes adatait|szemelyes adatokat|adatait)\b.{0,100}\b(?:hasznaljuk|kezeljuk|felhasznaljuk)\b.{0,80}\b(?:azert hogy|celjabol|erdekeben)\b.{0,120}\b(?:kezeljuk|megvalaszoljuk|biztositsuk|teljesitsuk|vedjuk|fejlesszuk)\b|\b(?:szemelyes adatait|szemelyes adatokat|adatait)\b.{0,120}\b(?:kezelese|megvalaszolasa|biztositasa|teljesitese|vedelme|fejlesztese)\b.{0,30}\bceljabol\b.{0,80}\b(?:hasznaljuk|kezeljuk|felhasznaljuk)\b/i,
      legalBasis: /\b(?:adatkezeles|szemelyes adatok kezelese)\b.{0,180}\b(?:alapja|alapul|jogalapja)\b.{0,100}\b(?:hozzajarulas|jogi kotelezettseg|jogos erdek|kozerdek|letfontossagu erdek)\b|\b(?:hozzajarulasa|jogi kotelezettseg|jogos erdek)\b.{0,100}\b(?:alapjan kezeljuk|alapjan tortenik az adatkezeles)\b/i,
      recipient: /\b(?:szemelyes adatokat|szemelyes adatait|adatait)\b.{0,100}\b(?:tovabbitjuk|atadjuk|hozzaferhetove tesszuk)\b.{0,120}\b(?:szolgaltatoknak|adatfeldolgozoknak|harmadik feleknek|platformnak)\b|\b(?:szemelyes adatokat|szemelyes adatait|adatait)\b.{0,100}\b(?:szolgaltatoknak|adatfeldolgozoknak|harmadik feleknek|platformnak)\b.{0,80}\b(?:tovabbitjuk|atadjuk|hozzaferhetove tesszuk)\b/i,
      retention: /\b(?:szemelyes adatokat|szemelyes adatait|adatait)\b.{0,100}\b(?:addig orizzuk meg|megorizzuk|taroljuk|toroljuk)\b.{0,140}\b(?:ameddig|mindaddig|szukseges|\d+ evig|jogszabaly)\b/i,
      complaint: /\b(?:panaszt nyujthat be|panaszt tehet|joga van panaszt benyujtani)\b.{0,100}\b(?:felugyeleti hatosagnal|adatvedelmi hatosagnal|nemzeti adatvedelmi es informacioszabadsag hatosagnal)\b/i,
      automated: /\b(?:automatizalt donteshozatal|automatizalt dontesek|profilalkotas)\b.{0,140}\b(?:nem alkalmazunk|nem tortenik|nem hasznalunk|alkalmazunk|joghatas|jelentosen erinti)\b|\b(?:nem alkalmazunk|nem hasznalunk)\b.{0,100}\b(?:automatizalt donteshozatalt|automatizalt donteseket|profilalkotast)\b/i,
    },
    {
      locale: "da",
      purpose: /\b(?:personoplysninger|dine personoplysninger)\b.{0,100}\b(?:bruges|anvendes|behandles)\b.{0,80}\b(?:til at|med henblik pa)\b.{0,120}\b(?:administrere|besvare|levere|opfylde|beskytte|forbedre)\b/i,
      legalBasis: /\b(?:behandlingen|behandling af personoplysninger)\b.{0,180}\b(?:er baseret pa|sker pa grundlag af|har grundlag i)\b.{0,100}\b(?:samtykke|retlig forpligtelse|legitime interesser|offentlig interesse|vitale interesser)\b/i,
      recipient: /\b(?:personoplysninger|dine personoplysninger)\b.{0,100}\b(?:videregives|overlades|deles)\b.{0,120}\b(?:databehandlere|tjenesteudbydere|tredjeparter|platforme)\b/i,
      retention: /\b(?:opbevarer|gemmer)\b.{0,100}\b(?:personoplysninger|dine personoplysninger)\b.{0,140}\b(?:sa lange som|indtil|i \d+|nødvendigt|nodvendigt|retlig forpligtelse)\b|\b(?:personoplysninger|dine personoplysninger)\b.{0,100}\b(?:opbevares|vil blive opbevaret|slettes)\b.{0,140}\b(?:sa lange som|indtil|i \d+|nødvendigt|nodvendigt)\b/i,
      complaint: /\b(?:du kan|du har ret til at)\b.{0,60}\b(?:indgive|indgive en)\b.{0,30}\bklage\b.{0,100}\b(?:tilsynsmyndighed|datatilsynet)\b/i,
      automated: /\b(?:automatiserede afg(?:ø|o)relser|automatiseret beslutningstagning|profilering)\b.{0,140}\b(?:anvendes ikke|finder ikke sted|bruger vi ikke|anvender vi|retsvirkning|pavirker betydeligt)\b|\b(?:vi anvender ikke|vi bruger ikke)\b.{0,100}\b(?:automatiserede afg(?:ø|o)relser|automatiseret beslutningstagning|profilering)\b/i,
    },
  ] as const).flatMap(({ locale, purpose, legalBasis, recipient, retention, complaint, automated }) => [
    { locale, matchedTerm: "specific personal-data processing purpose", pattern: purpose, topic: "processing_purposes" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "processing legal-basis clause", pattern: legalBasis, topic: "legal_basis" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "named recipient or meaningful recipient category", pattern: recipient, topic: "recipients_or_vendor_categories" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "personal-data retention period or criterion", pattern: retention, topic: "data_retention" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "supervisory-authority complaint disclosure", pattern: complaint, topic: "supervisory_authority" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "automated decision-making or profiling disclosure", pattern: automated, topic: "automated_decision_making_or_profiling" as const, variant: "semantic_clause" as const },
  ]),
  ...([
    {
      locale: "fi",
      purpose: /\bhenkilotietoja\b.{0,100}\b(?:kaytetaan|kasitellaan)\b.{0,100}\b(?:tilin hallintaan|pyyntoihin vastaamiseen|palvelun tarjoamiseen|suojaamiseen|parantamiseen)\b/i,
      legalBasis: /\bkasittely\b.{0,100}\bperustuu\b.{0,100}\b(?:suostumukseen|lakisaateiseen velvoitteeseen|oikeutettuun etuun|yleiseen etuun|elintarkeaan etuun)\b/i,
      recipient: /\bhenkilotietoja\b.{0,100}\b(?:luovutetaan|siirretaan|annetaan)\b.{0,120}\b(?:palveluntarjoajille|henkilotietojen kasittelijoille|kolmansille osapuolille|alustalle)\b/i,
      retention: /\b(?:sailytamme|pidamme)\b.{0,80}\bhenkilotietoja\b.{0,120}\b(?:niin kauan kuin|kunnes|\d+ vuoden ajan|tarpeen|laki edellyttaa)\b/i,
      complaint: /\b(?:voit|teilla on oikeus)\b.{0,60}\b(?:tehda|jattaa)\b.{0,30}\bvalituks(?:en|ta)?\b.{0,100}\b(?:valvontaviranomaiselle|tietosuojaviranomaiselle)\b/i,
      automated: /\b(?:emme kayta|emme suorita)\b.{0,100}\b(?:automatisoitua paatoksentekoa|automatisoituja paatoksia|profilointia)\b|\b(?:automatisoitu paatoksenteko|automatisoidut paatokset|profilointi)\b.{0,120}\b(?:ei ole kaytossa|ei tapahdu|oikeusvaikutuksia|vaikuttaa merkittavasti)\b/i,
    },
    {
      locale: "sk",
      purpose: /\bosobne udaje\b.{0,100}\b(?:pouzivame|spracuvame|su spracuvane)\b.{0,100}\b(?:na spravu|na vybavenie|na poskytovanie|na ochranu|na zlepsenie)\b/i,
      legalBasis: /\bspracuvani[ea]\b.{0,100}\b(?:je zalozene na|sa zaklada na|prebieha na zaklade)\b.{0,100}\b(?:suhlasu|zakonnej povinnosti|opravneneho zaujmu|verejneho zaujmu|zivotne doleziteho zaujmu)\b/i,
      recipient: /\bosobne udaje\b.{0,100}\b(?:poskytujeme|odovzdavame|su poskytovane)\b.{0,120}\b(?:sprostredkovatelom|poskytovatelom sluzieb|tretim stranam|platforme)\b/i,
      retention: /\b(?:uchovavame|skladujeme)\b.{0,80}\bosobne udaje\b.{0,120}\b(?:kym|pokial|do okamihu|\d+ rokov|potrebne|vyzaduje zakon)\b/i,
      complaint: /\b(?:mozete|mate pravo)\b.{0,60}\b(?:podat|uplatnit)\b.{0,30}\bstaznost\b.{0,100}\b(?:dozornemu organu|uradu na ochranu osobnych udajov)\b/i,
      automated: /\b(?:nepouzivame|nevykonavame)\b.{0,100}\b(?:automatizovane rozhodovanie|automatizovane rozhodnutia|profilovanie)\b|\b(?:automatizovane rozhodovanie|automatizovane rozhodnutia|profilovanie)\b.{0,120}\b(?:sa nepouziva|neprebieha|pravne ucinky|vyrazne ovplyvnuje)\b/i,
    },
    {
      locale: "bg",
      purpose: /(?:личните данни|вашите лични данни).{0,100}(?:се използват|се обработват).{0,100}(?:за управление|за отговор|за предоставяне|за изпълнение|за защита|за подобряване)/i,
      legalBasis: /(?:обработването|обработката).{0,100}(?:се основава на|е въз основа на).{0,100}(?:съгласие|законово задължение|легитимен интерес|обществен интерес|жизненоважен интерес)/i,
      recipient: /(?:личните данни|вашите лични данни).{0,100}(?:се предоставят|се предават|се разкриват).{0,120}(?:обработващи лични данни|доставчици на услуги|трети страни|платформа)/i,
      retention: /(?:съхраняваме|пазим).{0,80}(?:личните данни|вашите лични данни).{0,120}(?:докато|до момента|за \d+ години|необходимо|изисква законът)/i,
      complaint: /(?:можете|имате право да).{0,60}(?:подадете|внесете).{0,30}жалба.{0,100}(?:надзорен орган|комисията за защита на личните данни)/i,
      automated: /(?:не използваме|не извършваме).{0,100}(?:автоматизирано вземане на решения|автоматизирани решения|профилиране)|(?:автоматизирано вземане на решения|автоматизирани решения|профилиране).{0,120}(?:не се използва|не се извършва|правни последици|засяга значително)/i,
    },
    {
      locale: "hr",
      purpose: /\bosobne podatke\b.{0,100}\b(?:koristimo|obradujemo|upotrebljavamo)\b.{0,100}\b(?:za upravljanje|za odgovor|za pruzanje|za ispunjavanje|za zastitu|za poboljsanje)\b/i,
      legalBasis: /\bobrada\b.{0,100}\b(?:se temelji na|zasniva se na)\b.{0,100}\b(?:privoli|zakonskoj obvezi|legitimnom interesu|javnom interesu|zivotnom interesu)\b/i,
      recipient: /\bosobne podatke\b.{0,100}\b(?:proslje(?:đ|d)ujemo|prenosimo|otkrivamo)\b.{0,120}\b(?:izvrsiteljima obrade|pruzateljima usluga|trecim stranama|platformi)\b/i,
      retention: /\b(?:cuvamo|pohranjujemo)\b.{0,80}\bosobne podatke\b.{0,120}\b(?:dok god|sve dok|do trenutka|\d+ godina|potrebno|zahtijeva zakon)\b/i,
      complaint: /\b(?:mozete|imate pravo)\b.{0,60}\b(?:podnijeti|uloziti)\b.{0,30}\bprituzbu\b.{0,100}\b(?:nadzornom tijelu|agenciji za zastitu osobnih podataka)\b/i,
      automated: /\b(?:ne koristimo|ne provodimo)\b.{0,100}\b(?:automatizirano donosenje odluka|automatizirane odluke|izradu profila|profiliranje)\b|\b(?:automatizirano donosenje odluka|automatizirane odluke|profiliranje)\b.{0,120}\b(?:ne koristi se|ne provodi se|pravne ucinke|znacajno utjece)\b/i,
    },
    {
      locale: "nb",
      purpose: /\bpersonopplysninger\b.{0,100}\b(?:brukes|behandles|benyttes)\b.{0,100}\b(?:til a administrere|til a svare|til a levere|til a oppfylle|til a beskytte|til a forbedre)\b/i,
      legalBasis: /\bbehandlingen\b.{0,100}\b(?:er basert pa|bygger pa|skjer pa grunnlag av)\b.{0,100}\b(?:samtykke|rettslig forpliktelse|berettigede interesser|allmenn interesse|vitale interesser)\b/i,
      recipient: /\bpersonopplysninger\b.{0,100}\b(?:utleveres|deles|overfores)\b.{0,120}\b(?:databehandlere|tjenesteleverandorer|tredjeparter|plattformer)\b/i,
      retention: /\b(?:lagrer|oppbevarer)\b.{0,80}\bpersonopplysninger\b.{0,120}\b(?:sa lenge som|inntil|i \d+ ar|nødvendig|nodvendig|kreves ved lov)\b/i,
      complaint: /\b(?:du kan|du har rett til a)\b.{0,60}\b(?:sende inn|inngi|levere)\b.{0,30}\b(?:en )?klage\b.{0,100}\b(?:tilsynsmyndighet|datatilsynet)\b/i,
      automated: /\b(?:vi bruker ikke|vi foretar ikke)\b.{0,100}\b(?:automatiserte avgjørelser|automatiserte avgjorelser|automatisert beslutningstaking|profilering)\b|\b(?:automatiserte avgjørelser|automatiserte avgjorelser|automatisert beslutningstaking|profilering)\b.{0,120}\b(?:brukes ikke|finner ikke sted|rettsvirkning|pavirker betydelig)\b/i,
    },
    {
      locale: "sl",
      purpose: /\bosebne podatke\b.{0,100}\b(?:uporabljamo|obdelujemo)\b.{0,100}\b(?:za upravljanje|za odgovor|za zagotavljanje|za izpolnitev|za zascito|za izboljsanje)\b/i,
      legalBasis: /\bobdelava\b.{0,100}\b(?:temelji na|se izvaja na podlagi)\b.{0,100}\b(?:privolitvi|zakonski obveznosti|zakonitem interesu|javnem interesu|zivljenjskem interesu)\b/i,
      recipient: /\bosebne podatke\b.{0,100}\b(?:posredujemo|razkrivamo|prenasamo)\b.{0,120}\b(?:obdelovalcem|ponudnikom storitev|tretjim osebam|platformi)\b/i,
      retention: /\b(?:hranimo|shranjujemo)\b.{0,80}\bosebne podatke\b.{0,120}\b(?:dokler|do trenutka|\d+ let|potrebno|zahteva zakon)\b/i,
      complaint: /\b(?:lahko|imate pravico)\b.{0,60}\b(?:vlozite|podate)\b.{0,30}\bpritozbo\b.{0,100}\b(?:nadzornem organu|informacijskem pooblascencu)\b/i,
      automated: /\b(?:ne uporabljamo|ne izvajamo)\b.{0,100}\b(?:avtomatiziranega sprejemanja odlocitev|avtomatiziranih odlocitev|oblikovanja profilov|profiliranja)\b|\b(?:avtomatizirano sprejemanje odlocitev|avtomatizirane odlocitve|profiliranje)\b.{0,120}\b(?:se ne uporablja|se ne izvaja|pravne ucinke|znatno vpliva)\b/i,
    },
    {
      locale: "lt",
      purpose: /\b(?:asmens duomenis|jusu asmens duomenis)\b.{0,100}\b(?:naudojame|tvarkome)\b.{0,100}\b(?:paskyrai tvarkyti|uzklausoms atsakyti|paslaugoms teikti|isipareigojimams vykdyti|apsaugoti|tobulinti)\b/i,
      legalBasis: /\bduomenu tvarkymas\b.{0,100}\b(?:grindziamas|atliekamas remiantis)\b.{0,100}\b(?:sutikimu|teisine prievole|teisetu interesu|viesuoju interesu|gyvybiniu interesu)\b/i,
      recipient: /\b(?:asmens duomenis|jusu asmens duomenis)\b.{0,100}\b(?:perduodame|atskleidziame|pateikiame)\b.{0,120}\b(?:duomenu tvarkytojams|paslaugu teikejams|tretiesiems asmenims|platformai)\b/i,
      retention: /\b(?:saugome|laikome)\b.{0,80}\b(?:asmens duomenis|jusu asmens duomenis)\b.{0,120}\b(?:tol kol|iki|\d+ metus|butina|reikalauja istatymai)\b/i,
      complaint: /\b(?:galite|turite teise)\b.{0,60}\b(?:pateikti|paduoti)\b.{0,30}\bskunda\b.{0,100}\b(?:prieziuros institucijai|valstybinei duomenu apsaugos inspekcijai)\b/i,
      automated: /\b(?:nenaudojame|nevykdome)\b.{0,100}\b(?:automatizuoto sprendimu priemimo|automatizuotu sprendimu|profiliavimo)\b|\b(?:automatizuotas sprendimu priemimas|automatizuoti sprendimai|profiliavimas)\b.{0,120}\b(?:nenaudojamas|nevykdomas|teisines pasekmes|daro dideli poveiki)\b/i,
    },
    {
      locale: "lv",
      purpose: /\b(?:personas datus|jusu personas datus)\b.{0,100}\b(?:izmantojam|apstradajam)\b.{0,100}\b(?:konta parvaldisanai|pieprasijumu apstradei|pakalpojumu sniegsanai|saistibu izpildei|aizsardzibai|uzlabosanai)\b/i,
      legalBasis: /\bdatu apstrade\b.{0,100}\b(?:balstas uz|notiek pamatojoties uz)\b.{0,100}\b(?:piekrisanu|juridisku pienakumu|legitimam interesem|sabiedribas interesem|vitālam interesem)\b/i,
      recipient: /\b(?:personas datus|jusu personas datus)\b.{0,100}\b(?:nododam|izpauzam|nosutam)\b.{0,120}\b(?:apstradatajiem|pakalpojumu sniedzejiem|tresajam personam|platformai)\b/i,
      retention: /\b(?:glabajam|saglabajam)\b.{0,80}\b(?:personas datus|jusu personas datus)\b.{0,120}\b(?:tik ilgi cik|lidz|\d+ gadus|nepieciesams|prasa likums)\b/i,
      complaint: /\b(?:varat|jums ir tiesibas)\b.{0,60}\b(?:iesniegt|celt)\b.{0,30}\bsudzibu\b.{0,100}\b(?:uzraudzibas iestadei|datu valsts inspekcijai)\b/i,
      automated: /\b(?:neizmantojam|neveicam)\b.{0,100}\b(?:automatizetu lemumu pienemsanu|automatizetus lemumus|profilesanu)\b|\b(?:automatizeta lemumu pienemsana|automatizeti lemumi|profilesana)\b.{0,120}\b(?:netiek izmantota|nenotiek|tiesiskas sekas|butiski ietekme)\b/i,
    },
    {
      locale: "et",
      purpose: /\b(?:isikuandmeid|teie isikuandmeid)\b.{0,100}\b(?:kasutame|tootleme)\b.{0,100}\b(?:konto haldamiseks|paringutele vastamiseks|teenuse osutamiseks|kohustuste taitmiseks|kaitsmiseks|parandamiseks)\b/i,
      legalBasis: /\bandmetootlus\b.{0,100}\b(?:pohineb|toimub alusel)\b.{0,100}\b(?:nousolekul|seaduslikul kohustusel|oigustatud huvil|avalikul huvil|elulisel huvil)\b/i,
      recipient: /\b(?:isikuandmeid|teie isikuandmeid)\b.{0,100}\b(?:edastame|avaldame|anname)\b.{0,120}\b(?:volitatud töötlejatele|volitatud tootlejatele|teenusepakkujatele|kolmandatele isikutele|platvormile)\b/i,
      retention: /\b(?:sailitame|hoiame)\b.{0,80}\b(?:isikuandmeid|teie isikuandmeid)\b.{0,120}\b(?:nii kaua kui|kuni|\d+ aastat|vajalik|nouab seadus)\b/i,
      complaint: /\b(?:voite|teil on oigus)\b.{0,60}\b(?:esitada|pohjendada)\b.{0,30}\bkaebuse\b.{0,100}\b(?:jarelevalveasutusele|andmekaitse inspektsioonile)\b/i,
      automated: /\b(?:me ei kasuta|me ei tee)\b.{0,100}\b(?:automatiseeritud otsuseid|automatiseeritud otsuste tegemist|profiilianaluusi)\b|\b(?:automatiseeritud otsuste tegemine|automatiseeritud otsused|profiilianaluus)\b.{0,120}\b(?:ei ole kasutusel|ei toimu|oiguslikud tagajarjed|mojutab oluliselt)\b/i,
    },
    {
      locale: "uk",
      purpose: /(?:персональні дані|ваші персональні дані).{0,100}(?:використовуються|обробляються).{0,100}(?:для керування|для відповіді|для надання|для виконання|для захисту|для покращення)/i,
      legalBasis: /(?:обробка|опрацювання).{0,100}(?:ґрунтується на|здійснюється на підставі).{0,100}(?:згоді|юридичному обов'язку|законному інтересі|суспільному інтересі|життєво важливому інтересі)/i,
      recipient: /(?:персональні дані|ваші персональні дані).{0,100}(?:передаються|розкриваються|надаються).{0,120}(?:обробникам|постачальникам послуг|третім особам|платформі)/i,
      retention: /(?:зберігаємо|утримуємо).{0,80}(?:персональні дані|ваші персональні дані).{0,120}(?:доки|до моменту|протягом \d+ років|необхідно|вимагає закон)/i,
      complaint: /(?:можете|маєте право).{0,60}(?:подати|надіслати).{0,30}скаргу.{0,100}(?:наглядовому органу|уповноваженому із захисту персональних даних)/i,
      automated: /(?:ми не використовуємо|ми не здійснюємо).{0,100}(?:автоматизоване прийняття рішень|автоматизовані рішення|профілювання)|(?:автоматизоване прийняття рішень|автоматизовані рішення|профілювання).{0,120}(?:не використовується|не здійснюється|правові наслідки|істотно впливає)/i,
    },
    {
      locale: "tr",
      purpose: /\b(?:kisisel verileri|kisisel verilerinizi)\b.{0,100}\b(?:kullaniyoruz|isliyoruz)\b.{0,100}\b(?:hesabi yonetmek|talepleri yanitlamak|hizmet sunmak|yukumlulukleri yerine getirmek|korumak|gelistirmek)\b/i,
      legalBasis: /\bveri isleme\b.{0,100}\b(?:dayanir|temelinde gerceklesir)\b.{0,100}\b(?:acik riza|yasal yukumluluk|mesru menfaat|kamu yarari|hayati menfaat)\b/i,
      recipient: /\b(?:kisisel verileri|kisisel verilerinizi)\b.{0,100}\b(?:aktar[iı]r[iı]z|paylas[iı]r[iı]z|acar[iı]z)\b.{0,120}\b(?:veri isleyenlere|hizmet saglayicilara|ucuncu taraflara|platforma)\b/i,
      retention: /\b(?:saklar[iı]z|muhafaza ederiz)\b.{0,80}\b(?:kisisel verileri|kisisel verilerinizi)\b.{0,120}\b(?:gerektigi surece|ihtiyac oldugu surece|\d+ yil|yasa gerektirir)\b|\b(?:kisisel verileri|kisisel verilerinizi)\b.{0,100}\b(?:saklar[iı]z|muhafaza ederiz)\b.{0,120}\b(?:gerektigi surece|ihtiyac oldugu surece|\d+ yil|yasa gerektirir)\b/i,
      complaint: /\b(?:sikayette bulunabilirsiniz|sikayet etme hakk[iı]n[iı]z vard[iı]r)\b.{0,100}\b(?:denetim makam[iı]na|kisisel verileri koruma kuruluna)\b/i,
      automated: /\b(?:kullanm[iı]yoruz|gerceklestirmiyoruz)\b.{0,100}\b(?:otomatik karar verme|otomatik kararlar|profilleme)\b|\b(?:otomatik karar verme(?:yi)?|otomatik kararlar|profilleme(?:yi)?)\b.{0,120}\b(?:kullan[iı]lmaz|gerceklesmez|gerceklestirmiyoruz|hukuki sonuc|onemli olcude etkiler)\b/i,
    },
  ] as const).flatMap(({ locale, purpose, legalBasis, recipient, retention, complaint, automated }) => [
    { locale, matchedTerm: "specific personal-data processing purpose", pattern: purpose, topic: "processing_purposes" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "processing legal-basis clause", pattern: legalBasis, topic: "legal_basis" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "named recipient or meaningful recipient category", pattern: recipient, topic: "recipients_or_vendor_categories" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "personal-data retention period or criterion", pattern: retention, topic: "data_retention" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "supervisory-authority complaint disclosure", pattern: complaint, topic: "supervisory_authority" as const, variant: "semantic_clause" as const },
    { locale, matchedTerm: "automated decision-making or profiling disclosure", pattern: automated, topic: "automated_decision_making_or_profiling" as const, variant: "semantic_clause" as const },
  ]),
] as const;

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
const localizedTopicTerms = (
  locale: SupportedGdprTransparencyLocale,
  phrases: Record<GdprTransparencyTopic, readonly [string, ...string[]]>,
): GdprTransparencyTopicPhrase[] => Object.entries(phrases).flatMap(([topic, topicPhrases]) =>
  topicPhrases.map((phrase, index) => ({
    locale,
    phrase,
    strength: index === 0 ? "direct" as const : "equivalent" as const,
    topic: topic as GdprTransparencyTopic,
  }))
);

export const GDPR_TRANSPARENCY_TOPIC_PHRASE_REGISTRY: GdprTransparencyTopicPhrase[] = [
  ...en([
    direct("controller_contact", "data controller"),
    direct("controller_contact", "data controller contact"),
    equivalent("controller_contact", "controller operator of data"),
    equivalent("controller_contact", "controller of data"),
    equivalent("controller_contact", "privacy contact"),
    equivalent("controller_contact", "data protection contact"),
    equivalent("controller_contact", "questions related to data processing can be sent to privacy"),
    equivalent("controller_contact", "questions about this privacy policy", "requires_topic_context"),
    equivalent("controller_contact", "questions about this policy please contact us", "requires_topic_context"),
    equivalent("controller_contact", "if you have questions about this policy please contact us", "requires_topic_context"),
    equivalent("controller_contact", "contact us and our data protection officer", "privacy_contact_point"),
    equivalent("controller_contact", "attention privacy officer"),
    equivalent("controller_contact", "you can contact us at", "requires_topic_context"),
    equivalent("controller_contact", "who is the controller of personal data", "requires_privacy_context"),
    equivalent("controller_contact", "is the controller of personal data", "requires_privacy_context"),
    equivalent("controller_contact", "is the controller of the data", "requires_privacy_context"),
    equivalent("controller_contact", "information on the controller pursuant to art 4", "requires_topic_context"),
    equivalent("controller_contact", "controller and contact", "requires_topic_context"),
    equivalent("controller_contact", "companies are the controller"),
    direct("dpo_contact", "data protection officer"),
    equivalent("dpo_contact", "dpo contact"),
    equivalent("dpo_contact", "contact our dpo"),
    equivalent("dpo_contact", "data privacy officer"),
    equivalent("dpo_contact", "office of the data privacy officer"),
    equivalent("dpo_contact", "privacy counsel"),
    equivalent("dpo_contact", "privacy manager", "requires_privacy_context"),
    equivalent("dpo_contact", "privacy contact point", "privacy_contact_point"),
    direct("processing_purposes", "purposes of processing personal data"),
    direct("processing_purposes", "why we process personal data"),
    direct("processing_purposes", "use your personal data"),
    equivalent("processing_purposes", "purposes for which we use the information"),
    equivalent("processing_purposes", "how we use the information we collect", "requires_privacy_context"),
    equivalent("processing_purposes", "how do we use the information we collect", "requires_privacy_context"),
    equivalent("processing_purposes", "what do we use your data for", "requires_privacy_context"),
    direct("processing_purposes", "data will be processed for the following purposes"),
    equivalent("processing_purposes", "use information we collect from and about you for the following purposes", "requires_privacy_context"),
    equivalent("processing_purposes", "use the information for the purposes for which it was collected"),
    equivalent("processing_purposes", "use the information for the purposes for which it is provided"),
    equivalent("processing_purposes", "how we use your personal information"),
    equivalent("processing_purposes", "information will be used only to complete the activity for which it was provided", "requires_privacy_context"),
    equivalent("processing_purposes", "we use this information to"),
    equivalent("processing_purposes", "purposes and legal basis", "requires_topic_context"),
    equivalent("processing_purposes", "purposes and legal-basis", "requires_topic_context"),
    equivalent("processing_purposes", "uses personal data for the following goals"),
    equivalent("processing_purposes", "use personal data for the following goals"),
    direct("legal_basis", "legal basis for processing personal data"),
    direct("legal_basis", "lawful basis for processing personal data"),
    equivalent("legal_basis", "legal basis on which we hold and use your data"),
    equivalent("legal_basis", "our lawful bases include"),
    equivalent("legal_basis", "legal basis for collecting personally identifiable information"),
    equivalent("legal_basis", "basis for our processing", "requires_privacy_context"),
    equivalent("legal_basis", "needed to fulfill a contract"),
    equivalent("legal_basis", "comply with our legal obligations", "requires_topic_context"),
    equivalent("legal_basis", "legitimate interests for processing personal data"),
    equivalent("legal_basis", "relevant legitimate interest"),
    equivalent("legal_basis", "presence of the relevant legitimate interest"),
    equivalent("legal_basis", "processing of your information on the basis of our legitimate interests", "requires_privacy_context"),
    direct("legal_basis", "data processing is based on art 6"),
    direct("legal_basis", "legal bases are art 6"),
    equivalent("legal_basis", "under a contract", "requires_topic_context"),
    equivalent("legal_basis", "legitimate-interest purpose", "requires_topic_context"),
    direct("recipients_or_vendor_categories", "recipients of personal data"),
    direct("recipients_or_vendor_categories", "categories of recipients of personal data"),
    direct("recipients_or_vendor_categories", "third parties with whom we share personal data"),
    direct("recipients_or_vendor_categories", "share personal information with third parties"),
    equivalent("recipients_or_vendor_categories", "share personal information with service providers"),
    equivalent("recipients_or_vendor_categories", "pass on your data to the shipping provider"),
    equivalent("recipients_or_vendor_categories", "pass on your data to a service provider"),
    equivalent("recipients_or_vendor_categories", "pass on personal data to service providers"),
    equivalent("recipients_or_vendor_categories", "share or provide access to your information with service providers"),
    equivalent("recipients_or_vendor_categories", "share information with third parties", "requires_topic_context"),
    equivalent("recipients_or_vendor_categories", "who do we disclose your information to", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "recipient of the data", "requires_topic_context"),
    equivalent("recipients_or_vendor_categories", "content-delivery providers may process"),
    equivalent("recipients_or_vendor_categories", "service providers may process"),
    equivalent("recipients_or_vendor_categories", "service providers that may receive or process information on our behalf", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "service providers that process personal data"),
    equivalent("recipients_or_vendor_categories", "subcontractors and service providers"),
    equivalent("recipients_or_vendor_categories", "processors receive"),
    equivalent("recipients_or_vendor_categories", "our affiliates service providers third parties"),
    equivalent("recipients_or_vendor_categories", "our affiliates service providers and third parties"),
    equivalent("recipients_or_vendor_categories", "push subscription endpoint is shared"),
    equivalent("recipients_or_vendor_categories", "business partners who help us facilitate the services"),
    equivalent("recipients_or_vendor_categories", "supporting suppliers", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "payment and delivery service providers", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "advertising networks and analytics partners", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "named vendors include", "requires_topic_context"),
    equivalent("recipients_or_vendor_categories", "vendors include", "requires_topic_context"),
    direct("data_retention", "retention period for personal data"),
    direct("data_retention", "retain personal data"),
    direct("data_retention", "how long do we keep your personal information"),
    equivalent("data_retention", "additional information about data retention", "requires_privacy_context"),
    equivalent("data_retention", "as long as necessary for processing"),
    equivalent("data_retention", "retain your pii for as long as necessary", "requires_privacy_context"),
    equivalent("data_retention", "records are retained for", "requires_topic_context"),
    equivalent("data_retention", "retain account data", "requires_privacy_context"),
    equivalent("data_retention", "we only keep information for as long as we need", "requires_privacy_context"),
    equivalent("data_retention", "data is stored for as long as its processing is necessary", "requires_privacy_context"),
    equivalent("data_retention", "comment and its metadata are retained indefinitely", "requires_privacy_context"),
    equivalent("data_retention", "recordings are kept for", "requires_topic_context"),
    direct("data_subject_rights", "right to access your personal data"),
    direct("data_subject_rights", "right to erasure of personal data"),
    direct("data_subject_rights", "right to object to processing"),
    direct("data_subject_rights", "rights of data subject"),
    equivalent("data_subject_rights", "right to request the deletion of your personal data"),
    equivalent("data_subject_rights", "right to restrict or limit the ways in which we process your personal data"),
    direct("data_subject_rights", "request access correction deletion restriction portability or objection"),
    equivalent("data_subject_rights", "rights to request access to personal data deletion correction portability restriction or objection", "requires_privacy_context"),
    equivalent("data_subject_rights", "right to access and rectification", "requires_privacy_context"),
    equivalent("data_subject_rights", "right to access and delete", "requires_privacy_context"),
    equivalent("data_subject_rights", "right to access or delete", "requires_privacy_context"),
    direct("data_subject_rights", "right to data portability"),
    direct("data_subject_rights", "right to request the restriction of the processing of your personal data"),
    direct("international_transfers", "international transfers of personal data"),
    direct("international_transfers", "international transfers of data"),
    equivalent("international_transfers", "data transfer to processors"),
    equivalent("international_transfers", "transfer your personal data outside your jurisdiction"),
    equivalent("international_transfers", "transfer your data outside the eea", "requires_privacy_context"),
    equivalent("international_transfers", "transferring personal information outside the eea", "requires_privacy_context"),
    equivalent("international_transfers", "transfers of your data outside the eea"),
    equivalent("international_transfers", "transfers outside the eea", "requires_topic_context"),
    equivalent("international_transfers", "transfer data to processors located outside"),
    equivalent("international_transfers", "processors located outside"),
    equivalent("international_transfers", "transfer personal data outside the european economic area"),
    direct("international_transfers", "personal data outside the european economic area"),
    equivalent("international_transfers", "transferred to and processed in the united states or other jurisdictions"),
    equivalent("international_transfers", "transferred to or processed in the united states or other jurisdictions"),
    equivalent("international_transfers", "information may be transferred to and processed in the united states", "requires_privacy_context"),
    equivalent("international_transfers", "personal data will be transferred from your country of origin to the united states", "requires_privacy_context"),
    equivalent("international_transfers", "transferred to and stored at a destination outside the eu or the eea", "requires_privacy_context"),
    equivalent("international_transfers", "standard contractual clauses for personal data transfers"),
    equivalent("international_transfers", "standard contractual clauses issued by the european commission", "requires_privacy_context"),
    equivalent("international_transfers", "countries that have been deemed to provide an adequate level of protection for personal data"),
    equivalent("international_transfers", "international transfer of data", "requires_privacy_context"),
    equivalent("international_transfers", "overseas transfers of data", "requires_privacy_context"),
    equivalent("international_transfers", "pii is transferred outside the european economic area", "requires_privacy_context"),
    equivalent("international_transfers", "cross-border transfer", "requires_privacy_context"),
    equivalent("international_transfers", "personal information is transferred across borders", "requires_privacy_context"),
    direct("international_transfers", "data transfers to third countries"),
    direct("supervisory_authority", "right to lodge a complaint with a supervisory authority"),
    direct("supervisory_authority", "lodge a complaint with a supervisory authority"),
    equivalent("supervisory_authority", "lodge a complaint with the national supervisory authority"),
    equivalent("supervisory_authority", "right to complain to your data protection authority"),
    equivalent("supervisory_authority", "complain to your data protection authority"),
    equivalent("supervisory_authority", "lodge a complaint with an e.u. data protection authority"),
    equivalent("supervisory_authority", "right to make a complaint", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to file a complaint", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to submit complaints", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to complain to a supervisory authority"),
    equivalent("supervisory_authority", "right to complain to a data protection authority"),
    equivalent("supervisory_authority", "complaint with a data protection authority", "requires_privacy_context"),
    equivalent("supervisory_authority", "complaint before the supervisory authority", "requires_privacy_context"),
    equivalent("supervisory_authority", "claim with your data protection authority", "requires_privacy_context"),
    equivalent("supervisory_authority", "complaint to the information commissioner", "requires_privacy_context"),
    equivalent("supervisory_authority", "complaint to the competent data protection authority", "requires_privacy_context"),
    equivalent("supervisory_authority", "complaint with the applicable government regulator", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to lodge a complaint", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to submit a complaint", "requires_privacy_context"),
    equivalent("supervisory_authority", "right to bring a claim before", "requires_privacy_context"),
    equivalent("supervisory_authority", "file a claim with the data protection supervisory authority"),
    equivalent("supervisory_authority", "right to contact your local data protection supervisory authority to lodge a complaint"),
    equivalent("supervisory_authority", "submit a complaint to the applicable government regulator"),
    equivalent("supervisory_authority", "right to complain to the data protection supervisory authority"),
    equivalent("supervisory_authority", "lodge a complaint with a european data protection authority"),
    equivalent("supervisory_authority", "complaint may be lodged with the local supervisory authority"),
    equivalent("supervisory_authority", "lodge a complaint with the relevant governmental authority"),
    equivalent("supervisory_authority", "right to complain to the national data protection authority"),
    equivalent("supervisory_authority", "submit a complaint regarding the processing of personal data", "requires_privacy_context"),
    equivalent("supervisory_authority", "make a complaint before the national personal data protection authority"),
    equivalent("supervisory_authority", "lodge a complaint with the information commissioner's office"),
    equivalent("supervisory_authority", "complain to the data protection commission", "requires_topic_context"),
    equivalent("supervisory_authority", "data protection commission", "requires_topic_context"),
    equivalent("supervisory_authority", "lodge a complaint related to the processing of your personal data with the competent data protection authority"),
    direct("automated_decision_making_or_profiling", "automated decision-making using personal data"),
    equivalent("automated_decision_making_or_profiling", "automated decision-making for data processing"),
    equivalent("automated_decision_making_or_profiling", "automated individual decision-making processes", "requires_privacy_context"),
    equivalent("automated_decision_making_or_profiling", "profiling of personal data"),
    equivalent("automated_decision_making_or_profiling", "profiling for data processing"),
    equivalent("automated_decision_making_or_profiling", "do not use your data for profiling"),
    equivalent("automated_decision_making_or_profiling", "do not use personal data for profiling"),
    equivalent("automated_decision_making_or_profiling", "does not use personal data for profiling"),
    equivalent("automated_decision_making_or_profiling", "do not perform any automated profiling", "requires_privacy_context"),
    equivalent("automated_decision_making_or_profiling", "do not make decisions of this kind", "requires_topic_context"),
    equivalent("automated_decision_making_or_profiling", "will not be used for automated decision-making", "requires_privacy_context"),
    equivalent("automated_decision_making_or_profiling", "solely by automated means", "requires_topic_context"),
  ]),
  ...de([
    direct("controller_contact", "verantwortlicher für die datenverarbeitung"),
    direct("controller_contact", "verantwortlich für die datenverarbeitung"),
    direct("controller_contact", "kontaktdaten des verantwortlichen"),
    equivalent("controller_contact", "verantwortlicher", "requires_topic_context"),
    direct("controller_contact", "kontakt zum verantwortlichen für datenschutz"),
    equivalent("controller_contact", "datenschutz kontakt"),
    equivalent("controller_contact", "kontakt zum datenschutz"),
    equivalent("dpo_contact", "unser datenschutzbeauftragter"),
    equivalent("dpo_contact", "datenschutzbeauftragter", "requires_topic_context"),
    equivalent("dpo_contact", "datenschutzbeauftragte/r beim anbieter ist", "requires_privacy_context"),
    equivalent("dpo_contact", "name und anschrift des dsb", "requires_privacy_context"),
    equivalent("dpo_contact", "datenschutzbeauftragten erreichen"),
    equivalent("dpo_contact", "kontakt zum datenschutzbeauftragten"),
    direct("processing_purposes", "zwecke der verarbeitung personenbezogener daten"),
    equivalent("processing_purposes", "zweck dauer und rechtsgrundlage der verarbeitung personenbezogener daten", "requires_privacy_context"),
    equivalent("processing_purposes", "zweck der verarbeitung personenbezogener daten", "requires_privacy_context"),
    equivalent("processing_purposes", "zweck der verarbeitung", "requires_privacy_context"),
    equivalent("processing_purposes", "zwecke der verarbeitung", "requires_privacy_context"),
    equivalent("processing_purposes", "welche zwecke wir verfolgen"),
    equivalent("processing_purposes", "wofür wir ihre personenbezogenen daten verwenden"),
    direct("legal_basis", "rechtsgrundlage für die verarbeitung personenbezogener daten"),
    equivalent("legal_basis", "rechtsgrundlage der verarbeitung personenbezogener daten", "requires_privacy_context"),
    equivalent("legal_basis", "rechtsgrundlage von art 6", "requires_privacy_context"),
    equivalent("legal_basis", "maßgebliche rechtsgrundlagen", "requires_privacy_context"),
    equivalent("legal_basis", "rechtsgrundlage für die einholung von einwilligungen", "requires_privacy_context"),
    direct("legal_basis", "auf welcher rechtsgrundlage die verarbeitung basiert"),
    equivalent("legal_basis", "berechtigte interessen für die verarbeitung personenbezogener daten"),
    direct("legal_basis", "datenverarbeitung erfolgt auf grundlage von art 6"),
    direct("recipients_or_vendor_categories", "empfänger personenbezogener daten"),
    direct("recipients_or_vendor_categories", "empfänger der personenbezogenen daten"),
    equivalent("recipients_or_vendor_categories", "offenlegung und übermittlung von daten", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "auftragsverarbeitern oder dritten", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "welche empfänger von daten es geben kann"),
    equivalent("recipients_or_vendor_categories", "kategorien von empfängern personenbezogener daten"),
    equivalent("recipients_or_vendor_categories", "dienstleister die personenbezogene daten verarbeiten"),
    equivalent("recipients_or_vendor_categories", "an unseren webspace-provider übermittelt", "requires_privacy_context"),
    equivalent("recipients_or_vendor_categories", "an unseren webspace provider übermittelt", "requires_privacy_context"),
    direct("data_retention", "speicherdauer personenbezogener daten"),
    equivalent("data_retention", "dauer der speicherung", "requires_privacy_context"),
    equivalent("data_retention", "löschung von daten", "requires_privacy_context"),
    equivalent("data_retention", "gespeicherten daten gelöscht sobald", "requires_privacy_context"),
    equivalent("data_retention", "wie lange ihre informationen gespeichert werden"),
    equivalent("data_retention", "solange dies für die verarbeitung erforderlich ist"),
    equivalent("data_retention", "personenbezogene daten werden nur so lange gespeichert wie dies für die zwecke erforderlich ist"),
    direct("data_subject_rights", "recht auf auskunft über personenbezogene daten"),
    direct("data_subject_rights", "rechte der betroffenen personen"),
    equivalent("data_subject_rights", "rechte der nutzer und betroffenen", "requires_privacy_context"),
    equivalent("data_subject_rights", "auf auskunft über die verarbeiteten daten", "requires_privacy_context"),
    equivalent("data_subject_rights", "rechte der betroffenen person", "requires_privacy_context"),
    equivalent("data_subject_rights", "recht auf auskunft über diese daten", "requires_privacy_context"),
    equivalent("data_subject_rights", "recht auf löschung personenbezogener daten"),
    direct("data_subject_rights", "recht auf datenübertragbarkeit"),
    direct("data_subject_rights", "recht auf einschränkung der verarbeitung"),
    direct("international_transfers", "übermittlung personenbezogener daten in ein drittland"),
    equivalent("international_transfers", "übermittlungen in drittländer", "requires_privacy_context"),
    equivalent("international_transfers", "übermittlungen an ein drittland", "requires_privacy_context"),
    equivalent("international_transfers", "zertifizierung zum data privacy framework", "requires_privacy_context"),
    equivalent("international_transfers", "unter dem privacy shield zertifiziert", "requires_privacy_context"),
    equivalent("international_transfers", "eu-us data privacy framework", "requires_privacy_context"),
    equivalent("international_transfers", "voraussetzungen der art 44", "requires_privacy_context"),
    equivalent("international_transfers", "standardvertragsklauseln für die übermittlung personenbezogener daten"),
    direct("international_transfers", "übermittlung personenbezogener daten in drittländer"),
    direct("supervisory_authority", "recht auf beschwerde bei einer aufsichtsbehörde"),
    direct("supervisory_authority", "recht auf beschwerde gegenüber der aufsichtsbehörde", "requires_privacy_context"),
    equivalent("supervisory_authority", "beschwerde bei einer aufsichtsbehörde"),
    equivalent("supervisory_authority", "beschwerde gegenüber der aufsichtsbehörde", "requires_privacy_context"),
    direct("automated_decision_making_or_profiling", "automatisierte entscheidungsfindung mit personenbezogenen daten"),
    equivalent("automated_decision_making_or_profiling", "profiling personenbezogener daten"),
  ]),
  ...fr([
    direct("controller_contact", "responsable du traitement"),
    direct("controller_contact", "contact du responsable du traitement"),
    direct("controller_contact", "coordonnées du responsable du traitement"),
    equivalent("controller_contact", "contact confidentialité"),
    equivalent("controller_contact", "contact protection des données"),
    direct("dpo_contact", "délégué à la protection des données"),
    equivalent("dpo_contact", "contact dpo"),
    direct("processing_purposes", "finalités du traitement des données personnelles"),
    equivalent("processing_purposes", "finalités du traitement"),
    equivalent("processing_purposes", "finalités et bases légales", "requires_privacy_context"),
    equivalent("processing_purposes", "à quelles fins nous utilisons vos données personnelles"),
    direct("legal_basis", "base juridique du traitement des données personnelles"),
    direct("legal_basis", "base légale du traitement des données personnelles"),
    equivalent("legal_basis", "base légale du traitement"),
    equivalent("legal_basis", "finalités et bases légales", "requires_privacy_context"),
    equivalent("legal_basis", "intérêt légitime pour traiter les données personnelles"),
    direct("legal_basis", "traitement des données est fondé sur l article 6"),
    direct("legal_basis", "traitement des données est fondé sur l'article 6"),
    direct("recipients_or_vendor_categories", "destinataires des données personnelles"),
    direct("recipients_or_vendor_categories", "destinataire des données personnelles"),
    equivalent("recipients_or_vendor_categories", "catégories de destinataires des données personnelles"),
    equivalent("recipients_or_vendor_categories", "prestataires qui traitent des données personnelles"),
    equivalent("recipients_or_vendor_categories", "prestataires et sous-traitants"),
    equivalent("recipients_or_vendor_categories", "sous-traitants qui traitent des données personnelles"),
    equivalent("recipients_or_vendor_categories", "destinataires de vos données", "requires_privacy_context"),
    direct("data_retention", "durée de conservation des données personnelles"),
    equivalent("data_retention", "conservons vos données personnelles"),
    equivalent("data_retention", "données personnelles sont conservées"),
    equivalent("data_retention", "conservées pendant la durée nécessaire"),
    equivalent("data_retention", "durée de conservation", "requires_privacy_context"),
    equivalent("data_retention", "données personnelles ne sont conservées que pendant la durée nécessaire aux finalités"),
    direct("data_subject_rights", "droit d'accès aux données personnelles"),
    equivalent("data_subject_rights", "droit à l'effacement des données personnelles"),
    equivalent("data_subject_rights", "droits sur vos données", "requires_privacy_context"),
    direct("data_subject_rights", "droit à la portabilité des données"),
    direct("data_subject_rights", "droit à la limitation du traitement"),
    direct("international_transfers", "transferts internationaux de données personnelles"),
    equivalent("international_transfers", "données personnelles hors de l'espace économique européen"),
    equivalent("international_transfers", "transfert des données hors de l'union européenne", "requires_privacy_context"),
    equivalent("international_transfers", "absence de décision d'adéquation", "requires_privacy_context"),
    equivalent("international_transfers", "clauses contractuelles types", "requires_privacy_context"),
    direct("international_transfers", "transfert de données personnelles vers des pays tiers"),
    direct("supervisory_authority", "droit d'introduire une réclamation auprès d'une autorité de contrôle"),
    equivalent("supervisory_authority", "introduire une réclamation auprès d'une autorité de contrôle"),
    equivalent("supervisory_authority", "réclamation ou une plainte auprès de la commission nationale de l'informatique et des libertés", "requires_privacy_context"),
    direct("automated_decision_making_or_profiling", "décision automatisée utilisant des données personnelles"),
    equivalent("automated_decision_making_or_profiling", "profilage des données personnelles"),
  ]),
  ...es([
    direct("controller_contact", "responsable del tratamiento"),
    direct("controller_contact", "contacto del responsable del tratamiento"),
    direct("controller_contact", "datos de contacto del responsable del tratamiento"),
    equivalent("controller_contact", "contacto de privacidad"),
    equivalent("controller_contact", "contacto de protección de datos"),
    direct("dpo_contact", "delegado de protección de datos"),
    equivalent("dpo_contact", "contacto dpo"),
    direct("processing_purposes", "finalidades del tratamiento de datos personales"),
    equivalent("processing_purposes", "utilizamos sus datos personales para"),
    equivalent("processing_purposes", "usamos sus datos personales para"),
    equivalent("processing_purposes", "finalidad del tratamiento", "requires_privacy_context"),
    equivalent("processing_purposes", "para qué utilizamos sus datos personales"),
    direct("legal_basis", "base jurídica del tratamiento de datos personales"),
    equivalent("legal_basis", "intereses legítimos para tratar datos personales"),
    equivalent("legal_basis", "legitimación", "requires_privacy_context"),
    direct("legal_basis", "tratamiento de datos se basa en el artículo 6"),
    direct("recipients_or_vendor_categories", "destinatarios de datos personales"),
    direct("recipients_or_vendor_categories", "destinatario de los datos personales"),
    equivalent("recipients_or_vendor_categories", "categorías de destinatarios de datos personales"),
    equivalent("recipients_or_vendor_categories", "proveedores de servicios que tratan datos personales"),
    equivalent("recipients_or_vendor_categories", "comunicación de datos", "requires_privacy_context"),
    direct("data_retention", "plazo de conservación de datos personales"),
    equivalent("data_retention", "conservamos datos personales"),
    equivalent("data_retention", "conservación de datos", "requires_privacy_context"),
    equivalent("data_retention", "datos personales se conservan solo mientras sean necesarios para las finalidades"),
    direct("data_subject_rights", "derecho de acceso a datos personales"),
    equivalent("data_subject_rights", "derecho de supresión de datos personales"),
    equivalent("data_subject_rights", "derechos de las personas interesadas", "requires_privacy_context"),
    direct("data_subject_rights", "derecho a la portabilidad de los datos"),
    direct("data_subject_rights", "derecho a la limitación del tratamiento"),
    direct("international_transfers", "transferencias internacionales de datos personales"),
    equivalent("international_transfers", "datos personales fuera del espacio económico europeo"),
    direct("international_transfers", "transferencia de datos personales a terceros países"),
    equivalent("international_transfers", "cláusulas tipo de la comisión europea", "requires_privacy_context"),
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
    direct("controller_contact", "dati di contatto del titolare del trattamento"),
    equivalent("controller_contact", "contatto privacy"),
    equivalent("controller_contact", "contatto protezione dati"),
    direct("dpo_contact", "responsabile della protezione dei dati"),
    equivalent("dpo_contact", "contatto dpo"),
    direct("processing_purposes", "finalità del trattamento dei dati personali"),
    direct("processing_purposes", "finalità del trattamento"),
    equivalent("processing_purposes", "tratta i tuoi dati per le seguenti finalità"),
    equivalent("processing_purposes", "per quali finalità utilizziamo i suoi dati personali"),
    direct("legal_basis", "base giuridica del trattamento dei dati personali"),
    direct("legal_basis", "base giuridica", "requires_privacy_context"),
    equivalent("legal_basis", "legittimo interesse per trattare dati personali"),
    direct("legal_basis", "trattamento dei dati si basa sull articolo 6"),
    direct("legal_basis", "trattamento dei dati si basa sull'articolo 6"),
    direct("recipients_or_vendor_categories", "destinatari dei dati personali"),
    direct("recipients_or_vendor_categories", "destinatario dei dati personali"),
    equivalent("recipients_or_vendor_categories", "destinatari dei tuoi dati"),
    equivalent("recipients_or_vendor_categories", "categorie di destinatari dei dati personali"),
    equivalent("recipients_or_vendor_categories", "fornitori di servizi che trattano dati personali"),
    equivalent("recipients_or_vendor_categories", "responsabili del trattamento"),
    direct("data_retention", "periodo di conservazione dei dati personali"),
    equivalent("data_retention", "periodo di conservazione", "requires_privacy_context"),
    equivalent("data_retention", "conservazione dei dati"),
    equivalent("data_retention", "conserviamo dati personali"),
    equivalent("data_retention", "dati personali sono conservati solo per il tempo necessario alle finalità"),
    direct("data_subject_rights", "diritti degli interessati"),
    direct("data_subject_rights", "diritto di accesso ai dati personali"),
    equivalent("data_subject_rights", "diritto alla cancellazione dei dati personali"),
    direct("data_subject_rights", "diritto alla portabilità dei dati"),
    direct("data_subject_rights", "diritto alla limitazione del trattamento"),
    direct("international_transfers", "trasferimenti internazionali di dati personali"),
    equivalent("international_transfers", "trasferimenti extra ue"),
    equivalent("international_transfers", "paesi extra ue"),
    equivalent("international_transfers", "dati personali fuori dallo spazio economico europeo"),
    equivalent("international_transfers", "trasferimento dei dati", "requires_privacy_context"),
    direct("international_transfers", "trasferimento dei dati personali verso paesi terzi"),
    direct("supervisory_authority", "diritto di proporre reclamo all'autorità di controllo"),
    equivalent("supervisory_authority", "proporre reclamo all'autorità di controllo"),
    direct("automated_decision_making_or_profiling", "decisioni automatizzate con dati personali"),
    equivalent("automated_decision_making_or_profiling", "profilazione dei dati personali"),
  ]),
  ...nl([
    direct("controller_contact", "verwerkingsverantwoordelijke"),
    direct("controller_contact", "contact met verwerkingsverantwoordelijke"),
    direct("controller_contact", "contactgegevens van de verwerkingsverantwoordelijke"),
    equivalent("controller_contact", "privacycontact"),
    equivalent("controller_contact", "contact gegevensbescherming"),
    direct("dpo_contact", "functionaris voor gegevensbescherming"),
    equivalent("dpo_contact", "contact met fg"),
    direct("processing_purposes", "doeleinden van de verwerking van persoonsgegevens"),
    equivalent("processing_purposes", "waarvoor wij uw persoonsgegevens gebruiken"),
    direct("legal_basis", "rechtsgrondslag voor de verwerking van persoonsgegevens"),
    equivalent("legal_basis", "gerechtvaardigd belang voor verwerking van persoonsgegevens"),
    equivalent("legal_basis", "gerechtvaardigd belang bij het verwerken van persoonsgegevens"),
    direct("legal_basis", "gegevensverwerking is gebaseerd op artikel 6"),
    direct("recipients_or_vendor_categories", "ontvangers van persoonsgegevens"),
    direct("recipients_or_vendor_categories", "ontvanger van persoonsgegevens"),
    equivalent("recipients_or_vendor_categories", "categorieën van ontvangers van persoonsgegevens"),
    equivalent("recipients_or_vendor_categories", "dienstverleners die persoonsgegevens verwerken"),
    equivalent("recipients_or_vendor_categories", "externe beheerders van software platformen"),
    equivalent("recipients_or_vendor_categories", "betalingssystemen"),
    equivalent("recipients_or_vendor_categories", "uw persoonsgegevens niet delen met derden"),
    direct("data_retention", "bewaartermijn van persoonsgegevens"),
    equivalent("data_retention", "bewaren persoonsgegevens"),
    equivalent("data_retention", "persoonsgegevens niet langer bewaren dan noodzakelijk"),
    equivalent("data_retention", "persoonsgegevens worden slechts bewaard zolang dat nodig is voor de doeleinden"),
    direct("data_subject_rights", "recht op inzage in persoonsgegevens"),
    equivalent("data_subject_rights", "recht op verwijdering van persoonsgegevens"),
    equivalent("data_subject_rights", "bezwaar te maken tegen het verwerken van uw persoonsgegevens"),
    direct("data_subject_rights", "recht op overdraagbaarheid van gegevens"),
    direct("data_subject_rights", "recht op beperking van de verwerking"),
    direct("international_transfers", "internationale doorgiften van persoonsgegevens"),
    equivalent("international_transfers", "internationale doorgifte van gegevens worden er maatregelen genomen om een adequaat beschermingsniveau"),
    equivalent("international_transfers", "persoonsgegevens buiten de europese economische ruimte"),
    direct("international_transfers", "doorgifte van persoonsgegevens aan derde landen"),
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
    direct("controller_contact", "dane kontaktowe administratora danych osobowych"),
    equivalent("controller_contact", "kontakt w sprawie prywatności"),
    equivalent("controller_contact", "kontakt w sprawie ochrony danych"),
    direct("dpo_contact", "inspektor ochrony danych"),
    direct("dpo_contact", "administrator wyznaczył inspektora ochrony danych"),
    equivalent("dpo_contact", "kontakt z iod"),
    direct("processing_purposes", "cele przetwarzania danych osobowych"),
    direct("processing_purposes", "cele oraz podstawy prawne przetwarzania danych"),
    equivalent("processing_purposes", "przetwarzać dane osobowe użytkowników w celu"),
    equivalent("processing_purposes", "w jakich celach wykorzystujemy dane osobowe"),
    direct("legal_basis", "podstawa prawna przetwarzania danych osobowych"),
    direct("legal_basis", "podstawy prawne przetwarzania danych"),
    equivalent("legal_basis", "na podstawie art 6 ust 1 lit"),
    equivalent("legal_basis", "uzasadniony interes w przetwarzaniu danych osobowych"),
    direct("legal_basis", "przetwarzanie danych odbywa się na podstawie art 6"),
    direct("recipients_or_vendor_categories", "odbiorcy danych osobowych"),
    direct("recipients_or_vendor_categories", "odbiorca danych osobowych"),
    direct("recipients_or_vendor_categories", "odbiorcy danych i zaufani partnerzy"),
    equivalent("recipients_or_vendor_categories", "kategorie odbiorców danych osobowych"),
    equivalent("recipients_or_vendor_categories", "kategoriom odbiorców"),
    equivalent("recipients_or_vendor_categories", "dostawcy usług przetwarzający dane osobowe"),
    direct("data_retention", "okres przechowywania danych osobowych"),
    direct("data_retention", "przez jaki okres będą przechowywane twoje dane osobowe"),
    equivalent("data_retention", "przechowujemy dane osobowe"),
    equivalent("data_retention", "dane osobowe są przechowywane tylko tak długo jak jest to konieczne do celów"),
    direct("data_subject_rights", "prawo dostępu do danych osobowych"),
    equivalent("data_subject_rights", "prawo do usunięcia danych osobowych"),
    equivalent("data_subject_rights", "praw osób których dane dotyczą"),
    direct("data_subject_rights", "prawo do przenoszenia danych"),
    direct("data_subject_rights", "prawo do ograniczenia przetwarzania"),
    direct("international_transfers", "transfery międzynarodowe danych osobowych"),
    equivalent("international_transfers", "dane osobowe poza europejski obszar gospodarczy"),
    equivalent("international_transfers", "przekazywanie danych osobowych poza eog"),
    equivalent("international_transfers", "standardowych klauzul umownych", "requires_privacy_context"),
    equivalent("international_transfers", "dane osobowe użytkownika mogą być przekazywane do państw"),
    direct("international_transfers", "przekazywanie danych osobowych do państw trzecich"),
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
    direct("controller_contact", "dados de contacto do responsável pelo tratamento"),
    direct("controller_contact", "dados de contato do controlador"),
    equivalent("controller_contact", "contato de privacidade"),
    direct("dpo_contact", "encarregado de proteção de dados"),
    equivalent("dpo_contact", "contato do encarregado"),
    equivalent("dpo_contact", "contato do dpo"),
    direct("processing_purposes", "finalidades do tratamento de dados pessoais"),
    direct("processing_purposes", "finalidade do tratamento de dados pessoais"),
    equivalent("processing_purposes", "utilizamos seus dados pessoais para"),
    equivalent("processing_purposes", "usamos seus dados pessoais para"),
    equivalent("processing_purposes", "para que usamos os seus dados pessoais", "pt_pt"),
    equivalent("processing_purposes", "para que usamos seus dados pessoais"),
    direct("legal_basis", "base legal para o tratamento de dados pessoais"),
    direct("legal_basis", "bases legais para o tratamento de dados pessoais"),
    equivalent("legal_basis", "fundamento jurídico para o tratamento de dados pessoais", "pt_pt"),
    equivalent("legal_basis", "legítimo interesse para tratar dados pessoais"),
    direct("legal_basis", "tratamento de dados baseia se no artigo 6"),
    direct("legal_basis", "tratamento de dados baseia-se no artigo 6"),
    direct("recipients_or_vendor_categories", "destinatários dos dados pessoais"),
    direct("recipients_or_vendor_categories", "destinatário dos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "categorias de destinatários dos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "terceiros com quem compartilhamos dados pessoais"),
    equivalent("recipients_or_vendor_categories", "prestadores de serviços que tratam dados pessoais"),
    direct("data_retention", "prazo de conservação dos dados pessoais"),
    direct("data_retention", "período de retenção dos dados pessoais"),
    equivalent("data_retention", "pelo tempo necessário para o tratamento"),
    equivalent("data_retention", "dados pessoais são conservados apenas enquanto forem necessários para as finalidades"),
    direct("data_subject_rights", "direito de acesso aos dados pessoais"),
    equivalent("data_subject_rights", "direito à eliminação dos dados pessoais"),
    equivalent("data_subject_rights", "direitos do titular dos dados pessoais"),
    direct("data_subject_rights", "direito à portabilidade dos dados"),
    direct("data_subject_rights", "direito à limitação do tratamento", "pt_pt"),
    direct("international_transfers", "transferências internacionais de dados pessoais"),
    equivalent("international_transfers", "dados pessoais fora do espaço econômico europeu"),
    equivalent("international_transfers", "cláusulas contratuais padrão para transferências de dados pessoais"),
    direct("international_transfers", "transferência de dados pessoais para países terceiros"),
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
    direct("controller_contact", "оператор персональных данных", "requires_topic_context"),
    direct("controller_contact", "ответственный за обработку персональных данных"),
    direct("controller_contact", "контактные данные оператора персональных данных"),
    equivalent("controller_contact", "контакт по вопросам защиты персональных данных"),
    direct("dpo_contact", "сотрудник по защите данных"),
    equivalent("dpo_contact", "должностное лицо по защите данных"),
    equivalent("dpo_contact", "контакт ответственного по защите данных"),
    direct("processing_purposes", "цели обработки персональных данных"),
    equivalent("processing_purposes", "цели обработки данных", "requires_privacy_context"),
    equivalent("processing_purposes", "обрабатываем персональные данные для"),
    equivalent("processing_purposes", "используем ваши персональные данные для"),
    equivalent("processing_purposes", "для чего мы используем ваши персональные данные"),
    direct("legal_basis", "правовые основания обработки персональных данных"),
    direct("legal_basis", "правовое основание для обработки персональных данных"),
    equivalent("legal_basis", "правовых основаниях обработки персональных данных", "inflected"),
    equivalent("legal_basis", "законный интерес при обработке персональных данных"),
    equivalent("legal_basis", "согласие на их обработку", "requires_privacy_context"),
    equivalent("legal_basis", "согласия на их обработку", "requires_privacy_context"),
    equivalent("legal_basis", "согласия на ее обработку", "requires_privacy_context"),
    direct("legal_basis", "обработка данных осуществляется на основании статьи 6"),
    direct("recipients_or_vendor_categories", "получатели персональных данных"),
    direct("recipients_or_vendor_categories", "получатель персональных данных"),
    equivalent("recipients_or_vendor_categories", "категории получателей персональных данных"),
    equivalent("recipients_or_vendor_categories", "третьи лица которым мы передаем персональные данные"),
    equivalent("recipients_or_vendor_categories", "передать данные третьим лицам", "requires_privacy_context"),
    direct("data_retention", "срок хранения персональных данных"),
    equivalent("data_retention", "сроки хранения персональных данных", "inflected"),
    equivalent("data_retention", "сроках хранения персональных данных", "inflected"),
    equivalent("data_retention", "период хранения персональных данных"),
    equivalent("data_retention", "храним персональные данные столько сколько необходимо"),
    equivalent("data_retention", "персональные данные хранятся только столько сколько необходимо для целей"),
    equivalent("data_retention", "в течение 1 одного года", "requires_privacy_context"),
    direct("data_subject_rights", "права субъекта персональных данных"),
    equivalent("data_subject_rights", "правами субъектов персональных данных", "inflected"),
    equivalent("data_subject_rights", "правах субъектов персональных данных", "inflected"),
    equivalent("data_subject_rights", "право на доступ к персональным данным"),
    equivalent("data_subject_rights", "право на удаление персональных данных"),
    direct("data_subject_rights", "право на переносимость данных"),
    direct("data_subject_rights", "право на ограничение обработки"),
    equivalent("data_subject_rights", "можете отозвать свое согласие", "requires_privacy_context"),
    direct("international_transfers", "трансграничная передача персональных данных"),
    equivalent("international_transfers", "трансграничную передачу персональных данных"),
    equivalent("international_transfers", "передача персональных данных за пределы европейской экономической зоны"),
    equivalent("international_transfers", "стандартные договорные положения для передачи персональных данных"),
    equivalent("international_transfers", "стандартных договорных условий"),
    equivalent("international_transfers", "решения европейской комиссии об адекватности"),
    direct("international_transfers", "передача персональных данных в третьи страны"),
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
    direct("controller_contact", "個人情報取扱事業者の連絡先"),
    equivalent("controller_contact", "個人情報に関するお問い合わせ"),
    direct("dpo_contact", "データ保護責任者"),
    equivalent("dpo_contact", "データ保護責任者への連絡先"),
    equivalent("dpo_contact", "dpoへのお問い合わせ"),
    direct("processing_purposes", "個人データを処理する目的"),
    direct("processing_purposes", "個人情報の利用目的"),
    equivalent("processing_purposes", "利用目的の範囲内"),
    equivalent("processing_purposes", "以下の目的で個人データを利用します"),
    equivalent("processing_purposes", "個人情報を何のために利用するか"),
    direct("legal_basis", "個人データ処理の法的根拠"),
    direct("legal_basis", "個人データを処理する法的根拠"),
    equivalent("legal_basis", "個人データ処理における正当な利益"),
    direct("legal_basis", "gdpr第6条に基づく個人データ処理"),
    direct("recipients_or_vendor_categories", "個人データの受領者"),
    equivalent("recipients_or_vendor_categories", "個人データの受領者のカテゴリー"),
    equivalent("recipients_or_vendor_categories", "個人データを共有する第三者"),
    equivalent("recipients_or_vendor_categories", "個人情報の第三者提供"),
    direct("recipients_or_vendor_categories", "個人データの提供先"),
    direct("data_retention", "個人データの保存期間"),
    equivalent("data_retention", "個人情報の保有期間"),
    equivalent("data_retention", "必要な期間に限り個人データを保持します"),
    equivalent("data_retention", "利用目的に必要な期間に限り個人データを保存します"),
    direct("data_subject_rights", "データ主体の権利"),
    equivalent("data_subject_rights", "個人データにアクセスする権利"),
    equivalent("data_subject_rights", "個人データの消去を求める権利"),
    equivalent("data_subject_rights", "個人情報の開示、訂正、削除"),
    direct("data_subject_rights", "データポータビリティの権利"),
    direct("data_subject_rights", "個人データの処理を制限する権利"),
    direct("international_transfers", "個人データの国際移転"),
    equivalent("international_transfers", "欧州経済領域外への個人データの移転"),
    equivalent("international_transfers", "個人データ移転のための標準契約条項"),
    direct("international_transfers", "第三国への個人データの移転"),
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
    direct("controller_contact", "个人信息处理者的联系方式"),
    direct("dpo_contact", "数据保护官"),
    equivalent("dpo_contact", "数据保护负责人的联系方式"),
    equivalent("dpo_contact", "联系数据保护官"),
    direct("processing_purposes", "处理个人数据的目的"),
    direct("processing_purposes", "处理个人信息的目的"),
    equivalent("processing_purposes", "我们出于以下目的使用您的个人数据"),
    equivalent("processing_purposes", "我们为何使用您的个人信息"),
    direct("legal_basis", "处理个人数据的法律依据"),
    direct("legal_basis", "个人数据处理的法律基础"),
    equivalent("legal_basis", "处理个人数据的合法利益"),
    direct("legal_basis", "根据gdpr第6条处理个人数据"),
    direct("recipients_or_vendor_categories", "个人数据的接收方"),
    equivalent("recipients_or_vendor_categories", "个人数据接收方的类别"),
    equivalent("recipients_or_vendor_categories", "与其共享个人数据的第三方"),
    direct("recipients_or_vendor_categories", "个人信息接收方"),
    direct("data_retention", "个人数据的保存期限"),
    equivalent("data_retention", "个人信息的保留期限"),
    equivalent("data_retention", "仅在必要期间保留个人数据"),
    equivalent("data_retention", "仅在实现处理目的所必需的期限内保留个人信息"),
    direct("data_subject_rights", "数据主体的权利"),
    equivalent("data_subject_rights", "访问个人数据的权利"),
    equivalent("data_subject_rights", "删除个人数据的权利"),
    direct("data_subject_rights", "数据可携权"),
    direct("data_subject_rights", "限制处理个人数据的权利"),
    direct("international_transfers", "个人数据的跨境传输"),
    equivalent("international_transfers", "向欧洲经济区以外传输个人数据"),
    equivalent("international_transfers", "个人数据传输的标准合同条款"),
    direct("international_transfers", "向第三国传输个人数据"),
    direct("supervisory_authority", "向监管机构投诉的权利"),
    equivalent("supervisory_authority", "向数据保护机构提出投诉"),
    equivalent("supervisory_authority", "向监督机关投诉"),
    direct("automated_decision_making_or_profiling", "使用个人数据进行自动化决策"),
    equivalent("automated_decision_making_or_profiling", "个人数据的自动化处理"),
    equivalent("automated_decision_making_or_profiling", "对个人数据进行画像分析"),
    equivalent("controller_contact", "個人資料控制者", "zh_hant"),
    equivalent("controller_contact", "個人資料處理者的聯絡方式", "zh_hant"),
    equivalent("dpo_contact", "資料保護長", "zh_hant"),
    equivalent("dpo_contact", "資料保護長的聯絡方式", "zh_hant"),
    equivalent("dpo_contact", "個人資料保護員", "zh_hant"),
    equivalent("processing_purposes", "處理個人資料的目的", "zh_hant"),
    equivalent("processing_purposes", "我們為何使用您的個人資料", "zh_hant"),
    equivalent("legal_basis", "處理個人資料的法律依據", "zh_hant"),
    equivalent("legal_basis", "根據gdpr第6條處理個人資料", "zh_hant"),
    equivalent("recipients_or_vendor_categories", "個人資料接收者的類別", "zh_hant"),
    equivalent("recipients_or_vendor_categories", "個人資料接收者", "zh_hant"),
    equivalent("data_retention", "個人資料的保存期限", "zh_hant"),
    equivalent("data_retention", "僅在處理目的所必要的期間保留個人資料", "zh_hant"),
    equivalent("data_subject_rights", "資料當事人的權利", "zh_hant"),
    equivalent("data_subject_rights", "資料可攜權", "zh_hant"),
    equivalent("data_subject_rights", "限制處理個人資料的權利", "zh_hant"),
    equivalent("international_transfers", "個人資料的跨境傳輸", "zh_hant"),
    equivalent("international_transfers", "向第三國傳輸個人資料", "zh_hant"),
    equivalent("supervisory_authority", "向監管機構投訴的權利", "zh_hant"),
    equivalent("automated_decision_making_or_profiling", "使用個人資料進行自動化決策", "zh_hant"),
  ]),
  ...ar([
    direct("controller_contact", "مراقب البيانات الشخصية"),
    direct("controller_contact", "المتحكم في البيانات الشخصية"),
    equivalent("controller_contact", "بيانات الاتصال بمراقب البيانات"),
    direct("controller_contact", "بيانات الاتصال بالمتحكم في البيانات الشخصية"),
    direct("dpo_contact", "مسؤول حماية البيانات"),
    equivalent("dpo_contact", "بيانات الاتصال بمسؤول حماية البيانات"),
    equivalent("dpo_contact", "التواصل مع مسؤول حماية البيانات"),
    direct("processing_purposes", "أغراض معالجة البيانات الشخصية"),
    equivalent("processing_purposes", "نعالج بياناتك الشخصية من أجل"),
    equivalent("processing_purposes", "نستخدم بياناتك الشخصية للأغراض التالية"),
    equivalent("processing_purposes", "لماذا نستخدم بياناتك الشخصية"),
    direct("legal_basis", "الأساس القانوني لمعالجة البيانات الشخصية"),
    direct("legal_basis", "الأسس القانونية لمعالجة البيانات الشخصية"),
    equivalent("legal_basis", "المصلحة المشروعة في معالجة البيانات الشخصية"),
    direct("legal_basis", "تستند معالجة البيانات إلى المادة 6"),
    direct("recipients_or_vendor_categories", "مستلمو البيانات الشخصية"),
    equivalent("recipients_or_vendor_categories", "فئات مستلمي البيانات الشخصية"),
    equivalent("recipients_or_vendor_categories", "الأطراف الثالثة التي نشارك معها البيانات الشخصية"),
    direct("recipients_or_vendor_categories", "مستلم البيانات الشخصية"),
    direct("data_retention", "مدة الاحتفاظ بالبيانات الشخصية"),
    equivalent("data_retention", "فترة الاحتفاظ بالبيانات الشخصية"),
    equivalent("data_retention", "نحتفظ بالبيانات الشخصية طالما كان ذلك ضروريا"),
    equivalent("data_retention", "لا نحتفظ بالبيانات الشخصية إلا طالما كان ذلك ضروريا للأغراض"),
    direct("data_subject_rights", "حقوق صاحب البيانات"),
    equivalent("data_subject_rights", "الحق في الوصول إلى البيانات الشخصية"),
    equivalent("data_subject_rights", "الحق في محو البيانات الشخصية"),
    direct("data_subject_rights", "الحق في نقل البيانات"),
    direct("data_subject_rights", "الحق في تقييد المعالجة"),
    direct("international_transfers", "النقل الدولي للبيانات الشخصية"),
    equivalent("international_transfers", "نقل البيانات الشخصية خارج المنطقة الاقتصادية الأوروبية"),
    equivalent("international_transfers", "البنود التعاقدية القياسية لنقل البيانات الشخصية"),
    direct("international_transfers", "نقل البيانات الشخصية إلى دول ثالثة"),
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
    equivalent("international_transfers", "clauze contractuale standard", "requires_privacy_context"),
    equivalent("international_transfers", "din afara spațiului economic european", "requires_privacy_context"),
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
    equivalent("processing_purposes", "személyes adataidat tájékoztatási célból használjuk"),
    equivalent("processing_purposes", "adataidat tájékoztatási célból használjuk", "requires_privacy_context"),
    direct("legal_basis", "adatkezelés jogalapja"),
    equivalent("legal_basis", "személyes adatok kezelésének jogalapja"),
    equivalent("legal_basis", "adatkezelés jogalapját", "accusative"),
    equivalent("legal_basis", "hozzájárulásod alapján kezelt adataid"),
    direct("recipients_or_vendor_categories", "személyes adatok címzettjei"),
    equivalent("recipients_or_vendor_categories", "személyes adatok címzettjeinek kategóriái"),
    equivalent("recipients_or_vendor_categories", "személyes adatok címzettjeinek kategóriáit", "accusative"),
    equivalent("recipients_or_vendor_categories", "továbbítjuk harmadik felek részére", "requires_privacy_context"),
    direct("data_retention", "személyes adatok tárolásának időtartama"),
    equivalent("data_retention", "személyes adatok tárolásának időtartamát", "accusative"),
    equivalent("data_retention", "személyes adatok megőrzési ideje"),
    equivalent("data_retention", "megőrzési idő elteltével a személyes adatokat töröljük"),
    direct("data_subject_rights", "érintett jogai"),
    equivalent("data_subject_rights", "érintett jogait", "accusative"),
    equivalent("data_subject_rights", "személyes adatokhoz való hozzáférés joga"),
    equivalent("data_subject_rights", "hozzájárulásod bármikor visszavonható"),
    direct("international_transfers", "személyes adatok nemzetközi továbbítása"),
    equivalent("international_transfers", "személyes adatok nemzetközi továbbítását", "accusative"),
    equivalent("international_transfers", "személyes adatok harmadik országba történő továbbítása"),
    direct("supervisory_authority", "panasz benyújtásának joga valamely felügyeleti hatósághoz"),
    equivalent("supervisory_authority", "panasz benyújtásának jogát valamely felügyeleti hatósághoz", "accusative"),
    equivalent("supervisory_authority", "panaszt tehet a felügyeleti hatóságnál"),
    direct("automated_decision_making_or_profiling", "automatizált döntéshozatal személyes adatok felhasználásával"),
    equivalent("automated_decision_making_or_profiling", "automatizált döntéshozatal ideértve a profilalkotást"),
    equivalent("automated_decision_making_or_profiling", "személyes adatok felhasználásával történő automatizált döntéshozatalt", "accusative"),
    equivalent("automated_decision_making_or_profiling", "profilalkotáson alapuló közvetlen üzletszerzés"),
    equivalent("automated_decision_making_or_profiling", "profilalkotáson alapuló közvetlen üzletszerzéshez történő hozzájárulás"),
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
    equivalent("processing_purposes", "teenuse osutamise eesmärgil", "requires_privacy_context"),
    direct("legal_basis", "isikuandmete töötlemise õiguslik alus"),
    equivalent("legal_basis", "isikuandmete töötlemise õiguslikku alust", "partitive"),
    equivalent("legal_basis", "töötlemise õiguslik alus"),
    equivalent("legal_basis", "nõusoleku töödelda", "requires_privacy_context"),
    direct("recipients_or_vendor_categories", "isikuandmete vastuvõtjad"),
    equivalent("recipients_or_vendor_categories", "isikuandmete vastuvõtjate kategooriad"),
    equivalent("recipients_or_vendor_categories", "isikuandmete vastuvõtjate kategooriaid", "partitive"),
    equivalent("recipients_or_vendor_categories", "loovutatakse kolmandatele osapooltele", "requires_privacy_context"),
    direct("data_retention", "isikuandmete säilitamise ajavahemik"),
    equivalent("data_retention", "isikuandmete säilitamise ajavahemikku", "partitive"),
    equivalent("data_retention", "isikuandmete säilitamise tähtaeg"),
    equivalent("data_retention", "kustub automaatselt kolme kuu möödudes", "requires_privacy_context"),
    equivalent("data_retention", "kustub see automaatselt kolme kuu möödudes", "requires_privacy_context"),
    direct("data_subject_rights", "andmesubjekti õigused"),
    equivalent("data_subject_rights", "andmesubjekti õigusi", "partitive"),
    equivalent("data_subject_rights", "õigus tutvuda isikuandmetega"),
    equivalent("data_subject_rights", "õigus eemaldada teenusest oma konto", "requires_privacy_context"),
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
    direct("controller_contact", "kişisel veri sorumlusunun iletişim bilgileri"),
    direct("dpo_contact", "veri koruma görevlisi"),
    equivalent("dpo_contact", "veri koruma görevlisinin iletişim bilgileri"),
    equivalent("dpo_contact", "veri koruma görevlisiyle iletişime geçin"),
    direct("processing_purposes", "kişisel verilerin işlenme amaçları"),
    equivalent("processing_purposes", "kişisel verilerin işlenme amaçlarını", "accusative"),
    equivalent("processing_purposes", "kişisel verileri aşağıdaki amaçlarla işliyoruz"),
    equivalent("processing_purposes", "kişisel verilerinizi hangi amaçlarla kullanıyoruz"),
    direct("legal_basis", "kişisel verilerin işlenmesinin hukuki dayanağı"),
    equivalent("legal_basis", "kişisel verilerin işlenmesinin hukuki dayanağını", "accusative"),
    equivalent("legal_basis", "kişisel verilerin işlenmesinin hukuki sebebi"),
    direct("legal_basis", "veri işleme gdpr madde 6 uyarınca"),
    direct("recipients_or_vendor_categories", "kişisel verilerin alıcıları"),
    equivalent("recipients_or_vendor_categories", "kişisel veri alıcılarının kategorileri"),
    equivalent("recipients_or_vendor_categories", "kişisel veri alıcılarının kategorilerini", "accusative"),
    direct("recipients_or_vendor_categories", "kişisel verilerin alıcısı"),
    direct("data_retention", "kişisel verilerin saklama süresi"),
    equivalent("data_retention", "kişisel verilerin saklama süresini", "accusative"),
    equivalent("data_retention", "kişisel verilerin muhafaza süresi"),
    equivalent("data_retention", "kişisel veriler amaçlar için gerekli olduğu sürece saklanır"),
    direct("data_subject_rights", "ilgili kişinin hakları"),
    equivalent("data_subject_rights", "ilgili kişinin haklarını", "accusative"),
    equivalent("data_subject_rights", "kişisel verilere erişim hakkı"),
    direct("data_subject_rights", "veri taşınabilirliği hakkı"),
    direct("data_subject_rights", "işlemenin kısıtlanmasını talep etme hakkı"),
    direct("international_transfers", "kişisel verilerin uluslararası aktarımı"),
    equivalent("international_transfers", "kişisel verilerin uluslararası aktarımını", "accusative"),
    equivalent("international_transfers", "kişisel verilerin yurt dışına aktarılması"),
    direct("international_transfers", "kişisel verilerin üçüncü ülkelere aktarılması"),
    direct("supervisory_authority", "denetim makamına şikayette bulunma hakkı"),
    equivalent("supervisory_authority", "denetim makamına şikayette bulunma hakkını", "accusative"),
    equivalent("supervisory_authority", "kişisel verileri koruma kuruluna şikayet"),
    direct("automated_decision_making_or_profiling", "otomatik karar verme ve profilleme"),
    equivalent("automated_decision_making_or_profiling", "otomatik karar verme ve profillemeyi", "accusative"),
    equivalent("automated_decision_making_or_profiling", "kişisel verilerle otomatik karar alma"),
  ]),
  ...localizedTopicTerms("fa", {
    controller_contact: ["مسئول کنترل داده های شخصی", "اطلاعات تماس مسئول پردازش داده ها"],
    dpo_contact: ["مسئول حفاظت از داده ها", "اطلاعات تماس افسر حفاظت از داده ها"],
    processing_purposes: ["اهداف پردازش داده های شخصی", "داده های شخصی را برای اهداف زیر پردازش می کنیم"],
    legal_basis: ["مبنای قانونی پردازش داده های شخصی", "اساس حقوقی پردازش اطلاعات شخصی"],
    recipients_or_vendor_categories: ["گیرندگان داده های شخصی", "دسته های گیرندگان اطلاعات شخصی"],
    data_retention: ["مدت نگهداری داده های شخصی", "دوره نگهداری اطلاعات شخصی"],
    data_subject_rights: ["حقوق اشخاص موضوع داده", "حقوق صاحب داده های شخصی"],
    international_transfers: ["انتقال بین المللی داده های شخصی", "انتقال داده های شخصی به خارج از کشور"],
    supervisory_authority: ["حق شکایت به مرجع نظارتی", "مرجع نظارت بر حفاظت از داده ها"],
    automated_decision_making_or_profiling: ["تصمیم گیری خودکار و پروفایل سازی", "تصمیم گیری صرفا خودکار درباره داده های شخصی"],
  }),
  ...localizedTopicTerms("vi", {
    controller_contact: ["bên kiểm soát dữ liệu cá nhân", "thông tin liên hệ của bên kiểm soát dữ liệu"],
    dpo_contact: ["cán bộ bảo vệ dữ liệu", "thông tin liên hệ của cán bộ bảo vệ dữ liệu"],
    processing_purposes: ["mục đích xử lý dữ liệu cá nhân", "chúng tôi xử lý dữ liệu cá nhân cho các mục đích sau"],
    legal_basis: ["cơ sở pháp lý để xử lý dữ liệu cá nhân", "căn cứ pháp lý của việc xử lý dữ liệu cá nhân"],
    recipients_or_vendor_categories: ["bên nhận dữ liệu cá nhân", "các nhóm bên nhận dữ liệu cá nhân"],
    data_retention: ["thời hạn lưu trữ dữ liệu cá nhân", "thời gian lưu giữ dữ liệu cá nhân"],
    data_subject_rights: ["quyền của chủ thể dữ liệu", "quyền truy cập và xóa dữ liệu cá nhân"],
    international_transfers: ["chuyển dữ liệu cá nhân ra nước ngoài", "chuyển dữ liệu cá nhân quốc tế"],
    supervisory_authority: ["quyền khiếu nại với cơ quan giám sát", "cơ quan giám sát bảo vệ dữ liệu"],
    automated_decision_making_or_profiling: ["ra quyết định tự động và lập hồ sơ", "quyết định chỉ dựa trên xử lý tự động"],
  }),
  ...localizedTopicTerms("id", {
    controller_contact: ["pengendali data pribadi", "informasi kontak pengendali data"],
    dpo_contact: ["petugas perlindungan data", "informasi kontak petugas perlindungan data"],
    processing_purposes: ["tujuan pemrosesan data pribadi", "kami memproses data pribadi untuk tujuan berikut"],
    legal_basis: ["dasar hukum pemrosesan data pribadi", "landasan hukum untuk memproses data pribadi"],
    recipients_or_vendor_categories: ["penerima data pribadi", "kategori penerima data pribadi"],
    data_retention: ["jangka waktu penyimpanan data pribadi", "periode retensi data pribadi"],
    data_subject_rights: ["hak subjek data", "hak untuk mengakses dan menghapus data pribadi"],
    international_transfers: ["transfer internasional data pribadi", "pemindahan data pribadi ke luar negeri"],
    supervisory_authority: ["hak mengajukan keluhan kepada otoritas pengawas", "otoritas pengawas perlindungan data"],
    automated_decision_making_or_profiling: ["pengambilan keputusan otomatis dan pembuatan profil", "keputusan yang hanya didasarkan pada pemrosesan otomatis"],
  }),
  ...localizedTopicTerms("ko", {
    controller_contact: ["개인정보처리자의 연락처", "개인정보 처리자 및 연락처"],
    dpo_contact: ["개인정보 보호책임자", "개인정보 보호책임자의 연락처"],
    processing_purposes: ["개인정보의 처리 목적", "개인정보를 다음의 목적으로 처리합니다"],
    legal_basis: ["개인정보 처리의 법적 근거", "개인정보를 처리하는 법적 근거"],
    recipients_or_vendor_categories: ["개인정보를 제공받는 자", "개인정보 수령자의 범주"],
    data_retention: ["개인정보의 보유 및 이용 기간", "개인정보 보유 기간"],
    data_subject_rights: ["정보주체의 권리", "개인정보 열람 및 삭제 권리"],
    international_transfers: ["개인정보의 국외 이전", "개인정보의 국제 이전"],
    supervisory_authority: ["감독기관에 불만을 제기할 권리", "개인정보 보호 감독기관"],
    automated_decision_making_or_profiling: ["자동화된 의사결정 및 프로파일링", "자동화된 처리에만 근거한 결정"],
  }),
  ...localizedTopicTerms("th", {
    controller_contact: ["ผู้ควบคุมข้อมูลส่วนบุคคล", "ข้อมูลติดต่อของผู้ควบคุมข้อมูลส่วนบุคคล"],
    dpo_contact: ["เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล", "ข้อมูลติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล"],
    processing_purposes: ["วัตถุประสงค์ในการประมวลผลข้อมูลส่วนบุคคล", "เราประมวลผลข้อมูลส่วนบุคคลเพื่อวัตถุประสงค์ดังต่อไปนี้"],
    legal_basis: ["ฐานทางกฎหมายในการประมวลผลข้อมูลส่วนบุคคล", "ฐานกฎหมายสำหรับการประมวลผลข้อมูลส่วนบุคคล"],
    recipients_or_vendor_categories: ["ผู้รับข้อมูลส่วนบุคคล", "ประเภทของผู้รับข้อมูลส่วนบุคคล"],
    data_retention: ["ระยะเวลาการเก็บรักษาข้อมูลส่วนบุคคล", "ช่วงเวลาที่เก็บข้อมูลส่วนบุคคล"],
    data_subject_rights: ["สิทธิของเจ้าของข้อมูลส่วนบุคคล", "สิทธิในการเข้าถึงและลบข้อมูลส่วนบุคคล"],
    international_transfers: ["การโอนข้อมูลส่วนบุคคลไปต่างประเทศ", "การโอนข้อมูลส่วนบุคคลระหว่างประเทศ"],
    supervisory_authority: ["สิทธิในการร้องเรียนต่อหน่วยงานกำกับดูแล", "หน่วยงานกำกับดูแลการคุ้มครองข้อมูล"],
    automated_decision_making_or_profiling: ["การตัดสินใจอัตโนมัติและการจัดทำโปรไฟล์", "การตัดสินใจโดยอาศัยการประมวลผลอัตโนมัติเท่านั้น"],
  }),
  ...localizedTopicTerms("he", {
    controller_contact: ["בעל השליטה במידע", "פרטי הקשר של בעל השליטה במידע"],
    dpo_contact: ["ממונה על הגנת הפרטיות", "פרטי הקשר של ממונה הגנת המידע"],
    processing_purposes: ["מטרות עיבוד המידע האישי", "אנו מעבדים מידע אישי למטרות הבאות"],
    legal_basis: ["הבסיס המשפטי לעיבוד מידע אישי", "העילה החוקית לעיבוד המידע האישי"],
    recipients_or_vendor_categories: ["נמעני המידע האישי", "קטגוריות של מקבלי מידע אישי"],
    data_retention: ["תקופת שמירת המידע האישי", "משך שמירת הנתונים האישיים"],
    data_subject_rights: ["זכויות נושא המידע", "הזכות לעיין ולמחוק מידע אישי"],
    international_transfers: ["העברה בינלאומית של מידע אישי", "העברת מידע אישי מחוץ למדינה"],
    supervisory_authority: ["הזכות להגיש תלונה לרשות המפקחת", "רשות הפיקוח להגנת מידע"],
    automated_decision_making_or_profiling: ["קבלת החלטות אוטומטית ויצירת פרופיל", "החלטה המבוססת אך ורק על עיבוד אוטומטי"],
  }),
  ...localizedTopicTerms("sr", {
    controller_contact: ["rukovalac podacima o ličnosti", "руковалац подацима о личности"],
    dpo_contact: ["lice za zaštitu podataka o ličnosti", "лице за заштиту података о личности"],
    processing_purposes: ["svrhe obrade podataka o ličnosti", "сврхе обраде података о личности"],
    legal_basis: ["pravni osnov za obradu podataka o ličnosti", "правни основ за обраду података о личности"],
    recipients_or_vendor_categories: ["primaoci podataka o ličnosti", "примаоци података о личности"],
    data_retention: ["rok čuvanja podataka o ličnosti", "рок чувања података о личности"],
    data_subject_rights: ["prava lica na koje se podaci odnose", "права лица на које се подаци односе"],
    international_transfers: ["prenos podataka o ličnosti u druge države", "пренос података о личности у друге државе"],
    supervisory_authority: ["pravo na pritužbu nadzornom organu", "право на притужбу надзорном органу"],
    automated_decision_making_or_profiling: ["automatizovano donošenje odluka i profilisanje", "аутоматизовано доношење одлука и профилисање"],
  }),
  ...localizedTopicTerms("ca", {
    controller_contact: ["responsable del tractament de dades personals", "dades de contacte del responsable del tractament"],
    dpo_contact: ["delegat de protecció de dades", "dades de contacte del delegat de protecció de dades"],
    processing_purposes: ["finalitats del tractament de dades personals", "tractem les dades personals amb les finalitats següents"],
    legal_basis: ["base jurídica del tractament de dades personals", "fonament jurídic per tractar dades personals"],
    recipients_or_vendor_categories: ["destinataris de les dades personals", "categories de destinataris de dades personals"],
    data_retention: ["termini de conservació de les dades personals", "període de conservació de dades personals"],
    data_subject_rights: ["drets de les persones interessades", "dret d'accés i supressió de les dades personals"],
    international_transfers: ["transferències internacionals de dades personals", "transferència de dades personals fora de l'espai econòmic europeu"],
    supervisory_authority: ["dret a presentar una reclamació davant l'autoritat de control", "autoritat de control de protecció de dades"],
    automated_decision_making_or_profiling: ["presa de decisions automatitzada i elaboració de perfils", "decisions basades únicament en el tractament automatitzat"],
  }),
  ...localizedTopicTerms("hi", {
    controller_contact: ["व्यक्तिगत डेटा नियंत्रक", "डेटा नियंत्रक की संपर्क जानकारी"],
    dpo_contact: ["डेटा संरक्षण अधिकारी", "डेटा संरक्षण अधिकारी की संपर्क जानकारी"],
    processing_purposes: ["व्यक्तिगत डेटा के प्रसंस्करण के उद्देश्य", "हम निम्नलिखित उद्देश्यों के लिए व्यक्तिगत डेटा संसाधित करते हैं"],
    legal_basis: ["व्यक्तिगत डेटा के प्रसंस्करण का कानूनी आधार", "व्यक्तिगत डेटा संसाधित करने का वैधानिक आधार"],
    recipients_or_vendor_categories: ["व्यक्तिगत डेटा के प्राप्तकर्ता", "व्यक्तिगत डेटा प्राप्तकर्ताओं की श्रेणियां"],
    data_retention: ["व्यक्तिगत डेटा की अवधारण अवधि", "व्यक्तिगत डेटा रखने की अवधि"],
    data_subject_rights: ["डेटा विषय के अधिकार", "व्यक्तिगत डेटा तक पहुंच और उसे मिटाने का अधिकार"],
    international_transfers: ["व्यक्तिगत डेटा का अंतर्राष्ट्रीय हस्तांतरण", "व्यक्तिगत डेटा को विदेश में स्थानांतरित करना"],
    supervisory_authority: ["पर्यवेक्षी प्राधिकरण में शिकायत करने का अधिकार", "डेटा संरक्षण पर्यवेक्षी प्राधिकरण"],
    automated_decision_making_or_profiling: ["स्वचालित निर्णय लेना और प्रोफाइलिंग", "केवल स्वचालित प्रसंस्करण पर आधारित निर्णय"],
  }),
  ...localizedTopicTerms("az", {
    controller_contact: ["şəxsi məlumatlara nəzarət edən şəxs", "məlumat nəzarətçisinin əlaqə məlumatları"],
    dpo_contact: ["məlumatların mühafizəsi üzrə məsul şəxs", "məlumatların mühafizəsi üzrə məsul şəxsin əlaqə məlumatları"],
    processing_purposes: ["şəxsi məlumatların emalı məqsədləri", "şəxsi məlumatları aşağıdakı məqsədlər üçün emal edirik"],
    legal_basis: ["şəxsi məlumatların emalının hüquqi əsası", "şəxsi məlumatların emalı üçün qanuni əsas"],
    recipients_or_vendor_categories: ["şəxsi məlumatların alıcıları", "şəxsi məlumat alıcılarının kateqoriyaları"],
    data_retention: ["şəxsi məlumatların saxlanma müddəti", "şəxsi məlumatların qorunma müddəti"],
    data_subject_rights: ["məlumat subyektinin hüquqları", "şəxsi məlumatlara giriş və silinmə hüququ"],
    international_transfers: ["şəxsi məlumatların beynəlxalq ötürülməsi", "şəxsi məlumatların xaricə ötürülməsi"],
    supervisory_authority: ["nəzarət orqanına şikayət etmək hüququ", "məlumatların mühafizəsi üzrə nəzarət orqanı"],
    automated_decision_making_or_profiling: ["avtomatlaşdırılmış qərarvermə və profilləşdirmə", "yalnız avtomatlaşdırılmış emala əsaslanan qərar"],
  }),
  ...localizedTopicTerms("gl", {
    controller_contact: ["responsable do tratamento de datos persoais", "datos de contacto do responsable do tratamento"],
    dpo_contact: ["delegado de protección de datos", "datos de contacto do delegado de protección de datos"],
    processing_purposes: ["finalidades do tratamento de datos persoais", "tratamos os datos persoais coas seguintes finalidades"],
    legal_basis: ["base xurídica do tratamento de datos persoais", "fundamento xurídico para tratar datos persoais"],
    recipients_or_vendor_categories: ["destinatarios dos datos persoais", "categorías de destinatarios de datos persoais"],
    data_retention: ["prazo de conservación dos datos persoais", "período de conservación de datos persoais"],
    data_subject_rights: ["dereitos das persoas interesadas", "dereito de acceso e supresión dos datos persoais"],
    international_transfers: ["transferencias internacionais de datos persoais", "transferencia de datos persoais fóra do espazo económico europeo"],
    supervisory_authority: ["dereito a presentar unha reclamación ante a autoridade de control", "autoridade de control de protección de datos"],
    automated_decision_making_or_profiling: ["toma de decisións automatizada e elaboración de perfís", "decisións baseadas unicamente no tratamento automatizado"],
  }),
];

export function classifyGdprTransparencyTopics(
  input: GdprTransparencyTopicClassifierInput,
): GdprTransparencyTopicClassification {
  const sourceText = classifierSourceText(input);
  const normalizedText = normalizeGdprTransparencyText(sourceText);
  if (!normalizedText) {
    return {
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      matches: [],
      reasonCodes: ["empty_text"],
    };
  }

  const localeHints = new Set(input.localeHints ?? []);
  const privacyDisclosureContext = hasPrivacyDisclosureContext(normalizedText);
  const localizedSemanticDisclosureContext = hasLocalizedSemanticDisclosureContext(normalizedText);
  const matches = matchedGdprTransparencyPhraseIndexes(normalizedText)
    .map((index) => NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES[index])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter(({ term }) => localeHints.size === 0 || localeHints.has(term.locale))
    .filter(({ normalizedPhrase, term }) => !dpoDesignationIsExplicitlyNegated({
      normalizedPhrase,
      normalizedText,
      term,
    }))
    .map(({ normalizedPhrase, term }) => ({
      term,
      score: phraseScore({
        normalizedText,
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
  const normalizedSectionHeading = normalizeGdprTransparencyText(input.section?.heading);
  const normalizedSectionBody = normalizeGdprTransparencyText(input.section?.body);
  const semanticMatches = GDPR_TRANSPARENCY_SEMANTIC_RULES
    .filter((rule) => localeHints.size === 0 || localeHints.has(rule.locale))
    .filter(() =>
      input.section != null ||
      privacyDisclosureContext ||
      localizedSemanticDisclosureContext ||
      /\b(?:personal data|personal information|user data|data about you|account (?:data|information)|legal effects?|significantly affects?|similarly significant effects?)\b/i.test(normalizedText)
    )
    .filter((rule) => {
      if (rule.sectionOnly) {
        if (!normalizedSectionHeading || !normalizedSectionBody) return false;
        if (rule.headingPattern) rule.headingPattern.lastIndex = 0;
        if (rule.bodyPattern) rule.bodyPattern.lastIndex = 0;
        return Boolean(
          rule.headingPattern?.test(normalizedSectionHeading) &&
          rule.bodyPattern?.test(normalizedSectionBody)
        );
      }
      if (!rule.pattern) return false;
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(normalizedText);
    });
  const evidenceSourceText = matches.length > 0 || semanticMatches.length > 0
    ? decodedEvidenceText(sourceText)
    : "";
  const evidenceSearchIndex = evidenceSourceText ? buildEvidenceSearchIndex(evidenceSourceText) : undefined;

  const selected = new Map<string, GdprTransparencyTopicMatch>();
  for (const { term } of matches) {
    const selectionKey = input.retainLocaleAlternatives
      ? `${term.topic}:${term.locale}`
      : term.topic;
    if (selected.has(selectionKey)) {
      continue;
    }
    selected.set(selectionKey, {
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

  for (const rule of semanticMatches) {
    const selectionKey = input.retainLocaleAlternatives
      ? `${rule.topic}:${rule.locale}`
      : rule.topic;
    if (selected.has(selectionKey)) continue;
    selected.set(selectionKey, {
      classifierProvenance: "gdpr_transparency_topic_classifier.v1",
      confidence: rule.confidence ?? (rule.sectionOnly ? 0.88 : 0.86),
      evidenceExcerpt: rule.sectionOnly && input.section
        ? boundedSectionSemanticEvidenceExcerpt(input.section, rule)
        : boundedEvidenceExcerptFromIndex(
          evidenceSourceText,
          evidenceSearchIndex,
          semanticRuleAnchor(normalizedText, rule),
        ),
      matchedLocale: rule.locale,
      matchedTerm: rule.matchedTerm,
      matchStrength: "equivalent",
      reasonCodes: [
        `matched_${rule.topic}`,
        "match_strength_equivalent",
        `variant_${rule.variant ?? "semantic_clause"}`,
      ],
      topic: rule.topic,
      variant: rule.variant ?? "semantic_clause",
    });
    if (selected.size >= Math.max(1, input.maxMatches ?? DEFAULT_MAX_MATCHES)) break;
  }

  return {
    classifierProvenance: "gdpr_transparency_topic_classifier.v1",
    matches: [...selected.values()],
    reasonCodes: selected.size > 0 ? ["topic_match_observed"] : ["no_topic_match"],
  };
}

function classifierSourceText(input: GdprTransparencyTopicClassifierInput) {
  const heading = decodedEvidenceText(input.section?.heading ?? "").trim();
  const body = decodedEvidenceText(input.section?.body ?? "").trim();
  if (heading || body) {
    return [heading, body].filter(Boolean).join("\n");
  }
  return input.text ?? "";
}

function semanticRuleAnchor(normalizedText: string, rule: GdprTransparencySemanticRule) {
  const pattern = rule.sectionOnly
    ? rule.bodyPattern ?? rule.headingPattern
    : rule.pattern ?? rule.headingPattern ?? rule.bodyPattern;
  if (!pattern) return rule.matchedTerm;
  pattern.lastIndex = 0;
  const matchedClause = pattern.exec(normalizedText)?.[0];
  if (!matchedClause) return rule.matchedTerm;
  const boundedAnchor = matchedClause.slice(0, 80);
  return boundedAnchor.length < matchedClause.length
    ? boundedAnchor.replace(/\s+\S*$/u, "").trim()
    : boundedAnchor;
}

function boundedSectionSemanticEvidenceExcerpt(
  section: NonNullable<GdprTransparencyTopicClassifierInput["section"]>,
  rule: GdprTransparencySemanticRule,
) {
  const heading = decodedEvidenceText(section.heading ?? "").trim();
  const body = decodedEvidenceText(section.body ?? "").trim();
  const prefix = heading ? `${heading}. ` : "";
  const bodyBudget = Math.max(80, MAX_EXCERPT_CHARS - prefix.length);
  const bodyIndex = body ? buildEvidenceSearchIndex(body) : undefined;
  const bodyExcerpt = boundedEvidenceExcerptFromIndex(
    body,
    bodyIndex,
    semanticRuleAnchor(normalizeGdprTransparencyText(body), rule),
    bodyBudget,
  );
  return `${prefix}${bodyExcerpt}`.slice(0, MAX_EXCERPT_CHARS).trim();
}

export function normalizeGdprTransparencyText(value: string | null | undefined): string {
  return decodeCommonHtmlEntities(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\u0640/g, "")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, "\"")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u00a0\t\r\n]+/g, " ")
    .replace(/־/g, " ")
    .replace(/\s*[-–—]\s*/g, "-")
    .replace(/[.,;:!?()[\]{}。、，；：！？（）،؛؟।॥]+/g, " ")
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
  normalizedText: string;
  normalizedPhrase: string;
  privacyDisclosureContext: boolean;
  term: GdprTransparencyTopicPhrase;
}): number {
  if (input.term.variant === "requires_privacy_context" && !input.privacyDisclosureContext) {
    return 0;
  }
  if (
    input.term.variant === "requires_topic_context" &&
    (!input.privacyDisclosureContext || !hasRequiredTopicContext(input.normalizedText, input.term))
  ) {
    return 0;
  }
  return 600 + input.normalizedPhrase.length + strengthRank(input.term.strength) * 80;
}

function dpoDesignationIsExplicitlyNegated(input: {
  normalizedPhrase: string;
  normalizedText: string;
  term: GdprTransparencyTopicPhrase;
}) {
  if (
    input.term.locale !== "en" ||
    input.term.topic !== "dpo_contact" ||
    !/\b(?:data protection officer|dpo)\b/i.test(input.normalizedPhrase)
  ) {
    return false;
  }

  const rolePattern = "(?:data protection officer|dpo)";
  const negationPatterns = [
    new RegExp(`\\b(?:do|does|did) not(?: currently)? (?:have|appoint|designate|name|publish|employ)\\b.{0,80}\\b${rolePattern}\\b`, "i"),
    new RegExp(`\\b(?:have|has|had) not(?: currently)? (?:appointed|designated|named|published|employed)\\b.{0,80}\\b${rolePattern}\\b`, "i"),
    new RegExp(`\\bno(?: separate| formal| appointed| designated| named){0,4} ${rolePattern}\\b`, "i"),
    new RegExp(`\\b${rolePattern}\\b.{0,80}\\b(?:has|have|is|was) not (?:been )?(?:appointed|designated|named|assigned)\\b`, "i"),
  ];
  let occurrenceIndex = input.normalizedText.indexOf(input.normalizedPhrase);
  while (occurrenceIndex >= 0) {
    const contextStart = Math.max(0, occurrenceIndex - 120);
    const contextEnd = Math.min(
      input.normalizedText.length,
      occurrenceIndex + input.normalizedPhrase.length + 120,
    );
    const context = input.normalizedText.slice(contextStart, contextEnd);
    if (!negationPatterns.some((pattern) => pattern.test(context))) {
      return false;
    }
    occurrenceIndex = input.normalizedText.indexOf(
      input.normalizedPhrase,
      occurrenceIndex + input.normalizedPhrase.length,
    );
  }
  return true;
}

function hasRequiredTopicContext(
  normalizedText: string,
  term: GdprTransparencyTopicPhrase,
) {
  switch (term.topic) {
    case "controller_contact":
      return (
        /\binformation on the controller pursuant to art 4\b.{0,260}(?:@|email|e-mail|postal|address|phone|telephone|tel|gmbh|ag|ltd|limited|inc|llc)\b/i.test(normalizedText) ||
        /\bcontroller and contact\b.{0,240}(?:@|email|e-mail|postal|address|phone|telephone|contact)/i.test(normalizedText) ||
        /\b(?:data controller|controller of (?:the )?(?:personal )?data|controller is|is the controller)\b.{0,320}\b(?:questions about (?:this )?(?:privacy )?(?:policy|notice)|you can contact us at|contact us|email|e-mail|postal|address|phone|telephone|@)/i.test(normalizedText) ||
        /\b(?:questions about (?:this )?(?:privacy )?(?:policy|notice)|you can contact us at|contact us|email|e-mail|postal|address|phone|telephone|@)\b.{0,320}\b(?:data controller|controller of (?:the )?(?:personal )?data|controller is|is the controller)\b/i.test(normalizedText) ||
        /оператор(?:ом)? персональных данных.{0,180}(?:@|e-?mail|электронн(?:ая|ой) почт|почтов(?:ый|ого) адрес|телефон|контакт|связаться)/iu.test(normalizedText) ||
        /(?:@|e-?mail|электронн(?:ая|ой) почт|почтов(?:ый|ого) адрес|телефон|контакт|связаться).{0,180}оператор(?:ом)? персональных данных/iu.test(normalizedText) ||
        /оператор(?:ом)? персональных данных\s*(?:(?:является|выступает)\s+|[-—–:]\s*)(?:ооо|ао|пао|зао|ип|[«"])/iu.test(normalizedText) ||
        /(?:ооо|ао|пао|зао|ип|[«"])[^.!?]{0,180}(?:является|выступает)\s+оператор(?:ом)? персональных данных/iu.test(normalizedText) ||
        /\bverantwortlicher\b.{0,240}(?:@|e-?mail|postanschrift|anschrift|adresse|telefon|kontakt|vertreten durch|gmbh|ag|kg|e\.k\.)/iu.test(normalizedText) ||
        /(?:@|e-?mail|postanschrift|anschrift|adresse|telefon|kontakt|vertreten durch|gmbh|ag|kg|e\.k\.).{0,240}\bverantwortlicher\b/iu.test(normalizedText)
      );
    case "dpo_contact":
      return /\bdatenschutzbeauftragte[rsn]?\b.{0,220}(?:@|e-?mail|postanschrift|anschrift|adresse|telefon|kontakt|erreichen|gmbh|ag|kg)/iu.test(normalizedText) ||
        /(?:@|e-?mail|postanschrift|anschrift|adresse|telefon|kontakt|erreichen|gmbh|ag|kg).{0,220}\bdatenschutzbeauftragte[rsn]?\b/iu.test(normalizedText);
    case "processing_purposes":
      return /\b(?:process(?:es|ed|ing)?|uses?|collect(?:s|ed|ing)?)\b.{0,100}\b(?:personal data|personal information|account data|security logs?|information|data)\b.{0,100}\b(?:to|for|in order to)\b/i.test(normalizedText) ||
        /\b(?:personal data|personal information|account data|security logs?|information|data)\b.{0,100}\b(?:is|are)?\s*(?:process(?:ed|ing)?|used|collected)\b.{0,100}\b(?:to|for|in order to)\b/i.test(normalizedText);
    case "legal_basis":
      return /\b(?:process(?:es|ed|ing)?|uses?|collect(?:s|ed|ing)?)\b.{0,120}\b(?:personal data|personal information|account data|security logs?|information|data)\b.{0,160}\b(?:under a contract|legitimate-interest purpose)\b/i.test(normalizedText) ||
        /\b(?:under a contract|legitimate-interest purpose)\b.{0,160}\b(?:process(?:es|ed|ing)?|uses?|collect(?:s|ed|ing)?)\b/i.test(normalizedText) ||
        /\bprocess(?:es|ed|ing)?\b.{0,140}\b(?:personal data|personal information|your data|your information)\b.{0,180}\bcomply with (?:a |our )?legal obligations?\b/i.test(normalizedText) ||
        /\bcomply with (?:a |our )?legal obligations?\b.{0,180}\bprocess(?:es|ed|ing)?\b.{0,140}\b(?:personal data|personal information|your data|your information)\b/i.test(normalizedText);
    case "recipients_or_vendor_categories":
      return /\b(?:named )?(?:[a-z0-9-]+\s+)?vendors include\b\s+(?!(?:we|our|the|a|an)\b)[a-z0-9][a-z0-9 .&'-]{2,}/i.test(normalizedText) ||
        /\brecipient of (?:the )?data\b.{0,180}\b(?:gmbh|ag|ltd|limited|inc|llc|corp|company|service provider|processor|hoster|authority)\b/i.test(normalizedText) ||
        /\bshare (?:your |the )?(?:personal data|personal information|your data|your information) with third parties\b/i.test(normalizedText) ||
        /\bshare information with third parties\b.{0,180}\b(?:personal data|personal information|your data|your information|service providers?|processors?|recipients?|vendors?)\b/i.test(normalizedText) ||
        /\b(?:personal data|personal information|your data|your information|service providers?|processors?|recipients?|vendors?)\b.{0,180}\bshare information with third parties\b/i.test(normalizedText) ||
        /\b(?:share|provide|disclose)\b.{0,160}\b(?:information|data)\b.{0,180}\b(?:supporting suppliers?|payment and delivery service providers?|advertising networks? and analytics partners?)\b/i.test(normalizedText);
    case "data_retention":
      return /\b(?:records?|recordings?) (?:are )?(?:retained|kept) for\b.{0,100}(?:\b\d+\s*(?:days?|weeks?|months?|years?)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?)\b|\bas long as\b|\buntil\b|\bafter\b)/i.test(normalizedText);
    case "international_transfers":
      return /\btransfers outside the eea\b.{0,220}\b(?:personal data|data|standard contractual clauses|safeguards?|adequacy|third countr)/i.test(normalizedText);
    case "supervisory_authority":
      return /\b(?:complain|complaint|lodge|file|submit)\b.{0,140}\bdata protection commission\b|\bdata protection commission\b.{0,140}\b(?:complain|complaint|lodge|file|submit)\b/i.test(normalizedText);
    case "automated_decision_making_or_profiling":
      return /\b(?:decision(?:s| making)?|profiling)\b.{0,180}\bsolely by automated means\b/i.test(normalizedText) ||
        /\b(?:automated decision(?: making)?|profiling)\b.{0,220}\b(?:do not make decisions of this kind|do not perform any automated profiling)\b|\b(?:do not make decisions of this kind|do not perform any automated profiling)\b.{0,220}\b(?:automated decision(?: making)?|profiling)\b/i.test(normalizedText);
    default:
      return true;
  }
}

function hasPrivacyDisclosureContext(normalizedText: string) {
  if (/\b(?:privacy|gdpr|dati personali|protezione dei dati|titolare del trattamento|responsabili? del trattamento|diritti degli interessati|articolo (?:6|13|28|44))\b/i.test(normalizedText)) {
    return true;
  }
  return PRIVACY_EVIDENCE_LOCALE_REGISTRY.some((entry) =>
    [...entry.privacyPolicyLabels, ...entry.contextHints.slice(0, 2)].some((term) => {
      const normalizedTerm = normalizeGdprTransparencyText(term);
      return normalizedTerm.length >= 5 && normalizedText.includes(normalizedTerm);
    })
  );
}

function hasLocalizedSemanticDisclosureContext(normalizedText: string) {
  return /(?:datenverarbeitung|personenbezogene daten|ihre daten|ip-adresse|donnees personnelles|vos donnees|adresse ip|datos personales|sus datos|tus datos|direccion ip|dati personali|i suoi dati|i tuoi dati|indirizzo ip|persoonsgegevens|uw gegevens|jouw gegevens|ip-adres|dane osobowe|panstwa dane|twoje dane|adres ip|dados pessoais|seus dados|endereco ip)/i.test(normalizedText);
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
  maximumChars = MAX_EXCERPT_CHARS,
): string {
  const normalizedPhrase = normalizeGdprTransparencyText(phrase);
  if (!sourceText || !searchIndex) {
    return "";
  }
  const matchIndexes = normalizedPhrase
    ? paddedIndexesOf(searchIndex.normalized, normalizedPhrase)
    : [];
  if (matchIndexes.length === 0) {
    return sourceText.slice(0, maximumChars);
  }
  return matchIndexes
    .map((matchIndex, occurrenceIndex) => {
      const sourceMatchStart = searchIndex.sourceIndexes[matchIndex] ?? 0;
      const normalizedMatchEnd = Math.min(
        searchIndex.sourceIndexes.length - 1,
        matchIndex + Math.max(1, normalizedPhrase.length) - 1,
      );
      const sourceMatchEnd = (searchIndex.sourceIndexes[normalizedMatchEnd] ?? sourceMatchStart) + 1;
      const excerpt = boundedCompleteEvidenceWindow(
        sourceText,
        sourceMatchStart,
        sourceMatchEnd,
        maximumChars,
      );
      return {
        excerpt,
        occurrenceIndex,
        score: substantiveEvidenceOccurrenceScore(excerpt, normalizedPhrase),
      };
    })
    .sort((left, right) =>
      right.score - left.score || left.occurrenceIndex - right.occurrenceIndex
    )[0]?.excerpt ?? sourceText.slice(0, maximumChars);
}

function boundedCompleteEvidenceWindow(
  sourceText: string,
  anchorStart: number,
  anchorEnd: number,
  maximumChars = MAX_EXCERPT_CHARS,
) {
  const hardStart = Math.max(0, anchorEnd - maximumChars);
  const preferredStartFloor = Math.max(hardStart, anchorStart - Math.floor(maximumChars / 3));
  const precedingBoundaries = evidenceBoundaryIndexesBefore(sourceText, anchorStart)
    .filter((index) => index >= preferredStartFloor);
  let start = precedingBoundaries.length > 0
    ? Math.min(...precedingBoundaries)
    : preferredStartFloor;
  if (start > 0 && !isEvidenceBoundary(sourceText[start - 1] ?? "")) {
    const nextWhitespace = sourceText.slice(start, anchorStart).search(/\s/u);
    if (nextWhitespace >= 0) start += nextWhitespace + 1;
  }

  const maximumEnd = Math.min(sourceText.length, start + maximumChars);
  const followingBoundaries = evidenceBoundaryIndexesAfter(sourceText, anchorEnd)
    .filter((index) => index <= maximumEnd);
  let end = followingBoundaries.length > 0
    ? Math.max(...followingBoundaries)
    : maximumEnd;
  if (end < sourceText.length && !isEvidenceBoundary(sourceText[end] ?? "")) {
    const lastWhitespace = sourceText.slice(anchorEnd, end).search(/\s+\S*$/u);
    if (lastWhitespace >= 0) end = anchorEnd + lastWhitespace;
  }
  if (end <= anchorEnd) end = maximumEnd;
  return sourceText.slice(start, end).trim();
}

function evidenceBoundaryIndexesBefore(value: string, offset: number) {
  const prefix = value.slice(0, offset);
  const indexes = [0, prefix.lastIndexOf("\n")];
  for (const match of prefix.matchAll(/[.!?。！？؟]\s+/gu)) {
    indexes.push((match.index ?? 0) + match[0].length);
  }
  return indexes.filter((index) => index >= 0);
}

function evidenceBoundaryIndexesAfter(value: string, offset: number) {
  const suffix = value.slice(offset);
  const indexes: number[] = [];
  const newline = suffix.indexOf("\n");
  if (newline >= 0) indexes.push(offset + newline);
  for (const match of suffix.matchAll(/[.!?。！？؟](?:\s+|$)/gu)) {
    indexes.push(offset + (match.index ?? 0) + match[0].length);
  }
  return indexes;
}

function isEvidenceBoundary(value: string) {
  return /[\s.!?。！？؟]/u.test(value);
}

function substantiveEvidenceOccurrenceScore(excerpt: string, normalizedPhrase: string) {
  const normalizedExcerpt = normalizeGdprTransparencyText(excerpt);
  const sentenceCount = (excerpt.match(/[.!?。！？؟](?:\s|$)?/gu) ?? []).length;
  const letterCount = (excerpt.match(/\p{L}/gu) ?? []).length;
  const topicCount = new Set(
    matchedGdprTransparencyPhraseIndexes(normalizedExcerpt)
      .map((index) => NORMALIZED_GDPR_TRANSPARENCY_TOPIC_PHRASES[index]?.term.topic)
      .filter(Boolean),
  ).size;
  const navigationTokenCount = (
    normalizedExcerpt.match(/(?:^| )(?:menu|navigation|search|login|sign in|home|overview|faq|terms|news|press)(?: |$)/g) ?? []
  ).length;
  const separatorCount = (excerpt.match(/\||-->|›|»/g) ?? []).length;
  const questionHeadingCount = (excerpt.match(/[?？؟]/gu) ?? []).length;
  const substantiveContextChars = Math.max(0, normalizedExcerpt.length - normalizedPhrase.length);
  const topicInventoryPenalty = (
    (topicCount >= 4 && sentenceCount < 2) ||
    questionHeadingCount >= 3 ||
    /\b(?:table of contents|privacy (?:policy|notice) contains)\b/i.test(normalizedExcerpt)
  ) ? 1_000 : 0;
  return (
    Math.min(letterCount, 260) +
    Math.min(substantiveContextChars, 260) / 2 +
    Math.min(sentenceCount, 5) * 28 +
    (hasPrivacyDisclosureContext(normalizedExcerpt) ? 30 : 0) -
    navigationTokenCount * 24 -
    separatorCount * 16 -
    topicInventoryPenalty
  );
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
          /[\u200B-\u200D\uFEFF]/u.test(char) ? " " :
          char === "ـ" ? "" :
          char === "־" ? " " :
          /[-–—]/u.test(char) ? "-" :
            /[.,;:!?()[\]{}。、，；：！？（）،؛؟।॥]+/u.test(char) ? " " :
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

function paddedIndexesOf(normalizedValue: string, phrase: string): number[] {
  if (usesBoundarylessScript(phrase)) {
    return allSubstringIndexes(normalizedValue, phrase);
  }
  if (usesArabicScript(phrase)) {
    const directIndexes = allSubstringIndexes(normalizedValue, phrase).filter((index) =>
      (index === 0 || normalizedValue[index - 1] === " ") &&
      (index + phrase.length === normalizedValue.length || normalizedValue[index + phrase.length] === " ")
    );
    const cliticIndex = arabicCliticIndex(normalizedValue, phrase);
    return cliticIndex >= 0 && !directIndexes.includes(cliticIndex)
      ? [...directIndexes, cliticIndex]
      : directIndexes;
  }
  return allSubstringIndexes(normalizedValue, phrase).filter((index) =>
    (index === 0 || normalizedValue[index - 1] === " ") &&
    (index + phrase.length === normalizedValue.length || normalizedValue[index + phrase.length] === " ")
  );
}

function allSubstringIndexes(value: string, substring: string): number[] {
  const indexes: number[] = [];
  let index = value.indexOf(substring);
  while (index >= 0 && indexes.length < 64) {
    indexes.push(index);
    index = value.indexOf(substring, index + Math.max(1, substring.length));
  }
  return indexes;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
