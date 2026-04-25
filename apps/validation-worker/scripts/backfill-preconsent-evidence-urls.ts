import { closePools, query } from "@website-signal-risk-scanner/db";
import { collectResolvedRuntimeVendors } from "../src/validation/vendor-enrichment";

type RuntimeRow = Record<string, unknown> & {
  hostname: string | null;
  scan_id: string;
};

type PreconsentRow = {
  evidence_urls: string[] | null;
  id: string;
  scan_id: string;
  script_host: string | null;
  vendor_name: string;
};

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getNumberFlag(name: string, fallback: number) {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeHost(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().replace(/^\.+/, "").toLowerCase() : null;
}

function buildEvidenceUrlsByRow(input: {
  preconsentRows: PreconsentRow[];
  runtimeArtifacts: RuntimeRow;
}) {
  const resolvedVendors = collectResolvedRuntimeVendors({
    requestedHostname: input.runtimeArtifacts.hostname ?? "",
    runtimeArtifacts: input.runtimeArtifacts
  }).filter((vendor) => vendor.beforeConsent && vendor.sampleUrls.length > 0);

  return new Map(
    input.preconsentRows.flatMap((row) => {
      const rowHost = normalizeHost(row.script_host);
      const matchingUrls = uniqueStrings(
        resolvedVendors
          .filter((vendor) => vendor.vendorName === row.vendor_name || (rowHost !== null && normalizeHost(vendor.hostname) === rowHost))
          .flatMap((vendor) => vendor.sampleUrls)
      );
      if (matchingUrls.length === 0) {
        return [];
      }
      return [[row.id, matchingUrls] as const];
    })
  );
}

async function main() {
  const apply = hasFlag("--apply");
  const limit = getNumberFlag("--limit", 500);

  const runtimeResult = await query<RuntimeRow>(
    `
      select ra.*, d.hostname
        from scan_runtime_artifacts ra
        join scans s on s.id = ra.scan_id
        left join domains d on d.id = s.domain_id
       where exists (
         select 1
           from scan_preconsent_violations pv
          where pv.scan_id = ra.scan_id
       )
       order by ra.created_at desc
       limit $1
    `,
    [limit],
    { readOnly: true }
  );

  let scansWithRecoveredUrls = 0;
  let rowsWithRecoveredUrls = 0;
  let recoveredUrlCount = 0;

  for (const runtimeArtifacts of runtimeResult.rows) {
    const preconsentResult = await query<PreconsentRow>(
      `
        select id, scan_id, vendor_name, script_host, evidence_urls
          from scan_preconsent_violations
         where scan_id = $1
      `,
      [runtimeArtifacts.scan_id],
      { readOnly: true }
    );
    const urlsByRow = buildEvidenceUrlsByRow({
      preconsentRows: preconsentResult.rows,
      runtimeArtifacts
    });
    const allRecoveredUrls = uniqueStrings([...urlsByRow.values()].flat());
    if (allRecoveredUrls.length === 0) {
      continue;
    }

    scansWithRecoveredUrls += 1;
    rowsWithRecoveredUrls += urlsByRow.size;
    recoveredUrlCount += allRecoveredUrls.length;

    if (!apply) {
      continue;
    }

    for (const [rowId, urls] of urlsByRow) {
      await query(
        `
          update scan_preconsent_violations
             set evidence_urls = (
                   select coalesce(array_agg(distinct url order by url), '{}'::text[])
                     from unnest(coalesce(evidence_urls, '{}'::text[]) || $2::text[]) as merged(url)
                    where length(trim(url)) > 0
                 )
           where id = $1
        `,
        [rowId, urls]
      );
    }

    await query(
      `
        update scan_runtime_artifacts
           set consent_baseline_tracker_evidence_urls = (
                 select coalesce(array_agg(distinct url order by url), '{}'::text[])
                   from unnest(coalesce(consent_baseline_tracker_evidence_urls, '{}'::text[]) || $2::text[]) as merged(url)
                  where length(trim(url)) > 0
               ),
               updated_at = timezone('utc', now())
         where scan_id = $1
      `,
      [runtimeArtifacts.scan_id, allRecoveredUrls]
    );
  }

  console.log(
    JSON.stringify(
      {
        apply,
        recoveredUrlCount,
        rowsScanned: runtimeResult.rows.length,
        rowsWithRecoveredUrls,
        scansWithRecoveredUrls
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
