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
