import { classifyPrivacySurface, PRIVACY_EVIDENCE_LOCALE_REGISTRY } from "@certscore/contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RecordValue = Record<string, any>;
type Outcome = "policy_confirmed" | "policy_likely" | "no_policy_found" | "not_testable";

const DEFAULT_MANIFEST = "/Volumes/miniben/CertScore/evidence/calibration/manifest.json";
const DEFAULT_OUT_DIR = "/Volumes/miniben/CertScore/evidence/calibration/privacy-policy-gap-analysis";
const SAMPLE_SIZE = 120;
const SITE_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 600_000;
const BETWEEN_SITE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function parseAnchors(html: string, pageUrl: string) {
  const anchors: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "";
    if (!href || /^(?:javascript:|mailto:|tel:|#)/i.test(href)) continue;
    try {
      anchors.push({ href: new URL(href, pageUrl).toString(), text: decodeHtml(match[2] ?? "") });
    } catch {
      // Ignore malformed retained links.
    }
  }
  return anchors;
}

async function boundedFetch(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "CertScore evidence-validation/1.0 (+https://certscore.ai)" },
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const bounded = bytes.subarray(0, MAX_BODY_BYTES);
    return {
      body: new TextDecoder("utf-8", { fatal: false }).decode(bounded),
      contentType,
      finalUrl: response.url,
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      body: "",
      contentType: "",
      error: error instanceof Error ? error.message : String(error),
      finalUrl: url,
      ok: false,
      status: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function selectAcrossSiteTypes(rows: RecordValue[], size: number) {
  const buckets = new Map<string, RecordValue[]>();
  for (const row of rows) {
    const key = String(row.siteType ?? "unknown");
    const bucket = buckets.get(key) ?? [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) bucket.sort((a, b) => String(a.domain).localeCompare(String(b.domain)));
  const selected: RecordValue[] = [];
  const orderedBuckets = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  let cursor = 0;
  while (selected.length < Math.min(size, rows.length) && orderedBuckets.some(([, values]) => values.length > 0)) {
    const [, values] = orderedBuckets[cursor % orderedBuckets.length]!;
    const next = values.shift();
    if (next) selected.push(next);
    cursor += 1;
  }
  return selected;
}

function selectSample(rows: RecordValue[], size: number) {
  const withScreenshot = rows.filter((row) => Boolean(row.evidence?.pngPath));
  const withoutScreenshot = rows.filter((row) => !row.evidence?.pngPath);
  const screenshotTarget = Math.round(size * withScreenshot.length / rows.length);
  return [
    ...selectAcrossSiteTypes(withScreenshot, screenshotTarget),
    ...selectAcrossSiteTypes(withoutScreenshot, size - screenshotTarget)
  ];
}

function privacyFallbackPaths() {
  return unique(PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) =>
    entry.privacyPolicyPathSlugs.map((slug) => `/${slug.replace(/^\/+/, "")}`)
  )).slice(0, 12);
}

async function analyzeSite(row: RecordValue) {
  const domain = String(row.domain ?? "").trim();
  const homepage = await boundedFetch(`https://${domain}`);
  const baseResult = {
    scanId: row.scanId,
    domain,
    benchmark: row.benchmark,
    siteType: row.siteType,
    screenshotAvailable: Boolean(row.evidence?.pngPath),
    originalNoGo: Boolean(row.noGo),
    originalAccessLimited: Boolean(row.accessLimited),
    homepage: {
      status: homepage.status,
      finalUrl: homepage.finalUrl,
      error: "error" in homepage ? homepage.error : null
    },
    policyUrl: null as string | null,
    discoveryMethod: null as string | null,
    confidence: "low" as "high" | "medium" | "low",
    matchedLocale: null as string | null,
    rootCauses: [] as string[],
    outcome: "not_testable" as Outcome
  };
  if (!homepage.ok || !/html|xhtml/i.test(homepage.contentType)) {
    baseResult.rootCauses.push("homepage_not_reached");
    return baseResult;
  }

  const homeOrigin = new URL(homepage.finalUrl).origin;
  const candidates = parseAnchors(homepage.body, homepage.finalUrl)
    .filter((anchor) => {
      try { return new URL(anchor.href).origin === homeOrigin; } catch { return false; }
    })
    .map((anchor) => ({
      ...anchor,
      classification: classifyPrivacySurface({ linkText: anchor.text, url: anchor.href, surroundingText: "footer header navigation policy" })
    }))
    .filter((candidate) => candidate.classification.surfaceType === "privacy_policy")
    .sort((a, b) => b.classification.confidence - a.classification.confidence);

  for (const candidate of candidates.slice(0, 3)) {
    const response = await boundedFetch(candidate.href);
    if (response.ok && /html|pdf/i.test(response.contentType)) {
      baseResult.outcome = "policy_confirmed";
      baseResult.policyUrl = response.finalUrl;
      baseResult.discoveryMethod = "rendered_homepage_link";
      baseResult.confidence = candidate.classification.confidence >= 0.8 ? "high" : "medium";
      baseResult.matchedLocale = candidate.classification.matchedLocale ?? null;
      baseResult.rootCauses.push("rendered_link_discovery_missed");
      if (response.finalUrl !== candidate.href) baseResult.rootCauses.push("redirect_or_canonicalization_missed");
      return baseResult;
    }
  }

  if (candidates.length > 0) {
    const candidate = candidates[0]!;
    baseResult.outcome = "policy_likely";
    baseResult.policyUrl = candidate.href;
    baseResult.discoveryMethod = "unverified_rendered_homepage_link";
    baseResult.confidence = "medium";
    baseResult.matchedLocale = candidate.classification.matchedLocale ?? null;
    baseResult.rootCauses.push("rendered_link_discovery_missed");
    return baseResult;
  }

  for (const fallbackPath of privacyFallbackPaths().slice(0, 4)) {
    const candidateUrl = new URL(fallbackPath, String(homepage.finalUrl)).toString();
    const response = await boundedFetch(candidateUrl);
    if (!response.ok || !/html|pdf/i.test(response.contentType)) continue;
    const classification = classifyPrivacySurface({ url: response.finalUrl, title: response.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] });
    if (classification.surfaceType !== "privacy_policy") continue;
    baseResult.outcome = "policy_confirmed";
    baseResult.policyUrl = response.finalUrl;
    baseResult.discoveryMethod = "canonical_path_probe";
    baseResult.confidence = "medium";
    baseResult.matchedLocale = classification.matchedLocale ?? null;
    baseResult.rootCauses.push("canonical_policy_path_missed");
    return baseResult;
  }

  baseResult.outcome = "no_policy_found";
  baseResult.rootCauses.push("bounded_discovery_found_no_policy_candidate");
  return baseResult;
}

function wilson(successes: number, total: number) {
  if (total === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function countBy(values: string[]) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}

async function main() {
  const manifestPath = process.argv[2] ?? DEFAULT_MANIFEST;
  const outDir = process.argv[3] ?? DEFAULT_OUT_DIR;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RecordValue;
  const cohort = (manifest.rows as RecordValue[]).filter((row) => row.assignment !== "excluded" && row.evidence?.hasPolicySurface !== true);
  const sample = selectSample(cohort, SAMPLE_SIZE);
  const results = [];
  for (let index = 0; index < sample.length; index += SITE_CONCURRENCY) {
    const batch = sample.slice(index, index + SITE_CONCURRENCY);
    results.push(...await Promise.all(batch.map(analyzeSite)));
    if (index + SITE_CONCURRENCY < sample.length) await sleep(BETWEEN_SITE_DELAY_MS);
  }
  const testable = results.filter((row) => row.outcome !== "not_testable");
  const positive = testable.filter((row) => row.outcome === "policy_confirmed" || row.outcome === "policy_likely");
  const interval = wilson(positive.length, testable.length);
  const summary = {
    cohortSize: cohort.length,
    sampleSize: results.length,
    testableSampleSize: testable.length,
    outcomes: countBy(results.map((row) => row.outcome)),
    rootCauses: countBy(results.flatMap((row) => row.rootCauses)),
    conditionalPolicyPrevalence: testable.length ? positive.length / testable.length : null,
    conditionalWilson95: interval,
    estimatedFullCohortPolicyCountConditionalOnTestability: testable.length ? {
      point: Math.round(cohort.length * positive.length / testable.length),
      low: Math.round(cohort.length * interval.low),
      high: Math.round(cohort.length * interval.high)
    } : null,
    limitations: [
      "Estimate is conditional on sites reachable during this bounded validation run.",
      "Screenshots were inventoried but not OCR-processed because no local OCR runtime was available.",
      "No consent controls were clicked and no post-consent behavior was exercised.",
      "No-policy-found means the bounded method found no candidate; it does not establish policy absence."
    ]
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "analysis.json"), `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt: new Date().toISOString(), summary, rows: results }, null, 2)}\n`);
  const lines = [
    "# Privacy-policy gap analysis",
    "",
    "This analysis is diagnostic only. It does not change findings or treat an unresolved policy as absent.",
    "",
    "## Summary",
    "",
    `- Cohort: ${summary.cohortSize}`,
    `- Reproducible bounded sample: ${summary.sampleSize}`,
    `- Testable during live validation: ${summary.testableSampleSize}`,
    `- Outcomes: ${Object.entries(summary.outcomes).map(([key, value]) => `${key}=${value}`).join(", ")}`,
    `- Conditional policy prevalence: ${summary.conditionalPolicyPrevalence === null ? "not estimable" : `${(summary.conditionalPolicyPrevalence * 100).toFixed(1)}%`}`,
    `- Conditional full-cohort estimate: ${summary.estimatedFullCohortPolicyCountConditionalOnTestability ? `${summary.estimatedFullCohortPolicyCountConditionalOnTestability.point} (${summary.estimatedFullCohortPolicyCountConditionalOnTestability.low}-${summary.estimatedFullCohortPolicyCountConditionalOnTestability.high}, 95% interval)` : "not estimable"}`,
    "",
    "## Root causes observed",
    "",
    ...Object.entries(summary.rootCauses).sort(([, a], [, b]) => b - a).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Recommendations",
    "",
    "1. Preserve the distinction between policy not observed and policy not evaluated.",
    "2. Retain rendered homepage/footer candidates, classifier result, fetch result, final URL, and rejection reason.",
    "3. Reuse the canonical 40-locale privacy-surface classifier for anchor and common-path discovery.",
    "4. Add bounded canonical-path fallback only after rendered-link discovery, with strict same-origin and request limits.",
    "5. Record redirect and canonicalization outcomes rather than discarding the original candidate.",
    "6. Add deterministic fixtures for localized links, delayed footer rendering, relative URLs, redirects, custom-element anchors, and blocked homepages.",
    "7. Trace any retained candidate lost from the public evidence projection through typed evidence, normalized concern, policy, and checklist projection.",
    "",
    "## Limitations",
    "",
    ...summary.limitations.map((item) => `- ${item}`),
    "",
    "## Reviewed sites",
    "",
    "| Domain | Outcome | Policy URL | Discovery | Root causes |",
    "|---|---|---|---|---|",
    ...results.map((row) => `| ${row.domain} | ${row.outcome} | ${row.policyUrl ?? "—"} | ${row.discoveryMethod ?? "—"} | ${row.rootCauses.join(", ")} |`),
    ""
  ];
  await writeFile(path.join(outDir, "report.md"), lines.join("\n"));
  console.log(JSON.stringify(summary, null, 2));
}

void main();
