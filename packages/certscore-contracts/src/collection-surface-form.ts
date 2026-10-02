import { z } from "zod";
import { FIELD_REVIEW_CATEGORIES } from "./collection-field-review";

export const COLLECTION_SURFACE_INVENTORY_VERSION = "certscore.collection-surface-inventory.v1";
export const COLLECTION_SURFACE_ASSESSMENT_VERSION = "certscore.collection-surface-assessment.v1";
export const MAX_COLLECTION_SURFACE_FORMS = 10;
export const MAX_COLLECTION_SURFACE_FIELDS_PER_FORM = 20;
export const MAX_COLLECTION_SURFACE_FIELDS = 60;
export const MAX_COLLECTION_SURFACE_INVENTORY_BYTES = 64 * 1024;

export const collectionSurfaceSemanticCategorySchema = z.enum([
  "search",
  "name",
  "email",
  "phone",
  "address",
  "password",
  "payment_card",
  "bank_account",
  "government_id",
  "social_security_number",
  "date_of_birth",
  "health",
  "geolocation",
  "file_upload",
  "free_text",
  "selection",
  "boolean_choice",
  "website_url",
  "unknown",
]);

export const collectionSurfaceEvidenceRefSchema = z.object({
  refId: z.string().min(1).max(120),
  eventId: z.string().min(1).max(120).optional(),
  artifactId: z.string().min(1).max(120).optional(),
  eventType: z.string().min(1).max(80).optional(),
}).strict();

export const collectionSurfaceFieldSchema = z.object({
  controlKind: z.enum(["checkbox", "switch", "radio"]).optional(),
  checkedState: z.enum(["checked", "unchecked", "mixed", "unknown"]).optional(),
  review: z.object({ version: z.literal("collection-field-review.v1"), category: z.enum(FIELD_REVIEW_CATEGORIES), preselectedMarketing: z.boolean() }).strict().optional(),
  fieldRef: z.string().min(1).max(80),
  controlIndex: z.number().int().nonnegative().max(249).optional(),
  elementType: z.enum(["input", "textarea", "select", "custom_control"]),
  inputType: z.string().min(1).max(40),
  semanticCategory: collectionSurfaceSemanticCategorySchema,
  label: z.string().min(1).max(120).optional(),
  autocompleteToken: z.string().min(1).max(80).optional(),
  required: z.boolean(),
  disabled: z.boolean(),
  readOnly: z.boolean(),
  evidenceRefs: z.array(collectionSurfaceEvidenceRefSchema).max(2).default([]),
  confidence: z.number().min(0).max(1),
  directVsInferred: z.enum(["direct", "inferred", "mixed", "unknown"]),
}).strict().superRefine((field, ctx) => {
  if (field.review?.preselectedMarketing && (field.checkedState !== "checked" || !["checkbox", "switch"].includes(field.controlKind ?? ""))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preselected marketing review requires a retained selected checkbox or switch", path: ["review", "preselectedMarketing"] });
  }
});

export const formPrivacyDisclosureSchema = z.object({
  version: z.literal(1),
  excerpts: z.array(z.object({
    text: z.string().min(1).max(600),
    association: z.enum(["inside_form", "adjacent_notice", "described_by"]),
    links: z.array(z.object({
      label: z.string().min(1).max(100),
      url: z.string().url().max(500).refine(value => /^https?:\/\//i.test(value)),
    }).strict()).max(2),
  }).strict()).max(2),
  truncated: z.boolean(),
}).strict();

export const collectionSurfaceFormSchema = z.object({
  formRef: z.string().min(1).max(80),
  structure: z.enum(["native_form", "role_form", "unassociated_controls"]),
  surfaceType: z.enum(["search", "newsletter", "contact", "account", "checkout", "generic_form", "unknown"]),
  title: z.string().min(1).max(120).optional(),
  pageUrl: z.string().min(1).max(500),
  method: z.enum(["get", "post", "dialog", "other", "unknown"]),
  actionRelationship: z.enum(["same_site", "third_party", "self", "none", "unknown"]),
  actionHostname: z.string().min(1).max(255).optional(),
  candidateFieldCount: z.number().int().nonnegative(),
  retainedFieldCount: z.number().int().nonnegative().max(MAX_COLLECTION_SURFACE_FIELDS_PER_FORM),
  fieldsTruncated: z.boolean(),
  fields: z.array(collectionSurfaceFieldSchema).max(MAX_COLLECTION_SURFACE_FIELDS_PER_FORM),
  privacyDisclosure: formPrivacyDisclosureSchema.optional(),
  evidenceRefs: z.array(collectionSurfaceEvidenceRefSchema).max(4).default([]),
  confidence: z.number().min(0).max(1),
  directVsInferred: z.enum(["direct", "inferred", "mixed", "unknown"]),
}).strict().superRefine((form, context) => {
  if (form.retainedFieldCount !== form.fields.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "retainedFieldCount must equal the retained fields array length",
      path: ["retainedFieldCount"],
    });
  }
  if (form.fieldsTruncated !== (form.candidateFieldCount > form.retainedFieldCount)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "fieldsTruncated must reflect omitted candidate fields",
      path: ["fieldsTruncated"],
    });
  }
});
