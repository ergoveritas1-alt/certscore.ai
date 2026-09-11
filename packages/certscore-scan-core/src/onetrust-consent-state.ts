import { createHash } from "node:crypto";
import { oneTrustGroupEvidenceSchema } from "@certscore/contracts";
import type { BrowserContext, Frame, Page } from "playwright";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import type { SemanticState } from "./consent-action-semantic-state.js";

type Group = { id: string; alwaysActive: boolean };
export type OneTrustBaseline = { status: "invalid" } | {
  status: "verified"; identityHash: string; valueHash: string;
  groupIds: string[]; configurationHash: string;
};

async function readConfiguration(scope: Page | Frame): Promise<Group[] | "invalid" | undefined> {
  const raw = await scope.evaluate(() => {
    const api = (window as unknown as { OneTrust?: { GetDomainData?: () => { Groups?: unknown } } }).OneTrust;
    if (typeof api?.GetDomainData !== "function") return undefined;
    const groups = api.GetDomainData()?.Groups;
    if (!Array.isArray(groups) || !groups.length || groups.length > 64) return "invalid";
    return groups.map((group) => ({ id: group?.CustomGroupId, status: group?.Status }));
  }).catch(() => "invalid" as const);
  if (raw === undefined || raw === "invalid") return raw;
  if (raw.some((group) => typeof group.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(group.id) ||
    !["always active", "active", "inactive"].includes(group.status)) || new Set(raw.map((group) => group.id)).size !== raw.length) return "invalid";
  return raw.map((group) => ({ id: group.id as string, alwaysActive: group.status === "always active" }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Read only the versioned OneTrust groups field, never arbitrary receipt data. */
export function parseOneTrustCookieGroups(value: string): Map<string, boolean> | undefined {
  if (value.length > 4096) return undefined;
  const fields = new URLSearchParams(value).getAll("groups");
  if (fields.length !== 1) return undefined;
  const entries = fields[0]!.split(",");
  if (!entries.length || entries.length > 64) return undefined;
  const groups = new Map<string, boolean>();
  for (const entry of entries) {
    const match = /^([a-zA-Z0-9_-]{1,64}):([01])$/.exec(entry);
    if (!match || groups.has(match[1]!)) return undefined;
    groups.set(match[1]!, match[2] === "1");
  }
  return groups;
}

async function readCookie(context: BrowserContext, scope: Page | Frame) {
  const cookies = (await context.cookies(scope.url())).filter((cookie) => matchesCanonicalCmpCookieName(cookie.name, "OptanonConsent"));
  if (cookies.length !== 1) return undefined;
  const cookie = cookies[0]!;
  return { ...cookie, identityHash: hash(JSON.stringify([cookie.name, cookie.domain, cookie.path, cookie.partitionKey ?? ""])) };
}

export async function captureOneTrustBaseline(context: BrowserContext, scope: Page | Frame): Promise<OneTrustBaseline | undefined> {
  const configuration = await readConfiguration(scope);
  // Preserve legacy registry decoding where no domain-data API exists. If an
  // API is present but unverifiable, it must not fall back to guessed categories.
  if (configuration === undefined) return undefined;
  if (configuration === "invalid") return { status: "invalid" };
  const cookie = await readCookie(context, scope);
  const groups = cookie ? parseOneTrustCookieGroups(cookie.value) : undefined;
  if (!cookie || !groups || groups.size !== configuration.length || [...groups.keys()].some((id) => !configuration.some((group) => group.id === id))) return { status: "invalid" };
  return { status: "verified", identityHash: cookie.identityHash, valueHash: hash(cookie.value),
    groupIds: [...groups.keys()].sort(), configurationHash: hash(JSON.stringify(configuration)) };
}

export async function verifyOneTrustCookieDecision(context: BrowserContext, scope: Page | Frame,
  baseline: OneTrustBaseline): Promise<SemanticState | undefined> {
  if (baseline.status !== "verified") return undefined;
  const configuration = await readConfiguration(scope);
  if (!Array.isArray(configuration) || hash(JSON.stringify(configuration)) !== baseline.configurationHash) return undefined;
  const cookie = await readCookie(context, scope);
  const current = cookie ? parseOneTrustCookieGroups(cookie.value) : undefined;
  if (!cookie || cookie.identityHash !== baseline.identityHash || !current) return undefined;
  const groups = [...current].map(([id, consent]) => ({ id, consent, alwaysActive: configuration.find((group) => group.id === id)?.alwaysActive }));
  const proof = oneTrustGroupEvidenceSchema.safeParse({
    policyVersion: "onetrust_cookie_groups.v1", cookieIdentitySha256: cookie.identityHash,
    beforeValueSha256: baseline.valueHash, afterValueSha256: hash(cookie.value),
    configurationSha256: baseline.configurationHash, baselineGroupIds: baseline.groupIds, configuredGroupIds: configuration.map((group) => group.id), groups,
  });
  if (!proof.success) return undefined;
  const optional = proof.data.groups.filter((group) => !group.alwaysActive);
  const decision = optional.every((group) => group.consent) ? "granted"
    : optional.every((group) => !group.consent) ? "denied" : "mixed";
  return { key: cookie.name, stateHash: hash(cookie.value), decision, oneTrustGroupEvidence: proof.data };
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
