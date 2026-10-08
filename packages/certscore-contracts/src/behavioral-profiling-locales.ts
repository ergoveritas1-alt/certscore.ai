import type { SupportedGdprTransparencyLocale } from "./supported-languages";

// Each pair binds an affirmative, first-party observation of individual
// behavior to interest evaluation or interest-based content selection. The
// vocabulary is intentionally narrower than generic analytics/personalization.
export const BEHAVIORAL_PROFILING_LOCALE_VOCABULARY = {
  en: { tracking: ["we use cookies to track", "your browsing behavior and interests"], newsletter: ["we analyze your newsletter clicks", "content to your interests"], negation: ["not", "never", "aggregate", "anonymous"] },
  de: { tracking: ["wir verwenden cookies um", "ihre interessen zu analysieren"], newsletter: ["wir analysieren ihre klicks in unserem newsletter", "inhalte auf ihre interessen abzustimmen"], negation: ["nicht", "keine", "niemals", "aggregiert", "anonym"] },
  fr: { tracking: ["nous utilisons des cookies pour", "analyser vos centres d’intérêt"], newsletter: ["nous analysons vos clics dans notre newsletter", "adapter le contenu à vos centres d’intérêt"], negation: ["ne", "pas", "jamais", "agrégées", "anonymes"] },
  es: { tracking: ["utilizamos cookies para", "analizar sus intereses"], newsletter: ["analizamos sus clics en nuestro boletín", "adaptar el contenido a sus intereses"], negation: ["no", "nunca", "agregados", "anónimos"] },
  it: { tracking: ["utilizziamo cookie per", "analizzare i suoi interessi"], newsletter: ["analizziamo i suoi clic nella nostra newsletter", "adattare i contenuti ai suoi interessi"], negation: ["non", "mai", "aggregati", "anonimi"] },
  nl: { tracking: ["wij gebruiken cookies om", "uw interesses te analyseren"], newsletter: ["wij analyseren uw klikken in onze nieuwsbrief", "inhoud op uw interesses af te stemmen"], negation: ["niet", "nooit", "geaggregeerd", "anoniem"] },
  pl: { tracking: ["używamy plików cookie aby", "analizować twoje zainteresowania"], newsletter: ["analizujemy twoje kliknięcia w naszym newsletterze", "dopasować treści do twoich zainteresowań"], negation: ["nie", "nigdy", "zagregowane", "anonimowe"] },
  pt: { tracking: ["utilizamos cookies para", "analisar os seus interesses"], newsletter: ["analisamos os seus cliques na nossa newsletter", "adaptar o conteúdo aos seus interesses"], negation: ["não", "nunca", "agregados", "anónimos", "anônimos"] },
  ru: { tracking: ["мы используем файлы cookie чтобы", "анализировать ваши интересы"], newsletter: ["мы анализируем ваши клики в нашей рассылке", "адаптировать содержание к вашим интересам"], negation: ["не", "никогда", "агрегированные", "анонимные"] },
  ja: { tracking: ["当社はcookieを使用して", "お客様の興味を分析します"], newsletter: ["当社はニュースレター内のお客様のクリックを分析し", "お客様の興味に合わせて内容を調整します"], negation: ["しません", "しない", "集計のみ", "匿名"] },
  zh: { tracking: ["我们使用cookie", "分析您的兴趣"], newsletter: ["我们分析您在我们的新闻通讯中的点击", "根据您的兴趣调整内容"], negation: ["不", "不会", "仅汇总", "匿名"] },
  ar: { tracking: ["نستخدم ملفات تعريف الارتباط", "لتحليل اهتماماتك"], newsletter: ["نحلل نقراتك في نشرتنا الإخبارية", "لتخصيص المحتوى حسب اهتماماتك"], negation: ["لا", "لن", "مجمعة", "مجهولة"] },
  sv: { tracking: ["vi använder cookies för att", "analysera dina intressen"], newsletter: ["vi analyserar dina klick i vårt nyhetsbrev", "anpassa innehållet efter dina intressen"], negation: ["inte", "aldrig", "aggregerade", "anonyma"] },
  ro: { tracking: ["folosim cookie-uri pentru a", "analiza interesele dumneavoastră"], newsletter: ["analizăm clicurile dumneavoastră în buletinul nostru informativ", "adapta conținutul la interesele dumneavoastră"], negation: ["nu", "niciodată", "agregate", "anonime"] },
  cs: { tracking: ["používáme soubory cookie k", "analýze vašich zájmů"], newsletter: ["analyzujeme vaše kliknutí v našem newsletteru", "přizpůsobili obsah vašim zájmům"], negation: ["ne", "nikdy", "souhrnné", "anonymní"] },
  el: { tracking: ["χρησιμοποιούμε cookies για", "να αναλύσουμε τα ενδιαφέροντά σας"], newsletter: ["αναλύουμε τα κλικ σας στο ενημερωτικό μας δελτίο", "να προσαρμόσουμε το περιεχόμενο στα ενδιαφέροντά σας"], negation: ["δεν", "ποτέ", "συγκεντρωτικά", "ανώνυμα"] },
  hu: { tracking: ["sütiket használunk", "az ön érdeklődési körének elemzésére"], newsletter: ["elemezzük a hírlevelünkben végzett kattintásait", "a tartalmat az ön érdeklődési köréhez igazítsuk"], negation: ["nem", "soha", "összesített", "névtelen"] },
  da: { tracking: ["vi bruger cookies til at", "analysere dine interesser"], newsletter: ["vi analyserer dine klik i vores nyhedsbrev", "tilpasse indholdet til dine interesser"], negation: ["ikke", "aldrig", "aggregerede", "anonyme"] },
  fi: { tracking: ["käytämme evästeitä", "kiinnostuksen kohteidesi analysointiin"], newsletter: ["analysoimme klikkauksiasi uutiskirjeessämme", "mukauttaaksemme sisällön kiinnostuksen kohteisiisi"], negation: ["emme", "ei", "koskaan", "koottuja", "anonyymejä"] },
  sk: { tracking: ["používame súbory cookie na", "analýzu vašich záujmov"], newsletter: ["analyzujeme vaše kliknutia v našom newsletteri", "prispôsobili obsah vašim záujmom"], negation: ["nie", "nikdy", "súhrnné", "anonymné"] },
  bg: { tracking: ["използваме бисквитки за", "анализ на вашите интереси"], newsletter: ["анализираме вашите кликвания в нашия бюлетин", "адаптираме съдържанието към вашите интереси"], negation: ["не", "никога", "обобщени", "анонимни"] },
  hr: { tracking: ["koristimo kolačiće za", "analizu vaših interesa"], newsletter: ["analiziramo vaše klikove u našem biltenu", "prilagodili sadržaj vašim interesima"], negation: ["ne", "nikada", "zbirne", "anonimne"] },
  nb: { tracking: ["vi bruker informasjonskapsler for å", "analysere interessene dine"], newsletter: ["vi analyserer klikkene dine i nyhetsbrevet vårt", "tilpasse innholdet til interessene dine"], negation: ["ikke", "aldri", "aggregerte", "anonyme"] },
  sl: { tracking: ["uporabljamo piškotke za", "analizo vaših interesov"], newsletter: ["analiziramo vaše klike v našem glasilu", "prilagodili vsebino vašim interesom"], negation: ["ne", "nikoli", "združene", "anonimne"] },
  lt: { tracking: ["naudojame slapukus", "jūsų interesams analizuoti"], newsletter: ["analizuojame jūsų paspaudimus mūsų naujienlaiškyje", "pritaikytume turinį prie jūsų interesų"], negation: ["ne", "niekada", "apibendrinti", "anoniminiai"] },
  lv: { tracking: ["mēs izmantojam sīkdatnes", "jūsu interešu analīzei"], newsletter: ["mēs analizējam jūsu klikšķus mūsu jaunumu vēstulē", "pielāgotu saturu jūsu interesēm"], negation: ["ne", "nekad", "apkopoti", "anonīmi"] },
  et: { tracking: ["kasutame küpsiseid", "teie huvide analüüsimiseks"], newsletter: ["analüüsime teie klikke meie uudiskirjas", "kohandada sisu teie huvidele"], negation: ["ei", "mitte", "kunagi", "koondatud", "anonüümsed"] },
  uk: { tracking: ["ми використовуємо файли cookie щоб", "аналізувати ваші інтереси"], newsletter: ["ми аналізуємо ваші кліки в нашій розсилці", "адаптувати вміст до ваших інтересів"], negation: ["не", "ніколи", "узагальнені", "анонімні"] },
  tr: { tracking: ["çerezleri", "ilgi alanlarınızı analiz etmek için kullanıyoruz"], newsletter: ["bültenimizdeki tıklamalarınızı analiz ediyoruz", "içeriği ilgi alanlarınıza göre uyarlamak için"], negation: ["değil", "asla", "toplu", "anonim"] },
  fa: { tracking: ["ما از کوکی‌ها", "برای تحلیل علایق شما استفاده می‌کنیم"], newsletter: ["ما کلیک‌های شما در خبرنامه خود را تحلیل می‌کنیم", "محتوا را با علایق شما تطبیق دهیم"], negation: ["نمی", "هرگز", "تجمیعی", "ناشناس"] },
  vi: { tracking: ["chúng tôi sử dụng cookie để", "phân tích sở thích của bạn"], newsletter: ["chúng tôi phân tích các lần nhấp của bạn trong bản tin của chúng tôi", "điều chỉnh nội dung theo sở thích của bạn"], negation: ["không", "chưa", "tổng hợp", "ẩn danh"] },
  id: { tracking: ["kami menggunakan cookie untuk", "menganalisis minat anda"], newsletter: ["kami menganalisis klik anda dalam buletin kami", "menyesuaikan konten dengan minat anda"], negation: ["tidak", "bukan", "agregat", "anonim"] },
  ko: { tracking: ["당사는 쿠키를 사용하여", "귀하의 관심사를 분석합니다"], newsletter: ["당사는 뉴스레터에서 귀하의 클릭을 분석하여", "귀하의 관심사에 맞게 콘텐츠를 조정합니다"], negation: ["않", "아니", "집계만", "익명"] },
  th: { tracking: ["เราใช้คุกกี้เพื่อ", "วิเคราะห์ความสนใจของคุณ"], newsletter: ["เราวิเคราะห์การคลิกของคุณในจดหมายข่าวของเรา", "ปรับเนื้อหาให้ตรงกับความสนใจของคุณ"], negation: ["ไม่", "เฉพาะภาพรวม", "นิรนาม"] },
  he: { tracking: ["אנו משתמשים בעוגיות כדי", "לנתח את תחומי העניין שלך"], newsletter: ["אנו מנתחים את הקליקים שלך בניוזלטר שלנו", "להתאים את התוכן לתחומי העניין שלך"], negation: ["לא", "לעולם לא", "מצטברים", "אנונימיים"] },
  sr: { tracking: ["користимо колачиће за", "анализу ваших интересовања"], newsletter: ["анализирамо ваше кликове у нашем билтену", "прилагодили садржај вашим интересовањима"], negation: ["не", "никада", "збирне", "анонимне"] },
  ca: { tracking: ["utilitzem galetes per", "analitzar els seus interessos"], newsletter: ["analitzem els seus clics al nostre butlletí", "adaptar el contingut als seus interessos"], negation: ["no", "mai", "agregats", "anònims"] },
  hi: { tracking: ["हम आपकी रुचियों का विश्लेषण करने के लिए", "कुकीज़ का उपयोग करते हैं"], newsletter: ["हम अपने न्यूज़लेटर में आपके क्लिक का विश्लेषण करते हैं", "सामग्री को आपकी रुचियों के अनुसार ढाल सकें"], negation: ["नहीं", "कभी नहीं", "समेकित", "अनाम"] },
  az: { tracking: ["biz kukilərdən", "maraqlarınızı təhlil etmək üçün istifadə edirik"], newsletter: ["bülletenimizdəki kliklərinizi təhlil edirik", "məzmunu maraqlarınıza uyğunlaşdırmaq üçün"], negation: ["deyil", "heç vaxt", "ümumiləşdirilmiş", "anonim"] },
  gl: { tracking: ["utilizamos cookies para", "analizar os seus intereses"], newsletter: ["analizamos os seus clics no noso boletín", "adaptar o contido aos seus intereses"], negation: ["non", "nunca", "agregados", "anónimos"] },
} as const satisfies Record<SupportedGdprTransparencyLocale, {
  tracking: readonly [string, string]; newsletter: readonly [string, string]; negation: readonly string[];
}>;

export function normalizeBehavioralProfilingText(value: string) {
  return value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, " ").replace(/\u0640/g, "")
    .replace(/[‘’´`]/g, "'").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/־/g, " ").replace(/\s*[-–—]\s*/g, "-")
    .replace(/[.,;:!?()[\]{}。、，；：！？（）،؛؟।॥]+/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

const escape = (value: string) => normalizeBehavioralProfilingText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseBoundary = (locale: string) => ["ja", "zh", "ko", "th"].includes(locale)
  ? ["", ""] : ["(?<![\\p{L}\\p{N}])", "(?![\\p{L}\\p{N}])"];

// Additional writing systems and familiar policy wording stay within the same
// locale and affirmative-practice threshold; they do not infer a language.
const SCRIPT_AND_WORDING_VARIANTS = [
  ["zh", {tracking: ["我們使用cookie", "分析您的興趣"], newsletter: ["我們分析您在我們的電子報中的點擊", "根據您的興趣調整內容"], negation: ["不", "不會", "僅匯總", "匿名"]}],
  ["sr", {tracking: ["koristimo kolačiće za", "analizu vaših interesovanja"], newsletter: ["analiziramo vaše klikove u našem biltenu", "prilagodili sadržaj vašim interesovanjima"], negation: ["ne", "nikada", "zbirne", "anonimne"]}],
  ["en", {tracking: ["we use cookies to analyse", "your browsing behaviour and interests"], newsletter: ["we analyse your newsletter clicks", "content to your interests"], negation: ["not", "never", "aggregate", "anonymous"]}],
  ["de", {tracking: ["wir verwenden cookies um", "welche unserer seiten besucht werden und fur sie von interesse sind"], newsletter: ["wir analysieren ihre klicks in unserem newsletter", "angebote auf ihre interessen abzustimmen"], negation: ["nicht", "keine", "niemals", "aggregiert", "anonym"]}],
] as const;

export const BEHAVIORAL_PROFILING_LOCALE_RULES = [
  ...Object.entries(BEHAVIORAL_PROFILING_LOCALE_VOCABULARY), ...SCRIPT_AND_WORDING_VARIANTS,
].flatMap(([locale, words]) => {
  const [left, right] = phraseBoundary(locale);
  return (["tracking", "newsletter"] as const).map(kind => ({
    locale: locale as SupportedGdprTransparencyLocale,
    basis: kind === "tracking" ? "individual_interest_tracking" as const : "newsletter_engagement_personalization" as const,
    start: normalizeBehavioralProfilingText(words[kind][0]),
    pattern: new RegExp(`${left}${escape(words[kind][0])}${right}.{0,180}?${left}${escape(words[kind][1])}${right}`, "u"),
    excludePattern: new RegExp(`${left}(?:${words.negation.map(escape).join("|")})${right}`, "u"),
  }));
});

export type BehavioralProfilingLocaleRule = typeof BEHAVIORAL_PROFILING_LOCALE_RULES[number];

/** Input is already normalized by the canonical classifier. Validate the exact
 * rule, rather than borrowing an affirmative result from another practice. */
export function findBehavioralProfilingRuleMatch(text: string, rule: BehavioralProfilingLocaleRule) {
  if (!text.includes(rule.start)) return null;
  for (const match of text.matchAll(new RegExp(rule.pattern.source, "gu"))) {
    // Some languages put negation before the affirmative-looking verb phrase.
    // Check its immediate context as well as the retained practice clause.
    const before = text.slice(Math.max(0, match.index - 40), match.index).trim().split(/\s+/u).slice(-2).join(" ");
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 40).trim().split(/\s+/u).slice(0, 2).join(" ");
    const context = `${before} ${match[0]} ${after}`;
    if (!rule.excludePattern.test(context)) {
      return {locale: rule.locale, basis: rule.basis, clause: match[0]};
    }
  }
  return null;
}

export function findLocalizedBehavioralProfilingDisclosure(value: string, locales?: readonly SupportedGdprTransparencyLocale[]) {
  const text = normalizeBehavioralProfilingText(value);
  for (const rule of BEHAVIORAL_PROFILING_LOCALE_RULES) {
    if (locales?.length && !locales.includes(rule.locale)) continue;
    const match = findBehavioralProfilingRuleMatch(text, rule);
    if (match) return match;
  }
  return null;
}
