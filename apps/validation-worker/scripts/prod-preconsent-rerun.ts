import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";
import { FULL_SCAN_EVENT_TYPES, buildSharedFullScanConfig } from "@website-signal-risk-scanner/shared";

type RerunInput = {
  apply?: boolean;
  allowCreateDomain?: boolean;
  domains?: string[];
  forceActive?: boolean;
  notes?: string;
  pages?: number;
};

type DomainRow = {
  id: string;
  organization_id: string | null;
};

type ActiveScanRow = {
  id: string;
  status: string;
};

function decodeInput(): RerunInput {
  const encoded = process.env.OPS_PRECONSENT_RERUN_INPUT_BASE64?.trim();
  const inline = process.env.OPS_PRECONSENT_RERUN_INPUT_JSON?.trim();
  const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : inline;
  if (!raw) {
    throw new Error("OPS_PRECONSENT_RERUN_INPUT_BASE64 or OPS_PRECONSENT_RERUN_INPUT_JSON is required.");
  }
  const parsed = JSON.parse(raw) as RerunInput;
  const domains = Array.isArray(parsed.domains) ? parsed.domains : [];
  if (domains.length === 0) {
    throw new Error("Rerun input must include at least one explicit domain.");
  }
  if (domains.length > 10) {
    throw new Error("Rerun input is limited to 10 domains per task.");
  }
  if (parsed.apply !== true) {
    throw new Error("Production preconsent reruns require apply=true.");
  }
  return parsed;
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

function getPages(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 25) : 5;
}

async function findDomain(hostname: string, normalizedUrl: string) {
  return queryOne<DomainRow>(
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
}

async function createDomain(hostname: string, normalizedUrl: string) {
  return queryOne<DomainRow>(
    `
      insert into domains (hostname, normalized_url, scan_frequency)
      values ($1, $2, 'manual')
      returning id, organization_id
    `,
    [hostname, normalizedUrl]
  );
}

async function queueRerun(input: RerunInput) {
  const pages = getPages(input.pages);
  const results: Array<Record<string, unknown>> = [];

  for (const rawDomain of input.domains ?? []) {
    const hostname = normalizeHostname(rawDomain);
    if (!hostname) {
      results.push({ domain: rawDomain, skipped: "invalid_domain" });
      continue;
    }

    const normalizedUrl = normalizeUrlForHost(hostname);
    let domain = await findDomain(hostname, normalizedUrl);
    if (!domain && input.allowCreateDomain === true) {
      domain = await createDomain(hostname, normalizedUrl);
    }
    if (!domain) {
      results.push({ domain: hostname, skipped: "domain_not_found" });
      continue;
    }

    const active = await queryOne<ActiveScanRow>(
      `select id, status from scans where domain_id = $1 and status in ('queued', 'running') order by created_at desc limit 1`,
      [domain.id],
      { readOnly: true }
    );
    if (active && input.forceActive !== true) {
      results.push({ activeScanId: active.id, domain: hostname, skipped: "active_scan_exists", status: active.status });
      continue;
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
        {
          pagesRequested: pages,
          runId: process.env.OPS_PRECONSENT_RERUN_RUN_ID ?? null,
          source: "preconsent-cookie-evidence-rerun"
        }
      ]
    );
    await query(`update domains set latest_scan_id = $2 where id = $1`, [domain.id, scan.id]);
    results.push({ domain: hostname, scanId: scan.id, status: "queued" });
  }

  return {
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readWriteScope: {
      domains: (input.domains ?? []).map(normalizeHostname).filter(Boolean),
      maxDomains: 10,
      tables: ["domains", "scans", "scan_events"]
    },
    results
  };
}

async function main() {
  const input = decodeInput();
  const output = await queueRerun(input);
  console.log("__PROD_PRECONSENT_RERUN_JSON_START__");
  console.log(JSON.stringify(output, null, 2));
  console.log("__PROD_PRECONSENT_RERUN_JSON_END__");
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
