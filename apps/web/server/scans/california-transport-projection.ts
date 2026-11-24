import {
  californiaTransportProjectionSchema, definitiveTransportCertificateErrorSchema, resolveRuntimeEvidenceClock, transportSecurityObservationSchema,
  type CaliforniaTransportDefect, type CaliforniaTransportProjection, type CanonicalEvidenceBundle,
  type TransportSecurityObservation,
} from "@certscore/contracts";
import { transportDocumentUrl } from "../../lib/scans/california-transport-score-policy";

function verifiedCertificateFailure(observation: TransportSecurityObservation, target: URL) {
  if (target.protocol !== "https:") return false;
  const matchesTarget = (url?: string) => transportDocumentUrl(url)?.origin === target.origin;
  const probe = observation.tlsProbe;
  const primary = probe.attempted && matchesTarget(probe.inputUrl) && (!probe.finalUrl || matchesTarget(probe.finalUrl));
  const matchingCertificates = observation.tlsCertificateObservations.filter(row => matchesTarget(row.inputUrl));
  if (primary && probe.validCertificate === true || matchingCertificates.some(row => row.validCertificate === true)) return false;
  return (primary && probe.validCertificate === false && probe.errorCategory === "tls_or_certificate_failure" &&
    definitiveTransportCertificateErrorSchema.safeParse(probe.errorMessage).success) ||
    matchingCertificates.some(row => row.validCertificate === false && row.validationError !== undefined);
}

/** Called at materialization after the original canonical bundle bytes are verified. */
export function projectCaliforniaTransport(bundle: CanonicalEvidenceBundle,
  source: { sha256?: string; verificationStatus?: string } | undefined, documentUrl: string | null) {
  const document = transportDocumentUrl(documentUrl);
  const clock = resolveRuntimeEvidenceClock(bundle);
  if (!document || !clock || source?.verificationStatus !== "verified" || !source.sha256) return null;
  const issues = new Map<string, CaliforniaTransportProjection["issues"][number]>();
  const add = (url: URL, defect: CaliforniaTransportDefect, categories: CaliforniaTransportProjection["issues"][number]["fieldCategories"]) => {
    const issue = issues.get(url.host) ?? { authority: url.host, defects: [], fieldCategories: [] };
    issue.defects = [...new Set([...issue.defects, defect])].sort();
    issue.fieldCategories = [...new Set([...issue.fieldCategories, ...categories])].sort();
    issues.set(url.host, issue);
  };
  for (const raw of bundle.transportSecurityObservations ?? []) {
    const parsed = transportSecurityObservationSchema.safeParse(raw);
    if (!parsed.success) continue;
    const observation = parsed.data;
    if (observation.sourceScanner !== "pre_consent_runtime" || observation.scenario !== "fresh_pre_consent" ||
        observation.directVsInferred !== "direct" || observation.observedAtMs > clock.durationMs ||
        transportDocumentUrl(observation.finalUrl)?.href !== document.href || observation.finalScheme !== document.protocol.slice(0, -1) ||
        observation.pageHttpsObserved !== (document.protocol === "https:") ||
        !observation.evidenceRefs.some(ref => ref.artifactId === "transport_security_observation")) continue;
    for (const form of observation.formTransports) {
      const categories = form.personalDataFieldCategories;
      if (!categories?.length || !/^form_\d+$/.test(form.formId) || !["get", "post"].includes(form.method) ||
          form.pageUrl !== observation.finalUrl || form.pageScheme !== observation.finalScheme) continue;
      const action = transportDocumentUrl(form.actionUrl);
      if (!action || action.protocol.slice(0, -1) !== form.actionScheme || (!form.actionPresent && action.href !== document.href)) continue;
      if (document.protocol === "http:") add(document, "plaintext_page", categories);
      if (action.protocol === "http:" && form.insecureTransportObserved) add(action, "plaintext_form_destination", categories);
      for (const endpoint of [document, action]) {
        if (verifiedCertificateFailure(observation, endpoint)) add(endpoint, "certificate_validation_failure", categories);
      }
    }
  }
  const projected = californiaTransportProjectionSchema.safeParse({ contractVersion: "certscore.california-transport-security.v1",
    scanId: bundle.scanId, verificationStatus: "verified", sourceHash: source.sha256, documentUrl: document.href,
    issues: [...issues.values()].sort((a, b) => a.authority.localeCompare(b.authority)) });
  return projected.success ? projected.data : null;
}
