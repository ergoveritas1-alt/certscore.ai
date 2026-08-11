#!/usr/bin/env node
import { execFile as execFileWithCallback, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

type CohortManifest = {
  adversarial?: string[];
  baseline?: string[];
  expanded?: string[];
};

type Args = {
  cohort: "adversarial" | "baseline" | "expanded";
  concurrency: number;
  envFile?: string;
  forceReview: boolean;
  functionName: string;
  maxUncertainFields: number;
  minFieldAgreement: number;
  minLoadedExactAgreement: number;
  outDir?: string;
  profile: "tiny" | "standard" | "full";
  queueUrl?: string;
  region: "eu-central-1" | "eu-west-1" | "us-west-1";
  requireNoGoSites: number;
  requireProofForLoaded: boolean;
  review: boolean;
  sitesFile?: string;
};

type LambdaResponse = {
  artifactMetadata?: Record<string, { sha256?: string; sizeBytes?: number }>;
  artifactPointers?: Record<string, string>;
  error?: unknown;
  scanId?: string;
  scannerGitSha?: string;
  scannerImageTag?: string;
  status?: string;
};

type LambdaManifest = {
  auxiliaryArtifacts?: Array<{
    fileName?: string;
    uri?: string;
  }>;
};

type GeometryArtifact = {
  access?: {
    reasonCodes?: string[];
    status?: string;
  };
  egress?: {
    label?: string;
  };
  summary?: {
    cmpDetected?: boolean;
    cmpName?: string;
    confidence?: number;
    firstLayerAccept?: boolean;
    firstLayerOptions?: boolean;
    firstLayerReject?: boolean;
  };
};

type FinalSummary = {
  rows?: FinalSummaryRow[];
};

type FinalSummaryRow = {
  accessStatus?: string;
  accept?: boolean | "unavailable";
  nanoAgreementAccept?: string;
  nanoAgreementOptions?: string;
  nanoAgreementReject?: string;
  nanoSawConsentBanner?: boolean | "not_reviewed" | "uncertain";
  noGo?: boolean;
  options?: boolean | "unavailable";
  reject?: boolean | "unavailable";
  screenshotPath?: string;
  site: string;
};

type SiteResult = {
  accept: boolean;
  accessReasonCodes: string[];
  accessStatus: string | null;
  auxiliaryKeys: string[];
  cmp: string;
  confidence: number | null;
  elapsedMs: number;
  error: string | null;
  egressLabel: string | null;
  options: boolean;
  proofScreenshot: boolean;
  reject: boolean;
  scanId: string;
  scannerGitSha: string | null;
  scannerImageTag: string | null;
  site: string;
  slug: string;
  status: string;
};

type AwsResult = {
  attempts: AwsAttempt[];
  recoveredFromSqs?: boolean;
  stderr: string;
  stdout: string;
};

type AwsAttempt = {
  attempt: number;
  durationMs: number;
  error?: string;
  retryable?: boolean;
  stderr?: string;
  stdout?: string;
};

const execFile = promisify(execFileWithCallback);
const repoRoot = process.cwd();
const defaultManifestPath = path.join(repoRoot, "scripts", "config", "consent-geometry-aro-nogo-cohorts.json");

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadEnvFile(args.envFile);
  }
  const sites = await loadSites(args);
  if (sites.length === 0) {
    throw new Error("A/R/O no-go gate requires at least one site.");
  }
  const queueUrl = args.queueUrl ?? defaultQueueUrl(args.region);
  const sha = await gitHead();
  const outDir = path.resolve(args.outDir ?? path.join(
    repoRoot,
    "artifacts",
    "consent-control-geometry",
    `aws-lambda-${regionSlug(args.region)}`,
    `aro-nogo-${args.cohort}-${timestamp()}-${sha.slice(0, 8)}`,
  ));
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "sites.txt"), `${sites.join("\n")}\n`, "utf8");

  const startedAt = new Date().toISOString();
  const rows = await mapConcurrent(sites, args.concurrency, (site) =>
    runSite({ args, outDir, queueUrl, sha, site }),
  );
  const summary = {
    artifactVersion: "deployed_lambda_aro_nogo_cohort.v1",
    cohort: args.cohort,
    functionName: args.functionName,
    generatedAt: new Date().toISOString(),
    region: args.region,
    rows,
    scannerGitSha: sha,
    startedAt,
  };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await cleanupSqsMessages({
    queueUrl,
    region: args.region,
    scanIds: new Set(rows.map((row) => row.scanId)),
  });

  if (args.review) {
    await runPnpm([
      "--filter",
      "@certscore/scan-core",
      "consent-geometry-review",
      "--artifacts",
      outDir,
      ...(args.envFile ? ["--env-file", path.resolve(args.envFile)] : []),
      ...(args.forceReview ? ["--force"] : []),
    ]);
  }
  await runPnpm([
    "--filter",
    "@certscore/scan-core",
    "consent-geometry-final-summary",
    "--artifacts",
    outDir,
  ]);
  await cleanupSqsMessages({
    queueUrl,
    region: args.region,
    scanIds: new Set(rows.map((row) => row.scanId)),
  });

  const gateMetrics = await computeGateMetrics(outDir);
  await writeFile(path.join(outDir, "aro-nogo-gate-metrics.json"), `${JSON.stringify(gateMetrics, null, 2)}\n`, "utf8");
  await writeHumanAdjudicationPriority(outDir);
  const report = gateReportMarkdown({ args, gateMetrics, outDir, queueUrl, sha });
  await writeFile(path.join(outDir, "aro-nogo-gate-report.md"), report, "utf8");
  console.log(report);

  const failures = gateFailures(args, gateMetrics);
  if (failures.length > 0) {
    throw new Error(`A/R/O no-go gate failed: ${failures.join("; ")}`);
  }
}

async function runSite(input: {
  args: Args;
  outDir: string;
  queueUrl: string;
  sha: string;
  site: string;
}): Promise<SiteResult> {
  const site = normalizeSite(input.site);
  const slug = siteSlug(site);
  const siteDir = path.join(input.outDir, slug);
  await mkdir(siteDir, { recursive: true });
  const scanId = `aro-gate-${input.args.cohort}-${slug.replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`.slice(0, 120);
  const payload = {
    artifactOnly: true,
    awsRegion: input.args.region,
    callbackCorrelationId: scanId,
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    functionName: input.args.functionName,
    hostname: site,
    localCallbackUrl: null,
    orchestrationMode: "single",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    profile: input.args.profile,
    resultHandoff: "sqs",
    resultPurpose: "synthetic_verification",
    resultQueueUrl: input.queueUrl,
    scanId,
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: `https://${site}/`,
    vpcMode: "none",
  };
  const payloadPath = path.join(siteDir, "lambda-payload.json");
  const responsePath = path.join(siteDir, "lambda-response.json");
  await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const startedMs = Date.now();
  try {
    const invoke = await invokeLambdaWithSqsRecovery({
      args: input.args,
      payloadPath,
      queueUrl: input.queueUrl,
      responsePath,
      scanId,
      site,
    });
    await writeFile(path.join(siteDir, "lambda-invoke-meta.json"), `${JSON.stringify({
      ...jsonObjectFromStdout(invoke.stdout),
      attempts: invoke.attempts,
      recoveredFromSqs: invoke.recoveredFromSqs === true,
    }, null, 2)}\n`, "utf8");
    const response = JSON.parse(await readFile(responsePath, "utf8")) as LambdaResponse;
    if (response.status !== "completed") {
      throw new Error(`Lambda returned ${response.status ?? "unknown"}: ${JSON.stringify(response.error ?? null)}`);
    }
    const auxiliaryKeys = await mirrorArtifacts({
      response,
      region: input.args.region,
      siteDir,
    });
    const row = await summarizeSite({
      auxiliaryKeys,
      elapsedMs: Date.now() - startedMs,
      response,
      scanId,
      site,
      siteDir,
      slug,
    });
    console.log(`${site}: ${row.accessStatus ?? row.status} A/R/O=${row.accept}/${row.reject}/${row.options} proof=${row.proofScreenshot} sha=${(row.scannerGitSha ?? "").slice(0, 8)} elapsed=${Math.round(row.elapsedMs / 1000)}s`);
    return row;
  } catch (error) {
    const row: SiteResult = {
      accept: false,
      accessReasonCodes: [],
      accessStatus: null,
      auxiliaryKeys: [],
      cmp: "unknown",
      confidence: null,
      elapsedMs: Date.now() - startedMs,
      error: error instanceof Error ? error.message : String(error),
      egressLabel: null,
      options: false,
      proofScreenshot: false,
      reject: false,
      scanId,
      scannerGitSha: null,
      scannerImageTag: null,
      site,
      slug,
      status: "failed",
    };
    await writeFile(path.join(siteDir, "error.json"), `${JSON.stringify(row, null, 2)}\n`, "utf8");
    console.log(`${site}: failed ${row.error}`);
    return row;
  }
}

async function mirrorArtifacts(input: {
  region: Args["region"];
  response: LambdaResponse;
  siteDir: string;
}): Promise<string[]> {
  const pointers = input.response.artifactPointers ?? {};
  const mirrored: string[] = [];
  const coreArtifacts: Array<[string, string | undefined]> = [
    ["LocalV2DagLambdaManifest.json", pointers.manifestUri],
    ["CanonicalEvidenceBundle.json", pointers.scanArtifactUri],
    ["ReviewResult.json", pointers.reviewArtifactUri],
    ["V2ReportProjectionDraft.json", pointers.reportAdapterArtifactUri],
  ];
  for (const [fileName, uri] of coreArtifacts) {
    if (uri) {
      await copyS3({ filePath: path.join(input.siteDir, fileName), region: input.region, uri });
      mirrored.push(s3Key(uri));
    }
  }
  const manifestPath = path.join(input.siteDir, "LocalV2DagLambdaManifest.json");
  const manifest = await readJsonIfExists<LambdaManifest>(manifestPath);
  for (const artifact of manifest?.auxiliaryArtifacts ?? []) {
    if (!artifact.fileName || !artifact.uri || !isSupportedAuxiliaryFileName(artifact.fileName)) {
      continue;
    }
    await copyS3({
      filePath: path.join(input.siteDir, artifact.fileName),
      region: input.region,
      uri: artifact.uri,
    });
    mirrored.push(s3Key(artifact.uri));
  }
  await writeFile(path.join(input.siteDir, "LambdaArtifactMirrorManifest.json"), `${JSON.stringify({
    artifactOnly: true,
    fetchedAt: new Date().toISOString(),
    mirroredArtifacts: mirrored,
    outDir: input.siteDir,
    scanId: input.response.scanId ?? null,
    source: "consent-geometry-aro-nogo-lambda-gate",
  }, null, 2)}\n`, "utf8");
  return mirrored;
}

async function summarizeSite(input: {
  auxiliaryKeys: string[];
  elapsedMs: number;
  response: LambdaResponse;
  scanId: string;
  site: string;
  siteDir: string;
  slug: string;
}): Promise<SiteResult> {
  const geometry = await readJsonIfExists<GeometryArtifact>(path.join(input.siteDir, "ConsentControlGeometryEvidence.json"));
  const summary = geometry?.summary;
  const access = geometry?.access;
  return {
    accept: Boolean(summary?.firstLayerAccept),
    accessReasonCodes: access?.reasonCodes ?? [],
    accessStatus: access?.status ?? null,
    auxiliaryKeys: input.auxiliaryKeys,
    cmp: summary?.cmpName ?? (summary?.cmpDetected ? "unknown" : "none"),
    confidence: typeof summary?.confidence === "number" ? summary.confidence : null,
    elapsedMs: input.elapsedMs,
    error: null,
    egressLabel: geometry?.egress?.label ?? null,
    options: Boolean(summary?.firstLayerOptions),
    proofScreenshot: await exists(path.join(input.siteDir, "screenshot-pre-consent-geometry-proof.png")),
    reject: Boolean(summary?.firstLayerReject),
    scanId: input.response.scanId ?? input.scanId,
    scannerGitSha: input.response.scannerGitSha ?? null,
    scannerImageTag: input.response.scannerImageTag ?? null,
    site: input.site,
    slug: input.slug,
    status: input.response.status ?? "unknown",
  };
}

async function computeGateMetrics(outDir: string): Promise<Record<string, unknown>> {
  const finalSummary = await readJsonIfExists<FinalSummary>(path.join(outDir, "final-cohort-summary.json"));
  const rows = finalSummary?.rows ?? [];
  const loadedRows = rows.filter((row) => row.accessStatus === "loaded");
  const noGoRows = rows.filter((row) => row.noGo === true);
  const agreementFields = loadedRows.flatMap((row) => [
    row.nanoAgreementAccept,
    row.nanoAgreementReject,
    row.nanoAgreementOptions,
  ]);
  const exactLoadedAgreementCount = loadedRows.filter((row) => [
    row.nanoAgreementAccept,
    row.nanoAgreementReject,
    row.nanoAgreementOptions,
  ].every((value) => value === "agree")).length;
  const proofLoadedCount = loadedRows.filter(hasRequiredLoadedVisualProof).length;
  return {
    artifactVersion: "consent_geometry_aro_nogo_gate_metrics.v1",
    generatedAt: new Date().toISOString(),
    loadedExactAgreementRate: loadedRows.length > 0 ? exactLoadedAgreementCount / loadedRows.length : null,
    loadedSites: loadedRows.length,
    noGoSites: noGoRows.map((row) => row.site),
    noGoSitesCount: noGoRows.length,
    perFieldAgreementRate: agreementFields.length > 0
      ? agreementFields.filter((value) => value === "agree").length / agreementFields.length
      : null,
    perFieldAgreement: `${agreementFields.filter((value) => value === "agree").length}/${agreementFields.length}`,
    proofScreenshotsForLoadedSites: `${proofLoadedCount}/${loadedRows.length}`,
    proofScreenshotsForLoadedSitesRate: loadedRows.length > 0 ? proofLoadedCount / loadedRows.length : null,
    totalSites: rows.length,
    uncertainFields: agreementFields.filter((value) => value === "uncertain").length,
  };
}

function hasRequiredLoadedVisualProof(row: FinalSummaryRow): boolean {
  const screenshotPath = row.screenshotPath ?? "";
  if (/geometry-proof/.test(screenshotPath)) {
    return true;
  }
  const scannerObservedControl = row.accept === true || row.reject === true || row.options === true;
  if (scannerObservedControl) {
    return false;
  }
  return /screenshot-pre-consent/.test(screenshotPath);
}

async function writeHumanAdjudicationPriority(outDir: string): Promise<void> {
  const finalSummary = await readJsonIfExists<FinalSummary>(path.join(outDir, "final-cohort-summary.json"));
  const rows = finalSummary?.rows ?? [];
  const priorityRows = rows
    .filter((row) => row.noGo !== true)
    .filter((row) => [
      row.nanoAgreementAccept,
      row.nanoAgreementReject,
      row.nanoAgreementOptions,
    ].some((value) => value !== "agree"));
  const header = [
    "site",
    "reason",
    "nano_agreement_accept",
    "nano_agreement_reject",
    "nano_agreement_options",
    "screenshot_path",
  ];
  const csvRows = priorityRows.map((row) => [
    row.site,
    priorityReason(row),
    row.nanoAgreementAccept ?? "",
    row.nanoAgreementReject ?? "",
    row.nanoAgreementOptions ?? "",
    row.screenshotPath ?? "",
  ]);
  await writeFile(
    path.join(outDir, "human-adjudication-priority.csv"),
    csv([header, ...csvRows]),
    "utf8",
  );
}

function priorityReason(row: FinalSummaryRow): string {
  const agreements = [
    row.nanoAgreementAccept,
    row.nanoAgreementReject,
    row.nanoAgreementOptions,
  ];
  if (agreements.some((value) => value === "uncertain")) {
    return "nano_uncertain";
  }
  if (agreements.some((value) => value === "disagree")) {
    return "nano_disagreement";
  }
  return "needs_review";
}

function gateFailures(args: Args, metrics: Record<string, unknown>): string[] {
  const failures: string[] = [];
  const exact = nullableNumber(metrics.loadedExactAgreementRate);
  const field = nullableNumber(metrics.perFieldAgreementRate);
  const noGo = numberValue(metrics.noGoSitesCount);
  const uncertain = numberValue(metrics.uncertainFields);
  const proofRate = nullableNumber(metrics.proofScreenshotsForLoadedSitesRate);
  if (exact === null || exact < args.minLoadedExactAgreement) {
    failures.push(`loaded exact agreement ${formatRate(exact)} < ${args.minLoadedExactAgreement}`);
  }
  if (field === null || field < args.minFieldAgreement) {
    failures.push(`per-field agreement ${formatRate(field)} < ${args.minFieldAgreement}`);
  }
  if (noGo < args.requireNoGoSites) {
    failures.push(`no-go sites ${noGo} < ${args.requireNoGoSites}`);
  }
  if (uncertain > args.maxUncertainFields) {
    failures.push(`uncertain fields ${uncertain} > ${args.maxUncertainFields}`);
  }
  if (args.requireProofForLoaded && proofRate !== 1) {
    failures.push(`proof screenshots for loaded sites ${formatRate(proofRate)} < 1`);
  }
  return failures;
}

function gateReportMarkdown(input: {
  args: Args;
  gateMetrics: Record<string, unknown>;
  outDir: string;
  queueUrl: string;
  sha: string;
}): string {
  return [
    "# Consent Geometry A/R/O No-Go Lambda Gate",
    "",
    `- Cohort: ${input.args.cohort}`,
    `- Region: ${input.args.region}`,
    `- Function: ${input.args.functionName}`,
    `- Queue: ${input.queueUrl}`,
    `- Scanner SHA: ${input.sha}`,
    `- Artifacts: ${input.outDir}`,
    `- Total sites: ${String(input.gateMetrics.totalSites ?? "unknown")}`,
    `- Loaded sites: ${String(input.gateMetrics.loadedSites ?? "unknown")}`,
    `- No-go sites: ${String(input.gateMetrics.noGoSitesCount ?? "unknown")}`,
    `- Loaded exact agreement: ${formatRate(nullableNumber(input.gateMetrics.loadedExactAgreementRate))}`,
    `- Per-field agreement: ${formatRate(nullableNumber(input.gateMetrics.perFieldAgreementRate))} (${String(input.gateMetrics.perFieldAgreement ?? "n/a")})`,
    `- Proof screenshots for loaded sites: ${String(input.gateMetrics.proofScreenshotsForLoadedSites ?? "n/a")}`,
    `- Uncertain fields: ${String(input.gateMetrics.uncertainFields ?? "unknown")}`,
    "",
  ].join("\n");
}

async function cleanupSqsMessages(input: {
  queueUrl: string;
  region: Args["region"];
  scanIds: Set<string>;
}): Promise<void> {
  let deleted = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const receive = await runAws([
      "sqs",
      "receive-message",
      "--region",
      input.region,
      "--queue-url",
      input.queueUrl,
      "--max-number-of-messages",
      "10",
      "--wait-time-seconds",
      attempt === 0 ? "5" : "1",
      "--visibility-timeout",
      "10",
      "--output",
      "json",
    ]);
    const parsed = receive.stdout.trim() ? JSON.parse(receive.stdout) as {
      Messages?: Array<{ Body?: string; ReceiptHandle?: string }>;
    } : {};
    const messages = parsed.Messages ?? [];
    if (messages.length === 0) {
      break;
    }
    for (const message of messages) {
      const scanId = parseSqsScanId(message.Body);
      if (!scanId || !input.scanIds.has(scanId) || !message.ReceiptHandle) {
        continue;
      }
      await runAws([
        "sqs",
        "delete-message",
        "--region",
        input.region,
        "--queue-url",
        input.queueUrl,
        "--receipt-handle",
        message.ReceiptHandle,
      ]);
      deleted += 1;
    }
  }
  console.log(`SQS cleanup deleted ${deleted} gate result message(s).`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    cohort: "baseline",
    concurrency: 3,
    forceReview: true,
    functionName: "certscore-v2-dag-local-lambda",
    maxUncertainFields: 0,
    minFieldAgreement: 1,
    minLoadedExactAgreement: 1,
    profile: "tiny",
    region: "eu-west-1",
    requireNoGoSites: 1,
    requireProofForLoaded: true,
    review: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--cohort" && isCohort(value)) {
      args.cohort = value;
      index += 1;
    } else if (key === "--concurrency" && value) {
      args.concurrency = boundedInteger(value, 1, 10, "concurrency");
      index += 1;
    } else if (key === "--env-file" && value) {
      args.envFile = value;
      index += 1;
    } else if (key === "--function-name" && value) {
      args.functionName = value;
      index += 1;
    } else if (key === "--max-uncertain-fields" && value) {
      args.maxUncertainFields = boundedInteger(value, 0, 200, "max uncertain fields");
      index += 1;
    } else if (key === "--min-field-agreement" && value) {
      args.minFieldAgreement = boundedNumber(value, 0, 1, "minimum field agreement");
      index += 1;
    } else if (key === "--min-loaded-exact-agreement" && value) {
      args.minLoadedExactAgreement = boundedNumber(value, 0, 1, "minimum loaded exact agreement");
      index += 1;
    } else if (key === "--out-dir" && value) {
      args.outDir = value;
      index += 1;
    } else if (key === "--profile" && isProfile(value)) {
      args.profile = value;
      index += 1;
    } else if (key === "--queue-url" && value) {
      args.queueUrl = value;
      index += 1;
    } else if (key === "--region" && isRegion(value)) {
      args.region = value;
      index += 1;
    } else if (key === "--require-no-go-sites" && value) {
      args.requireNoGoSites = boundedInteger(value, 0, 50, "required no-go sites");
      index += 1;
    } else if (key === "--sites-file" && value) {
      args.sitesFile = value;
      index += 1;
    } else if (key === "--skip-review") {
      args.review = false;
    } else if (key === "--no-force-review") {
      args.forceReview = false;
    } else if (key === "--allow-missing-proof") {
      args.requireProofForLoaded = false;
    } else if (key === "--help") {
      printUsageAndExit();
    }
  }
  return args;
}

async function loadSites(args: Args): Promise<string[]> {
  if (args.sitesFile) {
    return uniqueSites((await readFile(path.resolve(args.sitesFile), "utf8")).split(/\r?\n/));
  }
  const manifest = JSON.parse(await readFile(defaultManifestPath, "utf8")) as CohortManifest;
  return uniqueSites(manifest[args.cohort] ?? []);
}

async function copyS3(input: { filePath: string; region: Args["region"]; uri: string }): Promise<void> {
  await runAws([
    "s3",
    "cp",
    input.uri,
    input.filePath,
    "--region",
    input.region,
    "--only-show-errors",
  ]);
}

async function invokeLambdaWithSqsRecovery(input: {
  args: Args;
  payloadPath: string;
  queueUrl: string;
  responsePath: string;
  scanId: string;
  site: string;
}): Promise<AwsResult> {
  try {
    return await runAwsWithRetry([
      "lambda",
      "invoke",
      "--region",
      input.args.region,
      "--function-name",
      input.args.functionName,
      "--invocation-type",
      "RequestResponse",
      "--cli-binary-format",
      "raw-in-base64-out",
      "--payload",
      `fileb://${input.payloadPath}`,
      input.responsePath,
    ], {
      attempts: 3,
      label: `lambda invoke ${input.site}`,
    });
  } catch (error) {
    const attempts = errorAttempts(error);
    console.log(`${input.site}: synchronous invoke failed; polling SQS for ${input.scanId}`);
    const recovered = await recoverLambdaResponseFromSqs({
      queueUrl: input.queueUrl,
      region: input.args.region,
      scanId: input.scanId,
      timeoutMs: 120_000,
    });
    if (!recovered) {
      throw error;
    }
    await writeFile(input.responsePath, `${JSON.stringify(recovered, null, 2)}\n`, "utf8");
    return {
      attempts,
      recoveredFromSqs: true,
      stderr: "",
      stdout: JSON.stringify({
        StatusCode: 200,
        recoveredFromSqs: true,
        scanId: input.scanId,
      }),
    };
  }
}

async function recoverLambdaResponseFromSqs(input: {
  queueUrl: string;
  region: Args["region"];
  scanId: string;
  timeoutMs: number;
}): Promise<LambdaResponse | null> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const receive = await runAws([
      "sqs",
      "receive-message",
      "--region",
      input.region,
      "--queue-url",
      input.queueUrl,
      "--max-number-of-messages",
      "10",
      "--wait-time-seconds",
      "10",
      "--visibility-timeout",
      "30",
      "--output",
      "json",
    ]);
    const parsed = receive.stdout.trim() ? JSON.parse(receive.stdout) as {
      Messages?: Array<{ Body?: string; ReceiptHandle?: string }>;
    } : {};
    for (const message of parsed.Messages ?? []) {
      const body = parseSqsResultBody(message.Body);
      if (body?.scanId !== input.scanId || !message.ReceiptHandle) {
        continue;
      }
      await runAws([
        "sqs",
        "delete-message",
        "--region",
        input.region,
        "--queue-url",
        input.queueUrl,
        "--receipt-handle",
        message.ReceiptHandle,
      ]);
      return body;
    }
  }
  return null;
}

function parseSqsResultBody(body: string | undefined): LambdaResponse | null {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as LambdaResponse;
    return typeof parsed.scanId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function runAws(args: string[]): Promise<AwsResult> {
  const startedMs = Date.now();
  const result = await execFile("aws", args, {
    cwd: repoRoot,
    env: awsCliEnv(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    attempts: [{
      attempt: 1,
      durationMs: Date.now() - startedMs,
      stderr: result.stderr,
      stdout: result.stdout,
    }],
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function runAwsWithRetry(
  args: string[],
  options: {
    attempts: number;
    label: string;
  },
): Promise<AwsResult> {
  const attempts: AwsAttempt[] = [];
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const startedMs = Date.now();
    try {
      const result = await execFile("aws", args, {
        cwd: repoRoot,
        env: awsCliEnv(),
        maxBuffer: 20 * 1024 * 1024,
      });
      attempts.push({
        attempt,
        durationMs: Date.now() - startedMs,
        stderr: result.stderr,
        stdout: result.stdout,
      });
      return {
        attempts,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableAwsCliError(error);
      attempts.push({
        attempt,
        durationMs: Date.now() - startedMs,
        error: errorMessage(error),
        retryable,
        stderr: errorStderr(error),
        stdout: errorStdout(error),
      });
      if (!retryable || attempt >= options.attempts) {
        break;
      }
      console.log(`${options.label}: retrying AWS CLI attempt ${attempt + 1}/${options.attempts} after ${errorMessage(error)}`);
      await sleep(1_000 * attempt);
    }
  }
  const message = `${options.label} failed after ${attempts.length} attempt(s): ${errorMessage(lastError)}`;
  const wrapped = new Error(message);
  (wrapped as Error & { attempts?: AwsAttempt[] }).attempts = attempts;
  throw wrapped;
}

function awsCliEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AWS_CLI_CONNECT_TIMEOUT: process.env.AWS_CLI_CONNECT_TIMEOUT ?? "30",
    AWS_CLI_READ_TIMEOUT: process.env.AWS_CLI_READ_TIMEOUT ?? "900",
  };
}

function isRetryableAwsCliError(error: unknown): boolean {
  const text = `${errorMessage(error)}\n${errorStderr(error)}`;
  return /read timeout|connect timeout|timed out|connection reset|connection aborted|temporarily unavailable|throttl|rate exceeded|too many requests|service unavailable|internal failure/i.test(text);
}

function jsonObjectFromStdout(stdout: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStderr(error: unknown): string {
  return typeof (error as { stderr?: unknown })?.stderr === "string"
    ? (error as { stderr: string }).stderr
    : "";
}

function errorStdout(error: unknown): string {
  return typeof (error as { stdout?: unknown })?.stdout === "string"
    ? (error as { stdout: string }).stdout
    : "";
}

function errorAttempts(error: unknown): AwsAttempt[] {
  return Array.isArray((error as { attempts?: unknown })?.attempts)
    ? (error as { attempts: AwsAttempt[] }).attempts
    : [];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPnpm(args: string[]): Promise<void> {
  const child = spawn("corepack", ["pnpm", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.base.json"),
    },
    stdio: "inherit",
  });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`corepack pnpm ${args.join(" ")} exited with ${code ?? "unknown"}`));
      }
    });
  });
}

async function gitHead(): Promise<string> {
  const result = await execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  return result.stdout.trim();
}

async function loadEnvFile(filePath: string): Promise<void> {
  const content = await readFile(path.resolve(filePath), "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = (match[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : Promise.reject(error);
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const value = values[currentIndex];
      if (value === undefined) {
        return;
      }
      results[currentIndex] = await mapper(value);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function parseSqsScanId(body: string | undefined): string | null {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body) as { scanId?: unknown };
    return typeof parsed.scanId === "string" ? parsed.scanId : null;
  } catch {
    return null;
  }
}

function defaultQueueUrl(region: Args["region"]): string {
  return `https://sqs.${region}.amazonaws.com/199536052647/certscore-v2-dag-local-production-results`;
}

function isSupportedAuxiliaryFileName(fileName: string): boolean {
  return path.basename(fileName) === fileName && /\.(?:json|png|jpe?g)$/i.test(fileName);
}

function s3Key(uri: string): string {
  return uri.replace(/^s3:\/\/[^/]+\//, "");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function regionSlug(region: Args["region"]): string {
  if (region === "eu-central-1") {
    return "eu-de";
  }
  if (region === "us-west-1") {
    return "us-west";
  }
  return "eu-ie";
}

function normalizeSite(site: string): string {
  return site.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
}

function uniqueSites(sites: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const rawSite of sites) {
    const site = normalizeSite(rawSite);
    if (!site || site.startsWith("#") || seen.has(site)) {
      continue;
    }
    seen.add(site);
    output.push(site);
  }
  return output;
}

function siteSlug(site: string): string {
  return site.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
}

function isRegion(value: string | undefined): value is Args["region"] {
  return value === "eu-central-1" || value === "eu-west-1" || value === "us-west-1";
}

function isProfile(value: string | undefined): value is Args["profile"] {
  return value === "tiny" || value === "standard" || value === "full";
}

function isCohort(value: string | undefined): value is Args["cohort"] {
  return value === "baseline" || value === "expanded" || value === "adversarial";
}

function boundedInteger(value: string, min: number, max: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return parsed;
}

function boundedNumber(value: string, min: number, max: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a number from ${min} to ${max}.`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatRate(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function csv(rows: string[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function printUsageAndExit(): never {
  console.log([
    "Usage: pnpm v2:consent-geometry-aro-nogo-gate [options]",
    "",
    "Options:",
    "  --cohort baseline|expanded|adversarial",
    "  --sites-file <path>",
    "  --region eu-central-1|eu-west-1|us-west-1",
    "  --function-name <name>",
    "  --queue-url <url>",
    "  --out-dir <path>",
    "  --concurrency <1-10>",
    "  --env-file apps/web/.env.local",
    "  --skip-review",
    "  --allow-missing-proof",
    "  --min-loaded-exact-agreement <0-1>",
    "  --min-field-agreement <0-1>",
    "  --require-no-go-sites <n>",
    "  --max-uncertain-fields <n>",
  ].join("\n"));
  process.exit(0);
}
