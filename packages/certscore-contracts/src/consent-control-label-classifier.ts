import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type ConsentControlIntent =
  | "accept"
  | "reject"
  | "options"
  | "privacy_opt_out"
  | "unknown";

export type ConsentControlLocale = SupportedPrivacyEvidenceLocale;

export type ConsentControlMatchStrength =
  | "direct"
  | "equivalent"
  | "contextual"
  | "weak";

export type ConsentControlClassifierProfile =
  | "production_default"
  | "multilingual_v1";

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
  classifierProfile?: ConsentControlClassifierProfile;
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

const PRODUCTION_DEFAULT_CONTEXT_HINT_PATTERN =
  /\b(cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|optional|essential|necessary|cmp|onetrust|trustarc|didomi|usercentrics|cookiebot|optanon|datenschutz|cookies?|einwilligung|zustimmung|präferenzen|einstellungen|choix|confidentialit[eé]|pr[eé]f[eé]rences?|consentement|finalit[eé]s|privacidad|preferencias?|configuraci[oó]n|opciones|consenso|privacy|preferenze|impostazioni|pubblicitarie|tracciamento)\b/i;

const MULTILINGUAL_CONTEXT_HINT_PATTERN =
  /\b(cookie|cookies|consent|privacy|preferences?|settings|choices?|tracking|advertising|marketing|optional|essential|necessary|cmp|onetrust|trustarc|didomi|usercentrics|cookiebot|optanon|datenschutz|cookies?|einwilligung|zustimmung|präferenzen|einstellungen|choix|confidentialit[eé]|pr[eé]f[eé]rences?|consentement|finalit[eé]s|privacidad|preferencias?|configuraci[oó]n|opciones|consenso|privacy|preferenze|impostazioni|pubblicitarie|tracciamento|toestemming|noodzakelijk|adverteren|śledzenie|sledzenie|reklam|prywatno[śs][ćc]|zgod[ayęą]|niezb[eę]dne|danych osobowych|plik(?:i|ów) cookie)\b/i;

const PRIVACY_OPT_OUT_HINT_PATTERN =
  /\b(do not sell|do not share|sale|share|targeted advertising|privacy rights?|legitimate interest|berechtigtem interesse|widerspruch|opposition|int[eé]r[eê]t l[eé]gitime|droit d['’]opposition|gerechtvaardigd belang|bezwaar|sprzeciw|uzasadnion(?:y|ego) interes)\b/i;

const PRODUCTION_DEFAULT_PREFERENCE_CONTEXT_PATTERN =
  /\b(preference|preferences|settings|choices?|options|purpose|purposes|präferenzen|einstellungen|auswahl|optionen|choix|param[eè]tres|pr[eé]f[eé]rences?|finalit[eé]s|preferencias?|configuraci[oó]n|opciones|preferenze|impostazioni|pubblicitarie)\b/i;

const MULTILINGUAL_PREFERENCE_CONTEXT_PATTERN =
  /\b(preference|preferences|settings|choices?|options|purpose|purposes|präferenzen|einstellungen|auswahl|optionen|choix|param[eè]tres|pr[eé]f[eé]rences?|finalit[eé]s|preferencias?|configuraci[oó]n|opciones|preferenze|impostazioni|pubblicitarie|voorkeuren|instellingen|keuzes|doeleinden|ustawieni[ae]|preferencj[ae]|wybor(?:y|ów)|cel(?:e|ów))\b/i;

const NON_ACTIONABLE_REFERENCE_PATTERN =
  /\bpannello delle preferenze pubblicitarie\b/i;

const UTIQ_SCOPED_REJECT_PATTERN =
  /\butiq\b.*\b(?:ablehnen|widersprechen|reject|decline|refuse|opt(?:\s|-)?out)\b|\b(?:ablehnen|widersprechen|reject|decline|refuse|opt(?:\s|-)?out)\b.*\butiq\b/i;

const CONTINUE_AS_ACCEPT_CONTEXT_PATTERN =
  /\b(?:by\s+(?:using|continuing(?:\s+to\s+use)?|accessing|remaining\s+on)\s+(?:this\s+)?(?:site|website|service|page)|(?:using|continuing(?:\s+to\s+use)?|accessing|remaining\s+on)\s+(?:this\s+)?(?:site|website|service|page)\s+(?:means|constitutes|indicates)|you\s+(?:consent|agree)\s+to\s+(?:these\s+)?cookies?)\b/i;

const PRODUCTION_DEFAULT_CONSENT_CONTROL_LOCALES = new Set<ConsentControlLocale>([
  "en",
  "de",
  "fr",
  "es",
  "it",
]);

const en = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "en", ...term }));
const de = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "de", ...term }));
const fr = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "fr", ...term }));
const es = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "es", ...term }));
const it = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "it", ...term }));
const nl = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "nl", ...term }));
const pl = (terms: TermInput[]) => terms.map((term): ConsentControlTerm => ({ locale: "pl", ...term }));

export const CONSENT_CONTROL_PHRASE_REGISTRY: ConsentControlTerm[] = [
  ...en([
    ...direct("accept", "accept"),
    ...direct("accept", "accept all"),
    ...direct("accept", "allow all"),
    ...direct("accept", "agree"),
    ...direct("accept", "i agree"),
    ...direct("accept", "i accept"),
    ...direct("accept", "yes, i agree"),
    ...direct("accept", "consent"),
    ...direct("accept", "accept cookies"),
    ...direct("accept", "accept all cookies"),
    ...direct("accept", "accept optional"),
    ...direct("accept", "accept optional cookies"),
    ...direct("accept", "accept non-essential cookies"),
    ...direct("accept", "accept non essential cookies"),
    ...direct("accept", "allow cookies"),
    ...direct("accept", "allow optional cookies"),
    ...direct("accept", "allow non-essential cookies"),
    ...direct("accept", "agree and close"),
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
    ...direct("reject", "reject cookies"),
    ...direct("reject", "reject all cookies"),
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
    equivalent("reject", "decline and subscribe", "reject_with_subscription"),
    equivalent("reject", "subscribe and decline", "reject_with_subscription"),
    equivalent("reject", "reject and subscribe", "reject_with_subscription"),
    equivalent("reject", "reject all and subscribe", "reject_with_subscription"),
    equivalent("reject", "use necessary cookies only", "necessary_only"),
    equivalent("reject", "necessary cookies only", "necessary_only"),
    equivalent("reject", "essential cookies only", "necessary_only"),
    contextual("reject", "required only", { requiresConsentContext: true, variant: "necessary_only" }),
    equivalent("reject", "only necessary", "necessary_only"),
    equivalent("reject", "only essential", "necessary_only"),
    equivalent("reject", "only technically required", "necessary_only"),
    equivalent("reject", "only technically required cookies", "necessary_only"),
    equivalent("reject", "only technically necessary", "necessary_only"),
    equivalent("reject", "only technically necessary cookies", "necessary_only"),
    equivalent("reject", "strictly necessary only", "necessary_only"),
    equivalent("reject", "accept necessary only", "necessary_only"),
    equivalent("reject", "accept essential only", "necessary_only"),
    equivalent("reject", "accept necessary", "necessary_only"),
    equivalent("reject", "accept essential", "necessary_only"),
    equivalent("reject", "save necessary only", "necessary_only"),
    ...direct("reject", "reject optional"),
    ...direct("reject", "reject optional cookies"),
    ...direct("reject", "reject non-essential"),
    ...direct("reject", "reject non essential"),
    ...direct("reject", "reject non-essential cookies"),
    ...direct("reject", "decline non-essential"),
    ...direct("reject", "decline non essential"),
    ...direct("reject", "decline non-essential cookies"),
    ...direct("reject", "decline non essential cookies"),
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
    ...direct("options", "manage cookies"),
    ...direct("options", "manage options"),
    ...direct("options", "manage choices"),
    ...direct("options", "set preferences"),
    contextual("options", "set up the collection", { requiresConsentContext: true }),
    ...direct("options", "cookie settings"),
    ...direct("options", "privacy settings"),
    contextual("options", "preferences", { requiresConsentContext: true }),
    contextual("options", "personalise", { requiresConsentContext: true }),
    contextual("options", "personalize", { requiresConsentContext: true }),
    contextual("options", "customise", { requiresConsentContext: true }),
    contextual("options", "customize", { requiresConsentContext: true }),
    ...direct("options", "customize choices"),
    ...direct("options", "customise choices"),
    ...direct("options", "customise my choices"),
    ...direct("options", "more options"),
    contextual("options", "show purposes", { requiresConsentContext: true }),
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
    ...direct("accept", "annehmen"),
    ...direct("accept", "alle annehmen"),
    ...direct("accept", "alle zulassen"),
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
    contextual("reject", "nur notwendige", { requiresConsentContext: true, variant: "necessary_only" }),
    contextual("reject", "nur erforderliche", { requiresConsentContext: true, variant: "necessary_only" }),
    contextual("reject", "nur essenzielle", { requiresConsentContext: true, variant: "necessary_only" }),
    contextual("reject", "nur essentielle", { requiresConsentContext: true, variant: "necessary_only" }),
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
    ...direct("options", "cookies verwalten"),
    contextual("options", "verwalten", { requiresConsentContext: true }),
    ...direct("options", "auswahl verwalten"),
    contextual("options", "optionen", { requiresConsentContext: true }),
    ...direct("options", "weitere optionen"),
    contextual("options", "anpassen", { requiresConsentContext: true }),
    contextual("options", "konfigurieren", { requiresConsentContext: true }),
    ...direct("options", "präferenzcenter"),
    ...direct("options", "datenschutzcenter"),
    ...direct("options", "mehr informationen öffnet das einstellungscenter-dialogfeld"),
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
    ...direct("reject", "refuser tous"),
    ...direct("reject", "refuser tous les cookies"),
    ...direct("reject", "tout refuser"),
    ...direct("reject", "refuser tout"),
    ...direct("reject", "je refuse"),
    ...direct("reject", "ne pas accepter"),
    ...direct("reject", "ne pas consentir"),
    ...direct("reject", "je ne consens pas"),
    ...direct("reject", "sans consentement"),
    contextual("reject", "non merci", { requiresConsentContext: true }),
    equivalent("reject", "continuer sans accepter"),
    equivalent("reject", "continuer sans consentir"),
    equivalent("reject", "continuer sans cookies"),
    equivalent("reject", "continuer sans accepter les cookies"),
    equivalent("reject", "continuer sans consentement"),
    equivalent("reject", "refuser et s'abonner", "reject_with_subscription"),
    equivalent("reject", "uniquement les cookies nécessaires", "necessary_only"),
    equivalent("reject", "cookies nécessaires uniquement", "necessary_only"),
    equivalent("reject", "cookies essentiels uniquement", "necessary_only"),
    equivalent("reject", "cookies strictement nécessaires", "necessary_only"),
    equivalent("reject", "essentiel uniquement", "necessary_only"),
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
    ...direct("options", "gérer mes consentements"),
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
  ...es([
    ...direct("accept", "aceptar"),
    ...direct("accept", "aceptar todo"),
    ...direct("accept", "aceptar todos"),
    ...direct("accept", "aceptar y continuar"),
    ...direct("accept", "aceptar cookies"),
    ...direct("accept", "aceptar todas las cookies"),

    ...direct("reject", "rechazar"),
    ...direct("reject", "rechazar todo"),
    ...direct("reject", "rechazar todos"),
    ...direct("reject", "rechazar cookies"),
    ...direct("reject", "rechazar todas las cookies"),
    equivalent("reject", "continuar sin aceptar"),
    equivalent("reject", "continuar sin cookies"),
    equivalent("reject", "solo cookies necesarias", "necessary_only"),
    equivalent("reject", "solo las cookies necesarias", "necessary_only"),

    contextual("options", "configurar", { requiresConsentContext: true }),
    contextual("options", "preferencias", { requiresConsentContext: true }),
    contextual("options", "opciones", { requiresConsentContext: true }),
    ...direct("options", "configurar cookies"),
    ...direct("options", "configuración de cookies"),
    ...direct("options", "gestionar opciones"),
    ...direct("options", "gestionar preferencias"),
    ...direct("options", "panel de preferencias"),
  ]),
  ...it([
    ...direct("accept", "accetta"),
    ...direct("accept", "accetto"),
    ...direct("accept", "accetta tutto"),
    ...direct("accept", "accetta tutti"),
    ...direct("accept", "accetta e continua"),
    ...direct("accept", "accetta i cookie"),
    ...direct("accept", "accetta tutti i cookie"),

    ...direct("reject", "rifiuta"),
    ...direct("reject", "rifiuta tutto"),
    ...direct("reject", "rifiuta tutti"),
    ...direct("reject", "rifiuta i cookie"),
    ...direct("reject", "rifiuta tutti i cookie"),
    equivalent("reject", "rifiuta e abbonati", "reject_with_subscription"),
    equivalent("reject", "continua senza accettare"),
    equivalent("reject", "continua senza cookie"),
    equivalent("reject", "solo cookie necessari", "necessary_only"),
    equivalent("reject", "solo i cookie necessari", "necessary_only"),
    contextual("reject", "accetta solo necessari", { requiresConsentContext: true, variant: "necessary_only" }),
    contextual("reject", "accetta solo i necessari", { requiresConsentContext: true, variant: "necessary_only" }),
    equivalent("reject", "consenti solo i cookie tecnici", "necessary_only"),
    equivalent("reject", "solo cookie tecnici", "necessary_only"),
    equivalent("reject", "solo i cookie tecnici", "necessary_only"),

    contextual("options", "preferenze", { requiresConsentContext: true }),
    contextual("options", "impostazioni", { requiresConsentContext: true }),
    contextual("options", "personalizza", { requiresConsentContext: true }),
    contextual("options", "configura", { requiresConsentContext: true }),
    ...direct("options", "gestione cookie"),
    ...direct("options", "impostazioni cookie"),
    ...direct("options", "gestisci preferenze"),
  ]),
  ...nl([
    ...direct("accept", "accepteren"),
    ...direct("accept", "alles accepteren"),
    ...direct("accept", "alle cookies accepteren"),
    ...direct("accept", "akkoord"),
    ...direct("accept", "ik ga akkoord"),
    ...direct("accept", "toestaan"),
    ...direct("accept", "alles toestaan"),
    ...direct("accept", "accepteren en doorgaan"),
    weak("accept", "ok", { requiresConsentContext: true }),

    ...direct("reject", "weigeren"),
    ...direct("reject", "alles weigeren"),
    ...direct("reject", "cookies weigeren"),
    ...direct("reject", "alle cookies weigeren"),
    ...direct("reject", "niet accepteren"),
    ...direct("reject", "niet toestaan"),
    equivalent("reject", "doorgaan zonder accepteren"),
    equivalent("reject", "doorgaan zonder toestemming"),
    equivalent("reject", "doorgaan zonder cookies"),
    equivalent("reject", "alleen noodzakelijke cookies", "necessary_only"),
    equivalent("reject", "alleen noodzakelijke", "necessary_only"),
    equivalent("reject", "alleen essentiële cookies", "necessary_only"),
    equivalent("reject", "noodzakelijke cookies gebruiken", "necessary_only"),
    ...direct("reject", "optionele cookies weigeren"),
    ...direct("reject", "alles uitschakelen"),

    contextual("options", "instellingen", { requiresConsentContext: true }),
    contextual("options", "voorkeuren", { requiresConsentContext: true }),
    contextual("options", "keuzes", { requiresConsentContext: true }),
    ...direct("options", "cookie-instellingen"),
    ...direct("options", "cookie instellingen"),
    ...direct("options", "cookies beheren"),
    ...direct("options", "voorkeuren beheren"),
    ...direct("options", "privacy-instellingen"),
    contextual("options", "mijn keuzes opslaan", { requiresPreferenceContext: true, variant: "save_preferences" }),

    ...direct("privacy_opt_out", "bezwaar maken"),
    ...direct("privacy_opt_out", "bezwaar tegen gerechtvaardigd belang"),
    ...direct("privacy_opt_out", "niet verkopen"),
    ...direct("privacy_opt_out", "niet delen"),
    ...direct("privacy_opt_out", "privacykeuzes"),
  ]),
  ...pl([
    ...direct("accept", "akceptuję"),
    ...direct("accept", "akceptuj"),
    ...direct("accept", "zaakceptuj"),
    ...direct("accept", "akceptuj wszystko"),
    ...direct("accept", "zaakceptuj wszystko"),
    ...direct("accept", "akceptuj wszystkie"),
    ...direct("accept", "akceptuj wszystkie pliki cookie"),
    ...direct("accept", "zgadzam się"),
    ...direct("accept", "zezwól"),
    ...direct("accept", "zezwól na wszystkie"),
    ...direct("accept", "zezwalam"),
    ...direct("accept", "zezwalam na wszystkie"),
    contextual("accept", "przejdź do serwisu", { requiresConsentContext: true }),
    weak("accept", "ok", { requiresConsentContext: true }),

    ...direct("reject", "odrzuć"),
    ...direct("reject", "odrzuć wszystko"),
    ...direct("reject", "odrzuć wszystkie"),
    ...direct("reject", "odrzuć pliki cookie"),
    ...direct("reject", "odrzuć wszystkie pliki cookie"),
    ...direct("reject", "nie akceptuję"),
    ...direct("reject", "nie zgadzam się"),
    equivalent("reject", "kontynuuj bez akceptacji"),
    equivalent("reject", "kontynuuj bez zgody"),
    equivalent("reject", "kontynuuj bez plików cookie"),
    equivalent("reject", "tylko niezbędne pliki cookie", "necessary_only"),
    equivalent("reject", "tylko wymagane pliki cookie", "necessary_only"),
    equivalent("reject", "tylko konieczne pliki cookie", "necessary_only"),
    equivalent("reject", "używaj tylko niezbędnych plików cookie", "necessary_only"),
    ...direct("reject", "odrzuć opcjonalne pliki cookie"),
    ...direct("reject", "wyłącz wszystkie"),

    contextual("options", "ustawienia", { requiresConsentContext: true }),
    contextual("options", "ustawienia zaawansowane", { requiresConsentContext: true }),
    contextual("options", "preferencje", { requiresConsentContext: true }),
    contextual("options", "opcje", { requiresConsentContext: true }),
    ...direct("options", "ustawienia cookies"),
    ...direct("options", "ustawienia plików cookie"),
    ...direct("options", "preferencje plików cookie"),
    ...direct("options", "dostosuj zgody"),
    ...direct("options", "dostosuj ustawienia"),
    ...direct("options", "dostosuj preferencje"),
    ...direct("options", "zarządzaj zgodami"),
    ...direct("options", "zarządzaj preferencjami"),
    ...direct("options", "centrum preferencji"),
    contextual("options", "zapisz moje wybory", { requiresPreferenceContext: true, variant: "save_preferences" }),

    ...direct("privacy_opt_out", "sprzeciw"),
    ...direct("privacy_opt_out", "wnieś sprzeciw"),
    ...direct("privacy_opt_out", "sprzeciw wobec uzasadnionego interesu"),
    ...direct("privacy_opt_out", "nie sprzedawaj"),
    ...direct("privacy_opt_out", "nie udostępniaj"),
    ...direct("privacy_opt_out", "wybory dotyczące prywatności"),
  ]),
];

export const consentControlTerms = CONSENT_CONTROL_PHRASE_REGISTRY;

export function classifyConsentControlLabel(
  input: ConsentControlLabelClassifierInput,
): ConsentControlLabelClassification {
  const labelText = [
    input.label,
    input.ariaLabel,
    input.title,
    input.value,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.findIndex((candidate) =>
      normalizeConsentControlText(candidate) === normalizeConsentControlText(value)
    ) === index)
    .join(" ");
  const normalizedLabel = normalizeConsentControlText(labelText);
  const normalizedContext = normalizeConsentControlText(input.contextText ?? "");
  const reasonCodes: string[] = [];
  const classifierProfile = input.classifierProfile ?? "production_default";
  const contextHintPattern = classifierProfile === "multilingual_v1"
    ? MULTILINGUAL_CONTEXT_HINT_PATTERN
    : PRODUCTION_DEFAULT_CONTEXT_HINT_PATTERN;
  const preferenceContextPattern = classifierProfile === "multilingual_v1"
    ? MULTILINGUAL_PREFERENCE_CONTEXT_PATTERN
    : PRODUCTION_DEFAULT_PREFERENCE_CONTEXT_PATTERN;
  const hasConsentContext = input.hasConsentContext === true ||
    contextHintPattern.test(input.contextText ?? "");
  const hasPreferenceContext = input.hasPreferenceContext === true ||
    hasConsentContext && preferenceContextPattern.test(input.contextText ?? "");
  const hasContinueConsentContext = CONTINUE_AS_ACCEPT_CONTEXT_PATTERN.test(input.contextText ?? "");

  if (!normalizedLabel) {
    return unknown(["empty_label"]);
  }
  if (normalizedLabel.length > 220) {
    return unknown(["label_too_long"]);
  }
  if (NON_ACTIONABLE_REFERENCE_PATTERN.test(normalizedLabel)) {
    return unknown(["non_actionable_reference_label"]);
  }
  if (isUtiqScopedRejectLabel(normalizedLabel)) {
    return {
      intent: "privacy_opt_out",
      confidence: 0.86,
      matchedTerm: "utiq reject",
      matchedLocale: "de",
      matchStrength: "equivalent",
      variant: "vendor_specific_opt_out",
      reasonCodes: [
        "vendor_specific_privacy_opt_out",
        "matched_privacy_opt_out",
        "match_strength_equivalent",
        "context_satisfied",
      ],
      contextSatisfied: true,
    };
  }
  if (PRIVACY_OPT_OUT_HINT_PATTERN.test(`${labelText} ${input.contextText ?? ""}`)) {
    reasonCodes.push("privacy_opt_out_context");
  }

  const localeHints = new Set(input.localeHints ?? []);
  const activeLocales = activeLocalesForProfile(classifierProfile);
  const terms = CONSENT_CONTROL_PHRASE_REGISTRY.filter((term) =>
    activeLocales.has(term.locale) &&
    (localeHints.size === 0 || localeHints.has(term.locale))
  );
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

export function isProductionCreditworthySupplementalConsentControlClassification(
  labelValue: string | null | undefined,
  classification: ConsentControlLabelClassification,
): boolean {
  if (classification.intent === "unknown") return false;
  const normalizedLabel = normalizeConsentControlText(labelValue);
  const strongMatch = classification.matchStrength === "direct" || classification.matchStrength === "equivalent";

  if (classification.matchedLocale === "nl") {
    if (classification.intent === "accept") return strongMatch && /\b(?:alles accepteren|alle cookies accepteren|accepteren|akkoord|ik ga akkoord|toestaan|alles toestaan)\b/i.test(normalizedLabel);
    if (classification.intent === "options") return /(?:cookie-instellingen|cookie instellingen|privacy-instellingen|cookies beheren|voorkeuren beheren)/i.test(normalizedLabel) || (strongMatch && /(?:voorkeuren|instellingen|keuzes)/i.test(normalizedLabel));
    if (classification.intent === "reject") return strongMatch && /(?:weigeren|niet accepteren|niet toestaan|zonder (?:accepteren|toestemming|cookies)|alleen (?:noodzakelijke|essenti[eë]le))/i.test(normalizedLabel);
    return false;
  }
  if (classification.matchedLocale !== "pl") return false;
  if (classification.intent === "accept") return strongMatch && /\b(?:akceptuj(?:e|ę)?|zaakceptuj|zgadzam się|zezw[oó]l|zezwalam)\b/i.test(normalizedLabel) && !/\bprzejd[zź]\b/i.test(normalizedLabel);
  if (classification.intent === "options") return /(?:centrum preferencji|ustawienia zaawansowane|preferencje plik|ustawienia (?:plik|cookies)|zarządzaj (?:zgodami|preferencjami)|dostosuj (?:zgody|ustawienia|preferencje))/i.test(normalizedLabel) || (classification.matchStrength === "contextual" && classification.contextSatisfied && classification.matchedTerm === "ustawienia" && normalizedLabel === "ustawienia") || (strongMatch && /(?:preferenc|ustawieni|wybor|zgod)/i.test(normalizedLabel));
  if (classification.intent === "reject") return strongMatch && /(?:odrzu|nie akceptuj|nie zgadzam|tylko (?:niezb[eę]dne|wymagane|konieczne))/i.test(normalizedLabel);
  return false;
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

function isUtiqScopedRejectLabel(normalizedLabel: string) {
  if (!UTIQ_SCOPED_REJECT_PATTERN.test(normalizedLabel)) {
    return false;
  }
  return !/\b(?:alle|all|cookies?|tracking|nicht erforderliche|optionale|optional|notwendige|necessary|essential)\b/i.test(normalizedLabel);
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
  return (exact ? 1000 : 500) +
    phrase.length +
    strengthRank(term.strength) * 100 +
    (term.variant === "reject_with_subscription" ? 200 : 0) +
    (contextSatisfied ? 50 : 0);
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

function activeLocalesForProfile(profile: ConsentControlClassifierProfile) {
  if (profile === "multilingual_v1") {
    return new Set<ConsentControlLocale>(["en", "de", "fr", "es", "it", "nl", "pl"]);
  }
  return PRODUCTION_DEFAULT_CONSENT_CONTROL_LOCALES;
}

function unknown(reasonCodes: string[]): ConsentControlLabelClassification {
  return {
    intent: "unknown",
    confidence: 0.2,
    reasonCodes: uniqueStrings(reasonCodes),
    contextSatisfied: false,
  };
}
