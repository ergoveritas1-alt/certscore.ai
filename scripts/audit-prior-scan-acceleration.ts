import pg from "pg";

type Args = {
  sinceHours: number;
  scanIds: string[];
};

function parseArgs(argv: string[]): Args {
  const scanIds: string[] = [];
  let sinceHours = 24;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--scan-id") {
      const value = argv[index + 1];
      if (value) {
        scanIds.push(value);
        index += 1;
      }
      continue;
    }
    if (arg === "--since-hours") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        sinceHours = value;
        index += 1;
      }
    }
  }

  return { scanIds, sinceHours };
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNestedRecord(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return getRecord(value[key]);
}

function millisecondsBetween(start: unknown, end: unknown) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null;
  }
  return end.getTime() - start.getTime();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_READ_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_READ_URL or DATABASE_URL is required.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const scanRows = args.scanIds.length > 0
      ? (
          await client.query(
            `
              select id, status, pages_scanned, started_at, completed_at, scan_config_json
                from scans
               where id = any($1::uuid[])
               order by created_at asc
            `,
            [args.scanIds]
          )
        ).rows
      : (
          await client.query(
            `
              select id, status, pages_scanned, started_at, completed_at, scan_config_json
                from scans
               where created_at >= timezone('utc', now()) - ($1::int * interval '1 hour')
                 and scan_type = 'full'
               order by created_at asc
            `,
            [args.sinceHours]
          )
        ).rows;

    const rows = [];
    for (const scan of scanRows) {
      const events = (
        await client.query(
          `
            select event_type, metadata_json, created_at
              from scan_events
             where scan_id = $1
             order by created_at asc
          `,
          [scan.id]
        )
      ).rows as Array<{ created_at: Date; event_type: string; metadata_json: unknown }>;
      const first = (eventType: string) => events.find((event) => event.event_type === eventType);
      const last = (eventType: string) => [...events].reverse().find((event) => event.event_type === eventType);
      const nanoCompleted = events
        .filter((event) => event.event_type === "signals.nano_doc_enrichment_completed")
        .map((event) => getRecord(event.metadata_json));
      const latestNano = nanoCompleted[nanoCompleted.length - 1] ?? {};
      const reuseNano = nanoCompleted.find((event) => numberOrNull(event.reusableExtractionAcceptedCount) !== null) ?? latestNano;
      const urlscanPreflightDiagnostics = events
        .filter((event) => event.event_type === "runtime.build_phase_diagnostic")
        .map((event) => getRecord(event.metadata_json))
        .filter((event) => event.phase === "urlscan_preflight_legal_fetch");
      const latestUrlscanPreflightDiagnostic = urlscanPreflightDiagnostics[urlscanPreflightDiagnostics.length - 1] ?? {};
      const preflightSuccess = getNestedRecord(latestUrlscanPreflightDiagnostic, "successMetadata");
      const preflightFailure = getNestedRecord(latestUrlscanPreflightDiagnostic, "failureMetadata");
      const preflightMetadata =
        Object.keys(preflightSuccess).length > 0
          ? preflightSuccess
          : Object.keys(preflightFailure).length > 0
            ? preflightFailure
            : latestUrlscanPreflightDiagnostic;
      const config = getRecord(scan.scan_config_json);
      const execution = getRecord(config.execution);
      const prior = getRecord(execution.priorScanAcceleration);
      const crawlSeedHints = Array.isArray(execution.crawlSeedHints)
        ? execution.crawlSeedHints.map((hint) => getRecord(hint))
        : [];
      const documentRows = (
        await client.query(
          `
            select document_type, source_status, extraction_status
              from scan_document_sources
             where scan_id = $1
          `,
          [scan.id]
        ).catch(() => ({ rows: [] }))
      ).rows as Array<{ document_type: string | null; extraction_status: string | null; source_status: string | null }>;
      const readyDocumentTypes = new Set(
        documentRows
          .filter((row) => row.source_status === "ready" && row.extraction_status === "ready")
          .map((row) => row.document_type)
          .filter((value): value is string => Boolean(value))
      );
      const hintTypes = crawlSeedHints
        .map((hint) => (typeof hint.hintType === "string" ? hint.hintType : null))
        .filter((value): value is string => Boolean(value));

      rows.push({
        crawlSeedHintCount: crawlSeedHints.length,
        crawlSeedHintTypes: [...new Set(hintTypes)],
        firstUnifiedFindingMs: millisecondsBetween(scan.started_at, first("findings.unified_derivation_completed")?.created_at),
        freshExtractionAttemptCount: numberOrNull(latestNano.freshExtractionAttemptCount) ?? 0,
        freshExtractionDurationMs: numberOrNull(latestNano.freshExtractionDurationMs) ?? 0,
        freshExtractionTotalTokenCount: numberOrNull(latestNano.freshExtractionTotalTokenCount) ?? 0,
        nanoRetrievalMs: millisecondsBetween(
          first("signals.nano_doc_retrieval_started")?.created_at,
          last("signals.nano_doc_retrieval_completed")?.created_at
        ),
        pagesScanned: scan.pages_scanned,
        priorHintAttemptCount: numberOrNull(preflightMetadata.priorScanHintAttemptCount) ?? 0,
        priorHintAttemptedCount: numberOrNull(preflightMetadata.priorScanHintAttemptedCount) ?? 0,
        priorHintVerifiedCount: numberOrNull(preflightMetadata.priorScanHintVerifiedCount) ?? 0,
        priorHit: Boolean(prior.sourceScanId),
        priorScanSelectionReason: typeof prior.priorScanSelectionReason === "string" ? prior.priorScanSelectionReason : null,
        priorScanSelectionScore: numberOrNull(prior.priorScanSelectionScore),
        readyDocumentTypes: [...readyDocumentTypes],
        reusableExtractionAcceptedCount: numberOrNull(reuseNano.reusableExtractionAcceptedCount) ?? 0,
        reusableExtractionCandidateCount: numberOrNull(reuseNano.reusableExtractionCandidateCount) ?? 0,
        reusableExtractionModelCallAvoidedCount: numberOrNull(reuseNano.reusableExtractionModelCallAvoidedCount) ?? 0,
        scanId: scan.id,
        scannerWallMs: millisecondsBetween(scan.started_at, scan.completed_at),
        sourceScanId: typeof prior.sourceScanId === "string" ? prior.sourceScanId : null,
        status: scan.status
      });
    }

    const priorHitRows = rows.filter((row) => row.priorHit);
    const average = (values: Array<number | null>) => {
      const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return valid.length > 0 ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
    };

    const hintTypes = [...new Set(rows.flatMap((row) => row.crawlSeedHintTypes))].sort();

    console.log(
      JSON.stringify(
        {
          aggregate: {
            averageFirstUnifiedFindingMs: average(rows.map((row) => row.firstUnifiedFindingMs)),
            averageNanoRetrievalMs: average(rows.map((row) => row.nanoRetrievalMs)),
            averageScannerWallMs: average(rows.map((row) => row.scannerWallMs)),
            priorHitRate: rows.length > 0 ? priorHitRows.length / rows.length : 0,
            scanCount: rows.length,
            totalPriorHintAttemptCount: rows.reduce((sum, row) => sum + row.priorHintAttemptCount, 0),
            totalPriorHintAttemptedCount: rows.reduce((sum, row) => sum + row.priorHintAttemptedCount, 0),
            totalPriorHintVerifiedCount: rows.reduce((sum, row) => sum + row.priorHintVerifiedCount, 0),
            totalFreshExtractionAttempts: rows.reduce((sum, row) => sum + row.freshExtractionAttemptCount, 0),
            totalReusableExtractionsAccepted: rows.reduce((sum, row) => sum + row.reusableExtractionAcceptedCount, 0),
            totalReusableModelCallsAvoided: rows.reduce((sum, row) => sum + row.reusableExtractionModelCallAvoidedCount, 0),
            priorHintVerificationRate:
              rows.reduce((sum, row) => sum + row.priorHintAttemptedCount, 0) > 0
                ? rows.reduce((sum, row) => sum + row.priorHintVerifiedCount, 0) /
                  rows.reduce((sum, row) => sum + row.priorHintAttemptedCount, 0)
                : 0,
            hintTypeAcceptance: Object.fromEntries(
              hintTypes.map((hintType) => {
                const hintedRows = rows.filter((row) => row.crawlSeedHintTypes.includes(hintType));
                const acceptedRows = hintedRows.filter((row) => row.readyDocumentTypes.includes(hintType));
                return [
                  hintType,
                  {
                    acceptedScanCount: acceptedRows.length,
                    hintedScanCount: hintedRows.length,
                    scanAcceptanceRate: hintedRows.length > 0 ? acceptedRows.length / hintedRows.length : 0
                  }
                ];
              })
            )
          },
          scans: rows
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
