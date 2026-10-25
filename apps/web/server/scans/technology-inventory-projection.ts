import {
  buildTechnologyInventory, matchTechnologySignal, technologyCaptureSchema, technologyInventorySchema,
  type CanonicalEvidenceBundle, type CmsSignal, type SiteMetadata, type TechnologySignal,
} from "@certscore/contracts";

/** Called only after the existing CMS bundle/document verification. No additional artifact reads. */
export function projectTechnologyInventory(input: {
  bundle: CanonicalEvidenceBundle; metadata: SiteMetadata; signals: CmsSignal[];
  documentUrl: string; requestDocumentUrl: string; documentToken: string; artifactRef: string; capturedAtMs: number;
}) {
  const signals: TechnologySignal[] = [];
  const add = (row: Omit<TechnologySignal, "evidenceRef">) => {
    if (matchTechnologySignal(row, input.documentUrl)) signals.push({ ...row, evidenceRef: `site_integrity:tech-signal:${signals.length}` });
  };
  // Historical verified declarations remain useful without synthesizing new capture proof.
  for (const signal of input.signals) {
    if (signal.kind === "meta_generator") add({ kind: "generator", value: signal.value, sourceUrl: signal.sourceUrl, sourceRef: signal.evidenceRef });
    if (signal.kind === "asset_path") add({ kind: "asset", value: signal.value, sourceUrl: signal.sourceUrl, sourceRef: signal.evidenceRef });
  }
  const capture = technologyCaptureSchema.safeParse(input.metadata.technology);
  if (capture.success) {
    const data = capture.data;
    // Join a main-document response to its exact request, never to a matching hostname alone.
    // Skip header attribution if the inventory exceeds the bounded join allowance.
    const requestInventory = input.bundle.networkEvents ?? [], responseInventory = input.bundle.networkResponseEvents ?? [];
    const requests = requestInventory.length <= 2048 ? requestInventory.filter(row => row.requestId === data.responseRequestId) : [];
    const responses = responseInventory.length <= 2048 ? responseInventory.filter(row => row.requestId === data.responseRequestId) : [];
    const request = requests.length === 1 ? requests[0] : undefined;
    const response = responses.length === 1 ? responses[0] : undefined;
    const headerBound = data.responseDocumentToken === input.documentToken && request?.isMainFrame === true &&
      request.resourceType === "document" && request.requestUrl === input.requestDocumentUrl &&
      request.consentStateAtTime === "pre_consent" && response?.consentStateAtTime === "pre_consent" &&
      response.responseUrl === input.requestDocumentUrl && response.status !== undefined && response.status >= 200 && response.status < 300 &&
      response.timestampMs >= request.timestampMs && response.timestampMs <= input.capturedAtMs;
    for (const observation of data.observations) {
      if (observation.kind === "generator") continue;
      if (observation.kind === "header" && !headerBound) continue;
      add({ ...observation, sourceUrl: observation.sourceUrl ?? input.documentUrl,
        sourceRef: observation.kind === "header" ? response!.eventId : input.artifactRef });
    }
  }
  const inventory = buildTechnologyInventory(signals, input.documentUrl, capture.success && capture.data.truncated);
  const result = technologyInventorySchema.safeParse(inventory);
  return result.success && result.data.detections.length ? result.data : undefined;
}
