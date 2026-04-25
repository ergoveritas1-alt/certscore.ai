import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import {
  buildCookieDisclosureGapEvidence,
  buildRuntimeCookieInventory
} from "../lib/scans/runtime-cookie-evidence";
import { classifyCookieDisclosureGapPromotionBlockers } from "./production-promotion-blockers";

type CandidateRow = {
  domain: string | null;
  hybrid_runtime_evidence: Record<string, unknown> | null;
  id: string;
  policy_cookie_disclosures: unknown[] | null;
  policy_evidence_snippets: Record<string, unknown> | null;
  policy_extraction_status: string | null;
  policy_page_type: string | null;
  policy_page_url: string | null;
  policy_positive_signal_present: boolean | null;
  policy_semantic_confidence: number | null;
  policy_structurally_weak: boolean | null;
};

type ReviewedCookieGapRow = {
  assessment: "supports_promotion" | "supports_demotion" | "borderline";
  blockers: string[];
  disclosedProviderCount: number;
  domain: string | null;
  fetched: boolean;
  fetchStatus: number | null;
  mentionedCookieNames: string[];
  mentionedVendors: string[];
  policyUrl: string | null;
  promotionReadyBeforeUrlReview: boolean;
  rationale: string;
  scanId: string;
  sampleUnmatchedCookies: string[];
  sampleUnmatchedVendors: string[];
  textLength: number;
  unmatchedCookieCount: number;
  unmatchedThirdPartyCookieCount: number;
};

const USER_AGENT = "CertScoreCookieGapReview/1.0 (+https://certscore.ai)";

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

function normalizeText(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function tokenAppearsInText(token: string, text: string) {
  const normalized = normalizeToken(token);
  if (!normalized || normalized.length < 3) {
    return false;
  }
  return text.includes(normalized);
}

async function fetchPolicyText(url: string | null, timeoutMs: number) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { fetched: false, status: null, text: "" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "user-agent": USER_AGENT
      },
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = /text|html|xml|json/i.test(contentType) ? await response.text() : "";
    return {
      fetched: response.ok && text.trim().length > 0,
      status: response.status,
      text: normalizeText(text)
    };
  } catch {
    return { fetched: false, status: null, text: "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRows(limit: number) {
  const result = await query<CandidateRow>(
    `
      select s.id,
             ss.domain,
             ra.hybrid_runtime_evidence,
             pe.page_url as policy_page_url,
             pe.page_type as policy_page_type,
             case
               when pe.policy_structurally_weak is true then 'structurally_weak'
               when pe.id is not null then 'fetched'
               else null
             end as policy_extraction_status,
             pe.policy_semantic_confidence,
             pe.policy_structurally_weak,
             pe.policy_cookie_disclosures,
             coalesce(to_jsonb(pe)->'policy_evidence_snippets', '{}'::jsonb) as policy_evidence_snippets,
             exists (
               select 1 from scan_signals sig
                where sig.scan_id = s.id
                  and sig.signal_key = 'privacy.cookie_runtime_disclosure_gap_detected'
                  and sig.signal_value_json = 'true'::jsonb
             ) as policy_positive_signal_present
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
        join scan_runtime_artifacts ra on ra.scan_id = s.id
        join lateral (
          select *
            from policy_enrichment pe
           where pe.scan_id = s.id
             and pe.page_type = 'cookie_policy'
           order by pe.created_at desc
           limit 1
        ) pe on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = 'full'
         and jsonb_array_length(coalesce(ra.hybrid_runtime_evidence->'cookieWriteObservations', '[]'::jsonb)) > 0
       order by s.completed_at desc nulls last
       limit $1
    `,
    [limit],
    { readOnly: true }
  );
  return result.rows;
}

function buildDerivedEvidence(row: CandidateRow) {
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence: row.hybrid_runtime_evidence });
  const evidence = buildCookieDisclosureGapEvidence({
    cookiePolicyUrl: row.policy_page_url,
    disclosures: row.policy_cookie_disclosures ?? [],
    inventory
  });
  return {
    evidence,
    validationEvidence: {
      cookie_policy_url: evidence.cookie_policy_url,
      runtime_cookie_names: evidence.runtime_cookie_names,
      unmatched_cookie_names: evidence.unmatched_cookie_names,
      unmatched_cookie_count: evidence.unmatched_cookie_count,
      unmatched_cookie_vendors: evidence.unmatched_cookie_vendors,
      unmatched_third_party_cookie_count: evidence.unmatched_third_party_cookie_count
    }
  };
}

async function reviewRow(row: CandidateRow, timeoutMs: number): Promise<ReviewedCookieGapRow | null> {
  const { evidence, validationEvidence } = buildDerivedEvidence(row);
  const assessment = classifyCookieDisclosureGapPromotionBlockers({
    cookieGapValidationEvidence: validationEvidence,
    hybridRuntimeEvidence: row.hybrid_runtime_evidence,
    policyEvidenceSnippets: row.policy_evidence_snippets,
    policyExtractionStatus: row.policy_extraction_status,
    policyPageType: row.policy_page_type,
    policyPageUrl: row.policy_page_url,
    policyPositiveSignalPresent: row.policy_positive_signal_present,
    policySemanticConfidence: row.policy_semantic_confidence,
    policyStructurallyWeak: row.policy_structurally_weak
  });
  if (evidence.unmatched_cookie_count <= 0) {
    return null;
  }

  const fetched = await fetchPolicyText(row.policy_page_url, timeoutMs);
  const mentionedCookieNames = evidence.unmatched_cookie_names.filter((name) => tokenAppearsInText(name, fetched.text));
  const mentionedVendors = evidence.unmatched_cookie_vendors.filter((vendor) => tokenAppearsInText(vendor, fetched.text));
  const coverageHits = mentionedCookieNames.length + mentionedVendors.length;
  const coverageDenominator = evidence.unmatched_cookie_names.length + evidence.unmatched_cookie_vendors.length;

  let urlAssessment: ReviewedCookieGapRow["assessment"] = "borderline";
  let rationale = "Live URL review was inconclusive; keep this case as review-only until policy text and runtime inventory are manually reconciled.";
  if (!fetched.fetched || fetched.text.length < 500) {
    urlAssessment = "borderline";
    rationale = "Live URL fetch was unavailable or too small to validate policy coverage.";
  } else if (coverageDenominator > 0 && coverageHits >= Math.max(1, Math.ceil(coverageDenominator * 0.75))) {
    urlAssessment = "supports_demotion";
    rationale = "Live policy text appears to mention most unmatched runtime cookies or vendors; promotion should be blocked unless structured extraction proves the gap.";
  } else if (assessment.promotionReady && coverageHits === 0 && evidence.unmatched_cookie_count > 0) {
    urlAssessment = "supports_promotion";
    rationale = "Live policy text did not mention the sampled unmatched runtime cookies or vendors, supporting the retained disclosure-gap evidence.";
  } else if (assessment.promotionReady) {
    urlAssessment = "borderline";
    rationale = "Live policy text mentions some unmatched cookies or vendors; keep as review-only pending alias/category reconciliation.";
  }

  return {
    assessment: urlAssessment,
    blockers: assessment.blockers,
    disclosedProviderCount: evidence.disclosed_cookie_providers.length,
    domain: row.domain,
    fetched: fetched.fetched,
    fetchStatus: fetched.status,
    mentionedCookieNames,
    mentionedVendors,
    policyUrl: row.policy_page_url,
    promotionReadyBeforeUrlReview: assessment.promotionReady,
    rationale,
    scanId: row.id,
    sampleUnmatchedCookies: evidence.unmatched_cookie_names.slice(0, 8),
    sampleUnmatchedVendors: evidence.unmatched_cookie_vendors.slice(0, 8),
    textLength: fetched.text.length,
    unmatchedCookieCount: evidence.unmatched_cookie_count,
    unmatchedThirdPartyCookieCount: evidence.unmatched_third_party_cookie_count
  };
}

function renderMarkdown(rows: ReviewedCookieGapRow[]) {
  const lines = [
    "# Cookie Disclosure Gap URL Review",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Domain | URL assessment | Ready before URL review | Fetch | Unmatched | Mentioned | Policy URL | Rationale |",
    "|---|---|---:|---|---:|---|---|---|"
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.domain ?? "-"} | ${row.assessment} | ${row.promotionReadyBeforeUrlReview ? "yes" : "no"} | ${row.fetched ? row.fetchStatus ?? "ok" : "failed"} / ${row.textLength} chars | ${row.unmatchedCookieCount} | ${[...row.mentionedCookieNames, ...row.mentionedVendors].slice(0, 6).join(", ") || "-"} | ${row.policyUrl ?? "-"} | ${row.rationale.replace(/\|/g, "\\|")} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const limit = getNumberArg("--limit", 25);
  const timeoutMs = getNumberArg("--timeout-ms", 8000);
  const rows = await loadRows(limit);
  const reviewed = (await Promise.all(rows.map((row) => reviewRow(row, timeoutMs))))
    .filter((row): row is ReviewedCookieGapRow => Boolean(row))
    .sort((left, right) => {
      const priority = { supports_promotion: 0, borderline: 1, supports_demotion: 2 };
      return priority[left.assessment] - priority[right.assessment] || Number(right.promotionReadyBeforeUrlReview) - Number(left.promotionReadyBeforeUrlReview);
    });

  process.stdout.write(hasFlag("--json") ? `${JSON.stringify(reviewed, null, 2)}\n` : renderMarkdown(reviewed));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
