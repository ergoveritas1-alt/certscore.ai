import { z } from "zod";

/** Operational metadata only: never retain error messages, URLs or page text. */
export const captureFailureDiagnosticSchema = z.object({
  version: z.literal("capture_failure.v1"),
  phase: z.string().regex(/^[a-z_]{1,40}$/),
  code: z.enum(["timeout", "cancelled", "document_changed", "network_failure", "engine_unavailable",
    "engine_busy", "serialization_failure", "contract_invalid", "metadata_invalid", "checksum_mismatch", "binding_mismatch", "unknown"]),
  errorName: z.enum(["Error", "TimeoutError", "ZodError", "AbortError", "ReferenceError", "TypeError", "Other"]),
}).strict();
export type CaptureFailureDiagnostic = z.infer<typeof captureFailureDiagnosticSchema>;

export function describeCaptureFailure(error: unknown, phase: string): CaptureFailureDiagnostic {
  const message = error instanceof Error ? error.message : "";
  const errorName = error instanceof Error && ["Error", "TimeoutError", "ZodError", "AbortError", "ReferenceError", "TypeError"].includes(error.name)
    ? error.name as CaptureFailureDiagnostic["errorName"] : "Other";
  const code = errorName === "TimeoutError" || /timeout|timed out|budget_exhausted|deadline/i.test(message) ? "timeout"
    : errorName === "AbortError" || /cancelled|aborted/i.test(message) ? "cancelled"
    : /execution context.*destroyed|frame.*detached|document_changed|target.*closed/i.test(message) ? "document_changed"
    : /net::|dns|navigation.*failed/i.test(message) ? "network_failure"
    : /axe.*already running/i.test(message) ? "engine_busy"
    : /engine_injection_failed|axe.*undefined|undefined.*run/i.test(message) ? "engine_unavailable"
    : /serializ|circular/i.test(message) ? "serialization_failure"
    : errorName === "ZodError" ? "contract_invalid"
    : /metadata_invalid/i.test(message) ? "metadata_invalid"
    : /checksum_mismatch/i.test(message) ? "checksum_mismatch"
    : /binding_mismatch|not bound|target_mismatch/i.test(message) ? "binding_mismatch" : "unknown";
  return captureFailureDiagnosticSchema.parse({ version: "capture_failure.v1", phase, code, errorName });
}
