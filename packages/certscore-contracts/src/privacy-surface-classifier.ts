import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type PrivacySurfaceType =
  | "privacy_policy"
  | "cookie_policy"
  | "california_notice"
  | "notice_at_collection"
  | "do_not_sell_or_share"
  | "your_privacy_choices"
  | "cookie_settings"
  | "consent_preferences"
  | "terms"
  | "ai_disclosure"
  | "accessibility_statement"
  | "unknown";

export type PrivacySurfaceMatchStrength =
  | "direct"
  | "equivalent"
  | "contextual"
  | "weak";

export type PrivacySurfacePhrase = {
  locale: SupportedPrivacyEvidenceLocale;
  phrase: string;
  surfaceType: Exclude<PrivacySurfaceType, "unknown">;
  strength: PrivacySurfaceMatchStrength;
  variant?: string;
  requiresPrivacyContext?: boolean;
};

export type PrivacySurfaceClassifierInput = {
  linkText?: string | null;
  url?: string | null;
  title?: string | null;
  surroundingText?: string | null;
  localeHints?: SupportedPrivacyEvidenceLocale[];
};

export type PrivacySurfaceClassification = {
  confidence: number;
  contextSatisfied: boolean;
  matchedLocale?: SupportedPrivacyEvidenceLocale;
  matchedTerm?: string;
  matchStrength?: PrivacySurfaceMatchStrength;
  reasonCodes: string[];
  surfaceType: PrivacySurfaceType;
  variant?: string;
};

type PhraseInput = Omit<PrivacySurfacePhrase, "locale">;

export type PrivacySurfaceLocaleDefinition = {
  locale: SupportedPrivacyEvidenceLocale;
  privacyPolicyPhrases: string[];
  privacyPolicyPathSlugs: string[];
  cookiePolicyPhrases: string[];
  cookiePolicyPathSlugs: string[];
  cookieSettingsPhrases?: string[];
  consentPreferencePhrases?: string[];
  termsPhrases?: string[];
  termsPathSlugs?: string[];
  contextTerms: string[];
  tldHints?: string[];
  visibleTextHints?: string[];
};

export const PRIVACY_SURFACE_LOCALE_REGISTRY: PrivacySurfaceLocaleDefinition[] = [
  locale("en", {
    privacyPolicyPhrases: ["privacy policy", "privacy notice", "privacy statement", "privacy"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "privacy-notice",
      "legal/privacy-policy",
      "legal/privacy",
      "policies/privacy",
      "privacy-statement",
      "data-privacy",
      "about/privacy",
      "en/privacy",
    ],
    cookiePolicyPhrases: ["cookie policy", "cookie notice", "cookie statement", "cookies"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie-notice",
      "legal/cookie-policy",
      "policies/cookies",
      "cookie-statement",
      "legal/cookies",
      "about/cookies",
      "cookie-declaration",
      "en/cookie-policy",
    ],
    cookieSettingsPhrases: ["cookie settings", "cookie preferences", "manage cookies", "manage cookies+", "manage preferences"],
    consentPreferencePhrases: ["consent preferences", "preference center", "privacy center", "privacy settings", "consent settings"],
    termsPhrases: ["terms", "terms of service", "terms and conditions"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "tos",
      "legal/terms",
      "terms-of-use",
      "legal/terms-of-service",
      "policies/terms",
      "about/terms",
      "legal",
    ],
    contextTerms: ["privacy", "cookie", "cookies", "consent", "preferences", "settings", "choices"],
    tldHints: [".com", ".org", ".net", ".edu", ".gov", ".uk", ".us", ".au", ".ca"],
  }),
  locale("es", {
    privacyPolicyPhrases: ["política de privacidad", "aviso de privacidad", "privacidad"],
    privacyPolicyPathSlugs: [
      "politica-de-privacidad",
      "privacidad",
      "politica-privacidad",
      "aviso-de-privacidad",
      "proteccion-de-datos",
      "aviso-legal",
      "legal/privacidad",
      "politica-de-proteccion-de-datos",
      "es/privacidad",
      "privacidad-y-cookies",
    ],
    cookiePolicyPhrases: ["política de cookies", "aviso de cookies", "cookies"],
    cookiePolicyPathSlugs: [
      "politica-de-cookies",
      "cookies",
      "aviso-de-cookies",
      "politica-cookies",
      "gestion-de-cookies",
      "legal/cookies",
      "es/cookies",
      "preferencias-de-cookies",
      "politica-de-privacidad-y-cookies",
      "cookies-policy",
    ],
    cookieSettingsPhrases: ["configuración de cookies", "preferencias de cookies"],
    consentPreferencePhrases: ["preferencias de consentimiento"],
    termsPhrases: ["términos y condiciones", "condiciones de uso"],
    termsPathSlugs: [
      "terminos-de-servicio",
      "terminos-y-condiciones",
      "condiciones-de-uso",
      "aviso-legal",
      "condiciones-de-servicio",
      "legal/terminos",
      "terminos",
      "condiciones-generales",
      "es/terminos",
      "tyc",
    ],
    contextTerms: ["privacidad", "cookies", "consentimiento", "datos personales"],
    tldHints: [".es", ".mx", ".ar", ".cl", ".co", ".pe"],
  }),
  locale("de", {
    privacyPolicyPhrases: ["datenschutzerklärung", "datenschutzinformation", "datenschutz"],
    privacyPolicyPathSlugs: [
      "datenschutz",
      "datenschutzerklarung",
      "datenschutzerklaerung",
      "datenschutzhinweise",
      "datenschutz-erklarung",
      "legal/datenschutz",
      "rechtliches/datenschutz",
      "datenschutzerklarung-dsgvo",
      "uber-uns/datenschutz",
      "de/datenschutz",
    ],
    cookiePolicyPhrases: ["cookie-richtlinie", "cookie hinweis", "cookie-erklärung", "cookies"],
    cookiePolicyPathSlugs: [
      "cookie-richtlinie",
      "cookies",
      "cookie-hinweise",
      "cookie-erklarung",
      "datenschutz/cookies",
      "rechtliches/cookies",
      "legal/cookies",
      "cookie-policy",
      "cookie-einstellungen",
      "de/cookies",
    ],
    cookieSettingsPhrases: ["cookie-einstellungen", "cookie einstellungen"],
    consentPreferencePhrases: ["datenschutzeinstellungen", "präferenzcenter"],
    termsPhrases: ["nutzungsbedingungen", "allgemeine geschäftsbedingungen"],
    termsPathSlugs: [
      "agb",
      "nutzungsbedingungen",
      "allgemeine-geschaftsbedingungen",
      "rechtliches",
      "legal/agb",
      "terms",
      "agb-nutzungsbedingungen",
      "de/agb",
      "bedingungen",
      "allgemeine-bedingungen",
    ],
    contextTerms: ["datenschutz", "personenbezogene daten", "cookie", "cookies", "einwilligung"],
    tldHints: [".de", ".at", ".ch"],
  }),
  locale("ja", {
    privacyPolicyPhrases: ["プライバシーポリシー", "個人情報保護方針", "個人情報の取り扱い"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "legal/privacy",
      "ja/privacy",
      "policies/privacy",
      "kojin-joho-hogo",
      "personal-information",
      "kojin-joho",
      "privacy-policy.html",
      "seisaku/privacy",
    ],
    cookiePolicyPhrases: ["クッキーポリシー", "cookieポリシー"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "ja/cookies",
      "cookie-notice",
      "cookie-statement",
      "cookies-policy",
      "policies/cookies",
      "privacy-cookies",
    ],
    cookieSettingsPhrases: ["クッキー設定", "cookie設定"],
    termsPhrases: ["利用規約"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "ja/terms",
      "tos",
      "terms-of-use",
      "legal",
      "riyokiyaku",
      "kiyaku",
    ],
    contextTerms: ["プライバシー", "個人情報", "クッキー"],
    tldHints: [".jp"],
  }),
  locale("fr", {
    privacyPolicyPhrases: ["politique de confidentialité", "avis de confidentialité", "confidentialité"],
    privacyPolicyPathSlugs: [
      "politique-de-confidentialite",
      "confidentialite",
      "politique-confidentialite",
      "protection-des-donnees",
      "vie-privee",
      "mentions-legales",
      "legal/confidentialite",
      "politique-de-protection-des-donnees",
      "fr/confidentialite",
      "politique-de-vie-privee",
    ],
    cookiePolicyPhrases: ["politique relative aux cookies", "politique cookies", "avis relatif aux cookies", "cookies"],
    cookiePolicyPathSlugs: [
      "politique-cookies",
      "cookies",
      "politique-de-cookies",
      "gestion-cookies",
      "cookie-policy",
      "mentions-legales/cookies",
      "confidentialite/cookies",
      "fr/cookies",
      "declaration-cookies",
      "politique-de-confidentialite/cookies",
    ],
    cookieSettingsPhrases: ["paramètres des cookies", "préférences cookies"],
    consentPreferencePhrases: ["préférences de consentement", "centre de préférences"],
    termsPhrases: ["conditions d'utilisation", "conditions générales"],
    termsPathSlugs: [
      "conditions-utilisation",
      "cgv",
      "cgu",
      "conditions-generales",
      "mentions-legales",
      "termes-conditions",
      "legal/conditions",
      "terms",
      "fr/conditions",
      "conditions-generales-utilisation",
    ],
    contextTerms: ["confidentialité", "cookies", "consentement", "données personnelles"],
    tldHints: [".fr"],
  }),
  locale("ru", {
    privacyPolicyPhrases: ["политика конфиденциальности", "уведомление о конфиденциальности"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "politika-konfidentsialnosti",
      "konfidentsialnost",
      "personalnye-dannye",
      "legal/privacy",
      "ru/privacy",
      "zayavlenie-o-konfidentsialnosti",
      "politika-konfidenczialnosti",
      "zashhita-personalnyh-dannyh",
    ],
    cookiePolicyPhrases: ["политика использования файлов cookie", "политика cookie"],
    cookiePolicyPathSlugs: [
      "politika-cookie",
      "cookies",
      "cookie-policy",
      "ru/cookies",
      "legal/cookies",
      "cookie",
      "nastrojki-cookie",
      "politika-ispolzovaniya-fajlov-cookie",
      "cookie-notice",
      "fajly-cookie",
    ],
    cookieSettingsPhrases: ["настройки cookie"],
    termsPhrases: ["условия использования"],
    termsPathSlugs: [
      "usloviya-ispolzovaniya",
      "polzovatelskoe-soglashenie",
      "terms",
      "terms-of-service",
      "usloviya",
      "legal/terms",
      "ru/terms",
      "licenzionnoe-soglashenie",
      "oferta",
      "soglashenie",
    ],
    contextTerms: ["конфиденциальности", "персональные данные", "cookie"],
    tldHints: [".ru"],
  }),
  locale("pt", {
    privacyPolicyPhrases: ["política de privacidade", "aviso de privacidade", "privacidade"],
    privacyPolicyPathSlugs: [
      "politica-de-privacidade",
      "privacidade",
      "politica-privacidade",
      "protecao-de-dados",
      "aviso-de-privacidade",
      "legal/privacidade",
      "politica-de-protecao-de-dados",
      "pt/privacidade",
      "declaracao-de-privacidade",
      "privacidade-e-cookies",
    ],
    cookiePolicyPhrases: ["política de cookies", "aviso de cookies"],
    cookiePolicyPathSlugs: [
      "politica-de-cookies",
      "cookies",
      "aviso-de-cookies",
      "politica-cookies",
      "gestao-de-cookies",
      "legal/cookies",
      "pt/cookies",
      "preferencias-de-cookies",
      "politica-de-privacidade-e-cookies",
      "cookies-policy",
    ],
    cookieSettingsPhrases: ["configurações de cookies", "preferências de cookies"],
    termsPhrases: ["termos de uso", "termos e condições"],
    termsPathSlugs: [
      "termos-de-servico",
      "termos-e-condicoes",
      "condicoes-de-uso",
      "termos-de-uso",
      "aviso-legal",
      "legal/termos",
      "termos",
      "condicoes-gerais",
      "pt/termos",
      "tos",
    ],
    contextTerms: ["privacidade", "cookies", "dados pessoais"],
    tldHints: [".pt", ".br"],
  }),
  locale("it", {
    privacyPolicyPhrases: ["informativa sulla privacy", "politica sulla privacy", "privacy"],
    privacyPolicyPathSlugs: [
      "informativa-privacy",
      "privacy",
      "politica-privacy",
      "privacy-policy",
      "informativa-sulla-privacy",
      "legal/privacy",
      "it/privacy",
      "trattamento-dati",
      "note-legali",
      "gdpr",
    ],
    cookiePolicyPhrases: ["informativa sui cookie", "cookie policy"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "informativa-sui-cookie",
      "politica-cookie",
      "gestione-cookie",
      "legal/cookies",
      "it/cookies",
      "cookie",
      "preferenze-cookie",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["impostazioni cookie", "preferenze cookie"],
    consentPreferencePhrases: ["preferenze di consenso"],
    termsPhrases: ["termini e condizioni", "condizioni d'uso"],
    termsPathSlugs: [
      "termini-di-servizio",
      "termini-e-condizioni",
      "condizioni-duso",
      "termini",
      "termini-di-utilizzo",
      "legal/termini",
      "it/termini",
      "condizioni-generali",
      "termini-di-uso",
      "tos",
    ],
    contextTerms: ["privacy", "cookie", "dati personali", "consenso"],
    tldHints: [".it"],
  }),
  locale("tr", {
    privacyPolicyPhrases: ["gizlilik politikası", "gizlilik bildirimi"],
    privacyPolicyPathSlugs: [
      "gizlilik-politikasi",
      "gizlilik",
      "kvkk",
      "kisisel-verilerin-korunmasi",
      "gizlilik-bildirimi",
      "privacy-policy",
      "legal/gizlilik",
      "tr/gizlilik",
      "gizlilik-sozlesmesi",
      "kisisel-veri-politikasi",
    ],
    cookiePolicyPhrases: ["çerez politikası", "cerez politikasi"],
    cookiePolicyPathSlugs: [
      "cerez-politikasi",
      "cerezler",
      "cerez-bildirimi",
      "cookie-policy",
      "cookies",
      "legal/cerez",
      "tr/cerez",
      "cerez",
      "cerez-yonetimi",
      "cerez-ayarlari",
    ],
    cookieSettingsPhrases: ["çerez ayarları", "cerez ayarlari"],
    termsPhrases: ["kullanım şartları", "kullanım koşulları"],
    termsPathSlugs: [
      "kullanim-kosullari",
      "hizmet-sartlari",
      "sartlar-ve-kosullar",
      "terms",
      "kullanim-sartlari",
      "legal/kosullar",
      "tr/kosullar",
      "sozlesme",
      "uyelik-sozlesmesi",
      "terms-of-service",
    ],
    contextTerms: ["gizlilik", "çerez", "cerez", "kişisel veri"],
    tldHints: [".tr"],
  }),
  locale("zh", {
    privacyPolicyPhrases: ["隐私政策", "隐私声明", "个人信息保护政策"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "legal/privacy",
      "zh/privacy",
      "policies/privacy",
      "privacy-statement",
      "privacy.html",
      "yinsizhengce",
      "geren-xinxi",
      "personal-information",
    ],
    cookiePolicyPhrases: ["cookie 政策", "Cookie 政策"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "zh/cookies",
      "cookie-notice",
      "cookie-statement",
      "policies/cookies",
      "about/cookies",
      "cookie-declaration",
    ],
    cookieSettingsPhrases: ["cookie 设置", "Cookie 设置"],
    termsPhrases: ["使用条款", "服务条款"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "zh/terms",
      "tos",
      "legal",
      "yonghu-xieyi",
      "fuwu-tiaokuan",
      "service-agreement",
    ],
    contextTerms: ["隐私", "个人信息", "cookie"],
    tldHints: [".cn", ".tw", ".hk"],
  }),
  locale("fa", {
    privacyPolicyPhrases: ["سیاست حفظ حریم خصوصی", "خط مشی حریم خصوصی", "خط‌مشی حریم خصوصی"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "privacy-notice",
      "legal/privacy",
      "fa/privacy",
      "policies/privacy",
      "siyasat-hefz-harimat",
      "hefz-harimat-shakhsi",
      "privacy.html",
      "personal-data",
    ],
    cookiePolicyPhrases: ["سیاست کوکی", "سیاست کوکی‌ها"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "fa/cookies",
      "cookie-notice",
      "cookie-statement",
      "cookies-policy",
      "siyasat-cookie",
      "cookies.html",
    ],
    cookieSettingsPhrases: ["تنظیمات کوکی"],
    termsPhrases: ["شرایط استفاده"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "fa/terms",
      "tos",
      "sharаyt-estefadeh",
      "qavanin-va-sharаyt",
      "sharаyt",
      "moqaveleh-karbar",
    ],
    contextTerms: ["حریم خصوصی", "کوکی", "داده شخصی"],
    tldHints: [".ir"],
  }),
  locale("nl", {
    privacyPolicyPhrases: ["privacybeleid", "privacyverklaring", "privacy reglement", "privacy"],
    privacyPolicyPathSlugs: [
      "privacyverklaring",
      "privacy",
      "privacybeleid",
      "privacy-beleid",
      "gegevensbescherming",
      "legal/privacy",
      "nl/privacy",
      "privacy-statement",
      "persoonsgegevens",
      "gdpr",
    ],
    cookiePolicyPhrases: ["cookiebeleid", "cookieverklaring", "cookies"],
    cookiePolicyPathSlugs: [
      "cookieverklaring",
      "cookies",
      "cookie-beleid",
      "cookiebeleid",
      "cookie-policy",
      "legal/cookies",
      "nl/cookies",
      "cookie",
      "cookieinstellingen",
      "cookie-statement",
    ],
    cookieSettingsPhrases: ["cookie-instellingen", "cookie instellingen", "cookievoorkeuren"],
    consentPreferencePhrases: ["toestemmingsvoorkeuren", "privacy-instellingen"],
    termsPhrases: ["algemene voorwaarden", "gebruiksvoorwaarden"],
    termsPathSlugs: [
      "gebruiksvoorwaarden",
      "algemene-voorwaarden",
      "av",
      "terms",
      "voorwaarden",
      "legal/voorwaarden",
      "nl/voorwaarden",
      "servicevoorwaarden",
      "dienstverleningsvoorwaarden",
      "terms-of-service",
    ],
    contextTerms: ["privacybeleid", "cookiebeleid", "persoonsgegevens", "toestemming"],
    tldHints: [".nl", ".be"],
  }),
  locale("pl", {
    privacyPolicyPhrases: ["polityka prywatności", "informacja o prywatności", "prywatność"],
    privacyPolicyPathSlugs: [
      "polityka-prywatnosci",
      "prywatnosc",
      "polityka-prywatnosci-rodo",
      "ochrona-danych",
      "rodo",
      "legal/prywatnosc",
      "pl/prywatnosc",
      "informacja-o-prywatnosci",
      "privacy-policy",
      "polityka-prywatnosci-i-cookie",
    ],
    cookiePolicyPhrases: ["polityka plików cookie", "polityka cookies", "informacja o plikach cookie", "cookies"],
    cookiePolicyPathSlugs: [
      "polityka-cookie",
      "cookies",
      "polityka-cookies",
      "plik-cookie",
      "legal/cookies",
      "pl/cookies",
      "cookie-policy",
      "pliki-cookies",
      "cookie",
      "informacja-o-plikach-cookie",
    ],
    cookieSettingsPhrases: ["ustawienia plików cookie", "preferencje plików cookie"],
    consentPreferencePhrases: ["preferencje zgody", "centrum preferencji"],
    termsPhrases: ["regulamin", "warunki korzystania"],
    termsPathSlugs: [
      "regulamin",
      "warunki-korzystania",
      "warunki-uslug",
      "zasady-korzystania",
      "terms",
      "legal/regulamin",
      "pl/regulamin",
      "terms-of-service",
      "zasady",
      "warunki",
    ],
    contextTerms: ["prywatność", "prywatnosci", "dane osobowe", "rodo", "zgoda"],
    tldHints: [".pl"],
  }),
  locale("vi", {
    privacyPolicyPhrases: ["chính sách bảo mật", "chính sách quyền riêng tư"],
    privacyPolicyPathSlugs: [
      "chinh-sach-bao-mat",
      "bao-mat",
      "chinh-sach-quyen-rieng-tu",
      "privacy-policy",
      "bao-ve-thong-tin-ca-nhan",
      "legal/bao-mat",
      "vi/privacy",
      "chinh-sach-bao-ve-thong-tin",
      "quyen-rieng-tu",
      "privacy",
    ],
    cookiePolicyPhrases: ["chính sách cookie"],
    cookiePolicyPathSlugs: [
      "chinh-sach-cookie",
      "cookies",
      "cookie-policy",
      "vi/cookies",
      "legal/cookies",
      "cookie",
      "chinh-sach-cookie-va-bao-mat",
      "thong-bao-cookie",
      "cookies-policy",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["cài đặt cookie"],
    termsPhrases: ["điều khoản sử dụng"],
    termsPathSlugs: [
      "dieu-khoan-dich-vu",
      "dieu-khoan-su-dung",
      "terms",
      "terms-of-service",
      "vi/terms",
      "legal/dieu-khoan",
      "dieu-kien-su-dung",
      "quy-dinh-su-dung",
      "thoa-thuan-nguoi-dung",
      "tos",
    ],
    contextTerms: ["bảo mật", "quyền riêng tư", "dữ liệu cá nhân", "cookie"],
    tldHints: [".vn"],
  }),
  locale("id", {
    privacyPolicyPhrases: ["kebijakan privasi", "pemberitahuan privasi"],
    privacyPolicyPathSlugs: [
      "kebijakan-privasi",
      "privasi",
      "privacy-policy",
      "perlindungan-data",
      "kebijakan-perlindungan-data",
      "legal/privasi",
      "id/privasi",
      "pernyataan-privasi",
      "kebijakan-kerahasiaan",
      "privacy",
    ],
    cookiePolicyPhrases: ["kebijakan cookie"],
    cookiePolicyPathSlugs: [
      "kebijakan-cookie",
      "cookies",
      "cookie-policy",
      "id/cookies",
      "legal/cookies",
      "kebijakan-cookies",
      "cookie",
      "cookies-policy",
      "pengaturan-cookie",
      "pemberitahuan-cookie",
    ],
    cookieSettingsPhrases: ["pengaturan cookie"],
    termsPhrases: ["syarat dan ketentuan", "ketentuan penggunaan"],
    termsPathSlugs: [
      "syarat-dan-ketentuan",
      "ketentuan-layanan",
      "ketentuan-penggunaan",
      "terms",
      "terms-of-service",
      "id/terms",
      "legal/ketentuan",
      "syarat-layanan",
      "perjanjian-pengguna",
      "tos",
    ],
    contextTerms: ["privasi", "data pribadi", "cookie"],
    tldHints: [".id"],
  }),
  locale("cs", {
    privacyPolicyPhrases: ["zásady ochrany osobních údajů", "ochrana osobních údajů"],
    privacyPolicyPathSlugs: [
      "ochrana-soukromi",
      "zasady-ochrany-osobnich-udaju",
      "gdpr",
      "privacy-policy",
      "ochrana-osobnich-udaju",
      "legal/privacy",
      "cs/privacy",
      "prohlaseni-o-ochrane-soukromi",
      "soukromi",
      "privacy",
    ],
    cookiePolicyPhrases: ["zásady používání cookies"],
    cookiePolicyPathSlugs: [
      "zasady-pouzivani-cookies",
      "cookies",
      "cookie-policy",
      "cs/cookies",
      "legal/cookies",
      "cookie",
      "zasady-cookies",
      "cookie-zasady",
      "soubory-cookie",
      "cookie-listan",
    ],
    cookieSettingsPhrases: ["nastavení cookies"],
    termsPhrases: ["obchodní podmínky", "podmínky používání"],
    termsPathSlugs: [
      "obchodni-podminky",
      "podminky-uzivani",
      "podminky",
      "terms",
      "terms-of-service",
      "vseobecne-obchodni-podminky",
      "legal/podminky",
      "cs/podminky",
      "uzivatelske-podminky",
      "podminky-sluzby",
    ],
    contextTerms: ["osobních údajů", "osobni udaje", "cookies"],
    tldHints: [".cz"],
  }),
  locale("ko", {
    privacyPolicyPhrases: ["개인정보처리방침", "개인정보 보호정책"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "privacy-notice",
      "legal/privacy",
      "ko/privacy",
      "policies/privacy",
      "privacy-statement",
      "personal-information-policy",
      "gaeinjeongbo",
      "privacy.html",
    ],
    cookiePolicyPhrases: ["쿠키 정책"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "ko/cookies",
      "cookie-notice",
      "cookie-statement",
      "cookies-policy",
      "policies/cookies",
      "cookie-declaration",
    ],
    cookieSettingsPhrases: ["쿠키 설정"],
    termsPhrases: ["이용약관"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "ko/terms",
      "tos",
      "terms-of-use",
      "ilyong-yakgwan",
      "service-terms",
      "policies/terms",
    ],
    contextTerms: ["개인정보", "쿠키"],
    tldHints: [".kr"],
  }),
  locale("sv", {
    privacyPolicyPhrases: ["integritetspolicy", "sekretesspolicy"],
    privacyPolicyPathSlugs: [
      "integritetspolicy",
      "privacy",
      "dataskyddspolicy",
      "integritetsskydd",
      "privacy-policy",
      "legal/privacy",
      "sv/privacy",
      "personuppgiftspolicy",
      "dataskydd",
      "gdpr",
    ],
    cookiePolicyPhrases: ["cookiepolicy", "policy för cookies"],
    cookiePolicyPathSlugs: [
      "cookiepolicy",
      "cookies",
      "cookie-policy",
      "legal/cookies",
      "sv/cookies",
      "cookie",
      "kakor",
      "cookieinstallningar",
      "cookie-notice",
      "hantering-av-kakor",
    ],
    cookieSettingsPhrases: ["cookieinställningar"],
    termsPhrases: ["användarvillkor"],
    termsPathSlugs: [
      "anvandarvillkor",
      "villkor",
      "terms",
      "terms-of-service",
      "legal/villkor",
      "sv/villkor",
      "tjanstevillkor",
      "allmanna-villkor",
      "terms-and-conditions",
      "tos",
    ],
    contextTerms: ["integritet", "personuppgifter", "cookies"],
    tldHints: [".se"],
  }),
  locale("uk", {
    privacyPolicyPhrases: ["політика конфіденційності", "повідомлення про конфіденційність"],
    privacyPolicyPathSlugs: [
      "polityka-konfidentsiynosti",
      "konfidentsiynist",
      "privacy-policy",
      "privacy",
      "zakhyst-personalnyh-danyh",
      "legal/privacy",
      "uk/privacy",
      "polozhennya-pro-konfidentsiynist",
      "personalni-dani",
      "privatnist",
    ],
    cookiePolicyPhrases: ["політика cookie"],
    cookiePolicyPathSlugs: [
      "polityka-cookie",
      "cookies",
      "cookie-policy",
      "uk/cookies",
      "legal/cookies",
      "cookie",
      "fayly-cookie",
      "nastrojky-cookie",
      "cookies-politika",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["налаштування cookie"],
    termsPhrases: ["умови використання"],
    termsPathSlugs: [
      "umovy-vykorystannya",
      "pravyla-vykorystannya",
      "terms",
      "terms-of-service",
      "uk/terms",
      "legal/umovy",
      "ugoda-korystuvacha",
      "umovy-nadannya-poslug",
      "pravyla",
      "polozhennya-ta-umovy",
    ],
    contextTerms: ["конфіденційності", "персональні дані", "cookie"],
    tldHints: [".ua"],
  }),
  locale("el", {
    privacyPolicyPhrases: ["πολιτική απορρήτου", "δήλωση απορρήτου"],
    privacyPolicyPathSlugs: [
      "politiki-aporitou",
      "privacy",
      "privacy-policy",
      "prostasia-prosopikon-dedomenwn",
      "gdpr",
      "legal/privacy",
      "el/privacy",
      "dedomenwn-prostasia",
      "aporrito",
      "prostasia-dedomenwn",
    ],
    cookiePolicyPhrases: ["πολιτική cookies"],
    cookiePolicyPathSlugs: [
      "politiki-cookie",
      "cookies",
      "cookie-policy",
      "el/cookies",
      "legal/cookies",
      "cookie",
      "cookie-notice",
      "cookies-politiki",
      "diaxeirisi-cookies",
      "cookie-astynomia",
    ],
    cookieSettingsPhrases: ["ρυθμίσεις cookies"],
    termsPhrases: ["όροι χρήσης"],
    termsPathSlugs: [
      "oroi-xrisis",
      "oroi-kai-proipotheseis",
      "terms",
      "terms-of-service",
      "el/terms",
      "legal/oroi",
      "oroi-paroхis-ipiresion",
      "oroi-ipiresion",
      "oroi",
      "tos",
    ],
    contextTerms: ["απορρήτου", "προσωπικά δεδομένα", "cookies"],
    tldHints: [".gr"],
  }),
  locale("ar", {
    privacyPolicyPhrases: ["سياسة الخصوصية", "إشعار الخصوصية"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "privacy-notice",
      "legal/privacy",
      "ar/privacy",
      "privacy-statement",
      "siyasat-khususiyya",
      "khususiyya",
      "siyasat-alkhususia",
      "himayat-albianat",
    ],
    cookiePolicyPhrases: ["سياسة ملفات تعريف الارتباط", "سياسة الكوكيز"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "ar/cookies",
      "cookie-notice",
      "cookies-policy",
      "siyasat-cookie",
      "siyasat-alcookies",
      "idarat-cookies",
    ],
    cookieSettingsPhrases: ["إعدادات ملفات تعريف الارتباط", "إعدادات الكوكيز"],
    termsPhrases: ["شروط الاستخدام"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "ar/terms",
      "tos",
      "shurut-alkhidma",
      "shurut-alastikhdam",
      "alshurut-waalachkam",
      "ittifaqiyat-almustakhdam",
    ],
    contextTerms: ["الخصوصية", "بيانات شخصية", "كوكيز"],
    tldHints: [".sa", ".ae", ".eg"],
  }),
  locale("hu", {
    privacyPolicyPhrases: ["adatvédelmi irányelvek", "adatvédelmi tájékoztató"],
    privacyPolicyPathSlugs: [
      "adatvedelmi-iranyelvek",
      "adatvedelem",
      "privacy-policy",
      "adatvedelmi-tajekoztato",
      "adatkezeles",
      "legal/privacy",
      "hu/privacy",
      "adatvedelmi-nyilatkozat",
      "gdpr",
      "privacy",
    ],
    cookiePolicyPhrases: ["cookie szabályzat", "süti szabályzat"],
    cookiePolicyPathSlugs: [
      "cookie-szabalyzat",
      "cookies",
      "cookie-policy",
      "hu/cookies",
      "legal/cookies",
      "cookie",
      "suti-szabalyzat",
      "sutik",
      "cookie-kezeles",
      "suti-tajekoztato",
    ],
    cookieSettingsPhrases: ["cookie beállítások", "süti beállítások"],
    termsPhrases: ["felhasználási feltételek"],
    termsPathSlugs: [
      "felhasznalasi-feltetelek",
      "aszf",
      "altalanos-szerzodesi-feltetelek",
      "terms",
      "terms-of-service",
      "hu/terms",
      "legal/feltetelek",
      "felhasznalasi-szabalyzat",
      "szolgaltatasi-feltetelek",
      "altalanos-feltetelek",
    ],
    contextTerms: ["adatvédelem", "személyes adatok", "cookie", "süti"],
    tldHints: [".hu"],
  }),
  locale("ro", {
    privacyPolicyPhrases: ["politica de confidențialitate", "politica de confidentialitate"],
    privacyPolicyPathSlugs: [
      "politica-de-confidentialitate",
      "confidentialitate",
      "privacy-policy",
      "politica-confidentialitate",
      "protectia-datelor",
      "legal/confidentialitate",
      "ro/privacy",
      "declaratie-de-confidentialitate",
      "gdpr",
      "privacy",
    ],
    cookiePolicyPhrases: ["politica cookie", "politica de cookie-uri"],
    cookiePolicyPathSlugs: [
      "politica-cookie",
      "cookies",
      "cookie-policy",
      "ro/cookies",
      "legal/cookies",
      "politica-cookies",
      "cookie",
      "politica-de-cookie-uri",
      "gestionare-cookie",
      "cookie-uri",
    ],
    cookieSettingsPhrases: ["setări cookie", "setari cookie"],
    termsPhrases: ["termeni și condiții", "termeni si conditii"],
    termsPathSlugs: [
      "termeni-si-conditii",
      "termeni-de-utilizare",
      "termeni",
      "terms",
      "terms-of-service",
      "ro/terms",
      "legal/termeni",
      "conditii-de-utilizare",
      "termeni-si-conditii-de-utilizare",
      "tos",
    ],
    contextTerms: ["confidențialitate", "confidentialitate", "date personale", "cookie"],
    tldHints: [".ro"],
  }),
  locale("th", {
    privacyPolicyPhrases: ["นโยบายความเป็นส่วนตัว"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "legal/privacy",
      "th/privacy",
      "policies/privacy",
      "nayobai-khwam-luap",
      "nayobai-privacy",
      "khumkhrong-khomun",
      "privacy.html",
      "naiyobai-khwam-luap",
    ],
    cookiePolicyPhrases: ["นโยบายคุกกี้"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "th/cookies",
      "cookie-notice",
      "cookies-policy",
      "nayobai-cookie",
      "jat-kan-cookie",
      "nayobai-cookies",
    ],
    cookieSettingsPhrases: ["การตั้งค่าคุกกี้"],
    termsPhrases: ["ข้อกำหนดการใช้งาน"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "th/terms",
      "tos",
      "kho-tong-rong",
      "khot-khwam-botbat",
      "kho-tok-long",
      "thaleang-kho-tok-long",
    ],
    contextTerms: ["ความเป็นส่วนตัว", "ข้อมูลส่วนบุคคล", "คุกกี้"],
    tldHints: [".th"],
  }),
  locale("da", {
    privacyPolicyPhrases: ["privatlivspolitik", "databeskyttelsespolitik"],
    privacyPolicyPathSlugs: [
      "privatlivspolitik",
      "privacy",
      "databeskyttelse",
      "privacy-policy",
      "persondatapolitik",
      "legal/privacy",
      "da/privacy",
      "privatlivserklaring",
      "cookie-og-privatlivspolitik",
      "gdpr",
    ],
    cookiePolicyPhrases: ["cookiepolitik"],
    cookiePolicyPathSlugs: [
      "cookiepolitik",
      "cookies",
      "cookie-policy",
      "da/cookies",
      "legal/cookies",
      "cookie",
      "cookie-erklaering",
      "cookieindstillinger",
      "cookie-notice",
      "retningslinjer-for-cookies",
    ],
    cookieSettingsPhrases: ["cookieindstillinger"],
    termsPhrases: ["vilkår", "brugsvilkår"],
    termsPathSlugs: [
      "handelsbetingelser",
      "brugsvilkar",
      "vilkar",
      "terms",
      "terms-of-service",
      "legal/betingelser",
      "da/betingelser",
      "servicevilkar",
      "almene-betingelser",
      "terms-and-conditions",
    ],
    contextTerms: ["privatliv", "personoplysninger", "cookies"],
    tldHints: [".dk"],
  }),
  locale("sk", {
    privacyPolicyPhrases: ["zásady ochrany osobných údajov", "ochrana osobných údajov"],
    privacyPolicyPathSlugs: [
      "zasady-ochrany-sukromia",
      "sukromie",
      "privacy-policy",
      "ochrana-osobnych-udajov",
      "gdpr",
      "legal/privacy",
      "sk/privacy",
      "vyhlasenie-o-ochrane-sukromia",
      "ochrana-udajov",
      "privacy",
    ],
    cookiePolicyPhrases: ["pravidlá používania cookies"],
    cookiePolicyPathSlugs: [
      "zasady-cookie",
      "cookies",
      "cookie-policy",
      "sk/cookies",
      "legal/cookies",
      "cookie",
      "cookie-zasady",
      "subory-cookie",
      "sprava-cookies",
      "cookie-listan",
    ],
    cookieSettingsPhrases: ["nastavenia cookies"],
    termsPhrases: ["podmienky používania"],
    termsPathSlugs: [
      "obchodne-podmienky",
      "podmienky-pouzitia",
      "podmienky",
      "terms",
      "terms-of-service",
      "vseobecne-obchodne-podmienky",
      "legal/podmienky",
      "sk/podmienky",
      "pouzivatelske-podmienky",
      "podmienky-sluzby",
    ],
    contextTerms: ["osobných údajov", "osobne udaje", "cookies"],
    tldHints: [".sk"],
  }),
  locale("fi", {
    privacyPolicyPhrases: ["tietosuojakäytäntö", "tietosuojaseloste"],
    privacyPolicyPathSlugs: [
      "tietosuojakaytanto",
      "tietosuoja",
      "privacy-policy",
      "tietosuojaseloste",
      "henkilotietojen-kasittely",
      "legal/privacy",
      "fi/privacy",
      "yksityisyyskaytanto",
      "gdpr",
      "privacy",
    ],
    cookiePolicyPhrases: ["evästekäytäntö", "evästeiden käyttö"],
    cookiePolicyPathSlugs: [
      "evasteet",
      "evastekaytanto",
      "cookie-policy",
      "fi/cookies",
      "legal/cookies",
      "cookies",
      "cookie",
      "evasteasetukset",
      "evasteseloste",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["evästeasetukset"],
    termsPhrases: ["käyttöehdot"],
    termsPathSlugs: [
      "kayttoehdot",
      "palveluehdot",
      "terms",
      "terms-of-service",
      "fi/terms",
      "legal/ehdot",
      "kayttosopimus",
      "ehdot",
      "terms-and-conditions",
      "yleiset-ehdot",
    ],
    contextTerms: ["tietosuoja", "henkilötiedot", "eväste"],
    tldHints: [".fi"],
  }),
  locale("bg", {
    privacyPolicyPhrases: ["политика за поверителност", "декларация за поверителност"],
    privacyPolicyPathSlugs: [
      "politika-za-poveritelnost",
      "poveritelnost",
      "privacy-policy",
      "zashtita-na-lichnite-danni",
      "gdpr",
      "legal/privacy",
      "bg/privacy",
      "deklaratsiya-za-poveritelnost",
      "lichni-danni",
      "privacy",
    ],
    cookiePolicyPhrases: ["политика за бисквитки"],
    cookiePolicyPathSlugs: [
      "politika-za-biskvitki",
      "cookies",
      "cookie-policy",
      "bg/cookies",
      "legal/cookies",
      "biskvitki",
      "cookie",
      "politika-cookies",
      "upravlenie-na-biskvitki",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["настройки за бисквитки"],
    termsPhrases: ["условия за ползване"],
    termsPathSlugs: [
      "usloviya-za-polzvane",
      "obshti-usloviya",
      "terms",
      "terms-of-service",
      "bg/terms",
      "legal/usloviya",
      "pravila-za-polzvane",
      "usloviya",
      "polzovatelsko-soglashenie",
      "tos",
    ],
    contextTerms: ["поверителност", "лични данни", "бисквитки"],
    tldHints: [".bg"],
  }),
  locale("he", {
    privacyPolicyPhrases: ["מדיניות פרטיות", "הצהרת פרטיות"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "privacy-notice",
      "legal/privacy",
      "he/privacy",
      "privacy-statement",
      "mediniyut-pirtiyut",
      "mediniyut-hapratiyut",
      "hagant-prtiyut",
      "hafashat-prtiyut",
    ],
    cookiePolicyPhrases: ["מדיניות עוגיות"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "he/cookies",
      "cookie-notice",
      "cookies-policy",
      "mediniyut-cookies",
      "idul-cookies",
      "alones-cookie",
    ],
    cookieSettingsPhrases: ["הגדרות עוגיות"],
    termsPhrases: ["תנאי שימוש"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "he/terms",
      "tos",
      "takhnon-hashimush",
      "tnaei-hashimush",
      "tnaim",
      "hoze-mishtatef",
    ],
    contextTerms: ["פרטיות", "מידע אישי", "עוגיות"],
    tldHints: [".il"],
  }),
  locale("sr", {
    privacyPolicyPhrases: ["политика приватности", "politika privatnosti"],
    privacyPolicyPathSlugs: [
      "politika-privatnosti",
      "privatnost",
      "privacy-policy",
      "zastita-podataka",
      "gdpr",
      "legal/privacy",
      "sr/privacy",
      "izjava-o-privatnosti",
      "licni-podaci",
      "privacy",
    ],
    cookiePolicyPhrases: ["политика колачића", "politika kolačića"],
    cookiePolicyPathSlugs: [
      "politika-kolacica",
      "cookies",
      "cookie-policy",
      "sr/cookies",
      "legal/cookies",
      "kolacici",
      "cookie",
      "cookie-politika",
      "upravljanje-kolacicima",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["podešavanja kolačića", "podesavanja kolacica"],
    termsPhrases: ["uslovi korišćenja", "услови коришћења"],
    termsPathSlugs: [
      "uslovi-koriscenja",
      "opsti-uslovi",
      "terms",
      "terms-of-service",
      "sr/terms",
      "legal/uslovi",
      "uslovi-upotrebe",
      "uslovi",
      "korisnicki-ugovor",
      "tos",
    ],
    contextTerms: ["privatnost", "приватности", "lični podaci", "колачићи"],
    tldHints: [".rs"],
  }),
  locale("hr", {
    privacyPolicyPhrases: ["politika privatnosti", "pravila privatnosti"],
    privacyPolicyPathSlugs: [
      "politika-privatnosti",
      "privatnost",
      "privacy-policy",
      "zastita-osobnih-podataka",
      "gdpr",
      "legal/privacy",
      "hr/privacy",
      "izjava-o-privatnosti",
      "privatnost-podataka",
      "privacy",
    ],
    cookiePolicyPhrases: ["politika kolačića", "pravila o kolačićima"],
    cookiePolicyPathSlugs: [
      "politika-kolacica",
      "cookies",
      "cookie-policy",
      "hr/cookies",
      "legal/cookies",
      "kolacici",
      "cookie",
      "cookie-politika",
      "upravljanje-kolacicima",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["postavke kolačića"],
    termsPhrases: ["uvjeti korištenja", "uvjeti uporabe"],
    termsPathSlugs: [
      "uvjeti-koristenja",
      "opci-uvjeti",
      "terms",
      "terms-of-service",
      "hr/terms",
      "legal/uvjeti",
      "uvjeti-upotrebe",
      "uvjeti",
      "korisnicki-ugovor",
      "tos",
    ],
    contextTerms: ["privatnosti", "osobni podaci", "kolačići"],
    tldHints: [".hr"],
  }),
  locale("lt", {
    privacyPolicyPhrases: ["privatumo politika"],
    privacyPolicyPathSlugs: [
      "privatumo-politika",
      "privatumas",
      "privacy-policy",
      "asmens-duomenu-apsauga",
      "gdpr",
      "legal/privacy",
      "lt/privacy",
      "privatumo-pranesimas",
      "duomenu-apsauga",
      "privacy",
    ],
    cookiePolicyPhrases: ["slapukų politika"],
    cookiePolicyPathSlugs: [
      "slapuku-politika",
      "cookies",
      "cookie-policy",
      "lt/cookies",
      "legal/cookies",
      "slapukai",
      "cookie",
      "slapuku-tvarkymas",
      "cookie-pranesimas",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["slapukų nustatymai"],
    termsPhrases: ["naudojimo sąlygos"],
    termsPathSlugs: [
      "naudojimo-salygos",
      "paslaugos-teikimo-salygos",
      "terms",
      "terms-of-service",
      "lt/terms",
      "legal/salygos",
      "naudojimosi-salygos",
      "salygos",
      "vartotojo-sutartis",
      "tos",
    ],
    contextTerms: ["privatumo", "asmens duomenys", "slapukai"],
    tldHints: [".lt"],
  }),
  locale("sl", {
    privacyPolicyPhrases: ["politika zasebnosti", "pravilnik o zasebnosti"],
    privacyPolicyPathSlugs: [
      "politika-zasebnosti",
      "zasebnost",
      "privacy-policy",
      "varstvo-osebnih-podatkov",
      "gdpr",
      "legal/privacy",
      "sl/privacy",
      "izjava-o-zasebnosti",
      "obvestilo-o-zasebnosti",
      "privacy",
    ],
    cookiePolicyPhrases: ["politika piškotkov"],
    cookiePolicyPathSlugs: [
      "politika-piskotkov",
      "cookies",
      "cookie-policy",
      "sl/cookies",
      "legal/cookies",
      "piskotki",
      "cookie",
      "upravljanje-piskotkov",
      "cookie-obvestilo",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["nastavitve piškotkov"],
    termsPhrases: ["pogoji uporabe"],
    termsPathSlugs: [
      "pogoji-uporabe",
      "splosni-pogoji",
      "terms",
      "terms-of-service",
      "sl/terms",
      "legal/pogoji",
      "pogoji-storitev",
      "pogoji",
      "uporabniska-pogodba",
      "tos",
    ],
    contextTerms: ["zasebnosti", "osebni podatki", "piškotki"],
    tldHints: [".si"],
  }),
  locale("ca", {
    privacyPolicyPhrases: ["política de privacitat", "avís de privacitat"],
    privacyPolicyPathSlugs: [
      "politica-de-privacitat",
      "privacitat",
      "privacy-policy",
      "proteccio-de-dades",
      "avis-legal",
      "legal/privacitat",
      "ca/privacitat",
      "declaracio-de-privacitat",
      "politica-privacitat",
      "privacy",
    ],
    cookiePolicyPhrases: ["política de cookies"],
    cookiePolicyPathSlugs: [
      "politica-de-cookies",
      "cookies",
      "avis-de-cookies",
      "ca/cookies",
      "legal/cookies",
      "cookie-policy",
      "galetes",
      "politica-galetes",
      "gestio-cookies",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["configuració de cookies"],
    termsPhrases: ["termes i condicions", "condicions d'ús"],
    termsPathSlugs: [
      "condicions-us",
      "termes-i-condicions",
      "condicions-servei",
      "terms",
      "terms-of-service",
      "ca/terms",
      "legal/condicions",
      "avis-legal",
      "condicions",
      "tos",
    ],
    contextTerms: ["privacitat", "dades personals", "cookies"],
    tldHints: [".cat", ".ad"],
  }),
  locale("hi", {
    privacyPolicyPhrases: ["गोपनीयता नीति", "निजता नीति"],
    privacyPolicyPathSlugs: [
      "privacy-policy",
      "privacy",
      "legal/privacy",
      "hi/privacy",
      "policies/privacy",
      "niji-niti",
      "gopaniyata-niti",
      "privacy.html",
      "vyaktigat-jankari-niti",
      "gopaniyata",
    ],
    cookiePolicyPhrases: ["कुकी नीति"],
    cookiePolicyPathSlugs: [
      "cookie-policy",
      "cookies",
      "cookie",
      "legal/cookies",
      "hi/cookies",
      "cookie-notice",
      "cookie-statement",
      "cookies-policy",
      "niti-cookie",
      "policies/cookies",
    ],
    cookieSettingsPhrases: ["कुकी सेटिंग्स"],
    termsPhrases: ["उपयोग की शर्तें"],
    termsPathSlugs: [
      "terms",
      "terms-of-service",
      "terms-and-conditions",
      "legal/terms",
      "hi/terms",
      "tos",
      "upyog-niyam",
      "sevaon-ke-niyam",
      "niyam-aur-sharten",
      "upyog-ke-niyam",
    ],
    contextTerms: ["गोपनीयता", "व्यक्तिगत डेटा", "कुकी"],
    tldHints: [".in"],
  }),
  locale("nb", {
    privacyPolicyPhrases: ["personvernerklæring", "personvern"],
    privacyPolicyPathSlugs: [
      "personvernerklaering",
      "personvern",
      "privacy-policy",
      "databeskyttelse",
      "persondatapolitik",
      "legal/privacy",
      "no/privacy",
      "personvernpolicy",
      "gdpr",
      "privacy",
    ],
    cookiePolicyPhrases: ["retningslinjer for informasjonskapsler", "cookiepolicy"],
    cookiePolicyPathSlugs: [
      "informasjonskapsler",
      "cookies",
      "cookie-policy",
      "no/cookies",
      "legal/cookies",
      "cookie",
      "cookie-erklaering",
      "cookie-innstillinger",
      "retningslinjer-for-cookies",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["innstillinger for informasjonskapsler"],
    termsPhrases: ["vilkår", "bruksvilkår"],
    termsPathSlugs: [
      "vilkar",
      "bruksvilkar",
      "terms",
      "terms-of-service",
      "no/terms",
      "legal/vilkar",
      "tjenestevilkar",
      "betingelser",
      "allmenne-betingelser",
      "terms-and-conditions",
    ],
    contextTerms: ["personvern", "personopplysninger", "informasjonskapsler"],
    tldHints: [".no"],
  }),
  locale("et", {
    privacyPolicyPhrases: ["privaatsuspoliitika", "andmekaitsetingimused"],
    privacyPolicyPathSlugs: [
      "privaatsuspoliitika",
      "privaatsus",
      "privacy-policy",
      "isikuandmete-kaitse",
      "gdpr",
      "legal/privacy",
      "et/privacy",
      "privaatsustingimused",
      "andmekaitse",
      "privacy",
    ],
    cookiePolicyPhrases: ["küpsiste poliitika"],
    cookiePolicyPathSlugs: [
      "kupsiste-poliitika",
      "cookies",
      "cookie-policy",
      "et/cookies",
      "legal/cookies",
      "kupsised",
      "cookie",
      "kupsiste-seaded",
      "kupsiste-teade",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["küpsiste seaded"],
    termsPhrases: ["kasutustingimused"],
    termsPathSlugs: [
      "kasutustingimused",
      "teenusetingimused",
      "terms",
      "terms-of-service",
      "et/terms",
      "legal/tingimused",
      "kasutuslepe",
      "tingimused",
      "uldtingimused",
      "tos",
    ],
    contextTerms: ["privaatsus", "isikuandmed", "küpsised"],
    tldHints: [".ee"],
  }),
  locale("lv", {
    privacyPolicyPhrases: ["privātuma politika", "konfidencialitātes politika"],
    privacyPolicyPathSlugs: [
      "privatuma-politika",
      "privatums",
      "privacy-policy",
      "personas-datu-aizsardziba",
      "gdpr",
      "legal/privacy",
      "lv/privacy",
      "privatuma-pazinojums",
      "datu-aizsardziba",
      "privacy",
    ],
    cookiePolicyPhrases: ["sīkdatņu politika"],
    cookiePolicyPathSlugs: [
      "sikdatnu-politika",
      "cookies",
      "cookie-policy",
      "lv/cookies",
      "legal/cookies",
      "sikdatnes",
      "cookie",
      "sikdatnu-parvaldiba",
      "cookie-pazinojums",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["sīkdatņu iestatījumi"],
    termsPhrases: ["lietošanas noteikumi"],
    termsPathSlugs: [
      "lietosanas-noteikumi",
      "pakalpojumu-noteikumi",
      "terms",
      "terms-of-service",
      "lv/terms",
      "legal/noteikumi",
      "lietosanas-ligums",
      "noteikumi",
      "vispareji-noteikumi",
      "tos",
    ],
    contextTerms: ["privātums", "personas dati", "sīkdatnes"],
    tldHints: [".lv"],
  }),
  locale("az", {
    privacyPolicyPhrases: ["məxfilik siyasəti", "gizlilik siyasəti"],
    privacyPolicyPathSlugs: [
      "gizlilik-siyaseti",
      "gizlilik",
      "privacy-policy",
      "melumat-muhafizesi",
      "konfidensiallik-siyaseti",
      "legal/privacy",
      "az/privacy",
      "sahsi-melumat-siyaseti",
      "gdpr",
      "privacy",
    ],
    cookiePolicyPhrases: ["kuki siyasəti"],
    cookiePolicyPathSlugs: [
      "cookie-siyaseti",
      "cookies",
      "cookie-policy",
      "az/cookies",
      "legal/cookies",
      "cookie",
      "kukilerin-siyaseti",
      "kuki-parametrleri",
      "cookies-policy",
      "cookie-notice",
    ],
    cookieSettingsPhrases: ["kuki ayarları"],
    termsPhrases: ["istifadə şərtləri"],
    termsPathSlugs: [
      "istifade-sertleri",
      "xidmet-sertleri",
      "terms",
      "terms-of-service",
      "az/terms",
      "legal/sertler",
      "istifade-qaydalari",
      "sertler",
      "istifadeci-raziligi",
      "tos",
    ],
    contextTerms: ["məxfilik", "şəxsi məlumat", "kuki"],
    tldHints: [".az"],
  }),
  locale("gl", {
    privacyPolicyPhrases: ["política de privacidade", "aviso de privacidade"],
    privacyPolicyPathSlugs: [
      "politica-de-privacidade",
      "privacidade",
      "privacy-policy",
      "proteccion-de-datos",
      "aviso-legal",
      "legal/privacidade",
      "gl/privacidade",
      "declaracion-de-privacidade",
      "politica-privacidade",
      "privacy",
    ],
    cookiePolicyPhrases: ["política de cookies"],
    cookiePolicyPathSlugs: [
      "politica-de-cookies",
      "cookies",
      "aviso-de-cookies",
      "gl/cookies",
      "legal/cookies",
      "cookie-policy",
      "xestion-cookies",
      "cookie-notice",
      "politica-cookies",
      "galetas",
    ],
    cookieSettingsPhrases: ["configuración de cookies"],
    termsPhrases: ["termos e condicións", "condicións de uso"],
    termsPathSlugs: [
      "condicions-de-uso",
      "termos-e-condicions",
      "termos",
      "terms",
      "terms-of-service",
      "gl/terms",
      "legal/condicions",
      "aviso-legal",
      "condicions",
      "tos",
    ],
    contextTerms: ["privacidade", "datos persoais", "cookies"],
    tldHints: [".gal"],
  }),
];

export const PRIVACY_SURFACE_PHRASE_REGISTRY: PrivacySurfacePhrase[] =
  PRIVACY_SURFACE_LOCALE_REGISTRY.flatMap((entry) => [
    ...phraseEntries(entry.locale, "privacy_policy", entry.privacyPolicyPhrases),
    ...phraseEntries(entry.locale, "cookie_policy", entry.cookiePolicyPhrases),
    ...phraseEntries(entry.locale, "cookie_settings", entry.cookieSettingsPhrases ?? []),
    ...phraseEntries(entry.locale, "consent_preferences", entry.consentPreferencePhrases ?? []),
    ...phraseEntries(entry.locale, "terms", entry.termsPhrases ?? []),
    ...(entry.locale === "en"
      ? [
        direct("your_privacy_choices", "your privacy choices"),
        direct("your_privacy_choices", "privacy choices"),
        direct("your_privacy_choices", "ad choices"),
        equivalent("your_privacy_choices", "your choices"),
        direct("do_not_sell_or_share", "do not sell or share"),
        direct("do_not_sell_or_share", "do not sell"),
        direct("do_not_sell_or_share", "do not share"),
        direct("notice_at_collection", "notice at collection"),
        direct("california_notice", "california privacy notice"),
        direct("california_notice", "state privacy rights"),
        direct("california_notice", "state privacy policy"),
        direct("accessibility_statement", "accessibility statement"),
        direct("ai_disclosure", "ai disclosure"),
        direct("ai_disclosure", "ai disclosures"),
        equivalent("ai_disclosure", "artificial intelligence"),
      ].map((term): PrivacySurfacePhrase => ({ locale: "en", ...term }))
      : []),
  ]);

const URL_SURFACE_PATTERNS: Array<{
  locale?: SupportedPrivacyEvidenceLocale;
  surfaceType: Exclude<PrivacySurfaceType, "unknown">;
  pattern: RegExp;
  variant?: string;
}> = [
  { surfaceType: "cookie_policy", pattern: /privacy[-_/]cookie[-_/]statement|privacy[-_/]and[-_/]cookies?|privacy[-_/]cookies?/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_-])privacy(?:[-_/]policy|[-_/]notice|[-_/]statement)?(?:$|[/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])datenschutz(?:erkl[aä]rung|information)?(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:politique[-_\s/](?:de[-_\s/])?confidentialit[eé]|confidentialit[eé])(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:pol[ií]tica[-_\s/](?:de[-_\s/])?privacidad|privacidad)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:informativa[-_\s/](?:sulla[-_\s/])?privacy|privacy)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:privacybeleid|privacyverklaring|privacy[-_\s/]reglement)(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])(?:polityka[-_\s/]prywatno(?:sci|ści)|prywatno(?:sc|ść))(?:$|[\s/?#._-])/i },
  { surfaceType: "privacy_policy", pattern: /(?:^|[/_\s-])politika[-_\s/]privatnosti(?:$|[\s/?#._-])/i, variant: "regional_privacy_policy" },
  { surfaceType: "cookie_policy", pattern: /(?:^|[/_-])cookies?(?:[-_/]policy|[-_/]notice|[-_/]statement)?(?:$|[/?#._-])/i },
  { surfaceType: "cookie_policy", pattern: /(?:^|[/_\s-])(?:cookie[-_\s/]richtlinie|politique[-_\s/](?:relative[-_\s/]aux[-_\s/])?cookies|pol[ií]tica[-_\s/](?:de[-_\s/])?cookies|informativa[-_\s/](?:sui[-_\s/])?cookie|cookiebeleid|polityka[-_\s/]plik[oó]w[-_\s/]cookie)(?:$|[\s/?#._-])/i },
  { surfaceType: "cookie_settings", pattern: /(?:^|[/_-])cookie[-_/](?:settings|preferences)(?:$|[/?#._-])/i },
  { surfaceType: "your_privacy_choices", pattern: /(?:your[-_/])?privacy[-_/]choices|yourprivacychoices|adchoices/i },
  { surfaceType: "do_not_sell_or_share", pattern: /do[-_/]not[-_/](?:sell|share)/i },
  { surfaceType: "notice_at_collection", pattern: /notice[-_/]at[-_/]collection/i },
  { surfaceType: "california_notice", pattern: /california[-_/]privacy|state[-_/]privacy/i },
  { surfaceType: "terms", pattern: /(?:^|[/_-])terms(?:[-_/](?:of[-_/]service|and[-_/]conditions|conditions|use))?(?:$|[/?#._-])/i },
  { surfaceType: "accessibility_statement", pattern: /accessibility(?:[-_/]statement)?|accesibilidad/i },
  { surfaceType: "ai_disclosure", pattern: /(?:^|[/_-])ai[-_/](?:disclosure|notice|policy)(?:$|[/?#._-])/i },
  ...PRIVACY_SURFACE_LOCALE_REGISTRY.flatMap((entry) => [
    ...urlPatternEntries(entry.locale, "privacy_policy", entry.privacyPolicyPathSlugs),
    ...urlPatternEntries(entry.locale, "cookie_policy", entry.cookiePolicyPathSlugs),
    ...urlPatternEntries(entry.locale, "terms", entry.termsPathSlugs ?? []),
  ]),
];

const PRIVACY_CONTEXT_PATTERN = new RegExp(
  `(?:^|\\s)(${PRIVACY_SURFACE_LOCALE_REGISTRY
    .flatMap((entry) => entry.contextTerms)
    .concat(["privacy", "cookie", "cookies", "consent", "preferences", "settings", "choices"])
    .map((term) => escapeRegExp(normalizePrivacySurfaceText(term)))
    .filter(Boolean)
    .join("|")})(?:\\s|$)`,
  "i",
);

export function classifyPrivacySurface(
  input: PrivacySurfaceClassifierInput,
): PrivacySurfaceClassification {
  const normalizedLinkText = normalizePrivacySurfaceText(input.linkText);
  const normalizedTitle = normalizePrivacySurfaceText(input.title);
  const normalizedSurrounding = normalizePrivacySurfaceText(input.surroundingText);
  const normalizedUrl = normalizePrivacySurfaceUrl(input.url);
  const labelText = uniqueStrings([normalizedLinkText, normalizedTitle].filter(Boolean)).join(" ");
  const haystack = uniqueStrings([labelText, normalizedSurrounding, normalizedUrl].filter(Boolean)).join(" ");
  const contextSatisfied = PRIVACY_CONTEXT_PATTERN.test(haystack);

  if (!haystack) {
    return unknown(["empty_surface_evidence"]);
  }

  const localeHints = new Set(input.localeHints ?? []);
  const phrases = localeHints.size > 0
    ? PRIVACY_SURFACE_PHRASE_REGISTRY.filter((term) => localeHints.has(term.locale))
    : PRIVACY_SURFACE_PHRASE_REGISTRY;
  const phraseMatch = phrases
    .map((term) => ({
      term,
      score: phraseScore(term, labelText, contextSatisfied),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score ||
      strengthRank(right.term.strength) - strengthRank(left.term.strength) ||
      right.term.phrase.length - left.term.phrase.length
    )[0];

  const urlMatch = URL_SURFACE_PATTERNS
    .map((entry) => ({
      ...entry,
      score: entry.pattern.test(normalizedUrl)
        ? 540 +
          entry.pattern.source.length +
          (entry.surfaceType === "cookie_policy" && /cookies?/.test(normalizedUrl) ? 1_000 : 0)
        : 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0];

  if (!phraseMatch && !urlMatch) {
    return unknown(["no_surface_match"]);
  }

  if (phraseMatch && (!urlMatch || phraseMatch.score >= urlMatch.score)) {
    return {
      confidence: confidenceFor(phraseMatch.term, contextSatisfied),
      contextSatisfied,
      matchedLocale: phraseMatch.term.locale,
      matchedTerm: phraseMatch.term.phrase,
      matchStrength: phraseMatch.term.strength,
      reasonCodes: uniqueStrings([
        `matched_${phraseMatch.term.surfaceType}`,
        `match_strength_${phraseMatch.term.strength}`,
        phraseMatch.term.variant ? `variant_${phraseMatch.term.variant}` : null,
        contextSatisfied ? "context_satisfied" : "context_not_satisfied",
      ]),
      surfaceType: phraseMatch.term.surfaceType,
      variant: phraseMatch.term.variant,
    };
  }

  if (!urlMatch) {
    return unknown(["no_surface_match"]);
  }

  return {
    confidence: 0.74,
    contextSatisfied,
    matchedLocale: urlMatch.locale,
    matchStrength: "contextual",
    reasonCodes: uniqueStrings([
      `matched_${urlMatch.surfaceType}`,
      "matched_url_pattern",
      urlMatch.variant ? `variant_${urlMatch.variant}` : null,
      contextSatisfied ? "context_satisfied" : "context_not_satisfied",
    ]),
    surfaceType: urlMatch.surfaceType,
    variant: urlMatch.variant,
  };
}

export function normalizePrivacySurfaceText(value: string | null | undefined): string {
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

function normalizePrivacySurfaceUrl(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const decoded = decodeURIComponent(`${parsed.pathname} ${parsed.hash}`).toLowerCase();
    return `${decoded} ${decoded.replace(/[-_/]+/g, " ")}`;
  } catch {
    return `${value.toLowerCase()} ${normalizePrivacySurfaceText(value.replace(/[-_/]+/g, " "))}`;
  }
}

function locale(
  localeCode: SupportedPrivacyEvidenceLocale,
  definition: Omit<PrivacySurfaceLocaleDefinition, "locale">,
): PrivacySurfaceLocaleDefinition {
  return { locale: localeCode, ...definition };
}

function phraseEntries(
  localeCode: SupportedPrivacyEvidenceLocale,
  surfaceType: Exclude<PrivacySurfaceType, "unknown">,
  phrases: string[],
): PrivacySurfacePhrase[] {
  return phrases.map((phrase): PrivacySurfacePhrase => ({
    locale: localeCode,
    ...(isShortContextualPhrase(phrase) ? equivalent(surfaceType, phrase) : direct(surfaceType, phrase)),
  }));
}

function isShortContextualPhrase(phrase: string) {
  const normalized = normalizePrivacySurfaceText(phrase);
  return normalized.length <= 10 && !/\s/.test(normalized);
}

function urlPatternEntries(
  localeCode: SupportedPrivacyEvidenceLocale,
  surfaceType: Exclude<PrivacySurfaceType, "unknown">,
  pathSlugs: string[],
): Array<{
  locale: SupportedPrivacyEvidenceLocale;
  pattern: RegExp;
  surfaceType: Exclude<PrivacySurfaceType, "unknown">;
  variant: string;
}> {
  return pathSlugs.map((slug) => ({
    locale: localeCode,
    pattern: pathSlugPattern(slug),
    surfaceType,
    variant: "locale_path",
  }));
}

function pathSlugPattern(slug: string): RegExp {
  const tokens = normalizePrivacySurfaceText(slug)
    .split(/[-_\s/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const pattern = tokens.length > 1
    ? tokens.map(escapeRegExp).join("[-_\\s/]+")
    : escapeRegExp(tokens[0] ?? normalizePrivacySurfaceText(slug));
  return new RegExp(`(?:^|[/_\\s-])${pattern}(?:$|[\\s/?#._-])`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function direct(surfaceType: Exclude<PrivacySurfaceType, "unknown">, phrase: string): PhraseInput {
  return { phrase, strength: "direct", surfaceType };
}

function equivalent(surfaceType: Exclude<PrivacySurfaceType, "unknown">, phrase: string, variant?: string): PhraseInput {
  return { phrase, strength: "equivalent", surfaceType, variant };
}

function phraseScore(
  term: PrivacySurfacePhrase,
  normalizedLabel: string,
  contextSatisfied: boolean,
) {
  const phrase = normalizePrivacySurfaceText(term.phrase);
  if (!phrase) {
    return 0;
  }
  const exact = normalizedLabel === phrase;
  const labelMatch = !exact && phrase.length >= 5 && paddedIncludes(normalizedLabel, phrase);
  if (!exact && !labelMatch) {
    return 0;
  }
  if (term.requiresPrivacyContext && !contextSatisfied) {
    return 0;
  }
  return (exact ? 1000 : 650) +
    phrase.length +
    strengthRank(term.strength) * 80 +
    (contextSatisfied ? 40 : 0);
}

function paddedIncludes(normalizedValue: string, phrase: string) {
  return ` ${normalizedValue} `.includes(` ${phrase} `);
}

function confidenceFor(term: PrivacySurfacePhrase, contextSatisfied: boolean) {
  const base =
    term.strength === "direct" ? 0.9 :
      term.strength === "equivalent" ? 0.82 :
        term.strength === "contextual" ? 0.74 :
          0.55;
  return Math.max(0.2, Math.min(0.95, contextSatisfied ? base : Math.min(base, 0.72)));
}

function strengthRank(strength: PrivacySurfaceMatchStrength) {
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

function unknown(reasonCodes: string[]): PrivacySurfaceClassification {
  return {
    confidence: 0.2,
    contextSatisfied: false,
    reasonCodes: uniqueStrings(reasonCodes),
    surfaceType: "unknown",
  };
}
