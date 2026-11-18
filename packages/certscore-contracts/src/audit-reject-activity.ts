import { z } from "zod";

export const AUDIT_REJECT_ACTIVITY_VERSION = "certscore.audit-reject-activity.v2";
export const MAX_AUDIT_REJECT_ACTIVITY_BYTES = 192;

// The index records which of request, write and snapshot was observed.
export const AUDIT_REJECT_ACTIVITY_RESULTS = [
  "classification_unavailable",
  "request",
  "storage_write",
  "request_and_storage_write",
  "cookie_snapshot",
  "request_and_cookie_snapshot",
  "storage_write_and_cookie_snapshot",
  "request_and_storage_write_and_cookie_snapshot",
] as const;

const scanId = z.string().uuid();
const packetSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const unavailable = ["source_unbound", "capture_unavailable"] as const;
const v1 = z.tuple([z.literal(1), scanId, packetSha256, z.enum([
  "request", "storage_write", "request_and_storage_write", "classification_unavailable", ...unavailable,
])]);

export const auditRejectActivityV2Schema = z.tuple([z.literal(2), scanId, packetSha256,
  z.enum([...AUDIT_REJECT_ACTIVITY_RESULTS, ...unavailable])]);
export const auditRejectActivitySchema = z.union([v1, auditRejectActivityV2Schema]);
export type AuditRejectActivity = z.infer<typeof auditRejectActivitySchema>;
export type AuditRejectActivityV2 = z.infer<typeof auditRejectActivityV2Schema>;
