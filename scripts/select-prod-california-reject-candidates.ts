import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  KNOWN_CMP_REGISTRY,
  getKnownCmpVendorName,
} from "../packages/shared/src/known-cmps.js";
import { publicTestContactHoldForUrl } from "../packages/certscore-scan-core/src/public-test-contact-holds.js";
import { parseSingleJsonOutput, runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff.js";

const ARTIFACT_VERSION = "certscore.california_known_reject_candidate_selection.1" as const;
const CALIFORNIA_SCANNER_REGION = "us-west-1";
const DISALLOWED_DOMAINS = new Set(["vercel.com"]);
const DISALLOWED_PATH_SEGMENTS = new Set([
  "account",
  "auth",
  "cart",
  "checkout",
  "login",
  "payment",
  "purchase",
  "register",
  "session",
  "signin",
  "signup",
]);

export type CaliforniaRejectSourceRow = {
  assessment_source_hash: string;
  assessment_version: string;
  cmp_vendor_name: string | null;
  completed_at: string;
  consent_first_observed_at_ms: number | null;
  cooldown_until: string;
  effective_state: "eligible" | "cooldown" | "blocked" | "do_not_calibrate";
  egress_id: string | null;
  egress_provider: string | null;
  final_url: string;
  last_contact_at: string;
  last_outcome: string;
  last_source: string;
  normalized_domain: string;
  reject_evidence_count: number;
  reject_first_observed_at_ms: number | null;
  reject_reason_codes: string[];
  scan_id: string;
  scanner_region: string;
};

export type CaliforniaRejectCandidate = {
  assessmentSourceHash: string;
  assessmentVersion: string;
  canonicalCmpName: string;
  completedAt: string;
  consentFirstObservedAtMs: number | null;
  contactLedger: {
    cooldownOverrideRequired: boolean;
    cooldownUntil: string;
    effectiveState: "eligible" | "cooldown";
    lastContactAt: string;
    lastOutcome: string;
    lastSource: string;
  };
  egressId: string | null;
  egressProvider: string | null;
  exactTargetUrl: string;
  normalizedDomain: string;
  rejectEvidenceCount: number;
  rejectFirstObservedAtMs: number | null;
  rejectReasonCodes: string[];
  scanId: string;
  scannerRegion: typeof CALIFORNIA_SCANNER_REGION;
};

type Args = {
  days: number;
  egressLabel: string;
  excludeSelection: string;
  limit: number;
  out: string;
};

type Exclusion = {
  detail?: string;
  normalizedDomain: string;
  reason:
    | "blocked_or_do_not_calibrate"
    | "disallowed_domain"
    | "excluded_previous_cohort"
    | "final_url_domain_mismatch"
    | "high_risk_path"
    | "invalid_or_unsupported_url"
    | "repository_contact_hold"
    | "unsupported_cmp_recipe";
};

export function canonicalRejectRecipeCmpName(value: string | null) {
  if (!value?.trim()) return null;
  const canonicalName = getKnownCmpVendorName({ labels: [value] });
  const definition = KNOWN_CMP_REGISTRY.find((candidate) =>
    candidate.canonicalName === canonicalName &&
    candidate.rejectControlSelectors?.length &&
    candidate.standards?.includes("tcf")
  );
  return definition?.canonicalName ?? null;
}

export function sanitizeExactPublicTargetUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { reason: "invalid_or_unsupported_url" as const, url: null };
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { reason: "invalid_or_unsupported_url" as const, url: null };
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { reason: "invalid_or_unsupported_url" as const, url: null };
  }
  const pathSegments = url.pathname.toLowerCase().split("/").filter(Boolean);
  if (pathSegments.some((segment) => DISALLOWED_PATH_SEGMENTS.has(segment))) {
    return { reason: "high_risk_path" as const, url: null };
  }
  url.hostname = hostname;
  url.port = "";
  url.search = "";
  url.hash = "";
  return { reason: null, url: url.toString() };
}

export function selectCaliforniaRejectCandidates(
  rows: CaliforniaRejectSourceRow[],
  limit: number,
  excludedDomains: ReadonlySet<string> = new Set(),
) {
  const exclusions: Exclusion[] = [];
  const eligible: CaliforniaRejectCandidate[] = [];
  const seenDomains = new Set<string>();

  for (const row of rows.toSorted((left, right) => right.completed_at.localeCompare(left.completed_at))) {
    const normalizedDomain = normalizeDomain(row.normalized_domain);
    if (!normalizedDomain || seenDomains.has(normalizedDomain)) continue;
    seenDomains.add(normalizedDomain);

    if (excludedDomains.has(normalizedDomain)) {
      exclusions.push({ normalizedDomain, reason: "excluded_previous_cohort" });
      continue;
    }

    if (row.effective_state === "blocked" || row.effective_state === "do_not_calibrate") {
      exclusions.push({ normalizedDomain, reason: "blocked_or_do_not_calibrate" });
      continue;
    }
    if ([...DISALLOWED_DOMAINS].some((domain) => normalizedDomain === domain || normalizedDomain.endsWith(`.${domain}`))) {
      exclusions.push({ normalizedDomain, reason: "disallowed_domain" });
      continue;
    }
    const urlResult = sanitizeExactPublicTargetUrl(row.final_url);
    if (!urlResult.url) {
      exclusions.push({
        normalizedDomain,
        reason: urlResult.reason ?? "invalid_or_unsupported_url",
      });
      continue;
    }
    const finalDomain = normalizeDomain(new URL(urlResult.url).hostname);
    if (finalDomain !== normalizedDomain) {
      exclusions.push({
        detail: finalDomain,
        normalizedDomain,
        reason: "final_url_domain_mismatch",
      });
      continue;
    }
    const hold = publicTestContactHoldForUrl(urlResult.url);
    if (hold) {
      exclusions.push({ detail: hold.reason, normalizedDomain, reason: "repository_contact_hold" });
      continue;
    }
    const canonicalCmpName = canonicalRejectRecipeCmpName(row.cmp_vendor_name);
    if (!canonicalCmpName) {
      exclusions.push({
        detail: row.cmp_vendor_name ?? "unknown",
        normalizedDomain,
        reason: "unsupported_cmp_recipe",
      });
      continue;
    }
    eligible.push({
      assessmentSourceHash: row.assessment_source_hash,
      assessmentVersion: row.assessment_version,
      canonicalCmpName,
      completedAt: row.completed_at,
      consentFirstObservedAtMs: row.consent_first_observed_at_ms,
      contactLedger: {
        cooldownOverrideRequired: Date.parse(row.cooldown_until) > Date.now(),
        cooldownUntil: row.cooldown_until,
        effectiveState: row.effective_state,
        lastContactAt: row.last_contact_at,
        lastOutcome: row.last_outcome,
        lastSource: row.last_source,
      },
      egressId: row.egress_id,
      egressProvider: row.egress_provider,
      exactTargetUrl: urlResult.url,
      normalizedDomain,
      rejectEvidenceCount: row.reject_evidence_count,
      rejectFirstObservedAtMs: row.reject_first_observed_at_ms,
      rejectReasonCodes: row.reject_reason_codes,
      scanId: row.scan_id,
      scannerRegion: CALIFORNIA_SCANNER_REGION,
    });
  }

  const byCmp = new Map<string, CaliforniaRejectCandidate[]>();
  for (const candidate of eligible) {
    const bucket = byCmp.get(candidate.canonicalCmpName) ?? [];
    bucket.push(candidate);
    byCmp.set(candidate.canonicalCmpName, bucket);
  }
  const selected: CaliforniaRejectCandidate[] = [];
  const cmpNames = [...byCmp.keys()].sort();
  while (selected.length < limit) {
    let added = false;
    for (const cmpName of cmpNames) {
      const next = byCmp.get(cmpName)?.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }

  return { eligible, exclusions, selected };
}

function candidateQuery(days: number) {
  return `select coalesce(jsonb_agg(to_jsonb(q) order by q.completed_at desc), '[]'::jsonb)::text
from (
  select distinct on (public.normalize_scan_contact_domain(d.hostname))
         s.id::text as scan_id,
         s.completed_at::text as completed_at,
         public.normalize_scan_contact_domain(d.hostname) as normalized_domain,
         ss.consent_control_assessment #>> '{scan,finalUrl}' as final_url,
         coalesce(nullif(s.scanner_region, ''), nullif(se.metadata_json->>'awsRegion', ''),
                  nullif(s.scan_config_json#>>'{execution,v2DagLambda,awsRegion}', '')) as scanner_region,
         nullif(s.egress_provider, '') as egress_provider,
         nullif(s.egress_id, '') as egress_id,
         ss.cmp_vendor_name,
         ss.consent_control_assessment #>> '{provenance,sourceHash}' as assessment_source_hash,
         ss.consent_control_assessment #>> '{provenance,contractVersion}' as assessment_version,
         nullif(ss.consent_control_assessment #>> '{surface,firstObservedAtMs}', '')::integer as consent_first_observed_at_ms,
         nullif(ss.consent_control_assessment #>> '{controls,reject,firstObservedAtMs}', '')::integer as reject_first_observed_at_ms,
         coalesce(ss.consent_control_assessment #> '{controls,reject,reasonCodes}', '[]'::jsonb) as reject_reason_codes,
         (select count(*)::integer
            from jsonb_array_elements(coalesce(ss.consent_control_assessment->'evidence', '[]'::jsonb)) evidence
           where evidence->>'intent' = 'reject'
             and evidence->>'layer' = 'first_layer'
             and evidence->>'visible' = 'true'
             and evidence->>'actionable' = 'true'
             and coalesce(evidence->>'controlVariant', '') = '') as reject_evidence_count,
         ledger.last_contact_at::text,
         ledger.last_source,
         ledger.last_outcome,
         ledger.cooldown_until::text,
         coalesce(ledger.manual_state, ledger.automatic_state) as effective_state
    from public.scans s
    join public.domains d on d.id = s.domain_id
    join public.scan_snapshots ss on ss.scan_id = s.id
    join public.scan_domain_contact_ledger ledger
      on ledger.normalized_domain = public.normalize_scan_contact_domain(d.hostname)
    left join lateral (
      select event.metadata_json
        from public.scan_events event
       where event.scan_id = s.id
         and event.event_type = 'v2_lambda_result.received'
       order by event.created_at desc
       limit 1
    ) se on true
   where s.completed_at >= now() - interval '${days} days'
     and s.status = 'completed'
     and s.scan_config_json->>'processor' = 'local-certscore-v2-dag-parallel-v1'
     and coalesce(nullif(s.scanner_region, ''), nullif(se.metadata_json->>'awsRegion', ''),
                  nullif(s.scan_config_json#>>'{execution,v2DagLambda,awsRegion}', '')) = '${CALIFORNIA_SCANNER_REGION}'
     and ss.consent_reject_observed is true
     and ss.consent_assessment_status = 'complete'
     and ss.consent_coverage_status = 'complete'
     and ss.consent_surface_status = 'observed_actionable'
     and ss.consent_control_assessment #>> '{artifactVersion}' = '2.0'
     and ss.consent_control_assessment #>> '{assessmentStatus}' = 'complete'
     and ss.consent_control_assessment #>> '{scan,noGo}' = 'false'
     and ss.consent_control_assessment #>> '{document,identityStatus}' = 'matched'
     and ss.consent_control_assessment #>> '{controls,reject,state}' = 'observed'
     and ss.consent_control_assessment #>> '{controls,reject,layer}' = 'first_layer'
     and nullif(ss.consent_control_assessment #>> '{scan,finalUrl}', '') is not null
     and nullif(ss.consent_control_assessment #>> '{provenance,sourceHash}', '') is not null
     and ss.consent_assessment_source_hash = ss.consent_control_assessment #>> '{provenance,sourceHash}'
     and exists (
       select 1
         from jsonb_array_elements(coalesce(ss.consent_control_assessment->'evidence', '[]'::jsonb)) evidence
        where evidence->>'intent' = 'reject'
          and evidence->>'layer' = 'first_layer'
          and evidence->>'visible' = 'true'
          and evidence->>'actionable' = 'true'
          and coalesce(evidence->>'controlVariant', '') = ''
     )
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(ss.consent_control_assessment->'contradictions', '[]'::jsonb)) contradiction
        where coalesce(contradiction->'affectedFields', '[]'::jsonb) ? 'reject'
     )
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(ss.consent_control_assessment->'limitations', '[]'::jsonb)) limitation
        where coalesce(limitation->'affectedFields', '[]'::jsonb) ? 'reject'
     )
   order by public.normalize_scan_contact_domain(d.hostname), s.completed_at desc
   limit 600
) q`;
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    days: 240,
    egressLabel: "vpn-off-us-egress-verified",
    excludeSelection: "",
    limit: 20,
    out: "artifacts/post-refusal-public-hardening-2026-08-26/california-known-reject-v1/CaliforniaRejectCandidateSelection.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--days") parsed.days = Number(value);
    else if (arg === "--egress-label") parsed.egressLabel = value;
    else if (arg === "--exclude-selection") parsed.excludeSelection = value;
    else if (arg === "--limit") parsed.limit = Number(value);
    else if (arg === "--out") parsed.out = value;
    else throw new Error(`Unknown argument: ${arg}`);
    index += 1;
  }
  if (!Number.isInteger(parsed.days) || parsed.days < 1 || parsed.days > 365) {
    throw new Error("--days must be an integer from 1 through 365");
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 50) {
    throw new Error("--limit must be an integer from 1 through 50");
  }
  if (!parsed.egressLabel.trim()) throw new Error("--egress-label is required");
  return parsed;
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = await runProdDbSqlOneoff({
    marker: "CALIFORNIA_KNOWN_REJECT_CANDIDATES",
    readOnly: true,
    sql: candidateQuery(args.days),
  });
  const rows = parseSingleJsonOutput<CaliforniaRejectSourceRow[]>(output);
  const excludedDomains = args.excludeSelection
    ? await readExcludedDomains(path.resolve(args.excludeSelection))
    : new Set<string>();
  const selection = selectCaliforniaRejectCandidates(rows, args.limit, excludedDomains);
  const artifact = {
    artifactVersion: ARTIFACT_VERSION,
    generatedAt: new Date().toISOString(),
    readOnlyProductionMetadataQuery: true,
    initiatesTargetContact: false,
    egressLabel: args.egressLabel,
    sourceWindowDays: args.days,
    scannerRegion: CALIFORNIA_SCANNER_REGION,
    requestedCandidateCount: args.limit,
    sourceRowCount: rows.length,
    eligibleCandidateCount: selection.eligible.length,
    selectedCandidateCount: selection.selected.length,
    selectionComplete: selection.selected.length === args.limit,
    cooldownOverrideAuthorizedByProductOwner: true,
    filters: {
      typedAssessmentComplete: true,
      firstLayerRejectObserved: true,
      rejectEvidenceVisibleAndActionable: true,
      rejectAffectedContradictionsExcluded: true,
      rejectAffectedLimitationsExcluded: true,
      canonicalCmpRecipeRequired: true,
      exactRetainedFinalUrlRequired: true,
      centralContactLedgerRequired: true,
      blockedAndDoNotCalibrateExcluded: true,
      repositoryContactHoldsExcluded: true,
      previousCohortDomainsExcluded: excludedDomains.size,
    },
    selected: selection.selected,
    eligible: selection.eligible,
    exclusions: selection.exclusions,
  };
  const outPath = path.resolve(args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    artifactPath: outPath,
    eligibleCandidateCount: selection.eligible.length,
    selectedCandidateCount: selection.selected.length,
    selectionComplete: selection.selected.length === args.limit,
    selected: selection.selected.map((candidate) => ({
      canonicalCmpName: candidate.canonicalCmpName,
      exactTargetUrl: candidate.exactTargetUrl,
      normalizedDomain: candidate.normalizedDomain,
    })),
  }, null, 2));
}

async function readExcludedDomains(filePath: string) {
  const value = JSON.parse(await readFile(filePath, "utf8")) as {
    selected?: Array<{ normalizedDomain?: unknown }>;
  };
  if (!Array.isArray(value.selected)) {
    throw new Error("--exclude-selection must contain a selected candidate array");
  }
  return new Set(value.selected.flatMap((candidate) => {
    const normalizedDomain = typeof candidate.normalizedDomain === "string"
      ? normalizeDomain(candidate.normalizedDomain)
      : "";
    return normalizedDomain ? [normalizedDomain] : [];
  }));
}

if (process.argv[1]?.endsWith("select-prod-california-reject-candidates.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
