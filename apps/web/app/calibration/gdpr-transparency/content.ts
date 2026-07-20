export const GDPR_TRANSPARENCY_CANARY_LOCALES = [
  "pt", "ru", "ja", "zh", "ar", "sv", "ro", "cs", "el", "hu", "da",
  "fi", "sk", "bg", "hr", "nb", "sl", "lt", "lv", "et", "uk", "tr",
] as const;

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
  ro: {
    language: "ro",
    privacyLabel: "Politică de confidențialitate",
    title: "Politică de confidențialitate — pagină de calibrare",
    paragraphs: [
      "Operatorul de date cu caracter personal furnizează datele de contact ale responsabilului cu protecția datelor. Explicăm scopurile prelucrării datelor cu caracter personal.",
      "Explicăm temeiul juridic al prelucrării datelor cu caracter personal, categoriile de destinatari ai datelor cu caracter personal și perioada de păstrare a datelor cu caracter personal.",
      "Explicăm drepturile persoanei vizate, transferurile internaționale de date cu caracter personal, dreptul de a depune o plângere la o autoritate de supraveghere și procesul decizional automatizat privind datele cu caracter personal.",
    ],
  },
  cs: {
    language: "cs",
    privacyLabel: "Zásady ochrany osobních údajů",
    title: "Zásady ochrany osobních údajů — kalibrační stránka",
    paragraphs: [
      "Správce osobních údajů uvádí kontaktní údaje pověřence pro ochranu osobních údajů. Popisujeme účely zpracování osobních údajů.",
      "Popisujeme právní základ pro zpracování osobních údajů, kategorie příjemců osobních údajů a dobu uložení osobních údajů.",
      "Popisujeme práva subjektu údajů, mezinárodní předávání osobních údajů, právo podat stížnost u dozorového úřadu a automatizované rozhodování včetně profilování.",
    ],
  },
  el: {
    language: "el",
    privacyLabel: "Πολιτική απορρήτου",
    title: "Πολιτική απορρήτου — σελίδα βαθμονόμησης",
    paragraphs: [
      "Ο υπεύθυνος επεξεργασίας δεδομένων προσωπικού χαρακτήρα παρέχει τα στοιχεία επικοινωνίας του υπευθύνου προστασίας δεδομένων. Περιγράφουμε τους σκοπούς της επεξεργασίας δεδομένων προσωπικού χαρακτήρα.",
      "Περιγράφουμε τη νομική βάση για την επεξεργασία δεδομένων προσωπικού χαρακτήρα, τις κατηγορίες αποδεκτών των δεδομένων προσωπικού χαρακτήρα και το διάστημα αποθήκευσης των δεδομένων προσωπικού χαρακτήρα.",
      "Περιγράφουμε τα δικαιώματα του υποκειμένου των δεδομένων, τις διεθνείς διαβιβάσεις δεδομένων προσωπικού χαρακτήρα, το δικαίωμα υποβολής καταγγελίας σε εποπτική αρχή και την αυτοματοποιημένη λήψη αποφάσεων με δεδομένα προσωπικού χαρακτήρα.",
    ],
  },
  hu: {
    language: "hu",
    privacyLabel: "Adatvédelmi tájékoztató",
    title: "Adatvédelmi tájékoztató — kalibrációs oldal",
    paragraphs: [
      "A személyes adatok adatkezelője megadja az adatvédelmi tisztviselő elérhetőségeit. Ismertetjük a személyes adatok kezelésének célját.",
      "Ismertetjük az adatkezelés jogalapját, a személyes adatok címzettjeinek kategóriáit és a személyes adatok tárolásának időtartamát.",
      "Ismertetjük az érintett jogait, a személyes adatok nemzetközi továbbítását, a panasz benyújtásának jogát valamely felügyeleti hatósághoz és a személyes adatok felhasználásával történő automatizált döntéshozatalt.",
    ],
  },
  da: {
    language: "da",
    privacyLabel: "Privatlivspolitik",
    title: "Privatlivspolitik — kalibreringsside",
    paragraphs: [
      "Den dataansvarlige angiver kontaktoplysninger for databeskyttelsesrådgiveren. Vi beskriver formålene med behandlingen af personoplysninger.",
      "Vi beskriver retsgrundlaget for behandlingen af personoplysninger, kategorier af modtagere af personoplysninger og opbevaringsperioden for personoplysninger.",
      "Vi beskriver den registreredes rettigheder, internationale overførsler af personoplysninger, retten til at indgive en klage til en tilsynsmyndighed og automatiserede afgørelser med personoplysninger.",
    ],
  },
  fi: {
    language: "fi",
    privacyLabel: "Tietosuojakäytäntö",
    title: "Tietosuojakäytäntö — kalibrointisivu",
    paragraphs: [
      "Rekisterinpitäjän yhteystiedot ja tietosuojavastaavan yhteystiedot annetaan tässä ilmoituksessa. Kuvaamme henkilötietojen käsittelyn tarkoitukset.",
      "Kuvaamme henkilötietojen käsittelyn oikeusperusteen, henkilötietojen vastaanottajaryhmät ja henkilötietojen säilytysajan.",
      "Kuvaamme rekisteröidyn oikeudet, henkilötietojen kansainväliset siirrot, oikeuden tehdä valitus valvontaviranomaiselle ja automatisoidun päätöksenteon mukaan lukien profilointi.",
    ],
  },
  sk: {
    language: "sk",
    privacyLabel: "Zásady ochrany osobných údajov",
    title: "Zásady ochrany osobných údajov — kalibračná stránka",
    paragraphs: [
      "Kontaktné údaje prevádzkovateľa a kontaktné údaje zodpovednej osoby sú uvedené v tomto oznámení. Opisujeme účely spracúvania osobných údajov.",
      "Opisujeme právny základ spracúvania osobných údajov, kategórie príjemcov osobných údajov a dobu uchovávania osobných údajov.",
      "Opisujeme práva dotknutej osoby, medzinárodné prenosy osobných údajov, právo podať sťažnosť dozornému orgánu a automatizované rozhodovanie vrátane profilovania.",
    ],
  },
  bg: {
    language: "bg",
    privacyLabel: "Политика за поверителност",
    title: "Политика за поверителност — страница за калибриране",
    paragraphs: [
      "Данните за контакт на администратора и данните за контакт на длъжностното лице по защита на данните са посочени тук. Описваме целите на обработването на лични данни.",
      "Описваме правното основание за обработването на лични данни, категориите получатели на лични данни и срока за съхранение на личните данни.",
      "Описваме правата на субекта на данните, международното предаване на лични данни, правото на жалба до надзорен орган и автоматизираното вземане на решения включително профилиране.",
    ],
  },
  hr: {
    language: "hr",
    privacyLabel: "Pravila privatnosti",
    title: "Pravila privatnosti — kalibracijska stranica",
    paragraphs: [
      "Kontaktni podaci voditelja obrade i kontaktni podaci službenika za zaštitu podataka navedeni su u ovoj obavijesti. Opisujemo svrhe obrade osobnih podataka.",
      "Opisujemo pravnu osnovu za obradu osobnih podataka, kategorije primatelja osobnih podataka i razdoblje pohrane osobnih podataka.",
      "Opisujemo prava ispitanika, međunarodne prijenose osobnih podataka, pravo na podnošenje pritužbe nadzornom tijelu i automatizirano donošenje odluka uključujući izradu profila.",
    ],
  },
  nb: {
    language: "nb",
    privacyLabel: "Personvernerklæring",
    title: "Personvernerklæring — kalibreringsside",
    paragraphs: [
      "Kontaktopplysninger til den behandlingsansvarlige og personvernombudets kontaktopplysninger oppgis her. Vi beskriver formålene med behandlingen av personopplysninger.",
      "Vi beskriver rettslig grunnlag for behandling av personopplysninger, kategorier av mottakere av personopplysninger og lagringsperiode for personopplysninger.",
      "Vi beskriver den registrertes rettigheter, internasjonale overføringer av personopplysninger, rett til å klage til en tilsynsmyndighet og automatiserte avgjørelser herunder profilering.",
    ],
  },
  sl: {
    language: "sl",
    privacyLabel: "Pravilnik o zasebnosti",
    title: "Pravilnik o zasebnosti — kalibracijska stran",
    paragraphs: [
      "Kontaktni podatki upravljavca in kontaktni podatki pooblaščene osebe za varstvo podatkov so navedeni tukaj. Opisujemo namene obdelave osebnih podatkov.",
      "Opisujemo pravno podlago za obdelavo osebnih podatkov, kategorije prejemnikov osebnih podatkov in obdobje hrambe osebnih podatkov.",
      "Opisujemo pravice posameznika na katerega se nanašajo osebni podatki, mednarodne prenose osebnih podatkov, pravico do vložitve pritožbe pri nadzornem organu in avtomatizirano sprejemanje odločitev vključno z oblikovanjem profilov.",
    ],
  },
  lt: {
    language: "lt",
    privacyLabel: "Privatumo politika",
    title: "Privatumo politika — kalibravimo puslapis",
    paragraphs: [
      "Duomenų valdytojo kontaktiniai duomenys ir duomenų apsaugos pareigūno kontaktiniai duomenys pateikiami čia. Aprašome asmens duomenų tvarkymo tikslus.",
      "Aprašome teisinį asmens duomenų tvarkymo pagrindą, asmens duomenų gavėjų kategorijas ir asmens duomenų saugojimo laikotarpį.",
      "Aprašome duomenų subjekto teises, tarptautinį asmens duomenų perdavimą, teisę pateikti skundą priežiūros institucijai ir automatizuotą sprendimų priėmimą įskaitant profiliavimą.",
    ],
  },
  lv: {
    language: "lv",
    privacyLabel: "Privātuma politika",
    title: "Privātuma politika — kalibrēšanas lapa",
    paragraphs: [
      "Pārziņa kontaktinformācija un datu aizsardzības speciālista kontaktinformācija ir norādīta šeit. Aprakstām personas datu apstrādes nolūkus.",
      "Aprakstām personas datu apstrādes juridisko pamatu, personas datu saņēmēju kategorijas un personas datu glabāšanas laikposmu.",
      "Aprakstām datu subjekta tiesības, personas datu starptautisku nosūtīšanu, tiesības iesniegt sūdzību uzraudzības iestādei un automatizētu lēmumu pieņemšanu tostarp profilēšanu.",
    ],
  },
  et: {
    language: "et",
    privacyLabel: "Privaatsuspoliitika",
    title: "Privaatsuspoliitika — kalibreerimisleht",
    paragraphs: [
      "Vastutava töötleja kontaktandmed ja andmekaitsespetsialisti kontaktandmed on esitatud siin. Kirjeldame isikuandmete töötlemise eesmärke.",
      "Kirjeldame isikuandmete töötlemise õiguslikku alust, isikuandmete vastuvõtjate kategooriaid ja isikuandmete säilitamise ajavahemikku.",
      "Kirjeldame andmesubjekti õigusi, isikuandmete rahvusvahelist edastamist, õigust esitada kaebus järelevalveasutusele ja automatiseeritud otsuste tegemist sealhulgas profiilianalüüsi.",
    ],
  },
  uk: {
    language: "uk",
    privacyLabel: "Політика конфіденційності",
    title: "Політика конфіденційності — калібрувальна сторінка",
    paragraphs: [
      "Контактні дані володільця персональних даних і контактні дані відповідальної особи із захисту даних наведено тут. Описуємо цілі обробки персональних даних.",
      "Описуємо правову підставу для обробки персональних даних, категорії одержувачів персональних даних і строк зберігання персональних даних.",
      "Описуємо права суб'єкта персональних даних, міжнародну передачу персональних даних, право подати скаргу до наглядового органу й автоматизоване прийняття рішень включаючи профілювання.",
    ],
  },
  tr: {
    language: "tr",
    privacyLabel: "Gizlilik politikası",
    title: "Gizlilik politikası — kalibrasyon sayfası",
    paragraphs: [
      "Veri sorumlusunun iletişim bilgileri ve veri koruma görevlisinin iletişim bilgileri burada verilir. Kişisel verilerin işlenme amaçlarını açıklıyoruz.",
      "Kişisel verilerin işlenmesinin hukuki dayanağını, kişisel veri alıcılarının kategorilerini ve kişisel verilerin saklama süresini açıklıyoruz.",
      "İlgili kişinin haklarını, kişisel verilerin uluslararası aktarımını, denetim makamına şikayette bulunma hakkını ve otomatik karar verme ve profillemeyi açıklıyoruz.",
    ],
  },
};

const MIN_CANARY_POLICY_TEXT_CHARS = 2_800;

export function buildGdprTransparencyCanaryPolicyParagraphs(locale: GdprTransparencyCanaryLocale) {
  const source = GDPR_TRANSPARENCY_CANARY_COPY[locale].paragraphs;
  const paragraphs: string[] = [];
  let retainedLength = 0;
  for (let index = 0; retainedLength < MIN_CANARY_POLICY_TEXT_CHARS; index += 1) {
    const paragraph = source[index % source.length];
    if (!paragraph) break;
    paragraphs.push(paragraph);
    retainedLength += paragraph.length + 1;
  }
  return paragraphs;
}

export function isGdprTransparencyCanaryLocale(value: string): value is GdprTransparencyCanaryLocale {
  return GDPR_TRANSPARENCY_CANARY_LOCALES.includes(value as GdprTransparencyCanaryLocale);
}
