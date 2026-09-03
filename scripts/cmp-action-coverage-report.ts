import { pathToFileURL } from "node:url";
import {
  canonicalizeKnownCmpName,
  getKnownCmpActionCapability,
  getKnownCmpCapabilityMatrix,
} from "../packages/shared/src/known-cmps.js";
import { closePools, query } from "../packages/db/src/index.js";

export type CmpExposureRow = {
  cmp_vendor_name: string;
  domain_count: number | string;
  scan_count: number | string;
};

export type CmpActionCoverageAlert = {
  canonicalName: string | null;
  domainCount: number;
  rawName: string;
  scanCount: number;
  type: "unregistered_cmp" | "accept_recipe_missing" | "reject_recipe_missing";
};

export function analyzeCmpActionCoverage(
  rows: CmpExposureRow[],
  minimumDomains = 3,
) {
  const alerts: CmpActionCoverageAlert[] = [];
  const exposure = rows.map((row) => {
    const rawName = row.cmp_vendor_name.trim();
    const canonicalName = canonicalizeKnownCmpName(rawName);
    const domainCount = Number(row.domain_count);
    const scanCount = Number(row.scan_count);
    const accept = canonicalName
      ? getKnownCmpActionCapability(canonicalName, "accept")
      : undefined;
    const reject = canonicalName
      ? getKnownCmpActionCapability(canonicalName, "reject")
      : undefined;
    if (domainCount >= minimumDomains) {
      if (!canonicalName) {
        alerts.push({ canonicalName, domainCount, rawName, scanCount, type: "unregistered_cmp" });
      } else {
        if (!accept?.recipeAvailable) {
          alerts.push({ canonicalName, domainCount, rawName, scanCount, type: "accept_recipe_missing" });
        }
        if (!reject?.recipeAvailable) {
          alerts.push({ canonicalName, domainCount, rawName, scanCount, type: "reject_recipe_missing" });
        }
      }
    }
    return {
      accept,
      canonicalName,
      domainCount,
      rawName,
      reject,
      scanCount,
    };
  });
  return {
    alertCount: alerts.length,
    alerts,
    exposure,
    minimumDomains,
    registry: getKnownCmpCapabilityMatrix(),
  };
}

async function readIabCmpNames() {
  const response = await fetch("https://cmplist.consensu.org/v2/cmp-list.json", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`IAB CMP list returned HTTP ${response.status}.`);
  const body = await response.json() as { cmps?: Record<string, { name?: string }> };
  return [...new Set(Object.values(body.cmps ?? {})
    .map((cmp) => cmp.name?.trim())
    .filter((name): name is string => Boolean(name)))]
    .sort((left, right) => left.localeCompare(right));
}

async function readExposure(lookbackDays: number) {
  const result = await query<CmpExposureRow>(`
    select ss.cmp_vendor_name,
           count(*)::int as scan_count,
           count(distinct s.domain_id)::int as domain_count
      from public.scan_snapshots ss
      join public.scans s on s.id = ss.scan_id
     where s.completed_at >= now() - ($1::int * interval '1 day')
       and s.status = 'completed'
       and nullif(trim(ss.cmp_vendor_name), '') is not null
     group by ss.cmp_vendor_name
     order by count(*) desc
  `, [lookbackDays], { readOnly: true });
  return result.rows;
}

async function main() {
  if (process.argv.includes("--scheduled")) {
    const now = new Date();
    if (now.getUTCHours() !== 7 || now.getUTCMinutes() >= 15) {
      console.log("CMP action coverage audit is outside its daily 07:00 UTC slot; skipping.");
      return;
    }
  }
  const registryOnly = process.argv.includes("--registry-only");
  const lookbackDays = Number(process.env.CERTSCORE_CMP_COVERAGE_LOOKBACK_DAYS ?? "90");
  const minimumDomains = Number(process.env.CERTSCORE_CMP_COVERAGE_ALERT_DOMAINS ?? "3");
  const rows = registryOnly ? [] : await readExposure(lookbackDays);
  const report = analyzeCmpActionCoverage(rows, minimumDomains);
  const iabNames = await readIabCmpNames().catch((error) => {
    console.warn(`::warning::IAB CMP discovery feed unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  });
  const registeredIabNames = iabNames.filter((name) => canonicalizeKnownCmpName(name));
  const output = {
    contractVersion: "certscore.cmp_action_coverage_report.v1",
    generatedAt: new Date().toISOString(),
    iabDiscovery: {
      matchedRegistryNames: registeredIabNames.length,
      source: "https://cmplist.consensu.org/v2/cmp-list.json",
      totalNames: iabNames.length,
    },
    lookbackDays,
    ...report,
  };
  for (const alert of report.alerts) {
    console.warn(`::warning title=CMP action coverage::${alert.type}: ${alert.rawName} (${alert.domainCount} domains, ${alert.scanCount} scans)`);
  }
  console.log(JSON.stringify(output, null, 2));
  if (process.argv.includes("--fail-on-alert") && report.alerts.length > 0) {
    process.exitCode = 2;
  }
  await closePools();
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  void main().catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    await closePools().catch(() => undefined);
    process.exitCode = 1;
  });
}
