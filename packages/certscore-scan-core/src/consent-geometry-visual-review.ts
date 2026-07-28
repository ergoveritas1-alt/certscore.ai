import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ConsentControlCandidateEvidence,
  ConsentControlContainerEvidence,
  ConsentControlGeometryArtifact,
} from "./consent-control-geometry.js";
import { classifyConsentControlLabel } from "@certscore/contracts";
import type { ConsentGeometryAccessDiagnostic } from "./consent-geometry-access.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_NANO_MODEL = "gpt-5.4-nano";
const REVIEW_FILE_NAME = "nano-visual-review.json";

export type NanoVisualBoolean = boolean | "uncertain";
export type NanoVisualAgreement = "agree" | "disagree" | "uncertain";
export type NanoVisualReviewStatus = "reviewed" | "no_screenshot" | "access_no_go" | "error";

export interface ConsentGeometryNanoVisualReview {
  site: string;
  reviewStatus: NanoVisualReviewStatus;
  visualFirstLayerAccept: NanoVisualBoolean;
  visualFirstLayerReject: NanoVisualBoolean;
  visualFirstLayerOptions: NanoVisualBoolean;
  scannerAgreement: {
    accept: NanoVisualAgreement;
    reject: NanoVisualAgreement;
    options: NanoVisualAgreement;
  };
  visibleLabels: string[];
  notes: string[];
  limitations: string[];
  reviewedAt: string;
  model?: string;
}

export interface ConsentGeometryNanoVisualReviewSummary {
  artifactVersion: "consent_geometry_nano_visual_review_summary.v1";
  source: "consent_geometry_nano_visual_review_diagnostic";
  artifactsRoot: string;
  generatedAt: string;
  model?: string;
  rows: ConsentGeometryNanoVisualReview[];
}

export interface RunConsentGeometryNanoVisualReviewInput {
  artifactsRoot: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  siteFilter?: string[];
  force?: boolean;
}

interface SiteArtifactInput {
  site: string;
  siteDir: string;
  geometryPath?: string;
  screenshotPath?: string;
  errorPath?: string;
}

type GeometryWithAccessDiagnostic = ConsentControlGeometryArtifact & {
  access?: ConsentGeometryAccessDiagnostic;
};

interface ReviewPacket {
  site: string;
  pageUrl: string;
  scannerSummary: ConsentControlGeometryArtifact["summary"];
  visibleConfirmedCandidates: Array<BoundedCandidate>;
  nonVisibleConsentCandidates: Array<BoundedCandidate>;
  containers: Array<BoundedContainer>;
  limitations: string[];
}

interface BoundedCandidate {
  label: string;
  actionType: ConsentControlCandidateEvidence["actionType"];
  decisionStatus: ConsentControlCandidateEvidence["decisionStatus"];
  layer: ConsentControlCandidateEvidence["layer"];
  boundingBox: ConsentControlCandidateEvidence["boundingBox"];
  reasons: string[];
}

interface BoundedContainer {
  selectorHint: string;
  layer: ConsentControlContainerEvidence["layer"];
  textExcerpt: string;
  boundingBox: ConsentControlContainerEvidence["boundingBox"];
}

export async function runConsentGeometryNanoVisualReview(
  input: RunConsentGeometryNanoVisualReviewInput,
): Promise<ConsentGeometryNanoVisualReviewSummary> {
  const artifactsRoot = path.resolve(input.artifactsRoot);
  const model = input.model?.trim() || DEFAULT_NANO_MODEL;
  const rows: ConsentGeometryNanoVisualReview[] = [];
  const sites = await discoverSiteArtifactInputs(artifactsRoot, input.siteFilter);
  const fetchImpl = input.fetchImpl ?? fetch;

  for (const site of sites) {
    const reviewPath = path.join(site.siteDir, REVIEW_FILE_NAME);
    if (!input.force && await exists(reviewPath)) {
      const existing = JSON.parse(await readFile(reviewPath, "utf8")) as ConsentGeometryNanoVisualReview;
      rows.push(existing);
      continue;
    }

    const review = await reviewSiteArtifact(site, {
      apiKey: input.apiKey,
      model,
      fetchImpl,
    });
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
    rows.push(review);
  }

  const summary: ConsentGeometryNanoVisualReviewSummary = {
    artifactVersion: "consent_geometry_nano_visual_review_summary.v1",
    source: "consent_geometry_nano_visual_review_diagnostic",
    artifactsRoot,
    generatedAt: new Date().toISOString(),
    ...(input.apiKey ? { model } : {}),
    rows: rows.sort((left, right) => left.site.localeCompare(right.site)),
  };
  await writeFile(path.join(artifactsRoot, "nano-visual-review-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function reviewSiteArtifact(
  site: SiteArtifactInput,
  options: {
    apiKey?: string;
    model: string;
    fetchImpl: typeof fetch;
  },
): Promise<ConsentGeometryNanoVisualReview> {
  if (site.errorPath && !site.geometryPath) {
    const errorText = await readFile(site.errorPath, "utf8").catch(() => "");
    return statusReview(site.site, "access_no_go", {
      limitations: [firstLine(errorText) || "navigation failed before geometry artifact was retained"],
      model: options.apiKey ? options.model : undefined,
    });
  }

  if (!site.geometryPath) {
    return statusReview(site.site, "error", {
      limitations: ["missing consent-control-geometry.json"],
      model: options.apiKey ? options.model : undefined,
    });
  }

  const geometry = JSON.parse(await readFile(site.geometryPath, "utf8")) as GeometryWithAccessDiagnostic;
  if (geometry.access && geometry.access.status !== "loaded") {
    return statusReview(site.site, "access_no_go", {
      geometry,
      limitations: [
        `access_status:${geometry.access.status}`,
        ...geometry.access.reasonCodes,
      ],
      model: options.apiKey ? options.model : undefined,
    });
  }
  const screenshotPath = site.screenshotPath ?? geometry.screenshotArtifactRef;
  if (!screenshotPath || !await exists(screenshotPath)) {
    return statusReview(site.site, "no_screenshot", {
      geometry,
      limitations: ["missing pre-consent screenshot"],
      model: options.apiKey ? options.model : undefined,
    });
  }

  if (!options.apiKey) {
    return statusReview(site.site, "error", {
      geometry,
      limitations: ["OPENAI_API_KEY is required for Nano visual review"],
    });
  }

  try {
    const packet = buildReviewPacket(site.site, geometry);
    const imageDataUrl = await imageDataUrlFor(screenshotPath);
    const parsed = await callNanoVisualReview(options.fetchImpl, {
      apiKey: options.apiKey,
      model: options.model,
      packet,
      imageDataUrl,
    });
    return normalizeNanoVisualReview(site.site, geometry, parsed, options.model);
  } catch (error) {
    return statusReview(site.site, "error", {
      geometry,
      limitations: [error instanceof Error ? error.message : String(error)],
      model: options.model,
    });
  }
}

export function buildReviewPacket(site: string, geometry: ConsentControlGeometryArtifact): ReviewPacket {
  const visibleConfirmedCandidates = geometry.candidates
    .filter((candidate) => candidate.decisionStatus === "confirmed_visible" && candidate.layer === "first_layer")
    .filter(isConsentActionCandidate)
    .map(boundCandidate)
    .slice(0, 16);
  const nonVisibleConsentCandidates = geometry.candidates
    .filter(isConsentActionCandidate)
    .filter((candidate) => candidate.decisionStatus !== "confirmed_visible")
    .map(boundCandidate)
    .slice(0, 24);

  return {
    site,
    pageUrl: geometry.pageUrl,
    scannerSummary: geometry.summary,
    visibleConfirmedCandidates,
    nonVisibleConsentCandidates,
    containers: geometry.containers.map((container) => ({
      selectorHint: container.selectorHint,
      layer: container.layer,
      textExcerpt: container.textExcerpt.slice(0, 500),
      boundingBox: container.boundingBox,
    })).slice(0, 12),
    limitations: geometry.summary.limitations.slice(0, 12),
  };
}

async function callNanoVisualReview(
  fetchImpl: typeof fetch,
  input: {
    apiKey: string;
    model: string;
    packet: ReviewPacket;
    imageDataUrl: string;
  },
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You visually review first-layer website consent controls from a screenshot and a bounded scanner evidence packet.",
            "Return JSON only. Do not create legal conclusions, production findings, scores, checklist rows, or compliance determinations.",
            "Determine only first-layer visible consent controls in the screenshot.",
            "Accept examples: Accept, Accept All, Allow, Agree. Continue counts only if the banner text states consent-by-use or cookie continuation semantics.",
            "Reject examples: Reject, Reject All, Decline, Decline Non-Essential Cookies, Essential Only, Essential Cookies Only, Necessary Only, Continue without agreeing, Reject and Subscribe, Decline and Subscribe, Subscribe and decline, Rifiuta e abbonati.",
            "Options examples: Cookie settings, Manage Cookies, Manage cookies and learn more, Manage preferences, More options, Customize choices, Preferenze, Personalise, Paramétrer mon consentement.",
            "Visible first-layer links count the same as buttons when they are part of the consent banner and their label opens cookie settings, preferences, choices, or consent configuration.",
            "Count inline text links inside the visible banner or modal, even when they look like ordinary blue text links, if they are clearly consent settings/options controls.",
            "Inspect the whole visible banner or modal, including small text links or small outlined buttons at the top or bottom edge, before deciding reject/options are absent. A visible top-right Continue without agreeing or Rifiuta e abbonati control in a consent modal counts as Reject.",
            "Do not count headings, modal titles, or descriptive section labels as Options unless they are visibly rendered as clickable links, buttons, or controls.",
            "Do not count footer-only links unless they are part of a visible first-layer banner.",
            "Do not count hidden, deeper, or preference-center controls unless they are visibly present in the screenshot.",
            "Do not count privacy opt-out, Do Not Sell, or Do Not Share as first-layer cookie reject.",
            "If the screenshot shows the target page but no visible consent banner or first-layer consent controls, return false for Accept, Reject, and Options, not uncertain.",
            "If the screenshot is blocked, a security check, or not the target page, mark uncertain and explain briefly.",
            "Keep booleans consistent with visibleLabels: if you list a visible Accept/Accept All/Allow/Agree control, visualFirstLayerAccept must be true; if you list a visible Reject/Decline/Continue without agreeing/Reject and Subscribe/Decline and Subscribe/Subscribe and decline/Rifiuta e abbonati/Essential Only/Essential Cookies Only/Necessary Only control, visualFirstLayerReject must be true, even when the reject control is a small top-right link or outlined button; if you list a visible Cookie settings/Manage cookies/Manage preferences/Manage settings/More options/Paramétrer mon consentement/Preferenze control, visualFirstLayerOptions must be true.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                reviewInstructions: {
                  outputShape: {
                    visualFirstLayerAccept: "boolean or uncertain",
                    visualFirstLayerReject: "boolean or uncertain",
                    visualFirstLayerOptions: "boolean or uncertain",
                    visibleLabels: ["visible labels observed in screenshot"],
                    notes: ["short evidence-scoped notes"],
                    limitations: ["short limitations"],
                  },
                },
                evidencePacket: input.packet,
              }, null, 2),
            },
            {
              type: "image_url",
              image_url: {
                url: input.imageDataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_completion_tokens: 1_000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Nano visual review request failed with status ${response.status}${errorBody ? `: ${errorBody.slice(0, 500)}` : ""}`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(extractJson(content)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

export function normalizeNanoVisualReview(
  site: string,
  geometry: ConsentControlGeometryArtifact,
  parsed: Record<string, unknown>,
  model?: string,
): ConsentGeometryNanoVisualReview {
  const visibleLabels = stringArray(parsed.visibleLabels, 16, 120);
  const visibleLabelHints = classifyVisibleLabels(visibleLabels);
  const noVisibleControls = shouldNormalizeNoVisibleControlReview(geometry, parsed, visibleLabels);
  const accept = noVisibleControls
    ? false
    : visibleLabelHints.accept ? true : visualBoolean(parsed.visualFirstLayerAccept);
  const reject = noVisibleControls
    ? false
    : visibleLabelHints.reject ? true : visualBoolean(parsed.visualFirstLayerReject);
  let options = noVisibleControls
    ? false
    : visibleLabelHints.options ? true : visualBoolean(parsed.visualFirstLayerOptions);
  if (shouldSuppressTitleOnlyOptionsReview(geometry, options)) {
    options = false;
  }
  return {
    site,
    reviewStatus: "reviewed",
    visualFirstLayerAccept: accept,
    visualFirstLayerReject: reject,
    visualFirstLayerOptions: options,
    scannerAgreement: {
      accept: agreement(geometry.summary.firstLayerAccept, accept),
      reject: agreement(geometry.summary.firstLayerReject, reject),
      options: agreement(geometry.summary.firstLayerOptions, options),
    },
    visibleLabels,
    notes: stringArray(parsed.notes, 8, 240),
    limitations: stringArray(parsed.limitations, 8, 240),
    reviewedAt: new Date().toISOString(),
    ...(model ? { model } : {}),
  };
}

function shouldSuppressTitleOnlyOptionsReview(
  geometry: ConsentControlGeometryArtifact,
  visualOptions: NanoVisualBoolean,
): boolean {
  if (visualOptions !== true || geometry.summary.firstLayerOptions) {
    return false;
  }
  return !geometry.candidates.some((candidate) => candidate.actionType === "manage_preferences");
}

function shouldNormalizeNoVisibleControlReview(
  geometry: ConsentControlGeometryArtifact,
  parsed: Record<string, unknown>,
  visibleLabels: string[],
): boolean {
  if (
    geometry.summary.firstLayerAccept ||
    geometry.summary.firstLayerReject ||
    geometry.summary.firstLayerOptions ||
    visibleLabels.length > 0
  ) {
    return false;
  }
  const parsedValues = [
    visualBoolean(parsed.visualFirstLayerAccept),
    visualBoolean(parsed.visualFirstLayerReject),
    visualBoolean(parsed.visualFirstLayerOptions),
  ];
  const parsedDidNotObserveControls = parsedValues.every((value) => value === false || value === "uncertain");
  if (!parsedDidNotObserveControls) {
    return false;
  }
  const reviewText = [
    ...stringArray(parsed.notes, 8, 240),
    ...stringArray(parsed.limitations, 8, 240),
  ].join(" ");
  return /no visible (?:cookie\/)?consent|no consent banner|no visible .*first-layer|no .*consent controls|cannot be confirmed/i.test(reviewText);
}

function classifyVisibleLabels(labels: string[]): {
  accept: boolean;
  reject: boolean;
  options: boolean;
} {
  const output = {
    accept: false,
    reject: false,
    options: false,
  };
  for (const label of labels) {
    const classification = classifyConsentControlLabel({
      label,
      contextText: label,
      hasConsentContext: true,
      hasPreferenceContext: true,
    });
    if (classification.intent === "accept") {
      output.accept = true;
    } else if (
      classification.intent === "reject" &&
      classification.variant !== "reject_with_subscription"
    ) {
      output.reject = true;
    } else if (classification.intent === "options") {
      output.options = true;
    }
  }
  return output;
}

function statusReview(
  site: string,
  status: NanoVisualReviewStatus,
  options: {
    geometry?: ConsentControlGeometryArtifact;
    limitations?: string[];
    model?: string;
  } = {},
): ConsentGeometryNanoVisualReview {
  return {
    site,
    reviewStatus: status,
    visualFirstLayerAccept: "uncertain",
    visualFirstLayerReject: "uncertain",
    visualFirstLayerOptions: "uncertain",
    scannerAgreement: {
      accept: options.geometry ? agreement(options.geometry.summary.firstLayerAccept, "uncertain") : "uncertain",
      reject: options.geometry ? agreement(options.geometry.summary.firstLayerReject, "uncertain") : "uncertain",
      options: options.geometry ? agreement(options.geometry.summary.firstLayerOptions, "uncertain") : "uncertain",
    },
    visibleLabels: [],
    notes: [],
    limitations: (options.limitations ?? []).slice(0, 8),
    reviewedAt: new Date().toISOString(),
    ...(options.model ? { model: options.model } : {}),
  };
}

async function discoverSiteArtifactInputs(
  artifactsRoot: string,
  siteFilter: string[] | undefined,
): Promise<SiteArtifactInput[]> {
  const allowed = siteFilter ? new Set(siteFilter.map((site) => site.toLowerCase())) : undefined;
  const entries = await readdir(artifactsRoot, { withFileTypes: true });
  const sites: SiteArtifactInput[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (allowed && !allowed.has(entry.name.toLowerCase())) {
      continue;
    }
    const siteDir = path.join(artifactsRoot, entry.name);
    const lambdaGeometryPath = path.join(siteDir, "ConsentControlGeometryEvidence.json");
    const legacyGeometryPath = path.join(siteDir, "consent-control-geometry.json");
    const geometryPath = await exists(lambdaGeometryPath) ? lambdaGeometryPath : legacyGeometryPath;
    const lambdaGeometryProofScreenshotPath = path.join(siteDir, "screenshot-pre-consent-geometry-proof.png");
    const lambdaFullPageScreenshotPath = path.join(siteDir, "screenshot-pre-consent-full-page.jpg");
    const lambdaScreenshotPath = path.join(siteDir, "screenshot-pre-consent.png");
    const legacyScreenshotPath = path.join(siteDir, "pre-consent-viewport.png");
    const screenshotPath = await exists(lambdaGeometryProofScreenshotPath)
      ? lambdaGeometryProofScreenshotPath
      : await exists(lambdaFullPageScreenshotPath)
        ? lambdaFullPageScreenshotPath
        : await exists(lambdaScreenshotPath)
        ? lambdaScreenshotPath
        : legacyScreenshotPath;
    const errorPath = path.join(siteDir, "error.txt");
    sites.push({
      site: entry.name,
      siteDir,
      ...(await exists(geometryPath) ? { geometryPath } : {}),
      ...(await exists(screenshotPath) ? { screenshotPath } : {}),
      ...(await exists(errorPath) ? { errorPath } : {}),
    });
  }
  return sites.sort((left, right) => left.site.localeCompare(right.site));
}

function isConsentActionCandidate(candidate: ConsentControlCandidateEvidence): boolean {
  return (
    candidate.actionType === "accept_all" ||
    candidate.actionType === "reject_all" ||
    candidate.actionType === "manage_preferences"
  );
}

function boundCandidate(candidate: ConsentControlCandidateEvidence): BoundedCandidate {
  return {
    label: candidate.label.slice(0, 160),
    actionType: candidate.actionType,
    decisionStatus: candidate.decisionStatus,
    layer: candidate.layer,
    boundingBox: candidate.boundingBox,
    reasons: candidate.reasons.slice(0, 5),
  };
}

async function imageDataUrlFor(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => true, () => false);
}

function agreement(scannerValue: boolean, visualValue: NanoVisualBoolean): NanoVisualAgreement {
  if (visualValue === "uncertain") {
    return "uncertain";
  }
  return scannerValue === visualValue ? "agree" : "disagree";
}

function visualBoolean(value: unknown): NanoVisualBoolean {
  return typeof value === "boolean" ? value : "uncertain";
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  return unique(
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((item) => item.slice(0, maxLength)),
  ).slice(0, maxItems);
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 240) ?? "";
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : "{}";
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}
