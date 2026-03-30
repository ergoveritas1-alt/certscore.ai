import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

type TriagedDomain = {
  domain: string;
  hostTypeGuess: string;
  priorityBand: string;
  rank: number;
  segmentGuess: string;
  skipReason: string;
};

const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), "public/tranco_PLGVJ.csv");
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration");
const DEFAULT_QUEUE_SIZE = 250;
const DEFAULT_CANDIDATE_LIMIT = 5000;

const BAND_RULES = [
  { label: "1-1000", maxRank: 1000 },
  { label: "1001-10000", maxRank: 10_000 },
  { label: "10001-50000", maxRank: 50_000 },
  { label: "50001-100000", maxRank: 100_000 },
  { label: "100001+", maxRank: Number.POSITIVE_INFINITY }
];

const STRATIFIED_BANDS = ["1-1000", "1001-10000", "10001-50000", "50001-100000"] as const;
const STRATIFIED_SEGMENTS = [
  "publisher",
  "ecommerce",
  "saas",
  "government",
  "education",
  "nonprofit",
  "travel",
  "community",
  "marketplace",
  "finance",
  "consumer_brand",
  "general_public_site"
] as const;

const STRATIFIED_TARGETS: Record<(typeof STRATIFIED_BANDS)[number], number> = {
  "1-1000": 75,
  "1001-10000": 75,
  "10001-50000": 60,
  "50001-100000": 40
};

const INFRA_KEYWORDS = [
  "akadns",
  "akamai",
  "api",
  "appspot",
  "assets",
  "auth",
  "azure",
  "cache",
  "captcha",
  "cdn",
  "cloudapp",
  "cloudflare",
  "cloudfront",
  "dns",
  "edge",
  "events",
  "gateway",
  "gslb",
  "img",
  "images",
  "ingest",
  "lb",
  "metrics",
  "microsoftonline",
  "msedge",
  "office",
  "origin",
  "pool",
  "push",
  "relay",
  "safebrowsing",
  "sdk",
  "secure",
  "service",
  "server",
  "servers",
  "signalr",
  "static",
  "telemetry",
  "trafficmanager",
  "upload",
  "video",
  "widget"
];

const ADTECH_KEYWORDS = [
  "ad",
  "ads",
  "adsafe",
  "adservice",
  "adserver",
  "bid",
  "criteo",
  "doubleclick",
  "liadm",
  "lijit",
  "mathtag",
  "media.net",
  "openx",
  "outbrain",
  "pubmatic",
  "rfihub",
  "rlcdn",
  "rubicon",
  "sharethrough",
  "smartadserver",
  "sonobi",
  "taboola",
  "teads",
  "yieldmo"
];

const COMMUNITY_KEYWORDS = [
  "forum",
  "forums",
  "reddit",
  "stackoverflow",
  "stackexchange",
  "community",
  "discord"
];

const ECOMMERCE_KEYWORDS = [
  "shop",
  "store",
  "market",
  "mall",
  "buy",
  "cart"
];

const SAAS_KEYWORDS = [
  "cloud",
  "workspace",
  "docs",
  "crm",
  "analytics",
  "security",
  "helpdesk"
];

const PUBLISHER_KEYWORDS = [
  "news",
  "times",
  "post",
  "daily",
  "media",
  "journal",
  "review",
  "press"
];

const MARKETPLACE_KEYWORDS = [
  "list",
  "jobs",
  "rent",
  "realestate",
  "marketplace",
  "classified"
];

const FINANCE_KEYWORDS = [
  "bank",
  "capital",
  "finance",
  "fund",
  "invest",
  "money",
  "pay"
];

const TRAVEL_KEYWORDS = [
  "air",
  "hotel",
  "travel",
  "trip",
  "booking",
  "flight"
];

const KNOWN_NONPROFIT_ORGS = new Set([
  "org",
  "edu",
  "gov",
  "mil",
  "int"
]);

const KNOWN_INFRA_ROOTS = new Set([
  "cloudfront.net",
  "gtld-servers.net",
  "list-manage.com"
]);

const KNOWN_FINANCE_ROOTS = new Set([
  "paypal.com",
  "stripe.com",
  "sberbank.ru"
]);

const LEADING_PUBLIC_PREFIXES = new Set(["m", "www"]);
const ALLOWED_PUBLIC_SUBDOMAIN_PREFIXES = new Set(["blog", "docs", "en", "help", "m", "news", "support", "www"]);

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function csvEscape(value: string | number) {
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function toCsv<T extends Record<string, string | number>>(rows: T[]) {
  if (rows.length === 0) {
    return "";
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }

  const headers = Object.keys(firstRow);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ];

  return `${lines.join("\n")}\n`;
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase();
}

function splitLabels(domain: string) {
  return domain.split(".").filter(Boolean);
}

function getDomainTokens(domain: string) {
  return splitLabels(domain).flatMap((label) => label.split("-")).filter(Boolean);
}

function getComparableDomain(domain: string) {
  const labels = splitLabels(domain);
  if (labels.length >= 3 && LEADING_PUBLIC_PREFIXES.has(labels[0] ?? "")) {
    return labels.slice(1).join(".");
  }

  return domain;
}

function getPriorityBand(rank: number) {
  for (const rule of BAND_RULES) {
    if (rank <= rule.maxRank) {
      return rule.label;
    }
  }

  return "100001+";
}

function hasKeyword(domain: string, keywords: readonly string[]) {
  const tokens = getDomainTokens(domain);

  return keywords.some((keyword) =>
    tokens.some((token) => token === keyword || token.startsWith(keyword) || token.endsWith(keyword))
  );
}

function isLikelyInfra(domain: string) {
  const labels = splitLabels(domain);
  const firstLabel = labels[0] ?? "";
  const root = labels.slice(-2).join(".");
  const tokens = getDomainTokens(domain);

  if (KNOWN_INFRA_ROOTS.has(root)) {
    return true;
  }

  if (labels.length === 3 && !ALLOWED_PUBLIC_SUBDOMAIN_PREFIXES.has(firstLabel)) {
    return true;
  }

  if (labels.length >= 4) {
    return true;
  }

  if (firstLabel.startsWith("ns") || firstLabel.startsWith("mx")) {
    return true;
  }

  if (tokens.some((token) => token.endsWith("svc") || token.endsWith("cdn") || token.endsWith("dns") || token.endsWith("api"))) {
    return true;
  }

  if (hasKeyword(domain, INFRA_KEYWORDS)) {
    return true;
  }

  if (root === "googleapis.com" || root === "gstatic.com" || root === "akamaiedge.net") {
    return true;
  }

  return false;
}

function getHostTypeGuess(domain: string) {
  if (isLikelyInfra(domain)) {
    if (hasKeyword(domain, ADTECH_KEYWORDS)) {
      return "infra_adtech";
    }

    if (domain.includes("dns")) {
      return "infra_dns";
    }

    if (domain.includes("cdn") || domain.includes("edge") || domain.includes("static")) {
      return "infra_cdn";
    }

    if (domain.includes("api") || domain.includes("auth")) {
      return "infra_api";
    }

    return "infra_service";
  }

  return "public_site";
}

function getSegmentGuess(domain: string) {
  const labels = splitLabels(domain);
  const tld = labels.at(-1) ?? "";
  const firstLabel = labels[0] ?? "";
  const root = labels.slice(-2).join(".");

  if (KNOWN_FINANCE_ROOTS.has(root)) {
    return "finance";
  }

  if (tld === "gov" || domain.endsWith(".gov") || domain.endsWith(".gov.au") || domain.endsWith(".gov.uk")) {
    return "government";
  }

  if (tld === "edu" || domain.endsWith(".edu") || domain.endsWith(".ac.at") || domain.endsWith(".ac.uk")) {
    return "education";
  }

  if (KNOWN_NONPROFIT_ORGS.has(tld) || domain.endsWith(".org")) {
    if (hasKeyword(domain, COMMUNITY_KEYWORDS)) {
      return "community";
    }

    return "nonprofit";
  }

  if (hasKeyword(domain, PUBLISHER_KEYWORDS)) {
    return "publisher";
  }

  if (hasKeyword(domain, ECOMMERCE_KEYWORDS)) {
    return "ecommerce";
  }

  if (hasKeyword(domain, SAAS_KEYWORDS)) {
    return "saas";
  }

  if (hasKeyword(domain, MARKETPLACE_KEYWORDS)) {
    return "marketplace";
  }

  if (hasKeyword(domain, FINANCE_KEYWORDS)) {
    return "finance";
  }

  if (hasKeyword(domain, TRAVEL_KEYWORDS)) {
    return "travel";
  }

  if (hasKeyword(domain, COMMUNITY_KEYWORDS)) {
    return "community";
  }

  if (firstLabel === "www") {
    return "general_public_site";
  }

  return "consumer_brand";
}

function getSkipReason(domain: string, hostTypeGuess: string) {
  if (hostTypeGuess !== "public_site") {
    return hostTypeGuess;
  }

  const labels = splitLabels(domain);
  if (labels.length >= 4) {
    return "deep_subdomain";
  }

  if (hasKeyword(domain, ADTECH_KEYWORDS)) {
    return "adtech_host";
  }

  return "";
}

function triageDomain(rank: number, domain: string): TriagedDomain {
  const normalizedDomain = normalizeDomain(domain);
  const hostTypeGuess = getHostTypeGuess(normalizedDomain);

  return {
    domain: normalizedDomain,
    hostTypeGuess,
    priorityBand: getPriorityBand(rank),
    rank,
    segmentGuess: getSegmentGuess(normalizedDomain),
    skipReason: getSkipReason(normalizedDomain, hostTypeGuess)
  };
}

function buildQueue(candidates: TriagedDomain[], queueSize: number) {
  const byBand = new Map<string, TriagedDomain[]>();

  for (const candidate of candidates) {
    if (!STRATIFIED_BANDS.includes(candidate.priorityBand as (typeof STRATIFIED_BANDS)[number])) {
      continue;
    }

    const existing = byBand.get(candidate.priorityBand) ?? [];
    existing.push(candidate);
    byBand.set(candidate.priorityBand, existing);
  }

  const queue: TriagedDomain[] = [];
  const usedDomains = new Set<string>();

  for (const band of STRATIFIED_BANDS) {
    const bandCandidates = byBand.get(band) ?? [];
    const bandTarget = STRATIFIED_TARGETS[band];
    const bySegment = new Map<string, TriagedDomain[]>();

    for (const candidate of bandCandidates) {
      const existing = bySegment.get(candidate.segmentGuess) ?? [];
      existing.push(candidate);
      bySegment.set(candidate.segmentGuess, existing);
    }

    let progress = true;
    while (progress && queue.length < queueSize) {
      progress = false;

      for (const segment of STRATIFIED_SEGMENTS) {
        if (queue.filter((entry) => entry.priorityBand === band).length >= bandTarget) {
          break;
        }

        const segmentEntries = bySegment.get(segment) ?? [];
        const nextEntry = segmentEntries.find((entry) => !usedDomains.has(entry.domain));
        if (!nextEntry) {
          continue;
        }

        queue.push(nextEntry);
        usedDomains.add(nextEntry.domain);
        progress = true;

        if (queue.length >= queueSize) {
          break;
        }
      }
    }
  }

  if (queue.length < queueSize) {
    for (const candidate of candidates) {
      if (usedDomains.has(candidate.domain)) {
        continue;
      }

      queue.push(candidate);
      usedDomains.add(candidate.domain);

      if (queue.length >= queueSize) {
        break;
      }
    }
  }

  return queue;
}

async function main() {
  const inputPath = path.resolve(getArgValue("--input") ?? DEFAULT_INPUT_PATH);
  const outputDir = path.resolve(getArgValue("--out-dir") ?? DEFAULT_OUTPUT_DIR);
  const queueSize = Number(getArgValue("--queue-size") ?? DEFAULT_QUEUE_SIZE);
  const candidateLimit = Number(getArgValue("--candidate-limit") ?? DEFAULT_CANDIDATE_LIMIT);

  const triaged: TriagedDomain[] = [];
  const stream = fs.createReadStream(inputPath, "utf8");
  const rl = readline.createInterface({ crlfDelay: Infinity, input: stream });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [rankText, domainText] = trimmed.split(",", 2);
    const rank = Number(rankText);
    const domain = domainText?.trim();

    if (!Number.isFinite(rank) || !domain) {
      continue;
    }

    triaged.push(triageDomain(rank, domain));
  }

  const publicCandidates: TriagedDomain[] = [];
  const seenComparableDomains = new Set<string>();

  for (const entry of triaged) {
    if (entry.hostTypeGuess !== "public_site" || entry.skipReason !== "") {
      continue;
    }

    const comparableDomain = getComparableDomain(entry.domain);
    if (seenComparableDomains.has(comparableDomain)) {
      continue;
    }

    seenComparableDomains.add(comparableDomain);
    publicCandidates.push(entry);

    if (publicCandidates.length >= candidateLimit) {
      break;
    }
  }
  const queue = buildQueue(publicCandidates, queueSize);

  const summaryRows = [
    { metric: "total_rows", value: triaged.length },
    { metric: "public_candidates", value: publicCandidates.length },
    { metric: "queue_size", value: queue.length }
  ];

  const summaryByHostType = new Map<string, number>();
  const summaryBySegment = new Map<string, number>();

  for (const entry of triaged) {
    summaryByHostType.set(entry.hostTypeGuess, (summaryByHostType.get(entry.hostTypeGuess) ?? 0) + 1);
  }

  for (const entry of queue) {
    const key = `${entry.priorityBand}:${entry.segmentGuess}`;
    summaryBySegment.set(key, (summaryBySegment.get(key) ?? 0) + 1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "candidate_domains.csv"),
    toCsv(
      publicCandidates.map((entry) => ({
        rank: entry.rank,
        domain: entry.domain,
        priority_band: entry.priorityBand,
        segment_guess: entry.segmentGuess,
        host_type_guess: entry.hostTypeGuess
      }))
    )
  );

  fs.writeFileSync(
    path.join(outputDir, "calibration_queue.csv"),
    toCsv(
      queue.map((entry, index) => ({
        batch_hint: Math.floor(index / 25) + 1,
        domain: entry.domain,
        rank: entry.rank,
        priority_band: entry.priorityBand,
        segment_guess: entry.segmentGuess,
        evaluation_status: "queued_for_scan"
      }))
    )
  );

  fs.writeFileSync(
    path.join(outputDir, "calibration_ledger_seed.csv"),
    toCsv(
      queue.map((entry) => ({
        domain: entry.domain,
        rank: entry.rank,
        priority_band: entry.priorityBand,
        site_shape: entry.segmentGuess,
        scan_id: "",
        failure_shape: "",
        root_cause_layer: "",
        generic_fix_candidate: "",
        verification_status: "pending_scan",
        transfer_verified_on: ""
      }))
    )
  );

  fs.writeFileSync(
    path.join(outputDir, "triage_summary.txt"),
    [
      "Tranco calibration queue summary",
      "",
      ...summaryRows.map((row) => `${row.metric}: ${row.value}`),
      "",
      "host_type_counts:",
      ...Array.from(summaryByHostType.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `  ${key}: ${value}`),
      "",
      "queue_band_segment_counts:",
      ...Array.from(summaryBySegment.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => `  ${key}: ${value}`)
    ].join("\n")
  );

  console.log(`Wrote calibration outputs to ${outputDir}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
