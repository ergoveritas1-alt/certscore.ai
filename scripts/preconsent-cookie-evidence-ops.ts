import { randomUUID } from "node:crypto";
import { closePools, query, queryOne } from "../packages/db/src/postgres";
import {
  FULL_SCAN_EVENT_TYPES,
  buildSharedFullScanConfig
} from "../packages/shared/src";
import {
  classifyRuntimeCookieCategory,
  isFunctionalCookieExcludedFromTrackingEvidence,
  isNonEssentialCookieCategory
} from "../apps/web/lib/scans/runtime-cookie-evidence";
import { buildScanReportUnifiedFindingsForScan } from "../apps/web/lib/scans/scan-report-unified-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "../apps/web/lib/scans/executive-findings-projection";

type ScanDiagnosticRow = {
  completed_at: string | null;
  domain: string | null;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  preconsent_tracking_detected: boolean | null;
  third_party_cookie_set_before_consent: boolean | null;
};

type RuntimeArtifactRow = Record<string, unknown> & {
  domain_id: string | null;
  hostname: string | null;
  organization_id: string | null;
  scan_id: string;
};

type PromotionCookieRow = {
  category: string;
  confidence: number;
  cookieName: string;
  domain: string | null;
  evidenceUrls: string[];
  responseHost: string | null;
  vendorName: string;
};

function normalizePreconsentViolationRow(row: Record<string, unknown>) {
  return {
    collectionEndpointType: getString(row.collectionEndpointType ?? row.collection_endpoint_type) ?? "unknown",
    confidence: getNumber(row.confidence) ?? 0,
    detectionSource: getString(row.detectionSource ?? row.detection_source) ?? "unknown",
    evidenceUrls: Array.isArray(row.evidenceUrls)
      ? uniqueStrings(row.evidenceUrls.map((value) => getString(value)))
      : Array.isArray(row.evidence_urls)
        ? uniqueStrings(row.evidence_urls.map((value) => getString(value)))
        : [],
    firstPartyOrThirdParty: getString(row.firstPartyOrThirdParty ?? row.first_party_or_third_party) ?? "unknown",
    matchedSignatureId: getString(row.matchedSignatureId ?? row.matched_signature_id),
    scriptHost: getString(row.scriptHost ?? row.script_host),
    vendorCategory: getString(row.vendorCategory ?? row.vendor_category) ?? "unknown",
    vendorName: getString(row.vendorName ?? row.vendor_name) ?? "unknown"
  };
}

const DEFAULT_RERUN_DOMAINS = [
  "alidns.com",
  "moe.video",
  "amazon.co.uk",
  "mi.com",
  "walmart.com",
  "cnn.com",
  "link.springer.com",
  "pages.cloudflare.com"
];

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getArg(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function getNumberArg(name: string, fallback: number) {
  const parsed = Number(getArg(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function splitList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeHostname(value: string) {
  const candidate = value.trim();
  if (!candidate) {
    return "";
  }
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname.toLowerCase();
  } catch {
    return candidate.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? "";
  }
}

function normalizeUrlForHost(hostname: string) {
  return `https://${hostname}`;
}

function cleanCookieDomain(value: unknown) {
  const raw = getString(value);
  if (!raw) {
    return null;
  }
  return raw
    .split(/[\r\n;\s]+/)
    .find((part) => part.trim().length > 0)
    ?.trim()
    .replace(/^\.+/, "")
    .toLowerCase() ?? null;
}

function concreteUrl(value: unknown) {
  const raw = getString(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function roughEtldPlusOne(hostname: string | null | undefined) {
  const parts = (hostname ?? "").replace(/^\./, "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]).has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

function isSameSiteCookie(input: { cookieDomain: string | null; pageDomain: string | null; responseHost: string | null }) {
  const cookieSite = roughEtldPlusOne(input.cookieDomain ?? input.responseHost);
  const pageSite = roughEtldPlusOne(input.pageDomain);
  return Boolean(cookieSite && pageSite && cookieSite === pageSite);
}

function inferCookieProvider(name: string, domain: string | null) {
  const normalized = `${name} ${domain ?? ""}`.toLowerCase();
  if (/^_ga|^_gid|^_gat|ga_|goog|gtm|doubleclick/.test(normalized)) return "Google";
  if (/^_fbp|^_fbc|facebook|connect\.facebook|fbcdn/.test(normalized)) return "Meta";
  if (/criteo|cto_bundle/.test(normalized)) return "Criteo";
  if (/^_ali_s_|aliyun|mmstat|(^|\b)cna(\b|$)|(^|\b)sca(\b|$)/.test(normalized)) return "Alibaba / Umeng Analytics";
  if (/yandex|yuid|yabs|sync_cookie_csrf/.test(normalized)) return /yabs|sync_cookie_csrf/.test(normalized) ? "Yandex Ads" : "Yandex";
  if (/mail\.ru|(^|\b)ftid(\b|$)|(^|\b)bh(\b|$)/.test(normalized)) return "Mail.ru / VK Ads";
  if (/adriver/.test(normalized)) return "Adriver";
  if (/amazon-adsystem|ad-privacy/.test(normalized)) return "Amazon Ads";
  if (/xiaomi|mi\.com|xm_user_bucket|^xm_/.test(normalized)) return "Xiaomi";
  if (/hotjar|_hj/.test(normalized)) return "Hotjar";
  if (/hubspot|__hstc|__hssc/.test(normalized)) return "HubSpot";
  if (/segment|ajs_anonymous_id|ajs_user_id/.test(normalized)) return "Segment";
  return null;
}

function getHybridRuntimeEvidence(row: Record<string, unknown> | null | undefined) {
  return getRecord(row?.hybrid_runtime_evidence ?? row?.hybridRuntimeEvidence);
}

function getCookieObservations(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObjectArray(getHybridRuntimeEvidence(runtimeArtifacts)?.cookieWriteObservations);
}

function buildPromotionCookieRows(input: {
  pageDomain: string | null;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}) {
  return getCookieObservations(input.runtimeArtifacts).flatMap((row): PromotionCookieRow[] => {
    const cookieName = getString(row.cookieName ?? row.cookie_name);
    const cookieDomain = cleanCookieDomain(row.domain ?? row.cookieDomain ?? row.cookie_domain);
    const responseHost = cleanCookieDomain(row.responseHost ?? row.response_host);
    if (!cookieName || isFunctionalCookieExcludedFromTrackingEvidence(cookieName, cookieDomain)) {
      return [];
    }

    const party = getString(row.cookiePartyType ?? row.cookie_party_type);
    const observedThirdParty = row.thirdParty === true || row.third_party === true || party === "third_party";
    const sameSite = isSameSiteCookie({
      cookieDomain,
      pageDomain: input.pageDomain,
      responseHost
    });
    if (!observedThirdParty || sameSite) {
      return [];
    }

    const beforeConsent = row.beforeConsent === true || row.before_consent === true;
    if (!beforeConsent) {
      return [];
    }

    const category = getString(row.category ?? row.cookieCategory ?? row.cookie_category) ?? classifyRuntimeCookieCategory(cookieName, cookieDomain);
    if (!isNonEssentialCookieCategory(category)) {
      return [];
    }

    const vendorName =
      getString(row.cookieInitiatorVendor ?? row.cookie_initiator_vendor ?? row.vendor ?? row.provider) ??
      inferCookieProvider(cookieName, cookieDomain ?? responseHost);
    if (!vendorName) {
      return [];
    }

    return [
      {
        category,
        confidence: getNumber(row.confidence) ?? 0.7,
        cookieName,
        domain: cookieDomain,
        evidenceUrls: uniqueStrings([concreteUrl(row.responseUrl ?? row.response_url)]),
        responseHost,
        vendorName
      }
    ];
  });
}

function buildPromotionCookieRowsFromPreconsentViolations(input: {
  pageDomain: string | null;
  rows: Record<string, unknown>[];
}) {
  return input.rows.flatMap((rawRow): PromotionCookieRow[] => {
    const row = normalizePreconsentViolationRow(rawRow);
    const cookieName = row.matchedSignatureId?.match(/^cookie_hint:(.+)$/i)?.[1]?.trim() ?? null;
    const cookieDomain = cleanCookieDomain(row.scriptHost);
    if (!cookieName || row.firstPartyOrThirdParty !== "third_party") {
      return [];
    }
    if (isFunctionalCookieExcludedFromTrackingEvidence(cookieName, cookieDomain)) {
      return [];
    }
    if (isSameSiteCookie({ cookieDomain, pageDomain: input.pageDomain, responseHost: null })) {
      return [];
    }
    if (!isNonEssentialCookieCategory(row.vendorCategory)) {
      return [];
    }
    return [
      {
        category: row.vendorCategory,
        confidence: row.confidence ?? 0.7,
        cookieName,
        domain: cookieDomain,
        evidenceUrls: row.evidenceUrls,
        responseHost: null,
        vendorName: row.vendorName
      }
    ];
  });
}

function classifyCookieGap(input: {
  pageDomain: string | null;
  preconsentRows: number;
  promotionRows?: PromotionCookieRow[];
  rawThirdPartyCookie: boolean;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  surfacedCookieFinding: boolean;
}) {
  const observations = getCookieObservations(input.runtimeArtifacts);
  const promotionRows = input.promotionRows ?? buildPromotionCookieRows(input);
  if (promotionRows.length > 0) {
    return input.surfacedCookieFinding ? "promotion_grade_cookie_evidence_present" : "promotion_grade_cookie_evidence_not_surfaced";
  }
  const beforeConsentThirdParty = observations.filter((row) => {
    const cookieDomain = cleanCookieDomain(row.domain ?? row.cookieDomain ?? row.cookie_domain);
    const responseHost = cleanCookieDomain(row.responseHost ?? row.response_host);
    return (
      (row.beforeConsent === true || row.before_consent === true) &&
      (row.thirdParty === true || row.third_party === true || getString(row.cookiePartyType ?? row.cookie_party_type) === "third_party") &&
      !isSameSiteCookie({ cookieDomain, pageDomain: input.pageDomain, responseHost })
    );
  });
  if (
    beforeConsentThirdParty.some((row) =>
      isFunctionalCookieExcludedFromTrackingEvidence(getString(row.cookieName ?? row.cookie_name), cleanCookieDomain(row.domain ?? row.cookieDomain ?? row.cookie_domain))
    )
  ) {
    return "cookie_observed_but_necessary_or_security";
  }
  if (beforeConsentThirdParty.length > 0) {
    return "cookie_observed_but_unclassified";
  }
  if (input.preconsentRows > 0) {
    return "preconsent_rows_present_but_not_surfaceable";
  }
  return input.rawThirdPartyCookie ? "raw_boolean_only" : "no_cookie_gap";
}

async function queueReruns() {
  const apply = hasFlag("--apply");
  const domains = splitList(getArg("--domains"));
  const targets = domains.length > 0 ? domains : DEFAULT_RERUN_DOMAINS;
  const pages = getNumberArg("--pages", 5);
  const forceActive = hasFlag("--force-active");
  const queued: Array<Record<string, unknown>> = [];

  for (const target of targets) {
    const hostname = normalizeHostname(target);
    if (!hostname) {
      continue;
    }
    const normalizedUrl = normalizeUrlForHost(hostname);
    let domain = await queryOne<{ id: string; organization_id: string | null }>(
      `
        select id, organization_id
          from domains
         where normalized_url = $1
            or hostname = $2
         order by organization_id nulls first, created_at desc
         limit 1
      `,
      [normalizedUrl, hostname],
      { readOnly: true }
    );

    if (!domain && apply) {
      domain = await queryOne<{ id: string; organization_id: string | null }>(
        `
          insert into domains (hostname, normalized_url, scan_frequency)
          values ($1, $2, 'manual')
          returning id, organization_id
        `,
        [hostname, normalizedUrl]
      );
    }

    const active = domain
      ? await queryOne<{ id: string; status: string }>(
          `select id, status from scans where domain_id = $1 and status in ('queued', 'running') order by created_at desc limit 1`,
          [domain.id],
          { readOnly: true }
        )
      : null;
    if (active && !forceActive) {
      queued.push({ domain: hostname, skipped: "active_scan_exists", activeScanId: active.id, status: active.status });
      continue;
    }

    if (!apply) {
      queued.push({ domain: hostname, dryRun: true, wouldCreateDomain: !domain, pages });
      continue;
    }

    if (!domain) {
      throw new Error(`Failed to create domain for ${hostname}.`);
    }

    const scanConfig = buildSharedFullScanConfig({
      freshBrowserRequired: true,
      hostname,
      maxPages: pages,
      maxRequestedTier: "tier5_full_scan",
      normalizedUrl,
      post403Policy: {
        maxHomepageRetriesAfter403: 0,
        maxPassiveVerificationFetchesAfter403: 4,
        passiveOnlyAfter403: true,
        stopOnHomepage403: true,
        verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
      },
      processor: "queued-full-scan-v1",
      profile: "standard",
      source: "preconsent-cookie-evidence-rerun",
      triggerMode: "operator_preconsent_cookie_evidence"
    });
    const scan = await queryOne<{ id: string }>(
      `
        insert into scans (organization_id, domain_id, submitted_by_user_id, scan_type, status, pages_requested, pages_scanned, scan_config_json)
        values ($1, $2, null, 'full', 'queued', $3, 0, $4)
        returning id
      `,
      [domain.organization_id, domain.id, pages, scanConfig]
    );
    if (!scan) {
      throw new Error(`Failed to queue scan for ${hostname}.`);
    }
    await query(
      `
        insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        scan.id,
        domain.id,
        domain.organization_id,
        FULL_SCAN_EVENT_TYPES.queued,
        "Operator queued pre-consent cookie evidence rerun.",
        { pagesRequested: pages, source: "preconsent-cookie-evidence-rerun" }
      ]
    );
    await query(`update domains set latest_scan_id = $2 where id = $1`, [domain.id, scan.id]);
    queued.push({ domain: hostname, scanId: scan.id, status: "queued" });
  }

  console.log(JSON.stringify({ apply, queued }, null, 2));
}

async function loadProjection(scanId: string) {
  const [
    snapshot,
    runtimeArtifacts,
    preconsentViolations,
    trackerVendors,
    signals,
    events,
    policyEnrichment,
    documentSources,
    policyReviewQueue,
    validationFindings
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
    query<Record<string, unknown>>(`select * from scan_preconsent_violations where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_tracker_vendors where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_signals where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select id, event_type as "eventType", message, metadata_json as "metadataJson", created_at as "createdAt" from scan_events where scan_id = $1 order by created_at asc`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_document_sources where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_review_queue where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from validation_run_findings where validation_run_id in (select id from validation_runs where scan_id = $1)`, [scanId], { readOnly: true }).then((result) => result.rows)
  ]);
  const packets = buildScanReportUnifiedFindingsForScan({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events,
    macroEnrichment: null,
    mergedSignals: [],
    pageEvidence: [],
    policyEnrichment,
    policyReviewQueue,
    preconsentViolations: preconsentViolations.map(normalizePreconsentViolationRow),
    previousSnapshot: null,
    primaryPolicyEnrichment: policyEnrichment[0] ?? null,
    relatedPreviewSnapshot: null,
    runtimeArtifacts,
    scan: { id: scanId },
    signalHits: [],
    signals,
    snapshot,
    trackerVendors,
    validationFindings
  });
  return projectExecutiveFindingsFromUnifiedPackets(packets);
}

async function loadDiagnosticRows() {
  const scanIds = splitList(getArg("--scan-ids"));
  const domains = splitList(getArg("--domains")).map(normalizeHostname);
  const limit = getNumberArg("--limit", 20);
  if (scanIds.length > 0) {
    const result = await query<ScanDiagnosticRow>(
      `
        select s.id, s.organization_id, s.domain_id, s.completed_at, coalesce(ss.domain, d.hostname) as domain,
               ss.preconsent_tracking_detected, ss.third_party_cookie_set_before_consent
          from scans s
          left join scan_snapshots ss on ss.scan_id = s.id
          left join domains d on d.id = s.domain_id
         where s.id = any($1::uuid[])
         order by s.completed_at desc nulls last
      `,
      [scanIds],
      { readOnly: true }
    );
    return result.rows;
  }
  if (domains.length > 0) {
    const result = await query<ScanDiagnosticRow>(
      `
        select s.id, s.organization_id, s.domain_id, s.completed_at, coalesce(ss.domain, d.hostname) as domain,
               ss.preconsent_tracking_detected, ss.third_party_cookie_set_before_consent
          from scans s
          left join scan_snapshots ss on ss.scan_id = s.id
          left join domains d on d.id = s.domain_id
         where coalesce(ss.domain, d.hostname) = any($1::text[])
         order by s.completed_at desc nulls last
         limit $2
      `,
      [domains, limit],
      { readOnly: true }
    );
    return result.rows;
  }
  const result = await query<ScanDiagnosticRow>(
    `
      select s.id, s.organization_id, s.domain_id, s.completed_at, coalesce(ss.domain, d.hostname) as domain,
             ss.preconsent_tracking_detected, ss.third_party_cookie_set_before_consent
        from scans s
        left join scan_snapshots ss on ss.scan_id = s.id
        left join domains d on d.id = s.domain_id
       where s.status = 'completed'
       order by s.completed_at desc nulls last, s.created_at desc
       limit $1
    `,
    [limit],
    { readOnly: true }
  );
  return result.rows;
}

async function diagnose() {
  const rows = await loadDiagnosticRows();
  const output = [];
  for (const row of rows) {
    const [runtimeArtifacts, preconsentRows] = await Promise.all([
      queryOne<RuntimeArtifactRow>(
        `select ra.*, d.hostname from scan_runtime_artifacts ra left join domains d on d.id = ra.domain_id where ra.scan_id = $1`,
        [row.id],
        { readOnly: true }
      ),
      query<Record<string, unknown>>(`select * from scan_preconsent_violations where scan_id = $1`, [row.id], { readOnly: true }).then((result) => result.rows)
    ]);
    const projection = await loadProjection(row.id);
    const projectedIds = new Set([...(projection.topFindings ?? []), ...(projection.findings ?? [])].map((finding) => finding.id));
    const pageDomain = row.domain ?? runtimeArtifacts?.hostname ?? null;
    const promotionRows = [
      ...buildPromotionCookieRows({ pageDomain, runtimeArtifacts }),
      ...buildPromotionCookieRowsFromPreconsentViolations({ pageDomain, rows: preconsentRows })
    ];
    const surfacedCookieFinding = projectedIds.has("third_party_cookie_pre_consent");
    const preconsentViolationRows = preconsentRows.length;
    output.push({
      scanId: row.id,
      domain: row.domain,
      completedAt: row.completed_at,
      rawPreconsentTracking: row.preconsent_tracking_detected === true,
      rawThirdPartyCookieBeforeConsent: row.third_party_cookie_set_before_consent === true,
      structuredCookieEvidence: getCookieObservations(runtimeArtifacts).length,
      promotionGradeCookieEvidence: promotionRows.length,
      preconsentViolationRows,
      surfacedPreconsentTracking: projectedIds.has("pre_consent_tracking_detected"),
      surfacedThirdPartyCookie: surfacedCookieFinding,
      gapClass: classifyCookieGap({
        pageDomain,
        preconsentRows: preconsentViolationRows,
        promotionRows,
        rawThirdPartyCookie: row.third_party_cookie_set_before_consent === true,
        runtimeArtifacts,
        surfacedCookieFinding
      }),
      sampleCookies: promotionRows.slice(0, 3).map((cookie) => `${cookie.cookieName}@${cookie.domain ?? cookie.responseHost ?? "unknown"}/${cookie.vendorName}`)
    });
  }
  if (hasFlag("--json")) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.table(output.map((row) => ({
    scan: row.scanId.slice(0, 8),
    domain: row.domain,
    rawPre: row.rawPreconsentTracking,
    raw3p: row.rawThirdPartyCookieBeforeConsent,
    structured: row.structuredCookieEvidence,
    promo: row.promotionGradeCookieEvidence,
    rows: row.preconsentViolationRows,
    preTop: row.surfacedPreconsentTracking,
    cookieTop: row.surfacedThirdPartyCookie,
    gap: row.gapClass
  })));
}

async function backfill() {
  const apply = hasFlag("--apply");
  const limit = getNumberArg("--limit", 200);
  const scanIds = splitList(getArg("--scan-ids"));
  const domains = splitList(getArg("--domains")).map(normalizeHostname);
  const candidates = await query<RuntimeArtifactRow>(
    `
      select ra.*, d.hostname
        from scan_runtime_artifacts ra
        join scans s on s.id = ra.scan_id
        left join domains d on d.id = ra.domain_id
        left join scan_snapshots ss on ss.scan_id = ra.scan_id
       where jsonb_typeof(ra.hybrid_runtime_evidence->'cookieWriteObservations') = 'array'
         and ($1::uuid[] is null or ra.scan_id = any($1::uuid[]))
         and ($2::text[] is null or coalesce(ss.domain, d.hostname) = any($2::text[]))
       order by ra.created_at desc
       limit $3
    `,
    [scanIds.length > 0 ? scanIds : null, domains.length > 0 ? domains : null, limit],
    { readOnly: true }
  );
  const summary = [];
  for (const runtimeArtifacts of candidates.rows) {
    const pageDomain = runtimeArtifacts.hostname;
    const rows = buildPromotionCookieRows({ pageDomain, runtimeArtifacts });
    if (rows.length === 0 || !runtimeArtifacts.domain_id) {
      continue;
    }
    summary.push({
      scanId: runtimeArtifacts.scan_id,
      domain: pageDomain,
      rows: rows.map((row) => `${row.vendorName}:${row.cookieName}`)
    });
    if (!apply) {
      continue;
    }
    for (const row of rows) {
      await query(
        `
          insert into scan_preconsent_violations (
            id, scan_id, organization_id, domain_id, vendor_name, vendor_category, detection_source,
            confidence, first_party_or_third_party, collection_endpoint_type, script_host,
            matched_signature_id, evidence_urls
          )
          values ($1, $2, $3, $4, $5, $6, 'request', $7, 'third_party', 'direct_third_party', $8, $9, $10)
          on conflict (scan_id, vendor_name) do update
            set vendor_category = excluded.vendor_category,
                confidence = greatest(scan_preconsent_violations.confidence, excluded.confidence),
                first_party_or_third_party = excluded.first_party_or_third_party,
                collection_endpoint_type = excluded.collection_endpoint_type,
                script_host = coalesce(excluded.script_host, scan_preconsent_violations.script_host),
                matched_signature_id = coalesce(excluded.matched_signature_id, scan_preconsent_violations.matched_signature_id),
                evidence_urls = (
                  select coalesce(array_agg(distinct url order by url), '{}'::text[])
                    from unnest(coalesce(scan_preconsent_violations.evidence_urls, '{}'::text[]) || coalesce(excluded.evidence_urls, '{}'::text[])) as merged(url)
                   where length(trim(url)) > 0
                )
        `,
        [
          randomUUID(),
          runtimeArtifacts.scan_id,
          runtimeArtifacts.organization_id,
          runtimeArtifacts.domain_id,
          row.vendorName,
          row.category,
          row.confidence,
          row.responseHost ?? row.domain,
          `cookie_hint:${row.cookieName.trim().toLowerCase()}`,
          row.evidenceUrls
        ]
      );
    }
  }
  console.log(JSON.stringify({ apply, scanned: candidates.rows.length, backfillableScans: summary.length, summary }, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === "queue-reruns") {
    await queueReruns();
    return;
  }
  if (command === "diagnose") {
    await diagnose();
    return;
  }
  if (command === "backfill") {
    await backfill();
    return;
  }
  throw new Error("Usage: preconsent-cookie-evidence-ops.ts <queue-reruns|diagnose|backfill> [--apply] [--domains=a,b] [--scan-ids=id,id]");
}

main()
  .catch((error) => {
    console.error("[preconsent-cookie-evidence-ops]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
