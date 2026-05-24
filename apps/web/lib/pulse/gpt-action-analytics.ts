type GptActionEventFields = {
  coverageStatus?: unknown;
  detail?: unknown;
  elapsedMs?: unknown;
  errorCode?: unknown;
  format?: unknown;
  freshness?: unknown;
  highPriorityFindingCount?: unknown;
  jobId?: unknown;
  requestId?: unknown;
  retryAfterSeconds?: unknown;
  route?: unknown;
  scanId?: unknown;
  status?: unknown;
  statusCode?: unknown;
  topFindingIds?: unknown;
  totalObservationCount?: unknown;
  wait?: unknown;
  wasCached?: unknown;
  [key: string]: unknown;
};

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hostnameFromPublicUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getTopFindingIds(pulse: { topFindings?: unknown }) {
  return Array.isArray(pulse.topFindings)
    ? pulse.topFindings
        .map((finding) => (finding && typeof finding === "object" && "id" in finding ? safeString((finding as { id?: unknown }).id) : null))
        .filter((id): id is string => Boolean(id))
        .slice(0, 10)
    : [];
}

export function getHighPriorityFindingCount(pulse: { topFindings?: unknown; findings?: unknown }) {
  const findings = Array.isArray(pulse.topFindings) && pulse.topFindings.length > 0
    ? pulse.topFindings
    : Array.isArray(pulse.findings)
      ? pulse.findings
      : [];

  return findings.filter((finding) => {
    if (!finding || typeof finding !== "object" || !("criticality" in finding)) {
      return false;
    }
    return /^(critical|high)$/i.test(String((finding as { criticality?: unknown }).criticality ?? ""));
  }).length;
}

export function getTotalObservationCount(pulse: { findings?: unknown; topFindings?: unknown; evidenceHighlights?: unknown }) {
  if (Array.isArray(pulse.findings)) {
    return pulse.findings.length;
  }

  if (Array.isArray(pulse.topFindings)) {
    return pulse.topFindings.length;
  }

  if (pulse.evidenceHighlights && typeof pulse.evidenceHighlights === "object") {
    return Object.keys(pulse.evidenceHighlights).length;
  }

  return null;
}

export function logPulseGptActionEvent(event: string, fields: GptActionEventFields) {
  const route = safeString(fields.route) ?? "/api/v1/pulse/gpt";
  const domain = safeString(fields.domain) ?? safeString(fields.hostname) ?? null;
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    source: "gpt_action",
    channel: "gpt_action",
    route,
    requestId: safeString(fields.requestId),
    domain,
    detail: fields.detail,
    format: fields.format,
    wait: fields.wait,
    status: fields.status,
    statusCode: fields.statusCode,
    elapsedMs: fields.elapsedMs,
    scanId: safeString(fields.scanId),
    jobId: safeString(fields.jobId),
    wasCached: fields.wasCached,
    freshness: fields.freshness,
    coverageStatus: fields.coverageStatus,
    topFindingIds: Array.isArray(fields.topFindingIds) ? fields.topFindingIds : undefined,
    highPriorityFindingCount: fields.highPriorityFindingCount,
    totalObservationCount: fields.totalObservationCount,
    errorCode: fields.errorCode,
    retryAfterSeconds: fields.retryAfterSeconds
  };

  console.info("CERTSCORE_GPT_ACTION_EVENT", JSON.stringify(payload));
}
