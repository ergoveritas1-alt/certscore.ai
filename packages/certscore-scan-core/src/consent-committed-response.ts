import type { ConsentGeometryAccessDiagnostic } from "./consent-geometry-access";
import { sameDocumentCaptureBinding, type DocumentCaptureBinding } from "./document-bound-capture";

export type CommittedConsentResponse = DocumentCaptureBinding & { httpStatus: number };

/** Complete only the existing geometry serialization from a response bound to
 * this access read. The caller verifies one CDP commit and stable access-read
 * bindings; the bindings here describe the geometry being written. No browser
 * command, readiness conclusion or capture scheduling is added here. */
export function retainCommittedConsentHttpStatus(
  access: ConsentGeometryAccessDiagnostic,
  response: CommittedConsentResponse | undefined,
  before: DocumentCaptureBinding,
  after: DocumentCaptureBinding,
): ConsentGeometryAccessDiagnostic {
  if (access.status !== "loaded" || access.reasonCodes.length > 0 || access.httpStatus !== undefined || !response ||
      !Number.isInteger(response.httpStatus) || response.httpStatus < 200 || response.httpStatus >= 300 ||
      response.documentIdentity?.source !== "cdp_loader_id" ||
      !sameDocumentCaptureBinding(response, before) || !sameDocumentCaptureBinding(before, after)) return access;
  try { if (!["http:", "https:"].includes(new URL(response.url).protocol)) return access; }
  catch { return access; }
  return { ...access, httpStatus: response.httpStatus };
}
