import type { MeasurementRequestEvidence, MeasurementStoredIdentifier } from "@certscore/contracts";

/** Closed collector protocols. Only a transmitted value matching an exact,
 * retained, persistent pre-action cookie establishes a persistent identifier.
 * Unknown fields and mixed telemetry never establish identifier absence. */
export function inspectCollectionIdentifier(input: {
  url: URL; method: string; requestId: string; timestampMs: number; body: string | null;
  headers?: Record<string, string>; storedIdentifiers?: readonly MeasurementStoredIdentifier[];
  hashIdentifier?: (value: string) => string;
}): MeasurementRequestEvidence | undefined {
  const { url } = input;
  const heap = url.origin === "https://heapanalytics.com" && url.pathname === "/h";
  const hubspot = /^https:\/\/track(?:-eu1)?\.hubspot\.com$/.test(url.origin) && /^\/(?:__pt[qc]|ptq)\.gif$/.test(url.pathname);
  const shopify = url.origin === "https://monorail-edge.shopifysvc.com" && ["/v1/produce", "/unstable/produce_batch"].includes(url.pathname);
  if (!heap && !hubspot && !shopify) return undefined;
  const reasons = new Set<NonNullable<MeasurementRequestEvidence["diagnostics"]>["reasons"][number]>();
  const method = ["GET", "POST", "OPTIONS"].includes(input.method) ? input.method as "GET" | "POST" | "OPTIONS" : "other";
  const bodyWithinLimit = input.body === null || new TextEncoder().encode(input.body).length <= 32768;
  const bodySupported = !input.body || !/[{}\r\n]/.test(input.body) && !/%(?![a-f0-9]{2})/i.test(input.body);
  let binding: MeasurementStoredIdentifier | undefined;
  if (!bodyWithinLimit) reasons.add("payload_size_limit");
  if (shopify) reasons.add("purpose_unresolved");
  else if (!bodySupported) reasons.add("unsupported_payload");
  else if (bodyWithinLimit && ["GET", "POST"].includes(method)) {
    const fields = [...url.searchParams, ...new URLSearchParams(input.body ?? "")];
    if (fields.length > 64) reasons.add("field_limit");
    else {
      const parameter = heap ? "u" : "vi", values = fields.filter(([key]) => key === parameter);
      const applications = fields.filter(([key]) => key === "a");
      if (values.length !== 1 || heap && applications.length !== 1) reasons.add("duplicate_fields");
      else {
        const value = values[0]![1];
        const valid = heap ? /^[0-9]{1,20}$/.test(value) && /^[0-9]{1,20}$/.test(applications[0]![1]) : /^[a-f0-9]{32}$/.test(value);
        if (valid && input.hashIdentifier) {
          const hash = input.hashIdentifier(value);
          const matches = (input.storedIdentifiers ?? []).filter(row => row.parameter === parameter &&
            row.identifierSha256 === hash && row.capturedAtMs <= input.timestampMs &&
            (heap ? row.cookieName === `_hp2_id.${applications[0]![1]}` : row.cookieName === "hubspotutk"));
          if (matches.length === 1) binding = matches[0];
        }
      }
    }
  }
  if (!binding) reasons.add("ambiguous_client_identifier");
  if (!input.headers) reasons.add("headers_unavailable");
  const header = (name: string) => !input.headers ? "unknown" as const :
    Object.entries(input.headers).some(([key,value]) => key.toLowerCase() === name && value.trim() !== "") ? "present" as const : "absent" as const;
  return {version:"measurement_request_evidence.v3",requestId:input.requestId,timestampMs:input.timestampMs,
    requestOrigin:url.origin,requestPath:url.pathname,method,
    profile:heap?"heap_collection.v1":hubspot?"hubspot_collection.v1":"shopify_mixed_telemetry.v1",
    payloadInspection:"unknown",identifierEvidence:binding?"persistent_observed":"unknown",
    cookieHeader:header("cookie"),authorizationHeader:header("authorization"),
    ...(binding?{cookieIdentifierBinding:binding}:{}),
    diagnostics:{policyVersion:"bounded_measurement_inspection.v1",reasons:[...reasons],
      bodyDisposition:!input.body?"empty":bodyWithinLimit&&bodySupported&&!shopify?"inspected":"limited"}};
}
