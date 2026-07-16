import { normalizeRequestSourceIp } from "../request-source-ip";

export type RequesterIpAttributionSource = "request_context" | "pulse_context" | "requested_by" | "event" | "hash_only" | "missing";

export type RequesterIpAttribution = {
  ipHash: string | null;
  sourceIp: string | null;
  source: RequesterIpAttributionSource;
};

type RequestRecord = {
  pulse_request_context?: unknown;
  request_context?: unknown;
  requested_by?: unknown;
} | null;

type EventRecord = {
  metadata_json?: Record<string, unknown> | null;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function emptyAttribution(): RequesterIpAttribution {
  return { ipHash: null, sourceIp: null, source: "missing" };
}

function splitValue(value: unknown, source: Exclude<RequesterIpAttributionSource, "hash_only" | "missing">): RequesterIpAttribution {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return emptyAttribution();
  if (/^[a-f0-9]{64}$/i.test(normalized)) {
    return { ipHash: normalized, sourceIp: null, source: "hash_only" };
  }
  const sourceIp = normalizeRequestSourceIp(normalized);
  return sourceIp ? { ipHash: null, sourceIp, source } : emptyAttribution();
}

export function mergeRequesterIpAttributions(
  ...values: RequesterIpAttribution[]
): RequesterIpAttribution {
  return {
    sourceIp: values.find((value) => value.sourceIp)?.sourceIp ?? null,
    ipHash: values.find((value) => value.ipHash)?.ipHash ?? null,
    source: values.find((value) => value.sourceIp)?.source ??
      (values.some((value) => value.ipHash) ? "hash_only" : "missing")
  };
}

export function requesterIpAttributionFromContext(
  value: unknown,
  source: "request_context" | "pulse_context" | "event" = "request_context"
): RequesterIpAttribution {
  const context = asRecord(value);
  if (!context) return emptyAttribution();
  const provenance = asRecord(context.provenance);
  return mergeRequesterIpAttributions(
    splitValue(context.sourceIp, source),
    splitValue(provenance?.sourceIp, source),
    splitValue(context.ipHash, source),
    splitValue(provenance?.ipHash, source),
    splitValue(context.originIp, source),
    splitValue(provenance?.originIp, source)
  );
}

export function requesterIpAttributionFromRequest(request: RequestRecord): RequesterIpAttribution {
  if (!request) return emptyAttribution();
  const contextAttribution = requesterIpAttributionFromContext(request.request_context);
  const pulseAttribution = requesterIpAttributionFromContext(request.pulse_request_context, "pulse_context");
  const requestedBy = asRecord(request.requested_by);
  return mergeRequesterIpAttributions(
    contextAttribution,
    pulseAttribution,
    splitValue(requestedBy?.sourceIp, "requested_by"),
    splitValue(requestedBy?.ipHash, "requested_by")
  );
}

export function requesterIpAttributionFromEvents(events: EventRecord[]): RequesterIpAttribution {
  return mergeRequesterIpAttributions(...events.flatMap((event) => {
    const metadata = event.metadata_json;
    if (!metadata) return [];
    return [requesterIpAttributionFromContext(metadata, "event")];
  }));
}
