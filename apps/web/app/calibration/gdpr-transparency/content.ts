export const GDPR_TRANSPARENCY_CANARY_LOCALES = ["pt", "ru", "ja", "zh", "ar", "sv"] as const;

export type GdprTransparencyCanaryLocale = (typeof GDPR_TRANSPARENCY_CANARY_LOCALES)[number];

type CanaryCopy = {
  language: string;
  privacyLabel: string;
  title: string;
  paragraphs: readonly string[];
};

export const GDPR_TRANSPARENCY_CANARY_COPY: Record<GdprTransparencyCanaryLocale, CanaryCopy> = {
  pt: {
    language: "pt-PT",
    privacyLabel: "Política de privacidade",
    title: "Política de privacidade — página de calibração",
    paragraphs: [
      "O responsável pelo tratamento de dados pessoais fornece o contato do controlador e o contato do encarregado de proteção de dados. Explicamos as finalidades do tratamento de dados pessoais.",
      "A base legal para o tratamento de dados pessoais inclui consentimento e contrato. Também descrevemos as categorias de destinatários dos dados pessoais e o prazo de conservação dos dados pessoais.",
      "Você tem o direito de acesso aos dados pessoais. Explicamos as transferências internacionais de dados pessoais, o direito de apresentar reclamação à Autoridade Nacional de Proteção de Dados e as decisões automatizadas com dados pessoais.",
    ],
  },
  ru: {
    language: "ru",
    privacyLabel: "Политика конфиденциальности",
    title: "Политика конфиденциальности — калибровочная страница",
    paragraphs: [
      "Оператор персональных данных указывает контакт ответственного по защите данных. Мы описываем цели обработки персональных данных.",
      "Правовые основания обработки персональных данных включают согласие и договор. Мы указываем категории получателей персональных данных и срок хранения персональных данных.",
      "Мы объясняем права субъекта персональных данных, трансграничную передачу персональных данных, право подать жалобу в надзорный орган и автоматизированное принятие решений с использованием персональных данных.",
    ],
  },
  ja: {
    language: "ja",
    privacyLabel: "プライバシーポリシー",
    title: "プライバシーポリシー — 校正ページ",
    paragraphs: [
      "個人データの管理者はデータ保護責任者への連絡先を示します。個人データを処理する目的について説明します。",
      "個人データ処理の法的根拠、個人データの受領者のカテゴリー、個人データの保存期間について説明します。",
      "データ主体の権利、個人データの国際移転、監督機関に苦情を申し立てる権利、個人データを用いた自動意思決定について説明します。",
    ],
  },
  zh: {
    language: "zh-Hant",
    privacyLabel: "隱私權政策",
    title: "隱私權政策 — 校準頁面",
    paragraphs: [
      "個人資料控制者提供資料保護長的聯絡方式，並說明處理個人資料的目的。",
      "我們說明處理個人資料的法律依據、個人資料接收者的類別以及個人資料的保存期限。",
      "我們說明資料當事人的權利、個人資料的跨境傳輸、向監管機構投訴的權利及使用個人資料進行自動化決策。",
    ],
  },
  ar: {
    language: "ar",
    privacyLabel: "سياسة الخصوصية",
    title: "سياسة الخصوصية — صفحة المعايرة",
    paragraphs: [
      "يقدم مراقب البيانات الشخصية بيانات الاتصال بمسؤول حماية البيانات. نشرح أغراض معالجة البيانات الشخصية.",
      "نشرح الأساس القانوني لمعالجة البيانات الشخصية وفئات مستلمي البيانات الشخصية ومدة الاحتفاظ بالبيانات الشخصية.",
      "نشرح حقوق صاحب البيانات والنقل الدولي للبيانات الشخصية والحق في تقديم شكوى إلى سلطة رقابية واتخاذ القرارات الآلية باستخدام البيانات الشخصية.",
    ],
  },
  sv: {
    language: "sv",
    privacyLabel: "Integritetspolicy",
    title: "Integritetspolicy — kalibreringssida",
    paragraphs: [
      "Personuppgiftsansvarig anger kontaktuppgifter till dataskyddsombudet. Vi beskriver ändamålen med behandlingen av personuppgifter.",
      "Vi beskriver rättslig grund för behandling av personuppgifter, kategorier av mottagare av personuppgifter och lagringstid för personuppgifter.",
      "Vi beskriver den registrerades rättigheter, internationella överföringar av personuppgifter, rätt att lämna in klagomål till en tillsynsmyndighet och automatiserat beslutsfattande med personuppgifter.",
    ],
  },
};

export function isGdprTransparencyCanaryLocale(value: string): value is GdprTransparencyCanaryLocale {
  return GDPR_TRANSPARENCY_CANARY_LOCALES.includes(value as GdprTransparencyCanaryLocale);
}
