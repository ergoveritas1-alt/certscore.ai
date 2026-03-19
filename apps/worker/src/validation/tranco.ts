import { extractHostname, normalizeUrl } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { ensureValidationSettings, insertValidationAuditEvent, setValidationScheduleState, upsertValidationTargets } from "./repository";
import { VALIDATION_TRANCO_FALLBACK_URL } from "./constants";

function parseCsv(text: string, minRank: number, maxRank: number) {
  const rows: Array<{ hostname: string; normalizedUrl: string; source: string; trancoRank: number }> = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [rankToken, domainToken] = trimmed.split(",", 2);
    const rank = Number.parseInt(rankToken ?? "", 10);
    if (!Number.isFinite(rank) || rank < minRank || rank > maxRank) {
      continue;
    }

    const domain = domainToken?.trim();
    if (!domain) {
      continue;
    }

    try {
      const normalizedUrl = normalizeUrl(domain);
      rows.push({
        hostname: extractHostname(normalizedUrl),
        normalizedUrl,
        source: "tranco",
        trancoRank: rank
      });
    } catch {
      continue;
    }
  }

  return rows;
}

export async function syncTrancoTargetsIfDue(now = new Date()) {
  const env = getWorkerEnv();
  const supabaseUrl = env.VALIDATION_TRANCO_SOURCE_URL ?? VALIDATION_TRANCO_FALLBACK_URL;
  const settings = await ensureValidationSettings();
  const lastSyncAt = settings.lastTrancoSyncAt ? new Date(settings.lastTrancoSyncAt) : null;
  if (lastSyncAt && now.getTime() - lastSyncAt.getTime() < 24 * 60 * 60_000) {
    return {
      inserted: 0,
      skipped: true
    };
  }

  const response = await fetch(supabaseUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Tranco CSV (${response.status}).`);
  }

  const text = await response.text();
  const rows = parseCsv(text, env.VALIDATION_TRANCO_MIN_RANK, env.VALIDATION_TRANCO_MAX_RANK);
  const inserted = await upsertValidationTargets(rows);

  await setValidationScheduleState({
    lastTrancoSyncAt: now
  });
  await insertValidationAuditEvent({
    eventType: "validation.tranco_synced",
    metadata: {
      inserted,
      maxRank: env.VALIDATION_TRANCO_MAX_RANK,
      minRank: env.VALIDATION_TRANCO_MIN_RANK,
      sourceUrl: supabaseUrl
    }
  });

  return {
    inserted,
    skipped: false
  };
}
