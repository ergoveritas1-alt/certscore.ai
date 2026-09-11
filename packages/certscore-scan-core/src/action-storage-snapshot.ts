/**
 * Normalize browser storage APIs at the observer boundary. Browser/driver
 * output is untrusted runtime data: malformed entries are omitted and the
 * caller records the resulting coverage limitation. Empty names and values
 * are valid observations and are deliberately preserved byte-for-byte.
 */

export type NormalizedActionCookie = {
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
