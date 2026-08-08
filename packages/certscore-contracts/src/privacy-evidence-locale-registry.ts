import type { SupportedPrivacyEvidenceLocale } from "./supported-languages";

export type PrivacyEvidenceLocaleRegistryEntry = {
  locale: SupportedPrivacyEvidenceLocale;
  privacyPolicyLabels: readonly string[];
  privacyPolicyPathSlugs: readonly string[];
  cookiePolicyLabels: readonly string[];
  combinedPrivacyCookieLabels?: readonly string[];
  cookiePolicyPathSlugs: readonly string[];
  cookieSettingsLabels: readonly string[];
  termsLabels: readonly string[];
  termsPathSlugs: readonly string[];
  contextHints: readonly string[];
  tldHints: readonly string[];
  consentControls: {
    accept: readonly string[];
    reject: readonly string[];
    options: readonly string[];
    necessaryOnly: readonly string[];
  };
  contextualConsentControls?: {
    accept?: readonly string[];
    reject?: readonly string[];
    options?: readonly string[];
    necessaryOnly?: readonly string[];
  };
};

type EntryInput = Omit<PrivacyEvidenceLocaleRegistryEntry, "locale">;

const locale = (
  localeCode: SupportedPrivacyEvidenceLocale,
  input: EntryInput,
): PrivacyEvidenceLocaleRegistryEntry => ({ locale: localeCode, ...input });

/**
 * Canonical locale data shared by policy-surface discovery and consent-control
 * classification. Exact action labels are intentionally narrow; generic words
 * such as “settings” remain context-gated in the classifier.
 */
export const PRIVACY_EVIDENCE_LOCALE_REGISTRY: readonly PrivacyEvidenceLocaleRegistryEntry[] = [
  locale("en", {
    privacyPolicyLabels: ["privacy policy", "privacy notice", "data protection"], privacyPolicyPathSlugs: ["privacy-policy", "privacy-notice", "data-protection"],
    cookiePolicyLabels: ["cookie policy", "cookie notice"], cookiePolicyPathSlugs: ["cookie-policy", "cookie-notice"],
    combinedPrivacyCookieLabels: ["privacy & cookie policy", "privacy and cookie policy", "website and cookies"],
    cookieSettingsLabels: ["cookie settings", "cookie preferences"], termsLabels: ["terms of service", "terms and conditions"], termsPathSlugs: ["terms", "terms-of-service"],
    contextHints: ["privacy", "personal data", "cookies", "consent"], tldHints: [],
    consentControls: { accept: ["accept all", "allow all"], reject: ["reject all", "decline all", "deny non-essential", "deny non-essential cookies"], options: ["cookie settings", "manage preferences", "allow selection"], necessaryOnly: ["necessary only", "required only", "essential only", "only necessary", "only essential", "essential cookies only", "necessary cookies only"] },
  }),
  locale("es", {
    privacyPolicyLabels: ["política de privacidad", "aviso de privacidad", "protección de datos"], privacyPolicyPathSlugs: ["politica-de-privacidad", "privacidad", "proteccion-de-datos"],
    cookiePolicyLabels: ["política de cookies", "aviso de cookies"], cookiePolicyPathSlugs: ["politica-de-cookies"], cookieSettingsLabels: ["configuración de cookies", "preferencias de cookies"],
    termsLabels: ["términos y condiciones", "condiciones de uso"], termsPathSlugs: ["terminos-y-condiciones", "condiciones-de-uso"], contextHints: ["privacidad", "datos personales", "cookies", "consentimiento"], tldHints: [".es"],
    consentControls: { accept: ["aceptar todo", "aceptar todas"], reject: ["rechazar todo", "rechazar todas"], options: ["configuración de cookies", "gestionar preferencias"], necessaryOnly: ["solo las necesarias", "solo cookies necesarias"] },
  }),
  locale("de", {
    privacyPolicyLabels: ["datenschutzerklärung", "datenschutzinformation"], privacyPolicyPathSlugs: ["datenschutz", "datenschutzerklaerung"], cookiePolicyLabels: ["cookie-richtlinie", "cookie-hinweis"], cookiePolicyPathSlugs: ["cookie-richtlinie"],
    cookieSettingsLabels: ["cookie-einstellungen", "datenschutzeinstellungen"], termsLabels: ["nutzungsbedingungen", "allgemeine geschäftsbedingungen"], termsPathSlugs: ["nutzungsbedingungen", "agb"], contextHints: ["datenschutz", "personenbezogene daten", "cookies", "einwilligung"], tldHints: [".de", ".at"],
    consentControls: { accept: ["alle akzeptieren", "alles akzeptieren", "alle auswählen"], reject: ["alle ablehnen", "alles ablehnen"], options: ["cookie-einstellungen", "einstellungen verwalten", "einwilligungs-einstellungen"], necessaryOnly: ["nur notwendige cookies", "nur erforderliche cookies"] },
  }),
  locale("ja", {
    privacyPolicyLabels: ["プライバシーポリシー", "個人情報保護方針"], privacyPolicyPathSlugs: ["privacy-policy", "kojin-joho"], cookiePolicyLabels: ["クッキーポリシー"], cookiePolicyPathSlugs: ["cookie-policy", "ja/cookies"], cookieSettingsLabels: ["Cookie設定"],
    termsLabels: ["利用規約"], termsPathSlugs: ["terms", "riyou-kiyaku"], contextHints: ["プライバシー", "個人情報", "クッキー", "Cookie"], tldHints: [".jp"],
    consentControls: { accept: ["すべて同意する", "すべて許可する"], reject: ["すべて拒否する", "すべてを拒否"], options: ["Cookie設定", "クッキー設定"], necessaryOnly: ["必要なCookieのみ", "必須Cookieのみ"] },
  }),
  locale("fr", {
    privacyPolicyLabels: ["politique de confidentialité", "avis de confidentialité"], privacyPolicyPathSlugs: ["politique-de-confidentialite", "confidentialite"], cookiePolicyLabels: ["politique relative aux cookies", "politique cookies"], cookiePolicyPathSlugs: ["politique-relative-aux-cookies", "politique-cookies"],
    cookieSettingsLabels: ["paramètres des cookies", "préférences cookies"], termsLabels: ["conditions d'utilisation", "conditions générales"], termsPathSlugs: ["conditions-utilisation", "mentions-legales"], contextHints: ["confidentialité", "données personnelles", "cookies", "consentement"], tldHints: [".fr"],
    consentControls: { accept: ["tout accepter", "accepter tout"], reject: ["tout refuser", "refuser tout"], options: ["paramètres des cookies", "gérer mes préférences"], necessaryOnly: ["uniquement les cookies nécessaires", "cookies nécessaires uniquement"] },
  }),
  locale("ru", {
    privacyPolicyLabels: ["политика конфиденциальности", "уведомление о конфиденциальности", "обработка персональных данных", "защита персональных данных"], privacyPolicyPathSlugs: ["politika-konfidencialnosti", "persondata", "personal-data"], cookiePolicyLabels: ["политика использования файлов cookie", "использование файлов cookie"], cookiePolicyPathSlugs: ["politika-cookie"], cookieSettingsLabels: ["настройки файлов cookie"], termsLabels: ["условия использования"], termsPathSlugs: ["usloviya-ispolzovaniya"], contextHints: ["конфиденциальность", "персональные данные", "файлы cookie", "согласие"], tldHints: [".ru"],
    consentControls: { accept: ["принять все", "разрешить все"], reject: ["отклонить все", "отказаться от всех"], options: ["настройки файлов cookie", "управление настройками"], necessaryOnly: ["только необходимые", "только обязательные файлы cookie"] },
  }),
  locale("pt", {
    privacyPolicyLabels: ["política de privacidade", "aviso de privacidade", "proteção de dados"], privacyPolicyPathSlugs: ["politica-de-privacidade", "privacidade", "protecao-de-dados"], cookiePolicyLabels: ["política de cookies"], cookiePolicyPathSlugs: ["politica-de-cookies"], cookieSettingsLabels: ["definições de cookies", "configurações de cookies"], termsLabels: ["termos e condições", "termos de uso"], termsPathSlugs: ["termos-e-condicoes", "termos-de-uso"], contextHints: ["privacidade", "dados pessoais", "cookies", "consentimento"], tldHints: [".pt", ".br"],
    consentControls: { accept: ["aceitar todos", "aceitar tudo"], reject: ["rejeitar todos", "recusar todos"], options: ["definições de cookies", "gerir preferências"], necessaryOnly: ["apenas necessários", "apenas cookies necessários"] },
    contextualConsentControls: { accept: ["aceitar"], reject: ["rejeitar"], options: ["preferências"] },
  }),
  locale("it", {
    privacyPolicyLabels: ["informativa sulla privacy", "politica sulla privacy", "protezione dei dati"], privacyPolicyPathSlugs: ["informativa-privacy", "privacy", "protezione-dei-dati"], cookiePolicyLabels: ["informativa sui cookie", "cookie policy"], cookiePolicyPathSlugs: ["cookie-policy"], cookieSettingsLabels: ["impostazioni cookie", "preferenze cookie"], termsLabels: ["termini e condizioni", "condizioni d'uso"], termsPathSlugs: ["termini-e-condizioni"], contextHints: ["privacy", "dati personali", "cookie", "consenso"], tldHints: [".it"],
    consentControls: { accept: ["accetta tutto", "accetta tutti"], reject: ["rifiuta tutto", "rifiuta tutti"], options: ["impostazioni cookie", "gestisci preferenze", "personalizza", "personalizza le mie scelte"], necessaryOnly: ["solo cookie necessari", "solo i cookie necessari"] },
  }),
  locale("tr", {
    privacyPolicyLabels: ["gizlilik politikası", "kişisel verilerin korunması"], privacyPolicyPathSlugs: ["gizlilik-politikasi", "kvkk"], cookiePolicyLabels: ["çerez politikası"], cookiePolicyPathSlugs: ["cerez-politikasi"], cookieSettingsLabels: ["çerez ayarları"], termsLabels: ["kullanım koşulları"], termsPathSlugs: ["kullanim-kosullari"], contextHints: ["gizlilik", "kişisel veri", "çerez", "rıza"], tldHints: [".tr"],
    consentControls: { accept: ["tümünü kabul et", "hepsini kabul et"], reject: ["tümünü reddet", "hepsini reddet"], options: ["çerez ayarları", "tercihleri yönet", "seçenekleri yönetin"], necessaryOnly: ["yalnızca gerekli çerezler", "sadece gerekli çerezler"] },
    contextualConsentControls: { accept: ["izin ver"] },
  }),
  locale("zh", {
    privacyPolicyLabels: ["隐私政策", "隐私声明"], privacyPolicyPathSlugs: ["privacy-policy", "yinsi-zhengce"], cookiePolicyLabels: ["Cookie 政策", "饼干政策"], cookiePolicyPathSlugs: ["cookie-policy"], cookieSettingsLabels: ["Cookie 设置", "饼干设置"], termsLabels: ["使用条款"], termsPathSlugs: ["terms"], contextHints: ["隐私", "个人信息", "Cookie", "同意"], tldHints: [".cn"],
    consentControls: { accept: ["全部接受", "接受全部"], reject: ["全部拒绝", "拒绝全部"], options: ["Cookie 设置", "管理偏好设置"], necessaryOnly: ["仅必要 Cookie", "仅限必要的 Cookie"] },
  }),
  locale("fa", {
    privacyPolicyLabels: ["سیاست حفظ حریم خصوصی"], privacyPolicyPathSlugs: ["privacy-policy", "siyasat-harim-khosusi"], cookiePolicyLabels: ["سیاست کوکی"], cookiePolicyPathSlugs: ["cookie-policy"], cookieSettingsLabels: ["تنظیمات کوکی"], termsLabels: ["شرایط استفاده"], termsPathSlugs: ["terms"], contextHints: ["حریم خصوصی", "داده شخصی", "کوکی", "رضایت"], tldHints: [".ir"],
    consentControls: { accept: ["پذیرش همه", "قبول همه"], reject: ["رد همه", "نپذیرفتن همه"], options: ["تنظیمات کوکی", "مدیریت ترجیحات"], necessaryOnly: ["فقط کوکی‌های ضروری", "فقط ضروری"] },
  }),
  locale("nl", {
    privacyPolicyLabels: ["privacybeleid", "privacyverklaring", "gegevensbescherming"], privacyPolicyPathSlugs: ["privacybeleid", "privacyverklaring", "gegevensbescherming"], cookiePolicyLabels: ["cookiebeleid", "cookieverklaring"], cookiePolicyPathSlugs: ["cookiebeleid"], cookieSettingsLabels: ["cookie-instellingen", "cookievoorkeuren"], termsLabels: ["algemene voorwaarden", "gebruiksvoorwaarden"], termsPathSlugs: ["algemene-voorwaarden"], contextHints: ["privacy", "persoonsgegevens", "cookies", "toestemming"], tldHints: [".nl"],
    consentControls: { accept: ["alles accepteren", "alle cookies accepteren"], reject: ["alles weigeren", "alle cookies weigeren"], options: ["cookie-instellingen", "voorkeuren beheren", "zelf instellen"], necessaryOnly: ["alleen noodzakelijke cookies", "alleen essentiële cookies"] },
  }),
  locale("pl", {
    privacyPolicyLabels: ["polityka prywatności", "informacja o prywatności", "ochrona danych"], privacyPolicyPathSlugs: ["polityka-prywatnosci", "prywatnosc", "ochrona-danych"], cookiePolicyLabels: ["polityka plików cookie", "polityka cookies"], cookiePolicyPathSlugs: ["polityka-cookie"], cookieSettingsLabels: ["ustawienia plików cookie"], termsLabels: ["regulamin", "warunki korzystania"], termsPathSlugs: ["regulamin"], contextHints: ["prywatność", "dane osobowe", "pliki cookie", "zgoda"], tldHints: [".pl"],
    consentControls: { accept: ["akceptuj wszystko", "zaakceptuj wszystko"], reject: ["odrzuć wszystko", "odrzuć wszystkie"], options: ["ustawienia plików cookie", "zarządzaj preferencjami"], necessaryOnly: ["akceptuj tylko niezbędne", "tylko niezbędne pliki cookie", "tylko wymagane pliki cookie"] },
  }),
  locale("vi", {
    privacyPolicyLabels: ["chính sách bảo mật", "chính sách quyền riêng tư", "bảo vệ dữ liệu"], privacyPolicyPathSlugs: ["chinh-sach-bao-mat", "bao-ve-du-lieu"], cookiePolicyLabels: ["chính sách cookie"], cookiePolicyPathSlugs: ["chinh-sach-cookie"], cookieSettingsLabels: ["cài đặt cookie"], termsLabels: ["điều khoản sử dụng"], termsPathSlugs: ["dieu-khoan-su-dung"], contextHints: ["quyền riêng tư", "dữ liệu cá nhân", "cookie", "đồng ý"], tldHints: [".vn"],
    consentControls: { accept: ["chấp nhận tất cả", "đồng ý tất cả"], reject: ["từ chối tất cả", "không chấp nhận tất cả"], options: ["cài đặt cookie", "quản lý tùy chọn"], necessaryOnly: ["chỉ cookie cần thiết", "chỉ những cookie cần thiết"] },
  }),
  locale("id", {
    privacyPolicyLabels: ["kebijakan privasi", "pemberitahuan privasi"], privacyPolicyPathSlugs: ["kebijakan-privasi", "privasi"], cookiePolicyLabels: ["kebijakan cookie"], cookiePolicyPathSlugs: ["kebijakan-cookie"], cookieSettingsLabels: ["pengaturan cookie"], termsLabels: ["syarat dan ketentuan"], termsPathSlugs: ["syarat-dan-ketentuan"], contextHints: ["privasi", "data pribadi", "cookie", "persetujuan"], tldHints: [".id"],
    consentControls: { accept: ["terima semua", "izinkan semua"], reject: ["tolak semua", "jangan izinkan semua"], options: ["pengaturan cookie", "kelola preferensi"], necessaryOnly: ["hanya cookie yang diperlukan", "hanya yang diperlukan"] },
  }),
  locale("cs", {
    privacyPolicyLabels: ["zásady ochrany osobních údajů", "ochrana osobních údajů"], privacyPolicyPathSlugs: ["zasady-ochrany-osobnich-udaju", "ochrana-osobnich-udaju"], cookiePolicyLabels: ["zásady používání cookies"], cookiePolicyPathSlugs: ["zasady-pouzivani-cookies"], cookieSettingsLabels: ["nastavení cookies"], termsLabels: ["podmínky používání"], termsPathSlugs: ["podminky-pouzivani"], contextHints: ["osobní údaje", "soukromí", "cookies", "souhlas"], tldHints: [".cz"],
    consentControls: { accept: ["přijmout vše", "souhlasit se vším"], reject: ["odmítnout vše", "zamítnout vše", "odmítnout volitelné cookies"], options: ["nastavení cookies", "spravovat předvolby"], necessaryOnly: ["pouze nezbytné", "pouze nezbytné cookies"] },
  }),
  locale("ko", {
    privacyPolicyLabels: ["개인정보처리방침", "개인정보 보호정책"], privacyPolicyPathSlugs: ["개인정보처리방침"], cookiePolicyLabels: ["쿠키 정책"], cookiePolicyPathSlugs: ["쿠키-정책"], cookieSettingsLabels: ["쿠키 설정"], termsLabels: ["이용약관"], termsPathSlugs: ["이용약관"], contextHints: ["개인정보", "쿠키", "동의"], tldHints: [".kr"],
    consentControls: { accept: ["모두 허용", "모두 동의"], reject: ["모두 거부", "전체 거부"], options: ["쿠키 설정", "환경설정 관리"], necessaryOnly: ["필수 쿠키만", "필수 항목만"] },
  }),
  locale("sv", {
    privacyPolicyLabels: ["integritetspolicy", "sekretesspolicy", "dataskydd"], privacyPolicyPathSlugs: ["integritetspolicy", "dataskydd"], cookiePolicyLabels: ["cookiepolicy"], cookiePolicyPathSlugs: ["cookiepolicy"], cookieSettingsLabels: ["cookieinställningar"], termsLabels: ["användarvillkor"], termsPathSlugs: ["anvandarvillkor"], contextHints: ["integritet", "personuppgifter", "cookies", "samtycke"], tldHints: [".se"],
    consentControls: { accept: ["acceptera alla", "godkänn alla"], reject: ["avvisa alla", "neka alla"], options: ["cookieinställningar", "hantera inställningar", "hantera eller avvisa"], necessaryOnly: ["endast nödvändiga", "endast nödvändiga cookies"] },
  }),
  locale("uk", {
    privacyPolicyLabels: ["політика конфіденційності"], privacyPolicyPathSlugs: ["polityka-konfidentsiynosti"], cookiePolicyLabels: ["політика cookie"], cookiePolicyPathSlugs: ["polityka-cookie"], cookieSettingsLabels: ["налаштування cookie"], termsLabels: ["умови використання"], termsPathSlugs: ["umovy-vykorystannya"], contextHints: ["конфіденційність", "персональні дані", "cookie", "згода"], tldHints: [".ua"],
    consentControls: { accept: ["прийняти всі", "дозволити всі"], reject: ["відхилити всі", "відмовитися від усіх"], options: ["налаштування cookie", "керувати налаштуваннями"], necessaryOnly: ["лише необхідні", "тільки необхідні cookie"] },
  }),
  locale("el", {
    privacyPolicyLabels: ["πολιτική απορρήτου"], privacyPolicyPathSlugs: ["politiki-aporritou"], cookiePolicyLabels: ["πολιτική cookies"], cookiePolicyPathSlugs: ["politiki-cookies"], cookieSettingsLabels: ["ρυθμίσεις cookies"], termsLabels: ["όροι χρήσης"], termsPathSlugs: ["oroi-chrisis"], contextHints: ["απόρρητο", "προσωπικά δεδομένα", "cookies", "συγκατάθεση"], tldHints: [".gr"],
    consentControls: { accept: ["αποδοχή όλων", "συμφωνώ με όλα"], reject: ["απόρριψη όλων", "άρνηση όλων"], options: ["ρυθμίσεις cookies", "διαχείριση προτιμήσεων"], necessaryOnly: ["μόνο απαραίτητα", "μόνο απαραίτητα cookies"] },
  }),
  locale("ar", {
    privacyPolicyLabels: ["سياسة الخصوصية", "إشعار الخصوصية"], privacyPolicyPathSlugs: ["siyasat-khususiyya"], cookiePolicyLabels: ["سياسة ملفات تعريف الارتباط"], cookiePolicyPathSlugs: ["ar/cookies"], cookieSettingsLabels: ["إعدادات ملفات تعريف الارتباط"], termsLabels: ["شروط الاستخدام"], termsPathSlugs: ["terms"], contextHints: ["الخصوصية", "بيانات شخصية", "ملفات تعريف الارتباط", "الموافقة"], tldHints: [".sa", ".ae", ".eg"],
    consentControls: { accept: ["قبول الكل", "السماح بالكل"], reject: ["رفض الكل", "عدم السماح بالكل"], options: ["إعدادات ملفات تعريف الارتباط", "إدارة التفضيلات"], necessaryOnly: ["الضرورية فقط", "ملفات تعريف الارتباط الضرورية فقط"] },
  }),
  locale("hu", {
    privacyPolicyLabels: ["adatvédelmi irányelvek", "adatvédelmi tájékoztató"], privacyPolicyPathSlugs: ["adatvedelmi-tajekoztato"], cookiePolicyLabels: ["süti szabályzat"], cookiePolicyPathSlugs: ["suti-szabalyzat"], cookieSettingsLabels: ["süti beállítások"], termsLabels: ["felhasználási feltételek"], termsPathSlugs: ["aszf"], contextHints: ["adatvédelem", "személyes adatok", "süti", "hozzájárulás"], tldHints: [".hu"],
    consentControls: { accept: ["összes elfogadása", "mindent elfogadok"], reject: ["összes elutasítása", "mindent elutasítok", "nem kötelező sütik elutasítása"], options: ["süti beállítások", "beállítások kezelése"], necessaryOnly: ["csak a szükséges", "csak szükséges sütik"] },
  }),
  locale("ro", {
    privacyPolicyLabels: ["politică de confidențialitate", "politica de confidențialitate", "protecția datelor"], privacyPolicyPathSlugs: ["politica-de-confidentialitate", "protectia-datelor"], cookiePolicyLabels: ["politica de cookie-uri"], cookiePolicyPathSlugs: ["politica-de-cookie-uri"], cookieSettingsLabels: ["setări cookie"], termsLabels: ["termeni și condiții"], termsPathSlugs: ["termeni-si-conditii"], contextHints: ["confidențialitate", "date personale", "cookie", "consimțământ"], tldHints: [".ro"],
    consentControls: { accept: ["acceptă toate", "permite toate"], reject: ["respinge toate", "refuză toate"], options: ["setări cookie", "gestionează preferințele"], necessaryOnly: ["doar cele necesare", "doar cookie-urile necesare"] },
  }),
  locale("th", {
    privacyPolicyLabels: ["นโยบายความเป็นส่วนตัว"], privacyPolicyPathSlugs: ["นโยบายความเป็นส่วนตัว"], cookiePolicyLabels: ["นโยบายคุกกี้"], cookiePolicyPathSlugs: ["นโยบายคุกกี้"], cookieSettingsLabels: ["การตั้งค่าคุกกี้"], termsLabels: ["ข้อกำหนดการใช้งาน"], termsPathSlugs: ["ข้อกำหนดการใช้งาน"], contextHints: ["ความเป็นส่วนตัว", "ข้อมูลส่วนบุคคล", "คุกกี้", "ยินยอม"], tldHints: [".th"],
    consentControls: { accept: ["ยอมรับทั้งหมด", "อนุญาตทั้งหมด"], reject: ["ปฏิเสธทั้งหมด", "ไม่อนุญาตทั้งหมด"], options: ["การตั้งค่าคุกกี้", "จัดการการตั้งค่า"], necessaryOnly: ["เฉพาะคุกกี้ที่จำเป็น", "เฉพาะที่จำเป็น"] },
  }),
  locale("da", {
    privacyPolicyLabels: ["privatlivspolitik", "databeskyttelsespolitik", "databeskyttelse"], privacyPolicyPathSlugs: ["privatlivspolitik", "databeskyttelse"], cookiePolicyLabels: ["cookiepolitik"], cookiePolicyPathSlugs: ["cookiepolitik"], cookieSettingsLabels: ["cookieindstillinger"], termsLabels: ["brugsvilkår"], termsPathSlugs: ["brugsvilkar"], contextHints: ["privatliv", "personoplysninger", "cookies", "samtykke"], tldHints: [".dk"],
    consentControls: { accept: ["accepter alle", "acceptér alle", "tillad alle"], reject: ["afvis alle", "nægt alle"], options: ["cookieindstillinger", "indstillinger", "administrer præferencer"], necessaryOnly: ["kun nødvendige", "kun nødvendige cookies"] },
  }),
  locale("sk", {
    privacyPolicyLabels: ["zásady ochrany osobných údajov", "ochrana osobných údajov"], privacyPolicyPathSlugs: ["zasady-ochrany-osobnych-udajov", "ochrana-osobnych-udajov"], cookiePolicyLabels: ["pravidlá používania cookies"], cookiePolicyPathSlugs: ["pravidla-pouzivania-cookies"], cookieSettingsLabels: ["nastavenia cookies"], termsLabels: ["podmienky používania"], termsPathSlugs: ["podmienky-pouzivania"], contextHints: ["osobné údaje", "súkromie", "cookies", "súhlas"], tldHints: [".sk"],
    consentControls: { accept: ["prijať všetko", "súhlasiť so všetkým"], reject: ["odmietnuť všetko", "zamietnuť všetko"], options: ["nastavenia cookies", "spravovať predvoľby"], necessaryOnly: ["iba nevyhnutné", "iba nevyhnutné cookies"] },
  }),
  locale("fi", {
    privacyPolicyLabels: ["tietosuojaseloste", "tietosuojakäytäntö", "tietosuoja"], privacyPolicyPathSlugs: ["tietosuojaseloste", "tietosuoja"], cookiePolicyLabels: ["evästekäytäntö"], cookiePolicyPathSlugs: ["evasteet"], cookieSettingsLabels: ["evästeasetukset"], termsLabels: ["käyttöehdot"], termsPathSlugs: ["kayttoehdot"], contextHints: ["tietosuoja", "henkilötiedot", "eväste", "suostumus"], tldHints: [".fi"],
    consentControls: { accept: ["hyväksy kaikki", "salli kaikki"], reject: ["hylkää kaikki", "estä kaikki"], options: ["evästeasetukset", "hallitse asetuksia", "muokkaa evästeasetuksia"], necessaryOnly: ["vain välttämättömät", "vain välttämättömät evästeet"] },
  }),
  locale("bg", {
    privacyPolicyLabels: ["политика за поверителност"], privacyPolicyPathSlugs: ["politika-za-poveritelnost"], cookiePolicyLabels: ["политика за бисквитки"], cookiePolicyPathSlugs: ["politika-za-biskvitki"], cookieSettingsLabels: ["настройки за бисквитки"], termsLabels: ["условия за ползване"], termsPathSlugs: ["usloviya-za-polzvane"], contextHints: ["поверителност", "лични данни", "бисквитки", "съгласие"], tldHints: [".bg"],
    consentControls: { accept: ["приемане на всички", "разрешаване на всички"], reject: ["отхвърляне на всички", "отказ на всички"], options: ["настройки за бисквитки", "управление на предпочитанията"], necessaryOnly: ["само необходимите", "само необходимите бисквитки"] },
  }),
  locale("he", {
    privacyPolicyLabels: ["מדיניות פרטיות", "הצהרת פרטיות"], privacyPolicyPathSlugs: ["privacy-policy"], cookiePolicyLabels: ["מדיניות עוגיות"], cookiePolicyPathSlugs: ["cookie-policy"], cookieSettingsLabels: ["הגדרות עוגיות"], termsLabels: ["תנאי שימוש"], termsPathSlugs: ["terms"], contextHints: ["פרטיות", "מידע אישי", "עוגיות", "הסכמה"], tldHints: [".il"],
    consentControls: { accept: ["אישור הכול", "קבלת הכול"], reject: ["דחיית הכול", "סירוב לכול"], options: ["הגדרות עוגיות", "ניהול העדפות"], necessaryOnly: ["הכרחיות בלבד", "עוגיות הכרחיות בלבד"] },
  }),
  locale("sr", {
    privacyPolicyLabels: ["politika privatnosti", "политика приватности", "zaštita podataka"], privacyPolicyPathSlugs: ["politika-privatnosti", "zastita-podataka"], cookiePolicyLabels: ["politika kolačića"], cookiePolicyPathSlugs: ["politika-kolacica"], cookieSettingsLabels: ["podešavanja kolačića"], termsLabels: ["uslovi korišćenja"], termsPathSlugs: ["uslovi-koriscenja"], contextHints: ["privatnost", "lični podaci", "kolačići", "saglasnost"], tldHints: [".rs"],
    consentControls: { accept: ["prihvati sve", "dozvoli sve"], reject: ["odbij sve", "odbaci sve"], options: ["podešavanja kolačića", "upravljaj podešavanjima"], necessaryOnly: ["samo neophodni", "samo neophodni kolačići"] },
  }),
  locale("hr", {
    privacyPolicyLabels: ["politika privatnosti", "pravila privatnosti", "zaštita podataka"], privacyPolicyPathSlugs: ["politika-privatnosti", "zastita-podataka"], cookiePolicyLabels: ["politika kolačića"], cookiePolicyPathSlugs: ["politika-kolacica"], cookieSettingsLabels: ["postavke kolačića"], termsLabels: ["uvjeti korištenja"], termsPathSlugs: ["uvjeti-koristenja"], contextHints: ["privatnost", "osobni podaci", "kolačići", "privola"], tldHints: [".hr"],
    consentControls: { accept: ["prihvati sve", "dopusti sve", "prihvati i zatvori"], reject: ["odbij sve", "odbaci sve"], options: ["postavke kolačića", "upravljaj postavkama"], necessaryOnly: ["prihvati samo obavezne kolačiće", "samo nužni", "samo nužni kolačići"] },
    contextualConsentControls: { options: ["konfigurirajte svoje privole"] },
  }),
  locale("lt", {
    privacyPolicyLabels: ["privatumo politika", "duomenų apsauga"], privacyPolicyPathSlugs: ["privatumo-politika", "duomenu-apsauga"], cookiePolicyLabels: ["slapukų politika"], cookiePolicyPathSlugs: ["slapuku-politika"], cookieSettingsLabels: ["slapukų nustatymai"], termsLabels: ["naudojimo sąlygos"], termsPathSlugs: ["naudojimo-salygos"], contextHints: ["privatumas", "asmens duomenys", "slapukai", "sutikimas"], tldHints: [".lt"],
    consentControls: { accept: ["priimti visus", "leisti visus"], reject: ["atmesti visus", "neleisti visų", "atsisakyti visų"], options: ["slapukų nustatymai", "rinktis", "tvarkyti nuostatas"], necessaryOnly: ["tik būtinieji", "tik būtinieji slapukai"] },
  }),
  locale("sl", {
    privacyPolicyLabels: ["politika zasebnosti", "pravilnik o zasebnosti", "politika varovanja zasebnosti", "politiko varovanja zasebnosti", "varstvo podatkov"], privacyPolicyPathSlugs: ["politika-varstva-zasebnosti-in-piskotkov", "politika-zasebnosti", "varstvo-podatkov"], cookiePolicyLabels: ["politika piškotkov"], combinedPrivacyCookieLabels: ["varstvo zasebnosti in piškotkov"], cookiePolicyPathSlugs: ["politika-piskotkov"], cookieSettingsLabels: ["nastavitve piškotkov"], termsLabels: ["pogoji uporabe"], termsPathSlugs: ["pogoji-uporabe"], contextHints: ["zasebnost", "osebni podatki", "piškotki", "soglasje"], tldHints: [".si"],
    consentControls: { accept: ["sprejmi vse", "dovoli vse"], reject: ["zavrni vse", "onemogoči vse"], options: ["nastavitve piškotkov", "upravljaj nastavitve"], necessaryOnly: ["sprejmi samo obvezne piškotke", "samo nujni", "samo nujni piškotki"] },
    contextualConsentControls: {
      accept: ["naloži vse"],
      options: ["nastavitve"],
      necessaryOnly: ["naloži samo nujne", "naloži samo nujne piškotke"],
    },
  }),
  locale("ca", {
    privacyPolicyLabels: ["política de privacitat", "avís de privacitat", "protecció de dades"], privacyPolicyPathSlugs: ["politica-de-privacitat", "privacitat", "proteccio-de-dades"], cookiePolicyLabels: ["política de cookies"], cookiePolicyPathSlugs: ["politica-de-cookies"], cookieSettingsLabels: ["configuració de cookies"], termsLabels: ["termes i condicions"], termsPathSlugs: ["termes-i-condicions"], contextHints: ["privacitat", "dades personals", "cookies", "consentiment"], tldHints: [".cat", ".ad"],
    consentControls: { accept: ["accepta-ho tot", "acceptar-ho tot"], reject: ["rebutja-ho tot", "rebutjar-ho tot"], options: ["configuració de cookies", "gestiona les preferències"], necessaryOnly: ["només necessàries", "només les cookies necessàries"] },
  }),
  locale("hi", {
    privacyPolicyLabels: ["गोपनीयता नीति", "निजता नीति"], privacyPolicyPathSlugs: ["gopniyata-niti"], cookiePolicyLabels: ["कुकी नीति"], cookiePolicyPathSlugs: ["cookie-policy"], cookieSettingsLabels: ["कुकी सेटिंग्स"], termsLabels: ["उपयोग की शर्तें"], termsPathSlugs: ["terms"], contextHints: ["गोपनीयता", "व्यक्तिगत डेटा", "कुकी", "सहमति"], tldHints: [".in"],
    consentControls: { accept: ["सभी स्वीकार करें", "सभी को अनुमति दें"], reject: ["सभी अस्वीकार करें", "सभी को मना करें"], options: ["कुकी सेटिंग्स", "प्राथमिकताएं प्रबंधित करें"], necessaryOnly: ["केवल आवश्यक कुकी", "केवल आवश्यक"] },
  }),
  locale("nb", {
    privacyPolicyLabels: ["personvernerklæring", "personvern"], privacyPolicyPathSlugs: ["personvernerklaering", "personvern"], cookiePolicyLabels: ["retningslinjer for informasjonskapsler"], cookiePolicyPathSlugs: ["informasjonskapsler"], cookieSettingsLabels: ["innstillinger for informasjonskapsler"], termsLabels: ["bruksvilkår"], termsPathSlugs: ["bruksvilkar"], contextHints: ["personvern", "personopplysninger", "informasjonskapsler", "samtykke"], tldHints: [".no"],
    consentControls: { accept: ["godta alle", "tillat alle"], reject: ["avvis alle", "nekt alle"], options: ["innstillinger for informasjonskapsler", "administrer preferanser"], necessaryOnly: ["bare nødvendige", "bare nødvendige informasjonskapsler"] },
  }),
  locale("et", {
    privacyPolicyLabels: ["privaatsuspoliitika", "andmekaitsetingimused", "andmekaitse"], privacyPolicyPathSlugs: ["privaatsuspoliitika", "andmekaitse"], cookiePolicyLabels: ["küpsiste poliitika"], cookiePolicyPathSlugs: ["kupsiste-poliitika"], cookieSettingsLabels: ["küpsiste seaded"], termsLabels: ["kasutustingimused"], termsPathSlugs: ["kasutustingimused"], contextHints: ["privaatsus", "isikuandmed", "küpsised", "nõusolek"], tldHints: [".ee"],
    consentControls: { accept: ["nõustu kõigiga", "luba kõik"], reject: ["keeldu kõigist", "lükka kõik tagasi"], options: ["küpsiste seaded", "halda eelistusi"], necessaryOnly: ["ainult vajalikud", "ainult vajalikud küpsised"] },
  }),
  locale("lv", {
    privacyPolicyLabels: ["privātuma politika", "datu aizsardzība"], privacyPolicyPathSlugs: ["privatuma-politika", "datu-aizsardziba"], cookiePolicyLabels: ["sīkdatņu politika"], cookiePolicyPathSlugs: ["sikdatnu-politika"], cookieSettingsLabels: ["sīkdatņu iestatījumi"], termsLabels: ["lietošanas noteikumi"], termsPathSlugs: ["lietosanas-noteikumi"], contextHints: ["privātums", "personas dati", "sīkdatnes", "piekrišana"], tldHints: [".lv"],
    consentControls: { accept: ["pieņemt visus", "atļaut visus"], reject: ["noraidīt visus", "neatļaut visus"], options: ["sīkdatņu iestatījumi", "pārvaldīt preferences"], necessaryOnly: ["tikai nepieciešamās", "tikai nepieciešamās sīkdatnes"] },
  }),
  locale("az", {
    privacyPolicyLabels: ["məxfilik siyasəti", "gizlilik siyasəti"], privacyPolicyPathSlugs: ["mexfilik-siyaseti"], cookiePolicyLabels: ["kuki siyasəti"], cookiePolicyPathSlugs: ["kuki-siyaseti"], cookieSettingsLabels: ["kuki ayarları"], termsLabels: ["istifadə şərtləri"], termsPathSlugs: ["istifade-sertleri"], contextHints: ["məxfilik", "şəxsi məlumat", "kuki", "razılıq"], tldHints: [".az"],
    consentControls: { accept: ["hamısını qəbul et", "hamısına icazə ver"], reject: ["hamısını rədd et", "hamısına icazə vermə"], options: ["kuki ayarları", "seçimləri idarə et"], necessaryOnly: ["yalnız zəruri kukilər", "yalnız zəruri"] },
  }),
  locale("gl", {
    privacyPolicyLabels: ["política de privacidade", "aviso de privacidade", "protección de datos"], privacyPolicyPathSlugs: ["politica-de-privacidade", "privacidade", "proteccion-de-datos"], cookiePolicyLabels: ["política de cookies"], cookiePolicyPathSlugs: ["politica-de-cookies"], cookieSettingsLabels: ["configuración de cookies"], termsLabels: ["termos e condicións"], termsPathSlugs: ["termos-e-condicions"], contextHints: ["privacidade", "datos persoais", "cookies", "consentimento"], tldHints: [".gal"],
    consentControls: { accept: ["aceptar todo", "permitir todo"], reject: ["rexeitar todo", "rexeitar todos"], options: ["configuración de cookies", "xestionar preferencias"], necessaryOnly: ["só as necesarias", "só cookies necesarias"] },
  }),
] as const;

export const PRIVACY_EVIDENCE_LOCALE_BY_CODE = new Map(
  PRIVACY_EVIDENCE_LOCALE_REGISTRY.map((entry) => [entry.locale, entry] as const),
);

export function privacySurfacePathsForLocale(localeCode: SupportedPrivacyEvidenceLocale): string[] {
  const entry = PRIVACY_EVIDENCE_LOCALE_BY_CODE.get(localeCode);
  if (!entry) return [];
  return [...new Set([
    ...entry.privacyPolicyPathSlugs,
    ...entry.cookiePolicyPathSlugs,
    ...entry.termsPathSlugs,
  ].map((slug) => `/${slug.replace(/^\/+/, "")}`))];
}
