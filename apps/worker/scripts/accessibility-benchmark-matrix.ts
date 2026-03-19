import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  evaluateAccessibilityBenchmarkAssertions,
  type AccessibilityBenchmarkAssertion,
  type AccessibilityBenchmarkSummary
} from "@website-signal-risk-scanner/scan-core";
import { runFullScanJob } from "@website-signal-risk-scanner/scan-core";

type BenchmarkSuite = "act" | "apg" | "real-world";

type BenchmarkTarget = {
  assertions?: AccessibilityBenchmarkAssertion;
  expectedIssueFamilies: string[];
  notes: string;
  pagesRequested: number;
  sourceLabel: string;
  sourceUrl: string;
  suite: BenchmarkSuite;
  title: string;
  url: string;
};

type OrganizationRow = {
  id: string;
  slug: string | null;
};

type DomainRow = {
  hostname: string;
  id: string;
  normalized_url: string;
  organization_id: string | null;
};

const STARTER_MATRIX: BenchmarkTarget[] = [
  {
    suite: "act",
    title: "ACT image accessible-name rule page",
    url: "https://act-rules.github.io/rules/23a2a8/",
    sourceLabel: "W3C ACT Rules community rule examples",
    sourceUrl: "https://act-rules.github.io/rules/23a2a8/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 1,
      minWcagErrorCountTotal: 1,
      requiredRuleCodes: ["region"]
    },
    expectedIssueFamilies: ["images", "names"],
    notes: "Rule page with embedded ACT examples for image accessible-name handling."
  },
  {
    suite: "act",
    title: "ACT form field accessible-name rule page",
    url: "https://act-rules.github.io/rules/e086e5/",
    sourceLabel: "W3C ACT Rules community rule examples",
    sourceUrl: "https://act-rules.github.io/rules/e086e5/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 1,
      minWcagErrorCountTotal: 1,
      requiredRuleCodes: ["region"]
    },
    expectedIssueFamilies: ["forms", "labels"],
    notes: "Rule page with embedded ACT examples for form-field naming."
  },
  {
    suite: "act",
    title: "ACT text contrast rule page",
    url: "https://act-rules.github.io/rules/afw4f7/",
    sourceLabel: "W3C ACT Rules community rule examples",
    sourceUrl: "https://act-rules.github.io/rules/afw4f7/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 1,
      minWcagErrorCountTotal: 1,
      requiredRuleCodes: ["region"]
    },
    expectedIssueFamilies: ["contrast", "visual"],
    notes: "Rule page with embedded ACT examples for text contrast checks."
  },
  {
    suite: "apg",
    title: "APG accordion example",
    url: "https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/",
    sourceLabel: "WAI-ARIA APG examples",
    sourceUrl: "https://www.w3.org/WAI/ARIA/apg/patterns/accordion/examples/accordion/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 3,
      minWcagErrorCountTotal: 3,
      requiredRuleCodes: ["frame-title", "region"]
    },
    expectedIssueFamilies: ["aria", "keyboard"],
    notes: "Widget-focused page for keyboard interaction and ARIA semantics."
  },
  {
    suite: "apg",
    title: "APG modal dialog example",
    url: "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/",
    sourceLabel: "WAI-ARIA APG examples",
    sourceUrl: "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 4,
      minWcagErrorCountTotal: 3,
      requiredRuleCodes: ["frame-title", "region"]
    },
    expectedIssueFamilies: ["aria", "dialogs", "keyboard"],
    notes: "Modal example with focus management and interactive controls."
  },
  {
    suite: "apg",
    title: "APG tabs example",
    url: "https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/",
    sourceLabel: "WAI-ARIA APG examples",
    sourceUrl: "https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/",
    pagesRequested: 1,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 3,
      minWcagErrorCountTotal: 3,
      requiredRuleCodes: ["frame-title", "region"]
    },
    expectedIssueFamilies: ["aria", "keyboard", "tabs"],
    notes: "Manual-activation tabs pattern for widget-behavior regression checks."
  },
  {
    suite: "real-world",
    title: "W3C homepage",
    url: "https://www.w3.org/",
    sourceLabel: "Real-world control site",
    sourceUrl: "https://www.w3.org/",
    pagesRequested: 3,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 4,
      minWcagErrorCountTotal: 1,
      requiredRuleCodes: ["link-name"]
    },
    expectedIssueFamilies: ["baseline"],
    notes: "Low-risk control target with a mature standards-oriented content model."
  },
  {
    suite: "real-world",
    title: "MDN homepage",
    url: "https://developer.mozilla.org/",
    sourceLabel: "Real-world content site",
    sourceUrl: "https://developer.mozilla.org/",
    pagesRequested: 3,
    assertions: {
      allowedHomepageFetchStatuses: ["ok", "redirected"],
      minAccessibilityScore: 95,
      minPagesScanned: 4,
      maxWcagErrorCountTotal: 0
    },
    expectedIssueFamilies: ["navigation", "content"],
    notes: "Docs-heavy page with navigation, search, and responsive content."
  },
  {
    suite: "real-world",
    title: "USA.gov homepage",
    url: "https://www.usa.gov/",
    sourceLabel: "Real-world government site",
    sourceUrl: "https://www.usa.gov/",
    pagesRequested: 3,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 90,
      minPagesScanned: 6,
      minWcagErrorCountTotal: 1,
      requiredRuleCodes: ["landmark-unique"]
    },
    expectedIssueFamilies: ["forms", "navigation", "content"],
    notes: "Government target for a real-world public-service baseline."
  },
  {
    suite: "real-world",
    title: "GitHub homepage",
    url: "https://github.com/",
    sourceLabel: "Real-world application landing page",
    sourceUrl: "https://github.com/",
    pagesRequested: 3,
    assertions: {
      allowedHomepageFetchStatuses: ["ok"],
      minAccessibilityScore: 95,
      minPagesScanned: 8,
      maxWcagErrorCountTotal: 0
    },
    expectedIssueFamilies: ["navigation", "dialogs", "forms"],
    notes: "Widely used production site with app-style navigation and sign-up controls."
  }
];

function parseArgs(argv: string[]) {
  const suites = new Set<BenchmarkSuite>();
  let dryRun = false;
  let limit: number | null = null;
  let offset = 0;
  let assertBenchmarks = false;
  let runNow = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--run-now") {
      runNow = true;
      continue;
    }

    if (arg === "--assert") {
      assertBenchmarks = true;
      continue;
    }

    if (arg.startsWith("--suite=")) {
      const requested = arg
        .slice("--suite=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      for (const suite of requested) {
        if (suite === "act" || suite === "apg" || suite === "real-world") {
          suites.add(suite);
        } else {
          throw new Error(`Unsupported suite ${suite}. Expected act, apg, or real-world.`);
        }
      }
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value ${arg}.`);
      }
      limit = parsed;
      continue;
    }

    if (arg.startsWith("--offset=")) {
      const parsed = Number(arg.slice("--offset=".length));
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid --offset value ${arg}.`);
      }
      offset = parsed;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dryRun,
    assertBenchmarks,
    limit,
    offset,
    runNow,
    suites
  };
}

function selectTargets(input: { limit: number | null; offset: number; suites: Set<BenchmarkSuite> }) {
  const filtered = STARTER_MATRIX.filter((target) => input.suites.size === 0 || input.suites.has(target.suite));
  const offsetFiltered = filtered.slice(input.offset);
  return input.limit ? offsetFiltered.slice(0, input.limit) : offsetFiltered;
}

function getHostname(url: string) {
  return new URL(url).hostname.toLowerCase();
}

function getNormalizedDomainUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}/`;
}

async function resolveDemoOrganization() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load organizations: ${error.message}`);
  }

  const organizations = (data ?? []) as OrganizationRow[];
  const demo = organizations.find((organization) => organization.slug === "certscore-dev") ?? organizations[0];

  if (!demo) {
    throw new Error("No organization found. Seed or create the demo workspace first.");
  }

  return demo;
}

async function ensureDomain(input: { hostname: string; normalizedUrl: string; organizationId: string }) {
  const supabase = createAdminClient();
  const { data: existingByUrl, error: normalizedUrlError } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url")
    .eq("organization_id", input.organizationId)
    .eq("normalized_url", input.normalizedUrl)
    .limit(1)
    .maybeSingle();

  if (normalizedUrlError) {
    throw new Error(`Failed to load domain ${input.normalizedUrl}: ${normalizedUrlError.message}`);
  }

  if (existingByUrl) {
    return existingByUrl as DomainRow;
  }

  const { data: existingByHostname, error } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url")
    .eq("organization_id", input.organizationId)
    .eq("hostname", input.hostname)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load domain ${input.hostname}: ${error.message}`);
  }

  if (existingByHostname) {
    return existingByHostname as DomainRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("domains")
    .insert({
      organization_id: input.organizationId,
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      scan_frequency: "manual"
    })
    .select("id, organization_id, hostname, normalized_url")
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to create domain ${input.hostname}: ${insertError?.message ?? "unknown error"}`);
  }

  return inserted as DomainRow;
}

async function createBenchmarkScan(input: {
  organizationId: string;
  domain: DomainRow;
  target: BenchmarkTarget;
}) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .insert({
      organization_id: input.organizationId,
      domain_id: input.domain.id,
      scan_type: "full",
      status: "queued",
      pages_requested: input.target.pagesRequested,
      pages_scanned: 0,
      scan_config_json: {
        processor: "accessibility-benchmark-v1",
        profile: input.target.pagesRequested <= 1 ? "homepage" : "smoke",
        maxPages: input.target.pagesRequested,
        startUrl: input.target.url,
        source: "accessibility-benchmark-matrix",
        benchmarkSuite: input.target.suite,
        benchmarkTitle: input.target.title,
        benchmarkSourceLabel: input.target.sourceLabel,
        benchmarkSourceUrl: input.target.sourceUrl,
        benchmarkExpectedIssueFamilies: input.target.expectedIssueFamilies,
        benchmarkNotes: input.target.notes
      }
    })
    .select("id")
    .single();

  if (error || !scan) {
    throw new Error(`Failed to create benchmark scan for ${input.target.title}: ${error?.message ?? "unknown error"}`);
  }

  const { error: latestScanError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scan.id })
    .eq("id", input.domain.id)
    .eq("organization_id", input.organizationId);

  if (latestScanError) {
    throw new Error(`Failed to update domain ${input.domain.hostname} latest scan id: ${latestScanError.message}`);
  }

  return scan.id;
}

async function loadScanSummary(scanId: string) {
  const supabase = createAdminClient();
  const [{ data: snapshot, error: snapshotError }, { data: ruleCounts, error: ruleCountsError }] = await Promise.all([
    supabase
      .from("scan_snapshots")
      .select("scan_id, domain, homepage_fetch_status, pages_scanned, accessibility_score, wcag_error_count_total, wcag_aria_error_count, wcag_missing_alt_count, wcag_form_label_error_count, wcag_keyboard_navigation_issue_count, wcag_contrast_failures_count")
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_accessibility_rule_counts")
      .select("rule_code, instance_count")
      .eq("scan_id", scanId)
      .order("instance_count", { ascending: false })
      .limit(5)
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshot for ${scanId}: ${snapshotError.message}`);
  }

  if (ruleCountsError) {
    throw new Error(`Failed to load rule counts for ${scanId}: ${ruleCountsError.message}`);
  }

  return {
    snapshot,
    topRules: (ruleCounts ?? []).map((row) => ({
      ruleCode: row.rule_code as string,
      instanceCount: row.instance_count as number
    }))
  } satisfies AccessibilityBenchmarkSummary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targets = selectTargets({
    limit: options.limit,
    offset: options.offset,
    suites: options.suites
  });

  if (targets.length === 0) {
    throw new Error("No benchmark targets selected.");
  }

  const organization = await resolveDemoOrganization();

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          organizationId: organization.id,
          organizationSlug: organization.slug,
          targets
        },
        null,
        2
      )
    );
    return;
  }

  const results: Array<Record<string, unknown>> = [];
  let assertionFailureCount = 0;

  for (const target of targets) {
    const domain = await ensureDomain({
      organizationId: organization.id,
      hostname: getHostname(target.url),
      normalizedUrl: getNormalizedDomainUrl(target.url)
    });
    const scanId = await createBenchmarkScan({
      organizationId: organization.id,
      domain,
      target
    });

    if (!options.runNow) {
      results.push({
        suite: target.suite,
        title: target.title,
        url: target.url,
        domain: domain.hostname,
        scanId,
        status: "queued"
      });
      continue;
    }

    await runFullScanJob(scanId);
    const summary = await loadScanSummary(scanId);
    const assertionResult = evaluateAccessibilityBenchmarkAssertions({
      assertions: target.assertions,
      summary
    });
    if (options.assertBenchmarks && !assertionResult.passed) {
      assertionFailureCount += 1;
    }

    results.push({
      suite: target.suite,
      title: target.title,
      url: target.url,
      domain: domain.hostname,
      scanId,
      status: "completed",
      assertionFailures: assertionResult.failures,
      assertionsPassed: assertionResult.passed,
      expectedIssueFamilies: target.expectedIssueFamilies,
      snapshot: summary.snapshot,
      topRules: summary.topRules
    });
  }

  console.log(
    JSON.stringify(
      {
        organizationId: organization.id,
        organizationSlug: organization.slug,
        assertionsEnforced: options.assertBenchmarks,
        assertionFailureCount,
        runNow: options.runNow,
        targetCount: targets.length,
        results
      },
      null,
      2
    )
  );

  if (options.assertBenchmarks && assertionFailureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
