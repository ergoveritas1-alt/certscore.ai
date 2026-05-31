import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { AuthenticatedAppUser } from "../auth-flows/types";
import { bootstrapAppUserSession } from "../bootstrap-user";
import { createOrganizationDomain, findOrganizationDomainByNormalizedUrl } from "../domains/repository";
import { findOrCreateAnonymousPreviewDomain } from "../preview-scan/preview-scan-repository";
import { deriveBrowserScanCanonicalMaterializationFromObservedSignals } from "./canonical-materialization";
import { summarizeBrowserEvidence, type BrowserScanArtifactRow, type BrowserScanEventRow } from "./evidence-summary";
import {
  BROWSER_SCAN_CAPTURE_MODE,
  BROWSER_SCAN_MODE,
  BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
  BROWSER_SCAN_SOURCE_ID,
  BROWSER_SCAN_SOURCE_TYPE,
  type BrowserScanEventInput,
  type BrowserScanObservedSignalPackageInput
} from "./schema";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 30 * 60 * 1000;

type BrowserScanSessionRow = {
  artifact_count?: number;
  canonical_scan_id?: string | null;
  created_at?: string;
  duration_ms?: number | null;
  event_count?: number;
  id: string;
  observed_signal_count?: number;
  observed_signals_ingested_at?: string | null;
  scan_completed_at?: string | null;
  scan_started_at?: string | null;
  source_id?: string;
  source_type?: string;
  status: string;
  summary_json?: Record<string, unknown>;
  target_hostname: string;
  target_url: string;
  token_expires_at: string;
  upload_token_hash: string;
  user_id: string | null;
};

type BrowserScanCanonicalScanRow = {
  domain_id: string;
  id: string;
  organization_id: string | null;
  started_at?: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 250) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
    .slice(0, limit);
}

function classifyBrowserVendor(hostname: string) {
  const host = hostname.toLowerCase();
  if (/googletagmanager\.com/.test(host)) return { category: "tag_manager", vendor: "Google Tag Manager" };
  if (/google-analytics\.com|analytics\.google\.com/.test(host)) return { category: "analytics", vendor: "Google Analytics" };
  if (/scorecardresearch\.com/.test(host)) return { category: "analytics", vendor: "Comscore / ScorecardResearch" };
  if (/doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\./.test(host)) return { category: "advertising", vendor: "Google Ads" };
  if (/facebook\.com|facebook\.net|connect\.facebook\.net/.test(host)) return { category: "advertising", vendor: "Meta Pixel" };
  if (/clarity\.ms|bat\.bing\.com/.test(host)) return { category: "analytics", vendor: host.includes("clarity") ? "Microsoft Clarity" : "Microsoft Advertising" };
  if (/hotjar\.com|fullstory\.com|logrocket\.com/.test(host)) return { category: "session_replay", vendor: host.includes("hotjar") ? "Hotjar" : host.includes("fullstory") ? "FullStory" : "LogRocket" };
  if (/segment\.com|segment\.io/.test(host)) return { category: "analytics", vendor: "Segment" };
  return null;
}

function buildBrowserObservedSignalPackageFromEvidence(input: {
  evidence: ReturnType<typeof summarizeBrowserEvidence>;
}): BrowserScanObservedSignalPackageInput {
  const consentSummary =
    input.evidence.consentSummary && typeof input.evidence.consentSummary === "object"
      ? input.evidence.consentSummary
      : null;
  const classified = input.evidence.thirdPartyRequestDomains
    .map((domain) => classifyBrowserVendor(domain))
    .filter((value): value is { category: string; vendor: string } => Boolean(value));
  const trackerVendors = uniqueStrings(classified.map((item) => item.vendor));
  const trackerCategories = uniqueStrings(classified.map((item) => item.category));
  const preconsentNetworkEvents = input.evidence.networkEvidence.filter((event) => event.consentInteractionObserved !== true);
  const preconsentTrackerEvidenceUrls = uniqueStrings(
    preconsentNetworkEvents
      .filter((event) => classifyBrowserVendor(event.hostname))
      .map((event) => event.url),
    50
  );
  const fingerprintCategories = uniqueStrings(input.evidence.fingerprintCategories, 50);
  const signals: BrowserScanObservedSignalPackageInput["observedSignals"] = [];
  const addSignal = (
    key: string,
    label: string,
    value: boolean | number | string | string[],
    valueType: "boolean" | "number" | "text" | "string_array",
    confidence = 0.78,
    evidenceRefs: string[] = [],
    observedAtMs: number | null = null
  ) => {
    signals.push({
      category: "privacy",
      confidence,
      evidenceRefs,
      key,
      label,
      observedAtMs,
      populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
      provenance: {
        captureMode: "single_page_user_browser",
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      },
      value,
      valueType
    });
  };

  addSignal("privacy.third_party_request_count", "Third-party request count", input.evidence.thirdPartyRequestCount, "number", 0.8);
  addSignal("privacy.third_party_request_domains", "Third-party request domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.8);
  addSignal("privacy.third_party_script_domain_count", "Third-party script domain count", input.evidence.thirdPartyRequestDomains.length, "number", 0.68);
  addSignal("privacy.third_party_script_domains", "Third-party script domains", input.evidence.thirdPartyRequestDomains, "string_array", 0.68);
  addSignal("privacy.tracker_vendor_count", "Tracker vendor count", trackerVendors.length, "number", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.tracker_vendors", "Tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_categories", "Pre-consent tracker categories", trackerCategories, "string_array", trackerCategories.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_vendors", "Pre-consent tracker vendors", trackerVendors, "string_array", trackerVendors.length > 0 ? 0.82 : 0.65);
  addSignal("privacy.preconsent_tracker_evidence_urls", "Pre-consent tracker evidence URLs", preconsentTrackerEvidenceUrls, "string_array", 0.82, preconsentTrackerEvidenceUrls);
  addSignal("privacy.preconsent_violation_count", "Pre-consent violation count", preconsentTrackerEvidenceUrls.length, "number", 0.82, preconsentTrackerEvidenceUrls, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal("privacy.cookie_count_total", "Cookie count total", input.evidence.cookies.length, "number", 0.78);
  addSignal("privacy.cookie_banner_present", "Cookie banner present", input.evidence.bannerObserved, "boolean", 0.82, [], consentSummary?.observedAtMs ?? null);
  addSignal("privacy.accept_all_present", "Accept-all control present", consentSummary?.acceptObserved === true, "boolean", 0.78);
  addSignal("privacy.reject_all_present", "Reject-all control present", consentSummary?.rejectObserved === true, "boolean", 0.78);
  addSignal("privacy.granular_preferences_present", "Granular preferences present", consentSummary?.manageObserved === true, "boolean", 0.78);
  addSignal("privacy.do_not_sell_link_present", "Do-not-sell/share control present", consentSummary?.doNotSellShareObserved === true, "boolean", 0.72);
  addSignal("privacy.preconsent_tracking_detected", "Pre-consent tracking detected", preconsentTrackerEvidenceUrls.length > 0, "boolean", 0.82, preconsentTrackerEvidenceUrls, input.evidence.timelineMarkers.firstThirdPartyRequestMs);
  addSignal("privacy.session_replay_runtime_vendors", "Session replay runtime vendors", trackerCategories.includes("session_replay") ? trackerVendors : [], "string_array", 0.76);
  addSignal("privacy.fingerprinting_tier", "Fingerprinting tier", fingerprintCategories.length >= 3 ? 2 : fingerprintCategories.length > 0 ? 1 : 0, "number", 0.6);
  addSignal("privacy.fingerprinting_attribute_categories", "Fingerprinting attribute categories", fingerprintCategories, "string_array", 0.6);

  return {
    observedSignals: signals,
    provenance: {
      sourceId: BROWSER_SCAN_SOURCE_ID,
      sourceType: BROWSER_SCAN_SOURCE_TYPE
    }
  };
}

export async function getBrowserScanSessionForUser(input: {
  browserScanId: string;
  userId: string;
}) {
  return queryOne<BrowserScanSessionRow>(
    `select b.id, b.user_id, b.source_type, b.source_id, b.target_url, b.target_hostname, b.status,
            b.canonical_scan_id, b.scan_started_at::text, b.scan_completed_at::text, b.duration_ms, b.event_count,
            b.artifact_count, b.summary_json, b.created_at::text, b.token_expires_at::text,
            b.upload_token_hash,
            (
              select count(*)::int
                from scan_signals ss
               where ss.scan_id = b.canonical_scan_id
                 and ss.population_source = $3
            ) as observed_signal_count,
            (
              select max(se.created_at)::text
                from scan_events se
               where se.scan_id = b.canonical_scan_id
                 and se.event_type = 'browser_extension.observed_signals_ingested'
            ) as observed_signals_ingested_at
       from browser_scan_sessions b
      where b.id = $1
        and b.user_id = $2`,
    [input.browserScanId, input.userId, BROWSER_SCAN_SIGNAL_POPULATION_SOURCE],
    { readOnly: true }
  );
}

export async function getBrowserScanSessionById(input: {
  browserScanId: string;
}) {
  return queryOne<BrowserScanSessionRow>(
    `select b.id, b.user_id, b.source_type, b.source_id, b.target_url, b.target_hostname, b.status,
            b.canonical_scan_id, b.scan_started_at::text, b.scan_completed_at::text, b.duration_ms, b.event_count,
            b.artifact_count, b.summary_json, b.created_at::text, b.token_expires_at::text,
            b.upload_token_hash,
            (
              select count(*)::int
                from scan_signals ss
               where ss.scan_id = b.canonical_scan_id
                 and ss.population_source = $2
            ) as observed_signal_count,
            (
              select max(se.created_at)::text
                from scan_events se
               where se.scan_id = b.canonical_scan_id
                 and se.event_type = 'browser_extension.observed_signals_ingested'
            ) as observed_signals_ingested_at
       from browser_scan_sessions b
      where b.id = $1`,
    [input.browserScanId, BROWSER_SCAN_SIGNAL_POPULATION_SOURCE],
    { readOnly: true }
  );
}

export async function getBrowserScanRawEvidenceForWs01(input: {
  browserScanId: string;
}) {
  const session = await getBrowserScanSessionById({ browserScanId: input.browserScanId });
  if (!session) {
    return { ok: false as const, status: 404, error: "Browser scan session not found." };
  }

  const [events, artifacts] = await Promise.all([
    query<BrowserScanEventRow & { created_at?: string }>(
      `select event_type, observed_at_ms, event_json, created_at::text
         from browser_scan_events
        where browser_scan_id = $1
        order by observed_at_ms asc, created_at asc`,
      [input.browserScanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<BrowserScanArtifactRow & { created_at?: string }>(
      `select artifact_type, content_type, artifact_json, created_at::text
         from browser_scan_artifacts
        where browser_scan_id = $1
        order by created_at asc`,
      [input.browserScanId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  return {
    ok: true as const,
      rawEvidence: {
        artifacts: artifacts.map((artifact) => ({
          artifactJson: artifact.artifact_json,
        artifactType: artifact.artifact_type,
        contentType: artifact.content_type,
        createdAt: artifact.created_at ?? null
      })),
      browserScanId: session.id,
      canonicalScanId: session.canonical_scan_id ?? null,
      events: events.map((event) => ({
        createdAt: event.created_at ?? null,
        eventJson: event.event_json,
        eventType: event.event_type,
        observedAtMs: event.observed_at_ms
        })),
        scanMode: BROWSER_SCAN_MODE,
        observedSignalCount: session.observed_signal_count ?? 0,
        observedSignalsIngestedAt: session.observed_signals_ingested_at ?? null,
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE,
        status: session.status,
      targetHostname: session.target_hostname,
      targetUrl: session.target_url
    }
  };
}

export async function listBrowserScanSessionsForUser(input: {
  limit?: number;
  userId: string;
}) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

  return query<BrowserScanSessionRow>(
    `select b.id, b.user_id, b.source_type, b.source_id, b.target_url, b.target_hostname, b.status,
            b.canonical_scan_id, b.scan_started_at::text, b.scan_completed_at::text, b.duration_ms, b.event_count,
            b.artifact_count, b.summary_json, b.created_at::text, b.token_expires_at::text,
            b.upload_token_hash,
            (
              select count(*)::int
                from scan_signals ss
               where ss.scan_id = b.canonical_scan_id
                 and ss.population_source = $3
            ) as observed_signal_count,
            (
              select max(se.created_at)::text
                from scan_events se
               where se.scan_id = b.canonical_scan_id
                 and se.event_type = 'browser_extension.observed_signals_ingested'
            ) as observed_signals_ingested_at
       from browser_scan_sessions b
      where b.user_id = $1
      order by b.created_at desc
      limit $2`,
    [input.userId, limit, BROWSER_SCAN_SIGNAL_POPULATION_SOURCE],
    { readOnly: true }
  ).then((result) => result.rows);
}

export function getBrowserScanTokenFromRequest(request: Request) {
  const explicit = request.headers.get("x-certscore-browser-scan-token")?.trim();
  if (explicit) {
    return explicit;
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}

export function normalizeBrowserScanUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be scanned.");
  }

  url.hash = "";
  return {
    hostname: url.hostname.toLowerCase(),
    normalizedUrl: url.toString()
  };
}

export async function createBrowserScanSession(input: {
  targetUrl: string;
  user: AuthenticatedAppUser | null;
}) {
  const target = normalizeBrowserScanUrl(input.targetUrl);
  const uploadToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const row = await queryOne<{ id: string }>(
    `insert into browser_scan_sessions (
       user_id, source_type, source_id, scan_mode, capture_mode, target_url, target_hostname,
       status, upload_token_hash, token_expires_at, scan_started_at
    )
     values ($1, $2, $3, $4, $5, $6, $7, 'started', $8, $9, timezone('utc', now()))
     returning id`,
    [
      input.user?.id ?? null,
      BROWSER_SCAN_SOURCE_TYPE,
      BROWSER_SCAN_SOURCE_ID,
      BROWSER_SCAN_MODE,
      BROWSER_SCAN_CAPTURE_MODE,
      target.normalizedUrl,
      target.hostname,
      hashToken(uploadToken),
      tokenExpiresAt
    ]
  );

  if (!row) {
    throw new Error("Browser scan session could not be created.");
  }

  return {
    browserScanId: row.id,
    captureMode: BROWSER_SCAN_CAPTURE_MODE,
    scanMode: BROWSER_SCAN_MODE,
    sourceId: BROWSER_SCAN_SOURCE_ID,
    sourceType: BROWSER_SCAN_SOURCE_TYPE,
    targetHostname: target.hostname,
    targetUrl: target.normalizedUrl,
    tokenExpiresAt,
    uploadToken
  };
}

export async function authorizeBrowserScanWrite(input: {
  browserScanId: string;
  requestToken: string | null;
  user: AuthenticatedAppUser | null;
}) {
  const row = await queryOne<BrowserScanSessionRow>(
    `select id, user_id, target_url, target_hostname, status, upload_token_hash, token_expires_at
       from browser_scan_sessions
      where id = $1`,
    [input.browserScanId]
  );

  if (!row) {
    return { ok: false as const, status: 404, error: "Browser scan session not found." };
  }

  const userAllowed = Boolean(input.user?.id && row.user_id === input.user.id);
  const tokenAllowed =
    Boolean(input.requestToken) &&
    row.upload_token_hash === hashToken(input.requestToken ?? "") &&
    new Date(row.token_expires_at).getTime() > Date.now();

  if (!userAllowed && !tokenAllowed) {
    return { ok: false as const, status: 401, error: "Browser scan session is not authorized." };
  }

  if (row.status === "complete") {
    return { ok: false as const, status: 409, error: "Browser scan session is already complete." };
  }

  return { ok: true as const, session: row };
}

export async function insertBrowserScanEvents(browserScanId: string, events: BrowserScanEventInput[]) {
  const values: unknown[] = [browserScanId];
  const rows = events.map((event, index) => {
    const offset = index * 3;
    values.push(event.eventType, event.observedAtMs, JSON.stringify(redactBrowserScanEvent(event)));
    return `($1, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`;
  });

  await query(
    `insert into browser_scan_events (browser_scan_id, event_type, observed_at_ms, event_json)
     values ${rows.join(", ")}
     on conflict do nothing`,
    values
  );

  await query(
    `update browser_scan_sessions
        set event_count = event_count + $2,
            status = case when status = 'started' then 'observing' else status end
      where id = $1`,
    [browserScanId, events.length]
  );
}

export async function insertBrowserScanArtifact(input: {
  artifactJson: Record<string, unknown>;
  artifactType: string;
  browserScanId: string;
  contentType: string;
}) {
  await query(
    `insert into browser_scan_artifacts (browser_scan_id, artifact_type, content_type, artifact_json)
     values ($1, $2, $3, $4::jsonb)`,
    [input.browserScanId, input.artifactType, input.contentType, JSON.stringify(input.artifactJson)]
  );

  await query(
    `update browser_scan_sessions
        set artifact_count = artifact_count + 1
      where id = $1`,
    [input.browserScanId]
  );
}

function getObservedSignalIngestToken() {
  return process.env.BX01_OBSERVED_SIGNAL_INGEST_TOKEN?.trim() || null;
}

export function authorizeBrowserObservedSignalIngest(request: Request) {
  const expected = getObservedSignalIngestToken();
  if (!expected) {
    return { ok: false as const, status: 503, error: "BX01 observed signal ingestion is not configured." };
  }

  const received = request.headers.get("x-certscore-bx01-observed-signal-token")?.trim() ?? "";
  if (received !== expected) {
    return { ok: false as const, status: 401, error: "BX01 observed signal ingestion is not authorized." };
  }

  return { ok: true as const };
}

function normalizeSignalValueType(signal: BrowserScanObservedSignalPackageInput["observedSignals"][number]) {
  if (signal.valueType === "boolean" && typeof signal.value === "boolean") {
    return "boolean" as const;
  }
  if (signal.valueType === "number" && typeof signal.value === "number") {
    return "number" as const;
  }
  if (signal.valueType === "string_array" && Array.isArray(signal.value)) {
    return "string_array" as const;
  }
  if (signal.valueType === "text" && typeof signal.value === "string") {
    return "text" as const;
  }

  throw new Error(`Observed signal ${signal.key} value does not match valueType ${signal.valueType}.`);
}

function deriveObservedAt(input: {
  observedAtMs: number | null | undefined;
  scanStartedAt: string | null | undefined;
}) {
  if (typeof input.observedAtMs !== "number") {
    return null;
  }

  const baseMs = input.scanStartedAt ? new Date(input.scanStartedAt).getTime() : Date.now();
  if (!Number.isFinite(baseMs)) {
    return null;
  }

  return new Date(baseMs + input.observedAtMs).toISOString();
}

export async function ingestBrowserScanObservedSignals(input: {
  browserScanId: string;
  signalPackage: BrowserScanObservedSignalPackageInput;
}) {
  const session = await getBrowserScanSessionById({ browserScanId: input.browserScanId });
  if (!session) {
    return { ok: false as const, status: 404, error: "Browser scan session not found." };
  }
  if (!session.canonical_scan_id) {
    return { ok: false as const, status: 409, error: "Browser scan has not been materialized into a canonical scan." };
  }

  const canonicalScan = await queryOne<BrowserScanCanonicalScanRow>(
    `select id, organization_id, domain_id, started_at::text
       from scans
      where id = $1`,
    [session.canonical_scan_id]
  );
  if (!canonicalScan) {
    return { ok: false as const, status: 404, error: "Canonical scan not found." };
  }

  const signals = input.signalPackage.observedSignals;
  const materialized = deriveBrowserScanCanonicalMaterializationFromObservedSignals(signals);
  if (signals.length > 0) {
    const values: unknown[] = [];
    const rows = signals.map((signal, index) => {
      const offset = index * 13;
      const valueType = normalizeSignalValueType(signal);
      const observedAt = deriveObservedAt({
        observedAtMs: signal.observedAtMs,
        scanStartedAt: canonicalScan.started_at ?? session.scan_started_at
      });

      values.push(
        canonicalScan.id,
        canonicalScan.organization_id,
        canonicalScan.domain_id,
        signal.category,
        signal.key,
        signal.label,
        valueType,
        JSON.stringify(signal.value),
        BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        signal.confidence ?? null,
        signal.evidenceRefs,
        JSON.stringify([
          {
            ...signal.provenance,
            browserScanId: input.browserScanId,
            detail: "ws01_bx01_observed_signal",
            kind: "runtime",
            populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE
          }
        ]),
        observedAt
      );

      return `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb, $${offset + 9}, 'present', $${offset + 10}, $${offset + 11}::text[], $${offset + 12}::jsonb, $${offset + 13}::timestamptz)`;
    });

    await query(
      `insert into scan_signals (
         scan_id, organization_id, domain_id, category, signal_key, signal_label,
         value_type, signal_value_json, population_source, population_status,
         confidence, evidence_refs, provenance_json, observed_at
       )
       values ${rows.join(", ")}
       on conflict (scan_id, signal_key, population_source) do update
         set category = excluded.category,
             signal_label = excluded.signal_label,
             value_type = excluded.value_type,
             signal_value_json = excluded.signal_value_json,
             population_status = excluded.population_status,
             confidence = excluded.confidence,
             evidence_refs = excluded.evidence_refs,
             provenance_json = excluded.provenance_json,
             observed_at = excluded.observed_at`,
      values
    );
  }

  await query(
    `update scan_snapshots
        set total_signals = $2::int,
            privacy_signal_count = $3::int,
            tracker_vendor_count = $4::int,
            cookie_banner_present = $5::boolean,
            accept_all_present = $6::boolean,
            reject_all_present = $7::boolean,
            granular_preferences_present = $8::boolean,
            do_not_sell_link_present = $9::boolean,
            preconsent_tracking_detected = $10::boolean,
            tracking_before_consent_detected = $10::boolean,
            cookie_count_total = $11::int,
            tracker_count_total = $12::int,
            analytics_tracker_count = $13::int,
            advertising_tracker_count = $14::int,
            session_replay_tracker_count = $15::int,
            tag_manager_present = $16::boolean,
            third_party_script_domain_count = $17::int,
            tracker_regulatory_risk_score = $18::int,
            consent_maturity_score = $19::int,
            privacy_score = $20::int,
            certscore_overall = $21::int
      where scan_id = $1`,
    [
      canonicalScan.id,
      signals.length,
      signals.filter((signal) => signal.category === "privacy").length,
      materialized.trackerVendorCount,
      materialized.cookieBannerPresent,
      materialized.acceptAllPresent,
      materialized.rejectAllPresent,
      materialized.granularPreferencesPresent,
      materialized.doNotSellLinkPresent,
      materialized.preconsentTrackingDetected,
      materialized.cookieCountTotal,
      materialized.trackerVendorCount,
      materialized.vendorCategoryCounts.analytics,
      materialized.vendorCategoryCounts.advertising,
      materialized.sessionReplayTrackerCount,
      materialized.tagManagerPresent,
      materialized.thirdPartyScriptDomainCount,
      Math.max(0, 100 - materialized.score),
      materialized.cookieBannerPresent ? (materialized.rejectAllPresent ? 80 : 45) : 65,
      materialized.privacyScore,
      materialized.score
    ]
  );

  await query(
    `insert into scan_runtime_artifacts (
       scan_id, organization_id, domain_id, third_party_request_domains, third_party_request_count,
       initial_cookie_names, initial_cookie_domains, initial_cookie_count,
       consent_preconsent_violation_count, consent_baseline_tracker_evidence_urls,
       consent_baseline_tracker_vendor_names, hybrid_runtime_evidence
     )
     values ($1, $9, $10, $2::text[], $3::int, '{}'::text[], '{}'::text[], $4::int, $5::int, $6::text[], $7::text[], $8::jsonb)
     on conflict (scan_id) do update
       set third_party_request_domains = excluded.third_party_request_domains,
           third_party_request_count = excluded.third_party_request_count,
           initial_cookie_count = excluded.initial_cookie_count,
           consent_preconsent_violation_count = excluded.consent_preconsent_violation_count,
           consent_baseline_tracker_evidence_urls = excluded.consent_baseline_tracker_evidence_urls,
           consent_baseline_tracker_vendor_names = excluded.consent_baseline_tracker_vendor_names,
           hybrid_runtime_evidence = coalesce(scan_runtime_artifacts.hybrid_runtime_evidence, '{}'::jsonb) || excluded.hybrid_runtime_evidence,
           updated_at = timezone('utc', now())`,
    [
      canonicalScan.id,
      materialized.thirdPartyRequestDomains,
      materialized.thirdPartyRequestCount,
      materialized.cookieCountTotal,
      materialized.preconsentViolationCount,
      materialized.preconsentTrackerEvidenceUrls,
      materialized.preconsentTrackerVendors,
      JSON.stringify(materialized.hybridRuntimeEvidencePatch),
      canonicalScan.organization_id,
      canonicalScan.domain_id
    ]
  );

  await query(
    `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     values ($1, $2, $3, 'browser_extension.observed_signals_ingested', $4, $5::jsonb)`,
    [
      canonicalScan.id,
      canonicalScan.domain_id,
      canonicalScan.organization_id,
      "WS01-normalized BX01 observed signals were ingested for canonical concern routing.",
      JSON.stringify({
        browserScanId: input.browserScanId,
        populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        signalCount: signals.length,
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      })
    ]
  );

  await query(
    `update browser_scan_sessions
        set summary_json = coalesce(summary_json, '{}'::jsonb)
          || jsonb_build_object(
            'observedSignalCount', $2::int,
            'observedSignalPackageStatus', 'ingested',
            'observedSignalPopulationSource', $3::text,
            'observedSignalsIngestedAt', timezone('utc', now())
          )
      where id = $1`,
    [input.browserScanId, signals.length, BROWSER_SCAN_SIGNAL_POPULATION_SOURCE]
  );

  return { ok: true as const, canonicalScanId: canonicalScan.id, signalCount: signals.length };
}

export async function completeBrowserScanSession(input: {
  browserScanId: string;
  durationMs: number;
  summary: Record<string, unknown>;
  user: AuthenticatedAppUser | null;
}) {
  const materializedScan = await materializeBrowserScanAsCanonicalScan({
    browserScanId: input.browserScanId,
    durationMs: input.durationMs,
    summary: input.summary,
    user: input.user
  });
  const canonicalScanId = materializedScan.canonicalScanId;
  const summary = {
    ...input.summary,
    canonicalScanId,
    evidenceNotice:
      "Browser-observed evidence captured from the reviewer's Chrome browser. Results may reflect the user's browser profile, location, cache, extensions, prior consent state, login state, and network path. Automated public-web observations for review, not legal advice, certification, or a compliance determination.",
    sourceId: BROWSER_SCAN_SOURCE_ID,
    sourceType: BROWSER_SCAN_SOURCE_TYPE
  };

  await query(
    `update browser_scan_sessions
        set status = 'complete',
            scan_completed_at = timezone('utc', now()),
            duration_ms = $2,
            summary_json = $3::jsonb,
            canonical_scan_id = coalesce($4::uuid, canonical_scan_id)
      where id = $1`,
    [input.browserScanId, input.durationMs, JSON.stringify(summary), canonicalScanId]
  );

  const canonicalScan = await queryOne<BrowserScanCanonicalScanRow>(
    `select id, organization_id, domain_id, started_at::text
       from scans
      where id = $1`,
    [canonicalScanId]
  );

  if (canonicalScan) {
    await query(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       select $1, $2, $3, 'browser_extension.normalization_requested', $4, $5::jsonb
       where not exists (
         select 1
           from scan_events
          where scan_id = $1
            and event_type = 'browser_extension.normalization_requested'
       )`,
      [
        canonicalScan.id,
        canonicalScan.domain_id,
        canonicalScan.organization_id,
        "BX01 browser-extension evidence is ready for WS01 observed-signal normalization.",
        JSON.stringify({
          browserScanId: input.browserScanId,
          canonicalScanId: canonicalScan.id,
          requestedAt: new Date().toISOString(),
          sourceId: BROWSER_SCAN_SOURCE_ID,
          sourceType: BROWSER_SCAN_SOURCE_TYPE,
          status: "pending"
        })
      ]
    );

    await query(
      `update browser_scan_sessions
          set summary_json = coalesce(summary_json, '{}'::jsonb)
            || jsonb_build_object(
              'observedSignalPackageStatus', 'requested',
              'observedSignalNormalizationRequestedAt', timezone('utc', now())
            )
        where id = $1`,
      [input.browserScanId]
    );
  }

  if (materializedScan.observedSignalPackage) {
    await ingestBrowserScanObservedSignals({
      browserScanId: input.browserScanId,
      signalPackage: materializedScan.observedSignalPackage
    });
  }

  return { canonicalScanId };
}

function redactBrowserScanEvent(event: BrowserScanEventInput) {
  if (event.eventType === "cookie_added" || event.eventType === "cookie_changed" || event.eventType === "cookie_observed") {
    return {
      ...event,
      valueCaptured: false
    };
  }

  return event;
}

async function resolveBrowserScanDomain(input: {
  normalizedUrl: string;
  targetHostname: string;
  user: AuthenticatedAppUser | null;
}) {
  if (!input.user) {
    return {
      domain: await findOrCreateAnonymousPreviewDomain(input.targetHostname, input.normalizedUrl),
      organizationId: null,
      submittedByUserId: null
    };
  }

  const bootstrapped = await bootstrapAppUserSession(input.user);
  const existing = await findOrganizationDomainByNormalizedUrl({
    normalizedUrl: input.normalizedUrl,
    organizationId: bootstrapped.organization.id
  });
  const domain =
    existing ??
    (await createOrganizationDomain({
      hostname: input.targetHostname,
      normalizedUrl: input.normalizedUrl,
      organizationId: bootstrapped.organization.id,
      scanFrequency: "manual"
    }));

  return {
    domain,
    organizationId: bootstrapped.organization.id,
    submittedByUserId: bootstrapped.user.id
  };
}

async function materializeBrowserScanAsCanonicalScan(input: {
  browserScanId: string;
  durationMs: number;
  summary: Record<string, unknown>;
  user: AuthenticatedAppUser | null;
}) {
  const session = await getBrowserScanSessionById({ browserScanId: input.browserScanId });
  if (!session) {
    throw new Error("Browser scan session not found.");
  }
  if (session.canonical_scan_id) {
    return {
      canonicalScanId: session.canonical_scan_id,
      observedSignalPackage: null
    };
  }

  const [events, artifacts] = await Promise.all([
    query<BrowserScanEventRow>(
      `select event_type, observed_at_ms, event_json
         from browser_scan_events
        where browser_scan_id = $1
        order by observed_at_ms asc, created_at asc`,
      [input.browserScanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<BrowserScanArtifactRow>(
      `select artifact_type, content_type, artifact_json
         from browser_scan_artifacts
        where browser_scan_id = $1
        order by created_at asc`,
      [input.browserScanId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  const resolved = await resolveBrowserScanDomain({
    normalizedUrl: session.target_url,
    targetHostname: session.target_hostname,
    user: input.user
  });
  const evidence = summarizeBrowserEvidence({
    artifacts,
    events,
    targetHostname: session.target_hostname
  });
  const observedSignalPackage = buildBrowserObservedSignalPackageFromEvidence({ evidence });
  const completedAt = new Date().toISOString();

  const scan = await queryOne<{ id: string }>(
    `insert into scans (
       organization_id, domain_id, submitted_by_user_id, scan_type, status,
       pages_requested, pages_scanned, started_at, completed_at, duration_ms,
       scan_config_json, queue_origin
     )
     values ($1, $2, $3, 'browser_extension', 'completed', 1, 1,
       coalesce($4::timestamptz, timezone('utc', now())), $5::timestamptz, $6, $7::jsonb, 'browser_extension')
     returning id`,
    [
      resolved.organizationId,
      resolved.domain.id,
      resolved.submittedByUserId,
      session.scan_started_at ?? null,
      completedAt,
      input.durationMs,
      JSON.stringify({
        browserScanId: input.browserScanId,
        captureMode: BROWSER_SCAN_CAPTURE_MODE,
        hostname: session.target_hostname,
        normalizedUrl: session.target_url,
        processor: "browser-extension-bx01",
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      })
    ]
  );

  if (!scan) {
    throw new Error("Could not create canonical browser-extension scan.");
  }

  await query(
    `insert into scan_snapshots (
       scan_id, organization_id, domain_id, pages_requested, pages_scanned,
       total_signals, privacy_signal_count, tracker_vendor_count,
       cookie_banner_present, accept_all_present, reject_all_present, granular_preferences_present,
       domain, registered_domain, scan_timestamp, crawl_source, crawl_tier,
       homepage_fetch_status, final_url, final_url_scheme, render_mode_used,
       scan_confidence, partial_scan, timeout_flag, blocked_flag, captcha_flag,
       preconsent_tracking_detected, tracking_before_consent_detected,
       third_party_cookie_set_before_consent, cookie_count_total, third_party_cookie_count,
       tracker_count_total, analytics_tracker_count, advertising_tracker_count,
       session_replay_tracker_count, tag_manager_present, third_party_script_domain_count,
       tracker_regulatory_risk_score, consent_maturity_score, privacy_score, certscore_overall
     )
     values (
       $1, $2, $3, 1, 1,
       0, 0, 0,
       false, false, false, false,
       $4, $4, $5::timestamptz, 'browser_extension', 'single_page_user_browser',
       'success', $6, $7, 'browser_extension',
       0.72, false, false, false, false,
       false, false,
       false, 0, 0,
       0, 0, 0,
       0, false, 0,
       0, 0, 0, 0
     )
     on conflict (scan_id) do update
       set total_signals = excluded.total_signals,
           privacy_signal_count = excluded.privacy_signal_count,
           tracker_vendor_count = excluded.tracker_vendor_count,
           cookie_banner_present = excluded.cookie_banner_present,
           accept_all_present = excluded.accept_all_present,
           reject_all_present = excluded.reject_all_present,
           granular_preferences_present = excluded.granular_preferences_present,
           scan_timestamp = excluded.scan_timestamp,
           homepage_fetch_status = excluded.homepage_fetch_status,
           final_url = excluded.final_url,
           final_url_scheme = excluded.final_url_scheme,
           render_mode_used = excluded.render_mode_used,
           preconsent_tracking_detected = excluded.preconsent_tracking_detected,
           tracking_before_consent_detected = excluded.tracking_before_consent_detected,
           third_party_cookie_set_before_consent = excluded.third_party_cookie_set_before_consent,
           cookie_count_total = excluded.cookie_count_total,
           third_party_cookie_count = excluded.third_party_cookie_count,
           tracker_count_total = excluded.tracker_count_total,
           analytics_tracker_count = excluded.analytics_tracker_count,
           tag_manager_present = excluded.tag_manager_present,
           third_party_script_domain_count = excluded.third_party_script_domain_count,
           tracker_regulatory_risk_score = excluded.tracker_regulatory_risk_score,
           consent_maturity_score = excluded.consent_maturity_score,
           privacy_score = excluded.privacy_score,
           certscore_overall = excluded.certscore_overall`,
    [
      scan.id,
      resolved.organizationId,
      resolved.domain.id,
      session.target_hostname,
      completedAt,
      session.target_url,
      new URL(session.target_url).protocol.replace(":", "")
    ]
  );

  await query(
     `insert into scan_runtime_artifacts (
       scan_id, organization_id, domain_id, third_party_request_domains, third_party_request_count,
       initial_cookie_names, initial_cookie_domains, initial_cookie_count,
       consent_preconsent_violation_count, consent_baseline_tracker_evidence_urls,
       consent_baseline_tracker_vendor_names,
       sanitized_network_evidence, cookie_attribute_summary, hybrid_runtime_evidence
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb)
     on conflict (scan_id) do update
       set third_party_request_domains = excluded.third_party_request_domains,
           third_party_request_count = excluded.third_party_request_count,
           initial_cookie_names = excluded.initial_cookie_names,
           initial_cookie_domains = excluded.initial_cookie_domains,
           initial_cookie_count = excluded.initial_cookie_count,
           consent_preconsent_violation_count = excluded.consent_preconsent_violation_count,
           consent_baseline_tracker_evidence_urls = excluded.consent_baseline_tracker_evidence_urls,
           consent_baseline_tracker_vendor_names = excluded.consent_baseline_tracker_vendor_names,
           sanitized_network_evidence = excluded.sanitized_network_evidence,
           cookie_attribute_summary = excluded.cookie_attribute_summary,
           hybrid_runtime_evidence = excluded.hybrid_runtime_evidence`,
    [
      scan.id,
      resolved.organizationId,
      resolved.domain.id,
      [],
      0,
      [],
      [],
      0,
      0,
      [],
      [],
      JSON.stringify({
        browserExtensionDerived: true,
        capturedRequestBodies: false,
        eventCount: evidence.networkEvidence.length,
        reportDriving: false,
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE
      }),
      JSON.stringify({
        browserExtensionDerived: true,
        cookieEventCount: evidence.cookies.length,
        reportDriving: false,
        valueCaptured: false
      }),
      JSON.stringify({
        browserExtension: {
          artifactCounts: {
            screenshots: evidence.screenshotArtifactCount
          },
          browserScanId: input.browserScanId,
          captureMode: BROWSER_SCAN_CAPTURE_MODE,
          consentSummary: evidence.consentSummary,
          evidenceNotice:
            "Browser-extension-derived evidence from a reviewer-controlled Chrome session. WC01 stores this raw evidence with provenance only; report findings require WS01-observed signals routed through normalized concerns, concern policy, and unified findings.",
          observedSignalPackageStatus: "not_provided",
          rawEvidenceSummary: {
            bannerObserved: evidence.bannerObserved,
            cookieDomains: evidence.cookieDomains,
            cookieEventCount: evidence.cookies.length,
            cookieNames: evidence.cookieNames,
            networkEvents: evidence.networkEvidence,
            thirdPartyRequestCount: evidence.thirdPartyRequestCount,
            thirdPartyRequestDomains: evidence.thirdPartyRequestDomains,
            timelineMarkers: evidence.timelineMarkers
          },
          reportDriving: false,
          sourceId: BROWSER_SCAN_SOURCE_ID,
          sourceType: BROWSER_SCAN_SOURCE_TYPE,
          summary: input.summary
        }
      })
    ]
  );

  await query(
    `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     values ($1, $2, $3, 'browser_extension.evidence_materialized', $4, $5::jsonb)`,
    [
      scan.id,
      resolved.domain.id,
      resolved.organizationId,
      "BX01 browser-extension evidence was materialized into canonical scan runtime artifacts.",
      JSON.stringify({
        browserScanId: input.browserScanId,
        captureMode: BROWSER_SCAN_CAPTURE_MODE,
        cookieEventCount: evidence.cookies.length,
        networkRequestCount: evidence.networkEvidence.length,
        sourceId: BROWSER_SCAN_SOURCE_ID,
        sourceType: BROWSER_SCAN_SOURCE_TYPE,
        thirdPartyRequestCount: evidence.thirdPartyRequestCount
      })
    ]
  );

  await query(
    `update domains
        set latest_scan_id = $2,
            last_scanned_at = $3::timestamptz
      where id = $1`,
    [resolved.domain.id, scan.id, completedAt]
  );

  return {
    canonicalScanId: scan.id,
    observedSignalPackage
  };
}
