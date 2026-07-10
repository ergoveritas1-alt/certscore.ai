import type { SupportedPrivacyEvidenceLocale } from "@certscore/contracts";

/**
 * Human-reviewed multilingual gold values. This intentionally does not import
 * the production locale registry: a registry edit must be able to fail this
 * corpus rather than rewriting its own expected values.
 */
export type MultilingualPrivacyEvidenceGoldFixture = {
  locale: SupportedPrivacyEvidenceLocale;
  privacyPolicy: string;
  cookiePolicy: string;
  consentContext: string;
  accept: string;
  reject: string;
  options: string;
  necessaryOnly: string;
};

export const MULTILINGUAL_PRIVACY_EVIDENCE_GOLD_FIXTURES: readonly MultilingualPrivacyEvidenceGoldFixture[] = [
  { locale: "en", privacyPolicy: "privacy policy", cookiePolicy: "cookie policy", consentContext: "privacy", accept: "accept all", reject: "reject all", options: "cookie settings", necessaryOnly: "necessary only" },
  { locale: "es", privacyPolicy: "política de privacidad", cookiePolicy: "política de cookies", consentContext: "privacidad", accept: "aceptar todo", reject: "rechazar todo", options: "configuración de cookies", necessaryOnly: "solo las necesarias" },
  { locale: "de", privacyPolicy: "datenschutzerklärung", cookiePolicy: "cookie-richtlinie", consentContext: "datenschutz", accept: "alle akzeptieren", reject: "alle ablehnen", options: "cookie-einstellungen", necessaryOnly: "nur notwendige cookies" },
  { locale: "ja", privacyPolicy: "プライバシーポリシー", cookiePolicy: "クッキーポリシー", consentContext: "プライバシー", accept: "すべて同意する", reject: "すべて拒否する", options: "Cookie設定", necessaryOnly: "必要なCookieのみ" },
  { locale: "fr", privacyPolicy: "politique de confidentialité", cookiePolicy: "politique relative aux cookies", consentContext: "confidentialité", accept: "tout accepter", reject: "tout refuser", options: "paramètres des cookies", necessaryOnly: "uniquement les cookies nécessaires" },
  { locale: "ru", privacyPolicy: "политика конфиденциальности", cookiePolicy: "политика использования файлов cookie", consentContext: "конфиденциальность", accept: "принять все", reject: "отклонить все", options: "настройки файлов cookie", necessaryOnly: "только необходимые" },
  { locale: "pt", privacyPolicy: "política de privacidade", cookiePolicy: "política de cookies", consentContext: "privacidade", accept: "aceitar todos", reject: "rejeitar todos", options: "definições de cookies", necessaryOnly: "apenas necessários" },
  { locale: "it", privacyPolicy: "informativa sulla privacy", cookiePolicy: "informativa sui cookie", consentContext: "privacy", accept: "accetta tutto", reject: "rifiuta tutto", options: "impostazioni cookie", necessaryOnly: "solo cookie necessari" },
  { locale: "tr", privacyPolicy: "gizlilik politikası", cookiePolicy: "çerez politikası", consentContext: "gizlilik", accept: "tümünü kabul et", reject: "tümünü reddet", options: "çerez ayarları", necessaryOnly: "yalnızca gerekli çerezler" },
  { locale: "zh", privacyPolicy: "隐私政策", cookiePolicy: "Cookie 政策", consentContext: "隐私", accept: "全部接受", reject: "全部拒绝", options: "Cookie 设置", necessaryOnly: "仅必要 Cookie" },
  { locale: "fa", privacyPolicy: "سیاست حفظ حریم خصوصی", cookiePolicy: "سیاست کوکی", consentContext: "حریم خصوصی", accept: "پذیرش همه", reject: "رد همه", options: "تنظیمات کوکی", necessaryOnly: "فقط کوکی‌های ضروری" },
  { locale: "nl", privacyPolicy: "privacybeleid", cookiePolicy: "cookiebeleid", consentContext: "privacy", accept: "alles accepteren", reject: "alles weigeren", options: "cookie-instellingen", necessaryOnly: "alleen noodzakelijke cookies" },
  { locale: "pl", privacyPolicy: "polityka prywatności", cookiePolicy: "polityka plików cookie", consentContext: "prywatność", accept: "akceptuj wszystko", reject: "odrzuć wszystko", options: "ustawienia plików cookie", necessaryOnly: "tylko niezbędne pliki cookie" },
  { locale: "vi", privacyPolicy: "chính sách bảo mật", cookiePolicy: "chính sách cookie", consentContext: "quyền riêng tư", accept: "chấp nhận tất cả", reject: "từ chối tất cả", options: "cài đặt cookie", necessaryOnly: "chỉ cookie cần thiết" },
  { locale: "id", privacyPolicy: "kebijakan privasi", cookiePolicy: "kebijakan cookie", consentContext: "privasi", accept: "terima semua", reject: "tolak semua", options: "pengaturan cookie", necessaryOnly: "hanya cookie yang diperlukan" },
  { locale: "cs", privacyPolicy: "zásady ochrany osobních údajů", cookiePolicy: "zásady používání cookies", consentContext: "osobní údaje", accept: "přijmout vše", reject: "odmítnout vše", options: "nastavení cookies", necessaryOnly: "pouze nezbytné" },
  { locale: "ko", privacyPolicy: "개인정보처리방침", cookiePolicy: "쿠키 정책", consentContext: "개인정보", accept: "모두 허용", reject: "모두 거부", options: "쿠키 설정", necessaryOnly: "필수 쿠키만" },
  { locale: "sv", privacyPolicy: "integritetspolicy", cookiePolicy: "cookiepolicy", consentContext: "integritet", accept: "acceptera alla", reject: "avvisa alla", options: "cookieinställningar", necessaryOnly: "endast nödvändiga" },
  { locale: "uk", privacyPolicy: "політика конфіденційності", cookiePolicy: "політика cookie", consentContext: "конфіденційність", accept: "прийняти всі", reject: "відхилити всі", options: "налаштування cookie", necessaryOnly: "лише необхідні" },
  { locale: "el", privacyPolicy: "πολιτική απορρήτου", cookiePolicy: "πολιτική cookies", consentContext: "απόρρητο", accept: "αποδοχή όλων", reject: "απόρριψη όλων", options: "ρυθμίσεις cookies", necessaryOnly: "μόνο απαραίτητα" },
  { locale: "ar", privacyPolicy: "سياسة الخصوصية", cookiePolicy: "سياسة ملفات تعريف الارتباط", consentContext: "الخصوصية", accept: "قبول الكل", reject: "رفض الكل", options: "إعدادات ملفات تعريف الارتباط", necessaryOnly: "الضرورية فقط" },
  { locale: "hu", privacyPolicy: "adatvédelmi irányelvek", cookiePolicy: "süti szabályzat", consentContext: "adatvédelem", accept: "összes elfogadása", reject: "összes elutasítása", options: "süti beállítások", necessaryOnly: "csak a szükséges" },
  { locale: "ro", privacyPolicy: "politica de confidențialitate", cookiePolicy: "politica de cookie-uri", consentContext: "confidențialitate", accept: "acceptă toate", reject: "respinge toate", options: "setări cookie", necessaryOnly: "doar cele necesare" },
  { locale: "th", privacyPolicy: "นโยบายความเป็นส่วนตัว", cookiePolicy: "นโยบายคุกกี้", consentContext: "ความเป็นส่วนตัว", accept: "ยอมรับทั้งหมด", reject: "ปฏิเสธทั้งหมด", options: "การตั้งค่าคุกกี้", necessaryOnly: "เฉพาะคุกกี้ที่จำเป็น" },
  { locale: "da", privacyPolicy: "privatlivspolitik", cookiePolicy: "cookiepolitik", consentContext: "privatliv", accept: "accepter alle", reject: "afvis alle", options: "cookieindstillinger", necessaryOnly: "kun nødvendige" },
  { locale: "sk", privacyPolicy: "zásady ochrany osobných údajov", cookiePolicy: "pravidlá používania cookies", consentContext: "osobné údaje", accept: "prijať všetko", reject: "odmietnuť všetko", options: "nastavenia cookies", necessaryOnly: "iba nevyhnutné" },
  { locale: "fi", privacyPolicy: "tietosuojaseloste", cookiePolicy: "evästekäytäntö", consentContext: "tietosuoja", accept: "hyväksy kaikki", reject: "hylkää kaikki", options: "evästeasetukset", necessaryOnly: "vain välttämättömät" },
  { locale: "bg", privacyPolicy: "политика за поверителност", cookiePolicy: "политика за бисквитки", consentContext: "поверителност", accept: "приемане на всички", reject: "отхвърляне на всички", options: "настройки за бисквитки", necessaryOnly: "само необходимите" },
  { locale: "he", privacyPolicy: "מדיניות פרטיות", cookiePolicy: "מדיניות עוגיות", consentContext: "פרטיות", accept: "אישור הכול", reject: "דחיית הכול", options: "הגדרות עוגיות", necessaryOnly: "הכרחיות בלבד" },
  { locale: "sr", privacyPolicy: "politika privatnosti", cookiePolicy: "politika kolačića", consentContext: "privatnost", accept: "prihvati sve", reject: "odbij sve", options: "podešavanja kolačića", necessaryOnly: "samo neophodni" },
  { locale: "hr", privacyPolicy: "politika privatnosti", cookiePolicy: "politika kolačića", consentContext: "privatnost", accept: "prihvati sve", reject: "odbij sve", options: "postavke kolačića", necessaryOnly: "samo nužni" },
  { locale: "lt", privacyPolicy: "privatumo politika", cookiePolicy: "slapukų politika", consentContext: "privatumas", accept: "priimti visus", reject: "atmesti visus", options: "slapukų nustatymai", necessaryOnly: "tik būtinieji" },
  { locale: "sl", privacyPolicy: "politika zasebnosti", cookiePolicy: "politika piškotkov", consentContext: "zasebnost", accept: "sprejmi vse", reject: "zavrni vse", options: "nastavitve piškotkov", necessaryOnly: "samo nujni" },
  { locale: "ca", privacyPolicy: "política de privacitat", cookiePolicy: "política de cookies", consentContext: "privacitat", accept: "accepta-ho tot", reject: "rebutja-ho tot", options: "configuració de cookies", necessaryOnly: "només necessàries" },
  { locale: "hi", privacyPolicy: "गोपनीयता नीति", cookiePolicy: "कुकी नीति", consentContext: "गोपनीयता", accept: "सभी स्वीकार करें", reject: "सभी अस्वीकार करें", options: "कुकी सेटिंग्स", necessaryOnly: "केवल आवश्यक कुकी" },
  { locale: "nb", privacyPolicy: "personvernerklæring", cookiePolicy: "retningslinjer for informasjonskapsler", consentContext: "personvern", accept: "godta alle", reject: "avvis alle", options: "innstillinger for informasjonskapsler", necessaryOnly: "bare nødvendige" },
  { locale: "et", privacyPolicy: "privaatsuspoliitika", cookiePolicy: "küpsiste poliitika", consentContext: "privaatsus", accept: "nõustu kõigiga", reject: "keeldu kõigist", options: "küpsiste seaded", necessaryOnly: "ainult vajalikud" },
  { locale: "lv", privacyPolicy: "privātuma politika", cookiePolicy: "sīkdatņu politika", consentContext: "privātums", accept: "pieņemt visus", reject: "noraidīt visus", options: "sīkdatņu iestatījumi", necessaryOnly: "tikai nepieciešamās" },
  { locale: "az", privacyPolicy: "məxfilik siyasəti", cookiePolicy: "kuki siyasəti", consentContext: "məxfilik", accept: "hamısını qəbul et", reject: "hamısını rədd et", options: "kuki ayarları", necessaryOnly: "yalnız zəruri kukilər" },
  { locale: "gl", privacyPolicy: "política de privacidade", cookiePolicy: "política de cookies", consentContext: "privacidade", accept: "aceptar todo", reject: "rexeitar todo", options: "configuración de cookies", necessaryOnly: "só as necesarias" },
];

export const MULTILINGUAL_GOLD_NEGATIVE_CONTROLS = {
  accept: "Accept newsletter",
  reject: "Reject invitation",
  options: "Account settings",
} as const;
