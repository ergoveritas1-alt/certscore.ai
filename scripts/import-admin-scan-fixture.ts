import pg from "pg";

const { Client } = pg;

const rows = [
  ["litnet.com", "36aec736-401f-4a28-a8d4-cefeca2d47eb", "2026-07-29T08:02:00-07:00", 39, false, "ru", "Media / publisher", "Completed Partial (Go)"],
  ["clip-studio.com", "ff735583-3c93-44ea-9d4d-60cff219e01c", "2026-07-29T07:58:00-07:00", 51, false, null, null, null],
  ["example.com", "64fd3967-2ce4-479f-894c-f96948274eba", "2026-07-29T07:58:00-07:00", null, true, "en", "General-purpose / placeholder domain (consumer web, low-specificity)", "Homepage Parked Or Placeholder (No-go)"],
  ["deine-tierwelt.de", "c640fddb-a150-4c4f-8d45-a2e3dede4904", "2026-07-29T07:54:00-07:00", 68, false, "de", null, null],
  ["tnedi.me", "845de075-a33e-405e-9b0a-563e0b947941", "2026-07-29T07:51:00-07:00", 70, false, null, null, null],
  ["navitime.biz", "7dd15270-82c8-4979-ade3-e404a8f0c5d2", "2026-07-29T07:48:00-07:00", 74, false, null, null, null],
  ["trueconf.ru", "f336a88e-3862-4c82-8a75-e20dc159826b", "2026-07-29T07:44:00-07:00", 51, false, "ru", null, null],
  ["gannett-cdn.com", "e72d4351-9f20-4aed-86b8-a1ad2fd2b6f5", "2026-07-29T07:41:00-07:00", 54, false, null, null, null],
  ["newtoki1.org", "2035ba14-a8c4-43b3-8d7e-34215b169812", "2026-07-29T07:37:00-07:00", 54, false, null, null, null],
  ["adition.com", "236f6bb4-873e-4e28-a8a9-dc476ad2abed", "2026-07-29T07:34:00-07:00", 54, false, null, null, null],
  ["rudderlabs.com", "95bbb4d7-cc6a-4470-9c04-5328eba27e79", "2026-07-29T07:30:00-07:00", 70, false, "en", "B2B SaaS / Product analytics & customer data platform", "Completed Partial (Go)"],
  ["bio.site", "13568362-559b-406f-a966-70848a4ccb6f", "2026-07-29T07:26:00-07:00", 64, false, "en", "Bio link / personal profile landing pages (creator/portfolio-style)", "Completed Partial (Go)"],
  ["pghub.io", "64611777-0e81-4ead-9316-42e7777ae637", "2026-07-29T07:20:00-07:00", 69, false, null, null, null],
  ["iliad.it", "bbcd6e5e-572a-45a6-bc26-ffd156fa6062", "2026-07-29T07:16:00-07:00", 26, false, "it", "Telecommunications / Mobile network operator (Italian ISP & mobile services)", "Completed Partial (Go)"],
  ["google.us", "8583a4be-86ea-4304-875b-fbad131fb74b", "2026-07-29T07:12:00-07:00", 51, false, "en", "Search engine / Technology (Advertising & Web Services)", "Completed Partial (Go)"],
  ["7-11.com.tw", "03d39f0d-bb2f-4431-a30a-64ea84e746ff", "2026-07-29T07:08:00-07:00", 29, false, "en", "Convenience store / Retail (7-Eleven franchise)", "Completed Partial (Go)"],
  ["sma.de", "3e0f0c43-dfeb-48a2-8864-9f60be55342c", "2026-07-29T07:04:00-07:00", 89, false, "de", null, null],
  ["lacoste.com", "b7473b9d-4c88-411a-9f53-7bbfed455f73", "2026-07-29T07:00:00-07:00", 49, false, "en", "Fashion & Apparel (Luxury retail/e-commerce)", "Completed Partial (Go)"],
  ["nrk.no", "ae4f6ff7-8e12-4b01-a27c-30871d84f4f4", "2026-07-29T06:56:00-07:00", 60, false, "nb", null, null],
  ["ebc.com.br", "1ad730a2-0357-4d9b-82b0-73fce3c1811b", "2026-07-29T06:49:00-07:00", 12, false, "pt", "Business services / corporate (likely finance or enterprise services)", "Completed Partial (Go)"],
  ["darkero.com", "ad3fcca3-3c66-4c55-8b9b-f005cbd28f55", "2026-07-29T06:42:00-07:00", 39, false, null, null, null],
  ["xn--3-nyf3aak0c.net", "29a0037f-bbd0-4ffc-bed0-6e3bd0f7ad8a", "2026-07-29T06:39:00-07:00", 44, false, null, null, null],
  ["uib.no", "7ec523df-7c85-4281-8754-30587bbdef2d", "2026-07-29T06:35:00-07:00", 78, false, "nb", null, null],
  ["shortpixel.ai", "aacfafc7-880f-493e-9d63-bca62ae733e4", "2026-07-29T06:32:00-07:00", 54, false, "en", "Image optimization / SEO SaaS (web performance & compression tools)", "Completed Partial (Go)"],
  ["homeaffairs.gov.au", "ba6ff182-455b-4911-bcd8-5746a77236a6", "2026-07-29T06:28:00-07:00", 43, false, "en", "Government / Public sector (Home Affairs)", "Completed Partial (Go)"],
  ["zblogcn.com", "1f76d0d2-00af-4540-850e-d53e13a620c2", "2026-07-29T06:24:00-07:00", 69, false, null, null, null],
  ["bwinners.gm", "21f1e12b-a199-4359-a868-9982266194b2", "2026-07-29T06:21:00-07:00", 37, false, null, null, null],
  ["lboro.ac.uk", "b67c78ea-1adb-4006-ad83-8f7a92bf9835", "2026-07-29T06:17:00-07:00", 13, false, "en", "Higher Education / University", "Completed Partial (Go)"],
  ["ucr.ac.cr", "8bc68829-fde7-4c3d-9066-e09a02da0ae0", "2026-07-29T06:13:00-07:00", 48, false, null, null, null],
  ["sape.ru", "85bd7cca-987b-4ebf-8744-c10fbe5e1cf2", "2026-07-29T06:09:00-07:00", 23, false, "ru", "SaaS / web application", "Completed Partial (Go)"]
] as const;

const targetUrl = process.env.TARGET_DATABASE_URL?.trim();
if (!targetUrl) throw new Error("Set TARGET_DATABASE_URL explicitly.");
const target = new URL(targetUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing to write to non-local target database: ${target.hostname}`);
}

const client = new Client({ connectionString: targetUrl });
const organizationId = "00000000-0000-0000-0000-000000000301";

async function main() {
  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into public.organizations (id, name, slug, plan, plan_status)
       values ($1, 'Local Admin Scan Fixture', 'local-admin-scan-fixture', 'custom', 'active')
       on conflict (id) do nothing`,
      [organizationId]
    );
    for (const [domain, scanId, timestamp, score, noGo, language, industry, outcome] of rows) {
      const existingDomain = await client.query<{ id: string }>(
        `select id from public.domains where hostname = $1 order by created_at asc limit 1`,
        [domain]
      );
      const domainResult = existingDomain.rows[0]
        ? existingDomain
        : await client.query<{ id: string }>(
            `insert into public.domains (organization_id, hostname, normalized_url, status)
             values ($1, $2, $3, 'active')
             returning id`,
            [organizationId, domain, `https://${domain}`]
          );
      const domainId = domainResult.rows[0]?.id;
      if (!domainId) throw new Error(`Could not create local domain ${domain}.`);
      await client.query(
        `insert into public.scans (id, organization_id, domain_id, scan_type, status, pages_requested, pages_scanned,
                                   started_at, completed_at, scan_config_json)
         values ($1, $2, $3, 'full', 'completed', 1, 1, $4::timestamptz, $4::timestamptz,
                 $5::jsonb)
         on conflict (id) do nothing`,
        [scanId, organizationId, domainId, timestamp, JSON.stringify({ source: "api-full-scan", scanFrom: "eu-ir" })]
      );
      await client.query(
        `insert into public.scan_snapshots
          (scan_id, organization_id, domain_id, pages_requested, pages_scanned, total_signals,
           privacy_policy_present, certscore_overall, scan_outcome, site_language_primary,
           admin_industry_label, access_posture_class, blocked_flag, captcha_flag, visual_evidence_artifacts)
         values ($1, $2, $3, 1, 1, $4, $5, $6, $7, $8, $9, 'clear', false, false, '[]'::jsonb)
         on conflict (scan_id) do update set
           certscore_overall = excluded.certscore_overall,
           scan_outcome = excluded.scan_outcome,
           site_language_primary = excluded.site_language_primary,
           admin_industry_label = excluded.admin_industry_label`,
        [scanId, organizationId, domainId, noGo ? 0 : 10, !noGo, score, outcome, language, industry]
      );
      const requestId = `local-prod-fixture-${scanId}`;
      await client.query(
        `insert into public.scan_requests
          (public_id, request_type, request_channel, requested_url, normalized_url, normalized_domain,
           requested_by, request_context, status, resolution_mode, scan_id, fulfilled_by_scan_id, requested_at)
         values ($1, 'full_scan', 'api-full-scan', $2, $2, $3, '{"anonymous":true}'::jsonb,
                 '{"scanFrom":"eu-ir","bypassRecentScanReuse":true}'::jsonb, 'completed', 'new_scan', $4, $4, $5::timestamptz)
         on conflict (public_id) do nothing`,
        [requestId, `https://${domain}`, domain, scanId, timestamp]
      );
    }
    await client.query("commit");
    console.log(`Imported ${rows.length} production admin scan rows into the local database.`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
