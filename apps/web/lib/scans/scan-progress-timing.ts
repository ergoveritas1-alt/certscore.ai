export type ScanProgressRuntime = "hosted" | "local";

type ScanProgressTimingStore = {
  samples: Record<string, number[]>;
  version: 1;
};

const SCAN_PROGRESS_TIMING_STORAGE_KEY = "certscore.scan-progress-timing.v1";
const MAX_SAMPLES_PER_TARGET = 5;
const MIN_RECORDED_DURATION_MS = 2_000;
const MAX_RECORDED_DURATION_MS = 5 * 60_000;

function normalizeTarget(target: string) {
  const trimmed = target.trim().toLowerCase();
  if (!trimmed) return "unknown";

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "") || "unknown";
  } catch {
    return trimmed.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") || "unknown";
  }
}

function timingKey(input: { profileValue: string; runtime: ScanProgressRuntime; target: string }) {
  return `${input.runtime}:${input.profileValue}:${normalizeTarget(input.target)}`;
}

function parseStore(raw: string | null): ScanProgressTimingStore {
  if (!raw) return { samples: {}, version: 1 };

  try {
    const parsed = JSON.parse(raw) as Partial<ScanProgressTimingStore>;
    if (parsed.version !== 1 || !parsed.samples || typeof parsed.samples !== "object") {
      return { samples: {}, version: 1 };
    }
    return { samples: parsed.samples, version: 1 };
  } catch {
    return { samples: {}, version: 1 };
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
  }
  return sorted[midpoint]!;
}

export function getScanProgressRuntime(hostname?: string): ScanProgressRuntime {
  const normalizedHostname = hostname?.trim().toLowerCase();
  return normalizedHostname === "localhost" || normalizedHostname === "127.0.0.1" || normalizedHostname === "::1"
    ? "local"
    : "hosted";
}

export function readLearnedScanDuration(input: {
  profileValue: string;
  runtime: ScanProgressRuntime;
  storage: Pick<Storage, "getItem">;
  target: string;
}) {
  const store = parseStore(input.storage.getItem(SCAN_PROGRESS_TIMING_STORAGE_KEY));
  const samples = store.samples[timingKey(input)]?.filter((value) => (
    Number.isFinite(value) && value >= MIN_RECORDED_DURATION_MS && value <= MAX_RECORDED_DURATION_MS
  )) ?? [];
  return samples.length > 0 ? median(samples) : null;
}

export function recordScanDuration(input: {
  durationMs: number;
  profileValue: string;
  runtime: ScanProgressRuntime;
  storage: Pick<Storage, "getItem" | "setItem">;
  target: string;
}) {
  if (!Number.isFinite(input.durationMs) || input.durationMs < MIN_RECORDED_DURATION_MS || input.durationMs > MAX_RECORDED_DURATION_MS) {
    return;
  }

  const store = parseStore(input.storage.getItem(SCAN_PROGRESS_TIMING_STORAGE_KEY));
  const key = timingKey(input);
  const samples = store.samples[key] ?? [];
  store.samples[key] = [...samples, Math.round(input.durationMs)].slice(-MAX_SAMPLES_PER_TARGET);
  input.storage.setItem(SCAN_PROGRESS_TIMING_STORAGE_KEY, JSON.stringify(store));
}
