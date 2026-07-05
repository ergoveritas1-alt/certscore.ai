import assert from "node:assert/strict";
import test from "node:test";

import {
  article13DisclosureRejectReason,
  isArticle13DisclosureEvidenceUsable,
  type Article13DisclosureRejectionMode,
} from "./article13-disclosure-rejection";

const rejectionModes: Article13DisclosureRejectionMode[] = [
  "scan_core",
  "retained_report",
  "multilingual_classifier",
];

test("Article 13 rejection contract rejects navigation chrome consistently across modes", () => {
  const navigation =
    "Skip to main content Privacy Policy Overview Terms of Service Technologies FAQ Privacy Terms Search Menu";

  for (const mode of rejectionModes) {
    assert.equal(
      article13DisclosureRejectReason(navigation, "controller_contact", { mode }),
      "page_chrome_or_navigation",
      `${mode} should reject navigation chrome`,
    );
  }
});

test("Article 13 rejection contract rejects table-of-contents snippets consistently across modes", () => {
  const tableOfContents =
    "Privacy Policy Introduction Controller contact Legal basis Recipients Retention Rights International transfers DPO Complaints";

  assert.equal(
    article13DisclosureRejectReason(tableOfContents, "legal_basis", { mode: "multilingual_classifier" }),
    "table_of_contents_only",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Datenschutzerklärung Inhaltsverzeichnis. Zwecke der Verarbeitung personenbezogener Daten. Rechtsgrundlage für die Verarbeitung personenbezogener Daten. Kategorien von Empfängern personenbezogener Daten. Speicherdauer personenbezogener Daten. Recht auf Auskunft über personenbezogene Daten. Übermittlung personenbezogener Daten in ein Drittland. Recht auf Beschwerde bei einer Aufsichtsbehörde.",
      "legal_basis",
      { mode: "multilingual_classifier" },
    ),
    "table_of_contents_only",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Introduction Information Google collects Why Google collects Your privacy controls Sharing your information Keeping your information FAQ",
      "legal_basis",
      { mode: "scan_core" },
    ),
    "table_of_contents_only",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Introduction Information Google collects Why Google collects Your privacy controls Sharing your information Keeping your information FAQ",
      "legal_basis",
      { mode: "retained_report" },
    ),
    "table_of_contents_only",
  );
});

test("Article 13 rejection contract preserves accepted legacy and multilingual examples", () => {
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "The legal basis for processing your personal data includes consent, contractual necessity, and legitimate interests.",
      "legal_basis",
      { mode: "scan_core" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "We may transfer your personal data to service providers outside the European Economic Area using safeguards.",
      "international_transfers",
      { mode: "retained_report" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "La base legale del trattamento dei dati personali comprende consenso, contratto e interessi legittimi.",
      "legal_basis",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Die Datenschutz-Grundverordnung verpflichtet uns, über personenbezogene Datenverarbeitung zu informieren. Sie sollen wissen, welche Zwecke wir verfolgen.",
      "processing_purposes",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Beim Aufruf der Website werden personenbezogene Daten verarbeitet. Verantwortlich für die Datenverarbeitung ist die Zeitverlag Gerd Bucerius GmbH & Co. KG.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Die Datenschutz-Grundverordnung verpflichtet uns, über die Verarbeitung zu informieren, etwa wie lange Ihre Informationen gespeichert werden.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Les données personnelles sont conservées pendant la durée nécessaire aux finalités du traitement.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "COMBIEN DE TEMPS CES INFORMATIONS SONT-ELLES CONSERVÉES ? D'une manière générale, vos données personnelles sont conservées en base active pour une durée conforme aux dispositions légales et proportionnelles aux finalités pour lesquelles elles ont été collectées.",
      "data_retention",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Unseren Datenschutzbeauftragten erreichen Sie unter datenschutzbeauftragter@example.test oder unserer Postadresse mit dem Zusatz Datenschutzbeauftragter.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Il responsabile della protezione dei dati risponde tramite contatto DPO e può essere contattato all'indirizzo privacy@example.test.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "RCS e CRM sono autonomi Titolari del trattamento dei dati personali raccolti su questo sito ai sensi del GDPR.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "Il titolare del trattamento dei suoi dati personali può essere contattato all'indirizzo privacy@example.test.",
      "controller_contact",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "RCS tratta i tuoi dati per le seguenti finalità, supportate dalle relative basi giuridiche.",
      "processing_purposes",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "L'elenco aggiornato dei soggetti che sono stati destinatari dei tuoi dati può essere richiesto al Titolare del trattamento.",
      "recipients_or_vendor_categories",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
  assert.equal(
    isArticle13DisclosureEvidenceUsable(
      "In bepaalde omstandigheden heeft u het recht om bezwaar te maken tegen het verwerken van uw persoonsgegevens door ons.",
      "data_subject_rights",
      { mode: "multilingual_classifier" },
    ),
    true,
  );
});

test("Article 13 rejection contract accepts BILD-style German row-specific excerpts", () => {
  const examples = [
    {
      disclosureType: "legal_basis",
      text: "IP-Adresse Rechtsgrundlage der Datenverarbeitung ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. f DSGVO.",
    },
    {
      disclosureType: "international_transfers",
      text: "Wir verarbeiten personenbezogene Daten auch in Staaten außerhalb des Europäischen Wirtschaftsraumes und nutzen Standardvertragsklauseln der EU-Kommission.",
    },
    {
      disclosureType: "supervisory_authority",
      text: "Ferner haben Sie ein Beschwerderecht bei der zuständigen Aufsichtsbehörde gemäß DSGVO.",
    },
    {
      disclosureType: "automated_decision_making_or_profiling",
      text: "Wir verzichten auf eine automatische Entscheidungsfindung oder ein Profiling im Sinne des Art. 22 DSGVO.",
    },
  ] as const;

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example.text, example.disclosureType, { mode: "multilingual_classifier" }),
      true,
      `${example.disclosureType} should be usable`,
    );
  }
});

test("Article 13 rejection contract accepts Wyborcza-style Polish row-specific excerpts", () => {
  const examples = [
    {
      disclosureType: "controller_contact",
      text: "Administratorem danych osobowych przetwarzanych w związku z korzystaniem z Serwisów jest Wyborcza sp. z o.o.",
    },
    {
      disclosureType: "dpo_contact",
      text: "W każdej sprawie dotyczącej danych osobowych można się skontaktować z naszym Inspektorem Ochrony Danych Osobowych na adres e-mail iod@example.test lub pisemnie z dopiskiem IOD.",
    },
    {
      disclosureType: "dpo_contact",
      text: "Z Administratorem można się kontaktować pisemnie na adres Nocowanie.pl Sp. z o.o. / Inspektor Ochrony Danych / ul. Nałęczowska 14 albo za pomocą poczty elektronicznej.",
    },
    {
      disclosureType: "processing_purposes",
      text: "W jakim celu i na jakiej podstawie prawnej przetwarzamy Twoje dane? Dane osobowe przetwarzamy w następujących celach związanych ze świadczeniem usług.",
    },
    {
      disclosureType: "legal_basis",
      text: "Podstawą prawną przetwarzania danych osobowych jest uzasadniony interes Administratora oraz art. 6 ust. 1 lit. f RODO.",
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      text: "Dane osobowe możemy przekazywać podmiotom przetwarzającym dane osobowe, partnerom biznesowym i dostawcom usług.",
    },
    {
      disclosureType: "data_retention",
      text: "Dane osobowe przechowujemy nie dłużej niż jest to niezbędne, do czasu cofnięcia zgody albo do czasu przedawnienia roszczeń.",
    },
    {
      disclosureType: "data_retention",
      text: "Podstawą przetwarzania jest art. 6 ust. 1 lit. f RODO, a dane przechowujemy do czasu przedawnienia roszczeń, nie dłużej niż 6 lat od zakończenia roku kalendarzowego.",
    },
    {
      disclosureType: "data_subject_rights",
      text: "Przysługuje Ci prawo dostępu do danych osobowych, sprostowania, usunięcia, ograniczenia, wniesienia sprzeciwu oraz przenoszenia danych.",
    },
    {
      disclosureType: "international_transfers",
      text: "Dane osobowe mogą być przekazywane poza Europejskim Obszarem Gospodarczym na podstawie standardowych klauzul umownych.",
    },
    {
      disclosureType: "supervisory_authority",
      text: "Masz prawo wnieść skargę do organu nadzorczego, którym jest Prezes Urzędu Ochrony Danych Osobowych.",
    },
    {
      disclosureType: "automated_decision_making_or_profiling",
      text: "W niektórych przypadkach wykorzystujemy profilowanie dla celów marketingowych w ramach przetwarzania danych osobowych.",
    },
  ] as const;

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example.text, example.disclosureType, { mode: "multilingual_classifier" }),
      true,
      `${example.disclosureType} should be usable`,
    );
  }
});

test("Article 13 rejection contract accepts Dutch healthcare row-specific excerpts", () => {
  const examples = [
    {
      disclosureType: "controller_contact",
      text: "Privacyverklaring. De organisatie is verantwoordelijk voor de verwerking van persoonsgegevens op deze website.",
    },
    {
      disclosureType: "processing_purposes",
      text: "In deze privacyverklaring staat waarvoor gebruiken wij uw persoonsgegevens en hoe we jouw persoonsgegevens gebruiken voor zorg en dienstverlening.",
    },
    {
      disclosureType: "processing_purposes",
      text: "Privacybeleid. Deze tekst beschrijft waarom en hoe wij deze gegevens opslaan wanneer u gebruik maakt van de dienst.",
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      text: "Privacybeleid. Wij leggen uit aan wie geven wij uw gegevens door en met wie delen wij uw persoonsgegevens.",
    },
    {
      disclosureType: "data_retention",
      text: "Privacybeleid. Hieronder lees je welke persoonsgegevens we verwerken, wat we hiermee doen en hoe lang we die bewaren.",
    },
    {
      disclosureType: "data_subject_rights",
      text: "Privacybeleid. Wij leggen uit welke rechten jij hierbij hebt, waaronder het recht om bezwaar te maken tegen het verwerken van persoonsgegevens.",
    },
    {
      disclosureType: "supervisory_authority",
      text: "Privacybeleid. De Autoriteit Persoonsgegevens ziet erop toe dat organisaties persoonsgegevens volgens de privacywet verwerken.",
    },
  ] as const;

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example.text, example.disclosureType, { mode: "multilingual_classifier" }),
      true,
      `${example.disclosureType} should be usable`,
    );
  }
});

test("Article 13 rejection contract accepts Spanish and Italian real-style row-specific excerpts", () => {
  const examples = [
    {
      disclosureType: "processing_purposes",
      text: "Tratamos sus datos personales para gestionar su cuenta y prestarle los servicios solicitados.",
    },
    {
      disclosureType: "legal_basis",
      text: "La legitimación para el tratamiento de sus datos personales incluye el consentimiento, la ejecución del contrato y nuestro interés legítimo.",
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      text: "Podemos comunicar sus datos personales a encargados del tratamiento, proveedores de servicios y otros destinatarios.",
    },
    {
      disclosureType: "data_retention",
      text: "Sus datos personales serán conservados durante el plazo necesario para las finalidades descritas.",
    },
    {
      disclosureType: "data_subject_rights",
      text: "Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad sobre sus datos personales.",
    },
    {
      disclosureType: "international_transfers",
      text: "Podemos transferir sus datos personales a terceros países usando cláusulas contractuales tipo.",
    },
    {
      disclosureType: "supervisory_authority",
      text: "Puede presentar una reclamación ante la Agencia Española de Protección de Datos.",
    },
    {
      disclosureType: "processing_purposes",
      text: "I dati personali sono trattati per le seguenti finalità connesse alla fornitura dei servizi.",
    },
    {
      disclosureType: "legal_basis",
      text: "Le basi giuridiche del trattamento dei dati personali includono il consenso, il contratto e il legittimo interesse.",
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      text: "Possiamo comunicare i dati personali a responsabili del trattamento, fornitori e soggetti autorizzati al trattamento.",
    },
    {
      disclosureType: "data_retention",
      text: "I dati personali saranno conservati per il tempo necessario al perseguimento delle finalità indicate.",
    },
    {
      disclosureType: "data_subject_rights",
      text: "Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità sui dati personali.",
    },
    {
      disclosureType: "international_transfers",
      text: "Possiamo trasferire i dati personali verso paesi terzi usando clausole contrattuali standard.",
    },
    {
      disclosureType: "supervisory_authority",
      text: "Puoi proporre reclamo al Garante per la protezione dei dati personali.",
    },
  ] as const;

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example.text, example.disclosureType, { mode: "multilingual_classifier" }),
      true,
      `${example.disclosureType} should be usable`,
    );
  }
});

test("Article 13 rejection contract rejects DPO nouns without a contact anchor", () => {
  assert.equal(
    article13DisclosureRejectReason(
      "Die Behörde der Datenschutzbeauftragten beaufsichtigt bisher den Nachrichtendienst. Die Datenschutzbeauftragte wehrt sich gegen den Entzug der Kontrolle.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    "insufficient_row_specific_terms",
  );
  assert.equal(
    article13DisclosureRejectReason(
      "Responsabile della Protezione dei Dati Rinvio ad altre informative di ANSA Rinvio alla Privacy Policy dell'App ANSA.",
      "dpo_contact",
      { mode: "multilingual_classifier" },
    ),
    "insufficient_row_specific_terms",
  );
});

test("Article 13 multilingual retained report accepts row-specific English policy excerpts", () => {
  const examples = [
    {
      disclosureType: "data_subject_rights",
      text: "You may download a copy of your data through privacy controls.",
    },
    {
      disclosureType: "recipients_or_vendor_categories",
      text: "We share information with service providers and partners that process data on our behalf.",
    },
    {
      disclosureType: "international_transfers",
      text: "Data transfers. We may process information on servers outside the European Economic Area using standard contractual clauses.",
    },
    {
      disclosureType: "data_retention",
      text: "Retaining your information. Some data is deleted or anonymized automatically and some records are retained as long as necessary for legal purposes.",
    },
  ] as const;

  for (const example of examples) {
    assert.equal(
      isArticle13DisclosureEvidenceUsable(example.text, example.disclosureType, { mode: "multilingual_classifier" }),
      true,
      `${example.disclosureType} should be usable`,
    );
  }
});
