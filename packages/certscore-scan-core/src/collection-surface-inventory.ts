import {
  COLLECTION_SURFACE_INVENTORY_VERSION,
  MAX_COLLECTION_SURFACE_FIELDS,
  MAX_COLLECTION_SURFACE_FIELDS_PER_FORM,
  MAX_COLLECTION_SURFACE_FORMS,
  collectionSurfaceInventorySchema,
  type CollectionSurfaceInventory,
  type CollectionSurfaceObservation,
  type CollectionSurfaceSemanticCategory,
} from "@certscore/contracts";
import { getRegistrableDomain } from "./domain-utils.js";

export const MAX_COLLECTION_SURFACE_INSPECTED_FORMS = 50;
export const MAX_COLLECTION_SURFACE_INSPECTED_FIELDS = 250;

export type CollectionSurfaceCaptureRow = {
  groupKey: string;
  structure: "native_form" | "role_form" | "unassociated_controls";
  title?: string;
  method?: string;
  actionHostname?: string;
  elementType: "input" | "textarea" | "select";
  inputType: string;
  label?: string;
  autocompleteToken?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  domOrder: number;
};

export type CollectionSurfaceCaptureSnapshot = {
  pageUrl: string;
  rows: CollectionSurfaceCaptureRow[];
  inspectedFieldCandidateCount: number;
  candidateScanTruncated: boolean;
};

const HIGH_SENSITIVITY_CATEGORIES = new Set<CollectionSurfaceSemanticCategory>([
  "password",
  "payment_card",
  "bank_account",
  "government_id",
  "social_security_number",
  "date_of_birth",
  "health",
]);

function normalizedText(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function classifyCollectionSurfaceSemanticCategory(input: {
  autocompleteToken?: string;
  inputType: string;
  elementType: "input" | "textarea" | "select";
  label?: string;
}): CollectionSurfaceSemanticCategory {
  const type = input.inputType.toLowerCase();
  const autocomplete = normalizedText(input.autocompleteToken);
  const evidence = normalizedText(type, autocomplete, input.label);
  if (type === "search" || /(?:^|\s)search(?:$|\s)/.test(evidence)) return "search";
  if (type === "email" || /(?:^|\s)email(?:$|\s)/.test(autocomplete)) return "email";
  if (type === "tel" || /(?:^|\s)tel(?:$|\s)/.test(autocomplete)) return "phone";
  if (type === "password" || /current-password|new-password/.test(autocomplete)) return "password";
  if (type === "file") return "file_upload";
  if (/cc-number|cc-csc|cc-exp|credit card|card number|payment card|\bcvv\b|\bcvc\b/.test(evidence)) return "payment_card";
  if (/\biban\b|bank account|routing number|account number/.test(evidence)) return "bank_account";
  if (/social security|\bssn\b|taxpayer identification/.test(evidence)) return "social_security_number";
  if (/passport|driver'?s? licen[cs]e|national id|government id/.test(evidence)) return "government_id";
  if (type === "date" && /birth|birthday|dob/.test(evidence) || /bday|date of birth|birth date|birthday|\bdob\b/.test(evidence)) return "date_of_birth";
  if (/medical|health|patient|diagnosis|prescription|insurance member/.test(evidence)) return "health";
  if (/geo|latitude|longitude|current location|coordinates/.test(evidence)) return "geolocation";
  if (/name|given-name|family-name|honorific/.test(autocomplete) || /\b(?:full )?name\b/.test(evidence)) return "name";
  if (/address|street-address|address-line|postal-code|country|shipping|billing/.test(autocomplete) || /\baddress\b/.test(evidence)) return "address";
  if (input.elementType === "textarea") return "free_text";
  if (input.elementType === "select") return "selection";
  if (type === "checkbox" || type === "radio") return "boolean_choice";
  return "unknown";
}

function classifySurfaceType(input: {
  categories: CollectionSurfaceSemanticCategory[];
  title?: string;
  labels: string[];
}): CollectionSurfaceInventory["forms"][number]["surfaceType"] {
  const evidence = normalizedText(input.title, ...input.labels);
  if (input.categories.includes("search")) return "search";
  if (/newsletter|subscribe|email updates|mailing list/.test(evidence)) return "newsletter";
  if (/contact|message|support|inquiry|enquiry/.test(evidence)) return "contact";
  if (input.categories.includes("password") || /login|sign in|account|register|create account/.test(evidence)) return "account";
  if (input.categories.some((category) => category === "payment_card" || category === "bank_account") || /checkout|payment|billing|shipping|cart/.test(evidence)) return "checkout";
  return input.categories.length > 0 ? "generic_form" : "unknown";
}

function actionRelationship(pageUrl: string, actionHostname?: string) {
  if (!actionHostname) return "none" as const;
  try {
    const pageHostname = new URL(pageUrl).hostname.toLowerCase();
    const normalizedActionHostname = actionHostname.toLowerCase();
    if (pageHostname === normalizedActionHostname) return "self" as const;
    const pageDomain = getRegistrableDomain(pageHostname);
    const actionDomain = getRegistrableDomain(normalizedActionHostname);
    return pageDomain && actionDomain && pageDomain === actionDomain
      ? "same_site" as const
      : "third_party" as const;
  } catch {
    return "unknown" as const;
  }
}

function normalizedMethod(value?: string): CollectionSurfaceInventory["forms"][number]["method"] {
  const method = value?.trim().toLowerCase();
  if (method === "get" || method === "post" || method === "dialog") return method;
  return method ? "other" : "unknown";
}

function fieldPriority(category: CollectionSurfaceSemanticCategory) {
  if (HIGH_SENSITIVITY_CATEGORIES.has(category)) return 0;
  if (["file_upload", "address", "email", "phone", "name"].includes(category)) return 1;
  if (category === "search") return 4;
  if (category === "unknown") return 3;
  return 2;
}

function surfacePriority(surfaceType: CollectionSurfaceInventory["forms"][number]["surfaceType"], hasSensitive: boolean) {
  if (hasSensitive) return 0;
  if (surfaceType === "checkout" || surfaceType === "account") return 1;
  if (surfaceType === "contact" || surfaceType === "newsletter") return 2;
  if (surfaceType === "generic_form" || surfaceType === "unknown") return 3;
  return 4;
}

export function buildCollectionSurfaceInventory(
  snapshot: CollectionSurfaceCaptureSnapshot,
  scanStartedAtMs: number,
): CollectionSurfaceInventory {
  const grouped = new Map<string, CollectionSurfaceCaptureRow[]>();
  for (const row of snapshot.rows.slice(0, MAX_COLLECTION_SURFACE_INSPECTED_FIELDS)) {
    const rows = grouped.get(row.groupKey) ?? [];
    rows.push(row);
    grouped.set(row.groupKey, rows);
  }
  const candidates = [...grouped.entries()].slice(0, MAX_COLLECTION_SURFACE_INSPECTED_FORMS).map(([groupKey, rows], formIndex) => {
    const classified = rows.map((row) => ({
      row,
      semanticCategory: classifyCollectionSurfaceSemanticCategory(row),
    }));
    const surfaceType = classifySurfaceType({
      categories: classified.map((field) => field.semanticCategory),
      title: rows[0]?.title,
      labels: rows.flatMap((row) => row.label ?? []).slice(0, 20),
    });
    const sortedFields = [...classified].sort((left, right) =>
      fieldPriority(left.semanticCategory) - fieldPriority(right.semanticCategory) ||
      left.row.domOrder - right.row.domOrder
    );
    const fields = sortedFields.slice(0, MAX_COLLECTION_SURFACE_FIELDS_PER_FORM).map(({ row, semanticCategory }, fieldIndex) => ({
      fieldRef: `collection_form_${formIndex}_field_${fieldIndex}`,
      elementType: row.elementType,
      inputType: row.inputType.slice(0, 40) || row.elementType,
      semanticCategory,
      ...(row.label ? { label: row.label.slice(0, 120) } : {}),
      ...(row.autocompleteToken ? { autocompleteToken: row.autocompleteToken.slice(0, 80) } : {}),
      required: row.required,
      disabled: row.disabled,
      readOnly: row.readOnly,
      evidenceRefs: [{
        refId: `ref_collection_surface_${formIndex}_${fieldIndex}`,
        artifactId: "collection_surface_inventory_pre_consent",
        eventType: "main_document_dom_control",
      }],
      confidence: semanticCategory === "unknown" ? 0.68 : 0.9,
      directVsInferred: "direct" as const,
    }));
    const hasSensitive = classified.some((field) => HIGH_SENSITIVITY_CATEGORIES.has(field.semanticCategory));
    return {
      groupKey,
      priority: surfacePriority(surfaceType, hasSensitive),
      domOrder: Math.min(...rows.map((row) => row.domOrder)),
      form: {
        formRef: `collection_form_${formIndex}`,
        structure: rows[0]?.structure ?? "unassociated_controls",
        surfaceType,
        ...(rows[0]?.title ? { title: rows[0].title.slice(0, 120) } : {}),
        pageUrl: snapshot.pageUrl.slice(0, 500),
        method: normalizedMethod(rows[0]?.method),
        actionRelationship: actionRelationship(snapshot.pageUrl, rows[0]?.actionHostname),
        ...(rows[0]?.actionHostname ? { actionHostname: rows[0].actionHostname.slice(0, 255) } : {}),
        candidateFieldCount: classified.length,
        retainedFieldCount: fields.length,
        fieldsTruncated: classified.length > fields.length,
        fields,
        evidenceRefs: [{
          refId: `ref_collection_surface_form_${formIndex}`,
          artifactId: "collection_surface_inventory_pre_consent",
          eventType: "main_document_dom_form",
        }],
        confidence: rows[0]?.structure === "unassociated_controls" ? 0.78 : 0.92,
        directVsInferred: "direct" as const,
      },
    };
  });
  const selectedForms = candidates
    .sort((left, right) => left.priority - right.priority || left.domOrder - right.domOrder)
    .slice(0, MAX_COLLECTION_SURFACE_FORMS);
  let remainingFieldBudget = MAX_COLLECTION_SURFACE_FIELDS;
  const forms = selectedForms.map(({ form }, retainedFormIndex) => {
    const fields = form.fields.slice(0, remainingFieldBudget);
    remainingFieldBudget -= fields.length;
    return {
      ...form,
      formRef: `collection_form_${retainedFormIndex}`,
      fields: fields.map((field, fieldIndex) => ({
        ...field,
        fieldRef: `collection_form_${retainedFormIndex}_field_${fieldIndex}`,
      })),
      retainedFieldCount: fields.length,
      fieldsTruncated: form.candidateFieldCount > fields.length,
    };
  });
  const retainedFieldCount = forms.reduce((total, form) => total + form.fields.length, 0);
  const candidateFormCount = grouped.size;
  const candidateFieldCount = snapshot.rows.length;
  const retentionTruncated = candidateFormCount > forms.length || candidateFieldCount > retainedFieldCount;
  const reasonCodes = [
    snapshot.candidateScanTruncated ? "candidate_scan_truncated" : null,
    candidateFormCount > MAX_COLLECTION_SURFACE_FORMS ? "form_retention_limit_reached" : null,
    candidateFieldCount > retainedFieldCount ? "field_retention_limit_reached" : null,
  ].filter((value): value is string => Boolean(value));
  return collectionSurfaceInventorySchema.parse({
    contractVersion: COLLECTION_SURFACE_INVENTORY_VERSION,
    inventoryId: "collection_surface_inventory_pre_consent",
    sourceLane: "runtime_evidence",
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    observedAtMs: Math.max(0, Date.now() - scanStartedAtMs),
    consentStateAtTime: "pre_consent",
    pageUrl: snapshot.pageUrl.slice(0, 500),
    coverage: {
      status: snapshot.candidateScanTruncated || retentionTruncated ? "limited" : "complete",
      documentScope: "main_document",
      interactionMode: "none",
      candidateFormCount,
      retainedFormCount: forms.length,
      candidateFieldCount,
      retainedFieldCount,
      inspectedFormCandidateCount: Math.min(candidateFormCount, MAX_COLLECTION_SURFACE_INSPECTED_FORMS),
      inspectedFieldCandidateCount: Math.min(snapshot.inspectedFieldCandidateCount, MAX_COLLECTION_SURFACE_INSPECTED_FIELDS),
      candidateScanTruncated: snapshot.candidateScanTruncated,
      retentionTruncated,
      reasonCodes,
    },
    forms,
    evidenceRefs: [{
      refId: "ref_collection_surface_inventory_pre_consent",
      artifactId: "collection_surface_inventory_pre_consent",
      eventType: "main_document_dom_inventory",
    }],
    confidence: snapshot.candidateScanTruncated ? 0.76 : 0.94,
    directVsInferred: "direct",
  });
}

export function legacyCollectionSurfaceObservationsFromInventory(
  inventory: CollectionSurfaceInventory,
): CollectionSurfaceObservation[] {
  return inventory.forms.flatMap((form) => form.fields.map((field, index) => ({
    observationId: `${form.formRef}_${index}`,
    observedAtMs: inventory.observedAtMs,
    sourceScanner: inventory.sourceScanner,
    scenario: inventory.scenario,
    consentStateAtTime: inventory.consentStateAtTime,
    pageUrl: form.pageUrl,
    surfaceType: form.surfaceType === "unknown" ? "other" as const : form.surfaceType,
    controlCount: 1,
    fieldTypes: [field.inputType],
    labels: field.label ? [field.label] : [],
    hasEmailField: field.semanticCategory === "email",
    hasSensitiveFieldHint: HIGH_SENSITIVITY_CATEGORIES.has(field.semanticCategory),
    evidenceRefs: field.evidenceRefs,
    confidence: field.confidence,
    directVsInferred: field.directVsInferred,
  }))).slice(0, 60);
}
