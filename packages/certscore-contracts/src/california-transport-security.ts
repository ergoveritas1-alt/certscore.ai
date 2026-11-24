import { z } from "zod";

export const CALIFORNIA_TRANSPORT_FINDING_ID = "california_personal_data_transport_security";
export const CALIFORNIA_TRANSPORT_SIGNAL = "california.personal_data_transport_security";
export const CALIFORNIA_TRANSPORT_TITLE = "Insecure transport on a personal-data form path";
export const CALIFORNIA_TRANSPORT_SUMMARY = "A page or submission destination used by a form that asks for personal information had a verified transport security issue.";
export const CALIFORNIA_TRANSPORT_ACTION = "Serve the affected pages and form destinations over HTTPS with a valid certificate, then verify the form paths again.";

export const transportPersonalDataCategories = ["name", "email", "phone", "address", "password", "payment_card",
  "bank_account", "government_id", "social_security_number", "date_of_birth", "health", "geolocation"] as const;
export const transportPersonalDataCategorySchema = z.enum(transportPersonalDataCategories);
export const definitiveTransportCertificateErrorSchema = z.enum([
  "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID", "HOSTNAME_MISMATCH", "DEPTH_ZERO_SELF_SIGNED_CERT",
]);
const defects = z.enum(["plaintext_page", "plaintext_form_destination", "certificate_validation_failure"]);
export type CaliforniaTransportDefect = z.infer<typeof defects>;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const californiaTransportProjectionSchema = z.object({
  contractVersion: z.literal("certscore.california-transport-security.v1"),
  scanId: z.string().min(1).max(160),
  verificationStatus: z.literal("verified"),
  sourceHash: sha256,
  documentUrl: z.string().url().max(500),
  issues: z.array(z.object({
    authority: z.string().min(1).max(262).regex(/^[a-z0-9.:[\]-]+$/),
    defects: z.array(defects).min(1).max(3),
    fieldCategories: z.array(transportPersonalDataCategorySchema).min(1).max(transportPersonalDataCategories.length),
  }).strict()).min(1).max(41),
}).strict().superRefine((value, ctx) => {
  const url = URL.canParse(value.documentUrl) ? new URL(value.documentUrl) : undefined;
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      new Set(value.issues.map(issue => issue.authority)).size !== value.issues.length || value.issues.some(issue =>
        new Set(issue.defects).size !== issue.defects.length || new Set(issue.fieldCategories).size !== issue.fieldCategories.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Transport proof must use a clean HTTP(S) document URL and distinct defect identities." });
  }
});

export type CaliforniaTransportProjection = z.infer<typeof californiaTransportProjectionSchema>;
