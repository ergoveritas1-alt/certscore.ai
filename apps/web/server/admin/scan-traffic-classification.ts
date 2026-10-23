import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_TRAFFIC_CLASSIFICATION_SQL } from "../../lib/admin/scan-traffic-classification-sql";
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from "../../lib/admin/mac-mini-scan-bot";
import { INTERNAL_QA_EMAILS, INTERNAL_QA_REQUESTER_IPS, INTERNAL_QA_MCP_CLIENT_NAMES } from "../../lib/admin/admin-traffic-scope";

// Internal classification only. Public admin loaders must authorize before reading it.
const loadCached = unstable_cache(async () => {
  const row = await queryOne<{ qa: string[]; macmini: string[] }>(SCAN_TRAFFIC_CLASSIFICATION_SQL,
    [MAC_MINI_SCAN_BOT_API_KEY_NAMES, INTERNAL_QA_EMAILS, INTERNAL_QA_REQUESTER_IPS, INTERNAL_QA_MCP_CLIENT_NAMES], { readOnly: true });
  if (!row) throw new Error("Scan traffic classification unavailable");
  return row;
}, ["admin-scan-traffic-classification-v2-original-requester"], { revalidate: 30 });
export const loadScanTrafficClassification = cache(() => loadCached());
