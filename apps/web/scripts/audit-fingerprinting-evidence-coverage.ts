import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";

type FingerprintCoverageRow = {
  completed_at: string | null;
  domain: string | null;
  fingerprint_summary: Record<string, unknown> | null;
  fingerprinting_runtime_evidence: Array<Record<string, unknown>> | null;
  scan_id: string;
};

type Bucket =
  | "probable_fingerprinting_ready"
  | "missing_runtime_anchor"
  | "missing_vendor_or_script_owner"
  | "missing_identity_or_entropy_linkage"
  | "post_consent_review_signal"
  | "tier2_review_signal"
  | "low_tier_noise";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classify(row: FingerprintCoverageRow): { bucket: Bucket; reasons: string[] } {
  const summary = isRecord(row.fingerprint_summary) ? row.fingerprint_summary : {};
  const runtimeRows = Array.isArray(row.fingerprinting_runtime_evidence) ? row.fingerprinting_runtime_evidence.filter(isRecord) : [];
  const tier = getNumber(summary.tier) ?? 0;
  const runtimeAnchors = runtimeRows.filter((entry) =>
    [entry.requestUrl, entry.request_url, entry.initiatorUrl, entry.initiator_url, entry.host, entry.vendor]
      .some((value) => getString(value))
  );
  const vendorRows = runtimeRows.filter((entry) => getString(entry.vendor) || getString(entry.vendorName) || getString(entry.vendor_name));
  const scriptRows = runtimeRows.filter((entry) => getString(entry.initiatorUrl) || getString(entry.initiator_url) || getString(entry.scriptUrl));
  const identityLinked =
    getBoolean(summary.identifierShapingDetected) === true ||
    runtimeRows.some((entry) =>
      getBoolean(entry.entropyLinkedToIdentifier ?? entry.entropy_linked_to_identifier) === true ||
      (getNumber(entry.identifierLikeRequestCount ?? entry.identifier_like_request_count) ?? 0) > 0
    );
  const entropyTransmitted =
    getBoolean(summary.networkAfterCollection) === true ||
    runtimeRows.some((entry) =>
      getBoolean(entry.entropyTransmissionObserved ?? entry.entropy_transmission_observed) === true ||
      (getNumber(entry.deviceDataLikeRequestCount ?? entry.device_data_like_request_count) ?? 0) > 0
    );
  const preConsent =
    getString(summary.preConsent) === "true" ||
    runtimeRows.some((entry) => getString(entry.runtimePhase ?? entry.runtime_phase) === "pre_consent");
  const reasons = [
    `tier=${tier}`,
    `runtimeRows=${runtimeRows.length}`,
    `anchors=${runtimeAnchors.length}`,
    `vendors=${vendorRows.length}`,
    `scripts=${scriptRows.length}`,
    `identityLinked=${identityLinked}`,
    `entropyTransmitted=${entropyTransmitted}`,
    `preConsent=${preConsent}`
  ];

  if (tier < 2) {
    return { bucket: "low_tier_noise", reasons };
  }
  if (runtimeAnchors.length === 0) {
    return { bucket: "missing_runtime_anchor", reasons };
  }
  if (tier >= 3 && (identityLinked || entropyTransmitted) && (vendorRows.length > 0 || scriptRows.length > 0)) {
    return { bucket: "probable_fingerprinting_ready", reasons };
  }
  if (vendorRows.length === 0 && scriptRows.length === 0) {
    return { bucket: "missing_vendor_or_script_owner", reasons };
  }
  if (!identityLinked && !entropyTransmitted) {
    return { bucket: "missing_identity_or_entropy_linkage", reasons };
  }
  if (!preConsent) {
    return { bucket: "post_consent_review_signal", reasons };
  }
  return { bucket: "tier2_review_signal", reasons };
}

async function main() {
  const limit = getNumberArg("--limit", 100);
  const days = getNumberArg("--days", 14);
  const rows = await query<FingerprintCoverageRow>(
    `
      select
        s.id::text as scan_id,
        s.completed_at,
        d.hostname as domain,
        (r.hybrid_runtime_evidence -> 'fingerprintSummary') as fingerprint_summary,
        coalesce(r.hybrid_runtime_evidence -> 'fingerprintingRuntimeEvidence', '[]'::jsonb) as fingerprinting_runtime_evidence
      from scan_runtime_artifacts r
      join scans s on s.id = r.scan_id
      left join domains d on d.id = s.domain_id
      where s.status = 'completed'
        and s.completed_at >= now() - ($1::text || ' days')::interval
        and coalesce((r.hybrid_runtime_evidence -> 'fingerprintSummary' ->> 'tier')::int, 0) > 0
      order by s.completed_at desc nulls last
      limit $2
    `,
    [days, limit],
    { readOnly: true }
  );

  const buckets = new Map<Bucket, Array<FingerprintCoverageRow & { reasons: string[] }>>();
  for (const row of rows.rows) {
    const classified = classify(row);
    const entries = buckets.get(classified.bucket) ?? [];
    entries.push({ ...row, reasons: classified.reasons });
    buckets.set(classified.bucket, entries);
  }

  const orderedBuckets: Bucket[] = [
    "probable_fingerprinting_ready",
    "missing_runtime_anchor",
    "missing_vendor_or_script_owner",
    "missing_identity_or_entropy_linkage",
    "post_consent_review_signal",
    "tier2_review_signal",
    "low_tier_noise"
  ];

  console.log(`Fingerprinting evidence coverage: ${rows.rows.length} scans from last ${days} days`);
  for (const bucket of orderedBuckets) {
    const entries = buckets.get(bucket) ?? [];
    console.log(`\n${bucket}: ${entries.length}`);
    for (const entry of entries.slice(0, 10)) {
      const runtimeRows = entry.fingerprinting_runtime_evidence ?? [];
      const hosts = runtimeRows.flatMap((row) => getString(row.host) ?? []).slice(0, 4);
      const vendors = runtimeRows.flatMap((row) => getString(row.vendor) ?? []).slice(0, 4);
      const categories = getStringArray(entry.fingerprint_summary?.attributeCategories).slice(0, 4);
      console.log(
        `- ${entry.domain ?? "unknown"} ${entry.scan_id} ${entry.reasons.join(" ")} hosts=${hosts.join(",") || "-"} vendors=${vendors.join(",") || "-"} categories=${categories.join(",") || "-"}`
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
