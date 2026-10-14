/**
 * Normalize browser storage APIs at the observer boundary. Browser/driver
 * output is untrusted runtime data: malformed entries are omitted and the
 * caller records the resulting coverage limitation. Empty names and values
 * are valid observations and are deliberately preserved byte-for-byte.
 */

export type NormalizedActionCookie = {
  expires?: number;
  name: string;
  value: string;
  domain: string;
  path: string;
  partitionKey?: string;
};

export type NormalizedActionStorageEntry = [name: string, value: string];

export type NormalizedActionStorageSnapshot = {
  cookies: NormalizedActionCookie[];
  localStorage: NormalizedActionStorageEntry[];
  sessionStorage: NormalizedActionStorageEntry[];
  droppedCookies: number;
  droppedLocalStorage: number;
  droppedSessionStorage: number;
};

export type ActionStorageChannelDiagnostic = {
  status: "empty" | "complete" | "sampled" | "partial" | "failed";
  retainedCount: number;
  droppedCount: number;
  sampleLimit: number;
};

export type ActionStorageCollectionDiagnostics = {
  policyVersion: "action_storage_collection_diagnostics.v1";
  cookies: ActionStorageChannelDiagnostic;
  localStorage: ActionStorageChannelDiagnostic;
  sessionStorage: ActionStorageChannelDiagnostic;
};

function channelDiagnostic(input: { count: number; dropped: number; available: boolean; limit: number; retainedCount?: number; sampled?: boolean; sampledDroppedCount?: number }): ActionStorageChannelDiagnostic {
  const retainedCount = Math.min(input.count, input.retainedCount ?? input.limit);
  const status = !input.available ? "failed" : input.dropped > 0 ? "partial" :
    input.count === 0 ? "empty" : input.sampled || retainedCount < input.count ? "sampled" : "complete";
  return { status, retainedCount, droppedCount: Math.min(100_000, input.dropped + Math.max(0, input.count - retainedCount) + (input.sampledDroppedCount ?? 0)), sampleLimit: input.limit };
}

export function actionStorageCollectionDiagnostics(input: {
  cookies: { count: number; dropped: number; available?: boolean; limit?: number; retainedCount?: number; sampled?: boolean; sampledDroppedCount?: number };
  localStorage: { count: number; dropped: number; available?: boolean; limit?: number; retainedCount?: number; sampled?: boolean; sampledDroppedCount?: number };
  sessionStorage: { count: number; dropped: number; available?: boolean; limit?: number; retainedCount?: number; sampled?: boolean; sampledDroppedCount?: number };
}): ActionStorageCollectionDiagnostics {
  const diagnostic = (channel: typeof input.cookies) => channelDiagnostic({
    count: channel.count, dropped: channel.dropped, available: channel.available !== false,
    limit: channel.limit ?? 96, retainedCount: channel.retainedCount, sampled: channel.sampled,
    sampledDroppedCount: channel.sampledDroppedCount,
  });
  return { policyVersion: "action_storage_collection_diagnostics.v1", cookies: diagnostic(input.cookies),
    localStorage: diagnostic(input.localStorage), sessionStorage: diagnostic(input.sessionStorage) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeEntries(value: unknown): {
  entries: NormalizedActionStorageEntry[];
  dropped: number;
} {
  if (!Array.isArray(value)) return { entries: [], dropped: 1 };
  const entries: NormalizedActionStorageEntry[] = [];
  let dropped = 0;
  for (const candidate of value) {
    if (
      !Array.isArray(candidate) ||
      candidate.length < 2 ||
      typeof candidate[0] !== "string" ||
      typeof candidate[1] !== "string"
    ) {
      dropped += 1;
      continue;
    }
    entries.push([candidate[0], candidate[1]]);
  }
  return { entries, dropped };
}

function normalizeCookies(value: unknown): {
  cookies: NormalizedActionCookie[];
  dropped: number;
} {
  if (!Array.isArray(value)) return { cookies: [], dropped: 1 };
  const cookies: NormalizedActionCookie[] = [];
  let dropped = 0;
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      dropped += 1;
      continue;
    }
    const { name, value: cookieValue, domain, path, partitionKey } = candidate;
    if (
      typeof name !== "string" ||
      typeof cookieValue !== "string" ||
      typeof domain !== "string" ||
      typeof path !== "string" ||
      (partitionKey !== undefined && partitionKey !== null && typeof partitionKey !== "string")
    ) {
      dropped += 1;
      continue;
    }
    cookies.push({
      ...(typeof candidate.expires === "number" && Number.isFinite(candidate.expires) && candidate.expires >= -1 ? { expires: candidate.expires } : {}),
      name,
      value: cookieValue,
      domain,
      path,
      ...(typeof partitionKey === "string" ? { partitionKey } : {}),
    });
  }
  return { cookies, dropped };
}

export function normalizeActionStorageSnapshot(input: {
  cookies: unknown;
  localStorage: unknown;
  sessionStorage: unknown;
}): NormalizedActionStorageSnapshot {
  const cookies = normalizeCookies(input.cookies);
  const localStorage = normalizeEntries(input.localStorage);
  const sessionStorage = normalizeEntries(input.sessionStorage);
  return {
    cookies: cookies.cookies,
    localStorage: localStorage.entries,
    sessionStorage: sessionStorage.entries,
    droppedCookies: cookies.dropped,
    droppedLocalStorage: localStorage.dropped,
    droppedSessionStorage: sessionStorage.dropped,
  };
}
