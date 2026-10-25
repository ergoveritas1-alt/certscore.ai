/** Sanitized retained-policy regression clauses. These are developer fixtures,
 * not adjudicated legal-adequacy labels. No live targets or visits required. */
export const INFORMAL_GERMAN_POLICY_CLAUSES = [
  { topic: "processing_purposes", text: "Wenn Besucher Kommentare auf der Website schreiben, sammeln wir die Daten, die im Kommentar-Formular angezeigt werden, außerdem die IP-Adresse des Besuchers und den User-Agent-String, um die Erkennung von Spam zu unterstützen." },
  { topic: "recipients_or_vendor_categories", text: "Aus deiner E-Mail-Adresse kann eine anonymisierte Zeichenfolge erstellt (auch Hash genannt) und dem Beispiel-Dienst übergeben werden, um zu prüfen, ob du diesen benutzt." },
  { topic: "data_retention", text: "Wenn du einen Kommentar schreibst, wird dieser inklusive Metadaten zeitlich unbegrenzt gespeichert. So können wir Folgekommentare automatisch erkennen und freigeben." },
  { topic: "data_subject_rights", text: "Wenn du ein Konto auf dieser Website besitzt oder Kommentare geschrieben hast, kannst du einen Export deiner personenbezogenen Daten bei uns anfordern, inklusive aller Daten, die du uns mitgeteilt hast." },
] as const;

export const INADEQUATE_PURPOSE_WITNESSES = [
  "Data categories Purpose of the processing Types of Processing Legal Basis Data Source Third party recipients Device data, including the type of device, operating system used, device settings, application IDs, unique device identifiers and crash data.",
  "to withdraw your consent fully or partly. Once we have received notification that you have withdrawn your consent, we will no longer process your Personal Information for the purpose(s) to which you originally consented unless there is another legal ground for the processing. d) Complaints: Although we would rather you speak to us first, if you believe that",
] as const;

export const DATA_BOUND_PURPOSE_TABLE = "Data categories: Data you provide through our support channels; email. Purpose of the processing: To send emails and other communication. We send account notifications, service updates and security notices to support your use of our services.";
