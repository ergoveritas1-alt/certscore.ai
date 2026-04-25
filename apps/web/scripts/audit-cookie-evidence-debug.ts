import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { buildRuntimeCookieInventory } from "../lib/scans/runtime-cookie-evidence";
import {
  classifyCookieDisclosureGapPromotionBlockers,
  classifyPreconsentPromotionBlockers
} from "./production-promotion-blockers";

type CookieDebugRow = {
  cookie_gap_validation_evidence: Record<string, unknown> | null;
  consent_baseline_tracker_evidence_urls: string[] | null;
  domain: string | null;
  hybrid_runtime_evidence: Record<string, unknown> | null;
  id: string;
  policy_evidence_snippets: Record<string, unknown> | null;
  policy_extraction_status: string | null;
  policy_page_type: string | null;
  policy_page_url: string | null;
  policy_positive_signal_present: boolean | null;
  policy_semantic_confidence: number | null;
  policy_structurally_weak: boolean | null;
  preconsent_tracking_detected: boolean | null;
  preconsent_violation_evidence_urls: string[] | null;
  tracking_before_consent_detected: boolean | null;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getValidationCookiePolicyUrl(evidence: Record<string, unknown> | null | undefined) {
  return getString(evidence?.cookiePolicyUrl ?? evidence?.cookie_policy_url);
}

function summarizePolicyCookieMentions(row: CookieDebugRow) {
  const validation = getRecord(row.cookie_gap_validation_evidence);
  const snippets = row.policy_evidence_snippets ?? {};
  const text = JSON.stringify(snippets).toLowerCase();
  const disclosedNames = [
    ...getStringArray(validation?.disclosedCookieNames ?? validation?.disclosed_cookie_names),
    ...getStringArray(validation?.policyCookieNames ?? validation?.policy_cookie_names)
  ];
  const disclosedVendors = [
    ...getStringArray(validation?.disclosedCookieVendors ?? validation?.disclosed_cookie_vendors),
    ...getStringArray(validation?.policyCookieVendors ?? validation?.policy_cookie_vendors)
  ];
  return {
    disclosedCookieNames: [...new Set(disclosedNames)].slice(0, 12),
    disclosedCookieVendors: [...new Set(disclosedVendors)].slice(0, 12),
    mentionsAdvertising: /advertis|marketing|retarget|personalized|interest-based/.test(text),
    mentionsAnalytics: /analytic|measurement|performance/.test(text),
    mentionsCookies: /cookie|tracking technolog|pixel|tag|beacon/.test(text),
    policyUrl: row.policy_page_url ?? getValidationCookiePolicyUrl(validation)
  };
}

async function loadRows(limit: number) {
  const result = await query<CookieDebugRow>(
    `
      select s.id,
             ss.domain,
             ss.preconsent_tracking_detected,
             ss.tracking_before_consent_detected,
             ra.hybrid_runtime_evidence,
             ra.consent_baseline_tracker_evidence_urls,
             coalesce(pcv.evidence_urls, '{}'::text[]) as preconsent_violation_evidence_urls,
             cgv.evidence as cookie_gap_validation_evidence,
             pe.page_url as policy_page_url,
             pe.page_type as policy_page_type,
             case
               when pe.policy_structurally_weak is true then 'structurally_weak'
               when pe.id is not null then 'fetched'
               else null
             end as policy_extraction_status,
             pe.policy_semantic_confidence,
             pe.policy_structurally_weak,
             coalesce(to_jsonb(pe)->'policy_evidence_snippets', '{}'::jsonb) as policy_evidence_snippets,
             exists (
               select 1 from scan_signals sig
                where sig.scan_id = s.id
                  and sig.signal_key = 'privacy.cookie_runtime_disclosure_gap_detected'
                  and sig.signal_value_json = 'true'::jsonb
             ) as policy_positive_signal_present
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
        left join scan_runtime_artifacts ra on ra.scan_id = s.id
        left join lateral (
          select array_agg(distinct url) filter (where url is not null and url <> '') as evidence_urls
            from scan_preconsent_violations spv
            left join lateral unnest(spv.evidence_urls) as url on true
           where spv.scan_id = s.id
        ) pcv on true
        left join lateral (
          select vf.evidence_json as evidence
            from validation_runs vr
            join validation_run_findings vf on vf.validation_run_id = vr.id
           where vr.scan_id = s.id
             and vf.rule_key = 'cookie_runtime.disclosure_gap'
           order by vf.created_at desc nulls last
           limit 1
        ) cgv on true
        left join lateral (
          select *
            from policy_enrichment pe
           where pe.scan_id = s.id
             and (pe.page_type in ('cookie_policy', 'privacy_policy') or pe.page_type is null)
           order by case when pe.page_type = 'cookie_policy' then 0 else 1 end, pe.created_at desc
           limit 1
        ) pe on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = 'full'
         and (
           jsonb_array_length(coalesce(ra.hybrid_runtime_evidence->'cookieWriteObservations', '[]'::jsonb)) > 0 or
           ss.preconsent_tracking_detected is true or
           ss.tracking_before_consent_detected is true or
           cgv.evidence is not null
         )
       order by s.completed_at desc nulls last
       limit $1
    `,
    [limit],
    { readOnly: true }
  );
  return result.rows;
}

function buildDebugRows(rows: CookieDebugRow[]) {
  return rows.map((row) => {
    const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: row.hybrid_runtime_evidence });
    const policy = summarizePolicyCookieMentions(row);
    const preconsentAssessment = classifyPreconsentPromotionBlockers({
      consentBaselineTrackerEvidenceUrls: row.consent_baseline_tracker_evidence_urls,
      hybridRuntimeEvidence: row.hybrid_runtime_evidence,
      preconsentTrackingDetected: row.preconsent_tracking_detected,
      preconsentViolationEvidenceUrls: row.preconsent_violation_evidence_urls,
      trackingBeforeConsentDetected: row.tracking_before_consent_detected
    });
    const disclosureAssessment = classifyCookieDisclosureGapPromotionBlockers({
      cookieGapValidationEvidence: row.cookie_gap_validation_evidence,
      hybridRuntimeEvidence: row.hybrid_runtime_evidence,
      policyEvidenceSnippets: row.policy_evidence_snippets,
      policyExtractionStatus: row.policy_extraction_status,
      policyPageType: row.policy_page_type,
      policyPageUrl: policy.policyUrl,
      policyPositiveSignalPresent: row.policy_positive_signal_present,
      policySemanticConfidence: row.policy_semantic_confidence,
      policyStructurallyWeak: row.policy_structurally_weak
    });
    return {
      beforeConsentCookieCount: inventory.beforeConsentRows.length,
      cookieCategories: inventory.cookieCategories,
      cookieDisclosureBlockers: disclosureAssessment.blockers,
      cookieDisclosurePromotionReady: disclosureAssessment.promotionReady,
      domain: row.domain,
      initiatorDomains: [...new Set(inventory.rows.flatMap((entry) => entry.initiatorDomain).filter(Boolean))].slice(0, 8),
      initiatorVendors: [...new Set(inventory.rows.flatMap((entry) => entry.initiatorVendor).filter(Boolean))].slice(0, 8),
      nonEssentialCookieCount: inventory.nonEssentialCookieNames.length,
      policy,
      preconsentBlockers: preconsentAssessment.blockers,
      preconsentPromotionReady: preconsentAssessment.promotionReady,
      sampleBeforeConsentCookies: inventory.beforeConsentCookieNames.slice(0, 8),
      sampleRuntimeCookies: inventory.cookieNames.slice(0, 8),
      sampleUnmatchedCookies: inventory.unmatchedCookieNames.slice(0, 8),
      scanId: row.id,
      runtimeCookieCount: inventory.cookieNames.length,
      unmatchedCookieCount: inventory.unmatchedCookieNames.length
    };
  });
}

function renderMarkdown(rows: ReturnType<typeof buildDebugRows>) {
  const lines = [
    "# Cookie Evidence Debug",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Domain | Runtime | Before consent | Non-essential | Unmatched | Preconsent | Disclosure gap | Initiators | Sample runtime cookies | Sample unmatched |",
    "|---|---:|---:|---:|---:|---|---|---|---|---|"
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.domain ?? "-"} | ${row.runtimeCookieCount} | ${row.beforeConsentCookieCount} | ${row.nonEssentialCookieCount} | ${row.unmatchedCookieCount} | ${row.preconsentPromotionReady ? "ready" : row.preconsentBlockers.join(", ") || "-"} | ${row.cookieDisclosurePromotionReady ? "ready" : row.cookieDisclosureBlockers.join(", ") || "-"} | ${row.initiatorVendors.join(", ") || row.initiatorDomains.join(", ") || "-"} | ${row.sampleRuntimeCookies.join(", ") || "-"} | ${row.sampleUnmatchedCookies.join(", ") || "-"} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const rows = buildDebugRows(await loadRows(getNumberArg("--limit", 80)));
  process.stdout.write(hasFlag("--json") ? `${JSON.stringify(rows, null, 2)}\n` : renderMarkdown(rows));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
