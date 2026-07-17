import { createHash } from "node:crypto";

export const CALIBRATION_LEDGER_VERSION = "certscore.scan_quality_calibration_ledger.1" as const;

export type CalibrationEligibilityState = "eligible" | "cooldown" | "blocked" | "do_not_calibrate";

export type CalibrationLedgerEntry = {
  consecutiveNoGoCount: number;
  cooldownUntil?: string;
  lastContactAt?: string;
  lastContactSource?: string;
  lastNoGoReasons: string[];
  lastOutcome?: string;
  note?: string;
  state: CalibrationEligibilityState;
  url: string;
};

export type CalibrationLedger = {
  entries: Record<string, CalibrationLedgerEntry>;
  ledgerVersion: typeof CALIBRATION_LEDGER_VERSION;
  updatedAt: string | null;
};

export type CalibrationTarget = {
  lanes: string[];
  role: string;
  url: string;
};

export type CalibrationSelection = {
  excluded: Array<{ reason: string; url: string }>;
  generatedAt: string;
  minimumCooldownDays: number;
  rotationKey: string;
  selected: CalibrationTarget[];
};

export type CentralCalibrationLedgerRecord = {
  consecutiveNoGoCount: number;
  cooldownUntil: string;
  effectiveState: CalibrationEligibilityState;
  lastContactAt: string;
  lastNoGoReasons: string[];
  lastOutcome: string;
  lastSource: string;
  manualNote?: string;
  normalizedDomain: string;
};

export type CohortSummaryForLedger = {
  generatedAt?: string;
  results?: Array<{
    completedAt?: string;
    runtime?: { noGoCandidate?: boolean; noGoReasons?: string[] };
    startedAt?: string;
    status?: "completed" | "failed" | "skipped";
    url?: string;
  }>;
};

export function createEmptyCalibrationLedger(): CalibrationLedger {
  return {
    entries: {},
    ledgerVersion: CALIBRATION_LEDGER_VERSION,
    updatedAt: null,
  };
}

export function mergeCentralContactLedger(input: {
  centralRecords: CentralCalibrationLedgerRecord[];
  ledger: CalibrationLedger;
  now: Date;
  targets: CalibrationTarget[];
}): CalibrationLedger {
  const centralByDomain = new Map(input.centralRecords.map((record) => [record.normalizedDomain, record]));
  const entries: Record<string, CalibrationLedgerEntry> = { ...input.ledger.entries };
  for (const target of input.targets) {
    const record = centralByDomain.get(normalizedDomain(target.url));
    if (!record) continue;
    const existing = input.ledger.entries[target.url];
    const centralIsLater = isLater(existing?.lastContactAt, record.lastContactAt);
    entries[target.url] = {
      consecutiveNoGoCount: Math.max(existing?.consecutiveNoGoCount ?? 0, record.consecutiveNoGoCount),
      cooldownUntil: laterTimestamp(existing?.cooldownUntil, record.cooldownUntil),
      lastContactAt: laterTimestamp(existing?.lastContactAt, record.lastContactAt),
      lastContactSource: centralIsLater ? record.lastSource : existing?.lastContactSource ?? record.lastSource,
      lastNoGoReasons: centralIsLater ? record.lastNoGoReasons : existing?.lastNoGoReasons ?? [],
      lastOutcome: centralIsLater ? record.lastOutcome : existing?.lastOutcome ?? record.lastOutcome,
      note: [existing?.note, record.manualNote].filter(Boolean).join(" | ") || undefined,
      state: stricterState(existing?.state, record.effectiveState),
      url: target.url,
    };
  }
  return {
    entries,
    ledgerVersion: CALIBRATION_LEDGER_VERSION,
    updatedAt: input.now.toISOString(),
  };
}

export function validateCalibrationLedger(ledger: CalibrationLedger, targetUrls: Set<string>): string[] {
  const errors: string[] = [];
  if (ledger.ledgerVersion !== CALIBRATION_LEDGER_VERSION) {
    errors.push(`Unsupported eligibility ledger version: ${ledger.ledgerVersion}`);
  }
  if (!ledger.entries || typeof ledger.entries !== "object" || Array.isArray(ledger.entries)) {
    errors.push("Eligibility ledger entries must be an object keyed by target URL");
    return errors;
  }

  for (const [key, entry] of Object.entries(ledger.entries)) {
    if (key !== entry.url) errors.push(`Eligibility ledger key/url mismatch for ${key}`);
    if (!targetUrls.has(entry.url)) errors.push(`Eligibility ledger contains unknown target: ${entry.url}`);
    if (!(["eligible", "cooldown", "blocked", "do_not_calibrate"] as string[]).includes(entry.state)) {
      errors.push(`Eligibility ledger contains invalid state for ${entry.url}: ${entry.state}`);
    }
    if (!Number.isInteger(entry.consecutiveNoGoCount) || entry.consecutiveNoGoCount < 0) {
      errors.push(`Eligibility ledger contains invalid no-go count for ${entry.url}`);
    }
    if (!Array.isArray(entry.lastNoGoReasons)) {
      errors.push(`Eligibility ledger contains invalid no-go reasons for ${entry.url}`);
    }
    for (const [label, value] of [
      ["lastContactAt", entry.lastContactAt],
      ["cooldownUntil", entry.cooldownUntil],
    ] as const) {
      if (value && !Number.isFinite(Date.parse(value))) {
        errors.push(`Eligibility ledger contains invalid ${label} for ${entry.url}`);
      }
    }
  }
  return errors;
}

export function selectCalibrationTargets(input: {
  ledger: CalibrationLedger;
  limit: number;
  minimumCooldownDays: number;
  now: Date;
  rotationKey: string;
  targets: CalibrationTarget[];
}): CalibrationSelection {
  const excluded: CalibrationSelection["excluded"] = [];
  const eligible = input.targets.filter((target) => {
    const entry = input.ledger.entries[target.url];
    if (!entry) return true;
    if (entry.state === "blocked" || entry.state === "do_not_calibrate") {
      excluded.push({ reason: entry.state, url: target.url });
      return false;
    }
    if (entry.cooldownUntil && Date.parse(entry.cooldownUntil) > input.now.getTime()) {
      excluded.push({ reason: `cooldown_until:${entry.cooldownUntil}`, url: target.url });
      return false;
    }
    if (entry.lastContactAt) {
      const nextEligibleAt = Date.parse(entry.lastContactAt) + input.minimumCooldownDays * 86_400_000;
      if (nextEligibleAt > input.now.getTime()) {
        excluded.push({ reason: `cooldown_until:${new Date(nextEligibleAt).toISOString()}`, url: target.url });
        return false;
      }
    }
    return true;
  });

  const ranked = eligible.toSorted((left, right) => {
    const scoreDifference = stableScore(input.rotationKey, left.url).localeCompare(stableScore(input.rotationKey, right.url));
    return scoreDifference || left.url.localeCompare(right.url);
  });
  const selected: CalibrationTarget[] = [];
  const selectedUrls = new Set<string>();
  const selectedRoleFamilies = new Set<string>();

  for (const target of ranked) {
    const family = roleFamily(target.role);
    if (selectedRoleFamilies.has(family)) continue;
    selected.push(target);
    selectedUrls.add(target.url);
    selectedRoleFamilies.add(family);
    if (selected.length === input.limit) break;
  }
  for (const target of ranked) {
    if (selected.length === input.limit) break;
    if (selectedUrls.has(target.url)) continue;
    selected.push(target);
    selectedUrls.add(target.url);
  }

  if (selected.length < input.limit) {
    throw new Error(`Only ${selected.length} targets are eligible; ${input.limit} required`);
  }

  return {
    excluded,
    generatedAt: input.now.toISOString(),
    minimumCooldownDays: input.minimumCooldownDays,
    rotationKey: input.rotationKey,
    selected,
  };
}

export function recordCalibrationOutcomes(input: {
  ledger: CalibrationLedger;
  minimumCooldownDays: number;
  now: Date;
  summary: CohortSummaryForLedger;
  targetUrls: Set<string>;
}): CalibrationLedger {
  const entries = { ...input.ledger.entries };
  for (const result of input.summary.results ?? []) {
    if (!result.url || result.status === "skipped") continue;
    if (!input.targetUrls.has(result.url)) {
      throw new Error(`Cohort summary contains a URL outside the calibration inventory: ${result.url}`);
    }
    const previous = entries[result.url];
    const noGo = result.runtime?.noGoCandidate === true;
    const consecutiveNoGoCount = noGo ? (previous?.consecutiveNoGoCount ?? 0) + 1 : 0;
    const contactAt = firstValidTimestamp(result.completedAt, result.startedAt, input.summary.generatedAt) ?? input.now.toISOString();
    const cooldownUntil = new Date(Date.parse(contactAt) + input.minimumCooldownDays * 86_400_000).toISOString();
    entries[result.url] = {
      consecutiveNoGoCount,
      cooldownUntil,
      lastContactAt: contactAt,
      lastContactSource: "calibration",
      lastNoGoReasons: noGo ? result.runtime?.noGoReasons ?? ["summary_no_go_candidate"] : [],
      lastOutcome: noGo ? "no_go" : result.status === "completed" ? "completed" : "failed",
      note: previous?.note,
      state: noGo ? (consecutiveNoGoCount >= 2 ? "do_not_calibrate" : "blocked") : "cooldown",
      url: result.url,
    };
  }
  return {
    entries,
    ledgerVersion: CALIBRATION_LEDGER_VERSION,
    updatedAt: input.now.toISOString(),
  };
}

function stableScore(rotationKey: string, url: string) {
  return createHash("sha256").update(`${rotationKey}:${url}`).digest("hex");
}

function roleFamily(role: string) {
  return role.split("_", 1)[0] ?? role;
}

function firstValidTimestamp(...values: Array<string | undefined>) {
  return values.find((value) => value && Number.isFinite(Date.parse(value)));
}

function normalizedDomain(url: string) {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function laterTimestamp(left: string | undefined, right: string) {
  return isLater(left, right) ? right : left ?? right;
}

function isLater(left: string | undefined, right: string) {
  return !left || Date.parse(right) >= Date.parse(left);
}

function stricterState(
  left: CalibrationEligibilityState | undefined,
  right: CalibrationEligibilityState,
): CalibrationEligibilityState {
  const rank: Record<CalibrationEligibilityState, number> = {
    eligible: 0,
    cooldown: 1,
    blocked: 2,
    do_not_calibrate: 3,
  };
  return left && rank[left] > rank[right] ? left : right;
}
