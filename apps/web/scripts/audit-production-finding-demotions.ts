import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";

type TargetFinding = "accessibility_support_path_missing" | "sale_sharing_controls_missing";

type CandidateRow = {
  ad_network_google_ads: boolean | null;
  ad_network_meta_ads: boolean | null;
  advertising_tracker_count: number | null;
  accessibility_contact_method_present: boolean | null;
  accessibility_statement_present: boolean | null;
  completed_at: string;
  domain: string;
  do_not_sell_link_present: boolean | null;
  final_url: string | null;
  mentions_data_sale_or_sharing: boolean | null;
  retargeting_pixel_detected: boolean | null;
  scan_id: string;
  verified_public_surfaces_count: number | null;
};

type LiveProbe = {
  assessment: "supports_demotion" | "needs_review" | "supports_promotion";
  evidenceUrl: string | null;
  rationale: string;
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

function getDomainArgs() {
  const index = process.argv.indexOf("--domains");
  if (index === -1) {
    return [];
  }
  const values: string[] = [];
  for (const value of process.argv.slice(index + 1)) {
    if (value.startsWith("--")) {
      break;
    }
    values.push(value);
  }
  return values
    .join(" ")
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeFinding(value: string | null): TargetFinding | "all" {
  if (!value || value === "all") {
    return "all";
  }
  if (value === "accessibility_support_path_missing" || value === "sale_sharing_controls_missing") {
    return value;
  }
  throw new Error(`Unsupported finding: ${value}`);
}

function getBaseUrl(row: Pick<CandidateRow, "domain" | "final_url">) {
  const candidate = row.final_url && /^https?:\/\//i.test(row.final_url) ? row.final_url : `https://${row.domain}`;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return `https://${row.domain}`;
  }
}

function getText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(baseUrl: string, html: string, pattern: RegExp) {
  const links = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || /^(mailto|tel|javascript):/i.test(href)) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl).toString();
      if (pattern.test(url)) {
        links.add(url);
      }
    } catch {
      // Ignore malformed page links.
    }
  }
  return [...links].slice(0, 6);
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 (compatible; CertScoreCalibration/1.0; +https://certscore.ai)"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok || !/text|html|xml/i.test(response.headers.get("content-type") ?? "")) {
      return null;
    }
    const html = await response.text();
    return {
      finalUrl: response.url,
      html,
      text: getText(html)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeAccessibility(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const linkedUrls = homepage ? extractLinks(baseUrl, homepage.html, /accessibility|accommodation|ada/i) : [];
  const candidateUrls = [
    ...linkedUrls,
    `${baseUrl}/accessibility`,
    `${baseUrl}/accessibility/`,
    `${baseUrl}/accessibility-statement`,
    `${baseUrl}/accessibility/feedback-form`
  ];

  for (const url of [...new Set(candidateUrls)]) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/accessibility|accommodation|assistive|screen reader|wcag/i.test(page.text)) {
      const hasSupportPath = /feedback|contact|help|support|suggestions?|issue|phone|email|form/i.test(page.text);
      return {
        assessment: hasSupportPath ? "supports_demotion" : "needs_review",
        evidenceUrl: page.finalUrl,
        rationale: hasSupportPath
          ? "Live URL review found an accessibility surface or support path, so the missing-path interpretation should not promote."
          : "Live URL review found accessibility content, but support-path language was not clear enough for automatic promotion or demotion."
      };
    }
  }

  return {
    assessment: "needs_review",
    evidenceUrl: null,
    rationale: "Live URL probe did not find an accessibility surface; retain as review unless bounded crawl evidence confirms absence."
  };
}

async function probeSaleSharing(row: CandidateRow): Promise<LiveProbe> {
  const baseUrl = getBaseUrl(row);
  const homepage = await fetchText(baseUrl);
  const linkedUrls = homepage
    ? extractLinks(baseUrl, homepage.html, /privacy|do-not-sell|do-not-share|privacy-choices|opt-?out|cookie/i)
    : [];
  const candidateUrls = [
    ...linkedUrls,
    `${baseUrl}/privacy`,
    `${baseUrl}/privacy-policy`,
    `${baseUrl}/privacy-center`,
    `${baseUrl}/privacy-choices`,
    `${baseUrl}/your-privacy-choices`,
    `${baseUrl}/do-not-sell`
  ];
  let behaviorDisclosureUrl: string | null = null;

  for (const url of [...new Set(candidateUrls)].slice(0, 12)) {
    const page = await fetchText(url);
    if (!page) {
      continue;
    }
    if (/do not sell|do not share|your privacy choices|privacy choices|opt out of targeted advertising|global privacy control|\bgpc\b/i.test(page.text)) {
      return {
        assessment: "supports_demotion",
        evidenceUrl: page.finalUrl,
        rationale: "Live URL review found a do-not-sell/share, privacy choices, opt-out, or GPC control path."
      };
    }
    if (/targeted advertising|cross-context behavioral|personalized ads?|advertising partners|sale or sharing|sell or share/i.test(page.text)) {
      behaviorDisclosureUrl = behaviorDisclosureUrl ?? page.finalUrl;
    }
  }

  if (behaviorDisclosureUrl) {
    return {
      assessment: "needs_review",
      evidenceUrl: behaviorDisclosureUrl,
      rationale: "Live URL review found sale/sharing or targeted-advertising disclosure language but did not find a control path in the bounded probe."
    };
  }

  return {
    assessment: "supports_demotion",
    evidenceUrl: null,
    rationale: "Live URL probe did not corroborate sale/sharing disclosure or a missing control path; runtime retargeting alone is insufficient."
  };
}

async function loadCandidates(finding: TargetFinding, input: { domains: string[]; limit: number }) {
  const predicate =
    finding === "accessibility_support_path_missing"
      ? `ss.accessibility_contact_method_present is false and ss.accessibility_statement_present is false`
      : `ss.retargeting_pixel_detected is true and ss.do_not_sell_link_present is false`;
  const domainPredicate =
    input.domains.length > 0
      ? `and lower(regexp_replace(ss.domain, '^www\\.', '')) = any($2::text[])`
      : "";
  const params = input.domains.length > 0
    ? [input.limit, input.domains.map((domain) => domain.replace(/^www\./, ""))]
    : [input.limit];

  const result = await query<CandidateRow>(
    `
      select distinct on (ss.domain)
             s.id as scan_id,
             s.completed_at::text as completed_at,
             ss.domain,
             ss.final_url,
             ss.accessibility_contact_method_present,
             ss.accessibility_statement_present,
             ss.retargeting_pixel_detected,
             ss.do_not_sell_link_present,
             ss.mentions_data_sale_or_sharing,
             ss.ad_network_google_ads,
             ss.ad_network_meta_ads,
             ss.advertising_tracker_count,
             ss.verified_public_surfaces_count
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = 'full'
         and ${predicate}
         ${domainPredicate}
       order by ss.domain, s.completed_at desc
       limit $1
    `,
    params,
    { readOnly: true }
  );

  return result.rows;
}

function localAssessment(finding: TargetFinding, row: CandidateRow): LiveProbe {
  if (finding === "accessibility_support_path_missing") {
    const surfaces = row.verified_public_surfaces_count ?? 0;
    return {
      assessment: surfaces >= 3 ? "needs_review" : "supports_demotion",
      evidenceUrl: row.final_url,
      rationale:
        surfaces >= 3
          ? "Scanner observed several public surfaces but retained no accessibility support path; needs external URL review before promotion."
          : "Scanner coverage is too limited to promote a missing accessibility support path from absence booleans alone."
    };
  }

  const hasBehaviorOnly = row.retargeting_pixel_detected === true && row.mentions_data_sale_or_sharing !== true;
  return {
    assessment: hasBehaviorOnly ? "supports_demotion" : "needs_review",
    evidenceUrl: row.final_url,
    rationale: hasBehaviorOnly
      ? "Runtime retargeting is present, but retained policy evidence does not disclose sale/sharing behavior; keep out of external surfacing."
      : "Retained policy/runtime signals may support the interpretation, but need a policy anchor plus missing control-path evidence."
  };
}

async function main() {
  const finding = normalizeFinding(getArgValue("--finding"));
  const domains = getDomainArgs();
  const limit = getNumberArg("--limit", 12);
  const liveCheck = hasFlag("--live-check");
  const findings: TargetFinding[] =
    finding === "all" ? ["accessibility_support_path_missing", "sale_sharing_controls_missing"] : [finding];
  const rows: string[] = [
    "# Production Finding Demotion Audit",
    "",
    `Live check: ${liveCheck ? "enabled" : "disabled"}`,
    "",
    "| Finding | Domain | Local assessment | Live assessment | Evidence URL | Rationale |",
    "|---|---|---|---|---|---|"
  ];

  for (const findingId of findings) {
    const candidates = await loadCandidates(findingId, { domains, limit });
    for (const candidate of candidates) {
      const local = localAssessment(findingId, candidate);
      const live = liveCheck
        ? findingId === "accessibility_support_path_missing"
          ? await probeAccessibility(candidate)
          : await probeSaleSharing(candidate)
        : null;
      const effective = live ?? local;
      rows.push(
        `| \`${findingId}\` | ${candidate.domain} | ${local.assessment} | ${live?.assessment ?? "not_run"} | ${effective.evidenceUrl ?? ""} | ${effective.rationale.replace(/\|/g, "/")} |`
      );
    }
  }

  process.stdout.write(`${rows.join("\n")}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
