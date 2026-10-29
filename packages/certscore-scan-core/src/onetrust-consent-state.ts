import { createHash } from "node:crypto";
import { oneTrustGroupEvidenceSchema, oneTrustApplicabilityInputsSchema, oneTrustLegacyApplicabilityInputsSchema, oneTrustEffectiveGroups, oneTrustApplicabilityInputsSupported, oneTrustApplicabilityReason, ONETRUST_ACTIVE_CATEGORY_POLICY, oneTrustInventoryOnlySource, ONETRUST_IKEA_APPLICABILITY, ONETRUST_EFFECTIVE_CATEGORY_POLICY, type OneTrustApplicabilityEvidence, type ConsentConfirmationReason } from "@certscore/contracts";
import type { BrowserContext, Frame, Page } from "playwright";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";
import type { SemanticState } from "./consent-action-semantic-state.js";

import { readOneTrustSdkSource, readOneTrustSdkSourceDiagnostic } from "./onetrust-sdk-source.js";

type Group = { id: string; alwaysActive: boolean };
export type OneTrustBaseline = ({
  status: "invalid";
  reason?: "configuration_unverifiable" | "cookie_missing_or_ambiguous" |
    "cookie_groups_malformed" | "cookie_groups_unconfigured";
  diagnosticReason?: ConsentConfirmationReason;
} | {
  status: "verified"; identityHash: string; valueHash: string;
  coverage: "complete" | "partial";
  groupIds: string[]; configurationHash: string;
  applicability?: OneTrustApplicabilityEvidence;
}) & { diagnosticReasons?: ConsentConfirmationReason[] };

type Configuration = { groups: Group[]; configurationHash: string; applicability?: OneTrustApplicabilityEvidence };
async function readConfiguration(scope: Page | Frame, diagnostic?: (reason: ConsentConfirmationReason) => void): Promise<Configuration | "invalid" | undefined> {
  let readFailed = false;
  const source = readOneTrustSdkSource(scope);
  const readAt = Date.now();
  if (!source) { const reason = readOneTrustSdkSourceDiagnostic(scope); if (reason) diagnostic?.(reason); }
  const raw = await scope.evaluate(({sdkUrl,inventoryOnly}) => {
    const api = (window as unknown as { OneTrust?: { GetDomainData?: () => {Groups?:unknown; IsIABEnabled?:unknown; VendorLevelOptOut?:unknown; UseGoogleVendors?:unknown} } }).OneTrust;
    if (typeof api?.GetDomainData !== "function") return undefined;
    const data = api.GetDomainData(); // One existing read; no additional SDK call.
    const groups = data?.Groups;
    if (!Array.isArray(groups) || !groups.length || groups.length > 64) return "invalid";
    const declared = groups.map((group) => ({ id: group?.CustomGroupId, status: group?.Status }));
    if (!sdkUrl) return declared;
    // Unknown script/config shapes keep the strict declared universe.
    const scripts = document.scripts;
    if (scripts.length > 256) return {declared, fallback: "script_inventory_limit" as const};
    const sources = Array.from(scripts).filter(script => /\/otBannerSdk\.js(?:[?#]|$)/.test(script.src));
    if (sources.length === 0) return {declared, fallback: "script_element_missing" as const};
    if (sources.length > 8) return {declared, fallback: "script_multiple_elements" as const};
    if (sources.some(script=>script.src !== sdkUrl)) return {declared, fallback: "script_url_mismatch" as const};
    return { declared, matchingElements:sources.length, inputs: {
      isIabEnabled: data.IsIABEnabled, vendorLevelOptOut: data.VendorLevelOptOut, useGoogleVendors: data.UseGoogleVendors,
      groups: groups.map(group => ({id:group?.CustomGroupId,status:group?.Status,type:group?.Type,
        root:(group?.Parent == null || group.Parent === "") &&
          (group?.SubGroups == null || (Array.isArray(group.SubGroups) && group.SubGroups.length === 0)),
        named:typeof group?.GroupName === "string" && group.GroupName.trim().length > 0,
        isIabPurpose:group?.IsIabPurpose,showInPopup:group?.ShowInPopup,alwaysShowCategory:inventoryOnly && typeof group?.AlwaysShowCategory !== "boolean" ? null : group?.AlwaysShowCategory,
        firstPartyCookies:Array.isArray(group?.FirstPartyCookies) && group.FirstPartyCookies.length <= 10000 ? group.FirstPartyCookies.length : -1,
        hosts:Array.isArray(group?.Hosts) && group.Hosts.length <= 10000 ? group.Hosts.length : -1,
        generalVendors:Array.isArray(group?.GeneralVendorsIds) && group.GeneralVendorsIds.length <= 10000 ? group.GeneralVendorsIds.length : group?.GeneralVendorsIds == null ? 0 : -1,
        vendorServices:Array.isArray(group?.VendorServices) && group.VendorServices.length <= 10000 ? group.VendorServices.length : group?.VendorServices == null ? 0 : -1})),
    }};
  }, {sdkUrl:source?.sdkUrl,inventoryOnly:source ? oneTrustInventoryOnlySource(source) : false}).catch(() => { readFailed = true; return "invalid" as const; });
  if (raw === undefined) { diagnostic?.("configuration_missing"); return raw; }
  if (raw === "invalid") { diagnostic?.(readFailed ? "configuration_unverifiable" : "configuration_malformed"); return raw; }
  if (!Array.isArray(raw) && "fallback" in raw && raw.fallback) diagnostic?.(raw.fallback);
  const declared = Array.isArray(raw) ? raw : raw.declared;
  if (declared.some((group) => typeof group.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(group.id) ||
    !["always active", "active", "inactive"].includes(group.status)) || new Set(declared.map((group) => group.id)).size !== declared.length) { diagnostic?.("configuration_malformed"); return "invalid"; }
  const groups = declared.map((group) => ({ id: group.id as string, alwaysActive: group.status === "always active" }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (source && source === readOneTrustSdkSource(scope) && !Array.isArray(raw) && "inputs" in raw) {
    const reason = oneTrustApplicabilityReason(raw.inputs,source);
    diagnostic?.(reason);
    const parsed = oneTrustLegacyApplicabilityInputsSchema.safeParse(raw.inputs);
    if (parsed.success && reason === "category_applicability_verified" && parsed.data.groups.length === declared.length &&
      parsed.data.groups.every(g => declared.some(d => d.id === g.id && d.status === g.status))) {
      parsed.data.groups.sort((a,b) => a.id.localeCompare(b.id));
      const matchingElements = raw.matchingElements;
      const scriptBinding = typeof matchingElements === "number" && matchingElements > 1 ? {policyVersion:"onetrust_script_binding.v2-identical-elements" as const,matchingElements} : undefined;
      const configurationHash = hash(JSON.stringify({source,inputs:parsed.data,...(scriptBinding?{scriptBinding}:{})}));
      const effective = oneTrustEffectiveGroups(parsed.data.groups,source).map(g => ({id:g.id,alwaysActive:g.status === "always active"}));
      const hasHiddenRequired = parsed.data.groups.some(g=>g.status === "always active" && !g.showInPopup);
      return {groups:effective,configurationHash,applicability:{policyVersion:hasHiddenRequired || scriptBinding ? ONETRUST_ACTIVE_CATEGORY_POLICY :source.sdkUrl === ONETRUST_IKEA_APPLICABILITY.sdkUrl && source.documentSha256 === ONETRUST_IKEA_APPLICABILITY.documentSha256 ? ONETRUST_IKEA_APPLICABILITY.policyVersion : ONETRUST_EFFECTIVE_CATEGORY_POLICY,
        source,...(scriptBinding?{scriptBinding}:{}),inputs:parsed.data,configurationSha256:configurationHash,baselineReadAtEpochMs:readAt,confirmationReadAtEpochMs:readAt}};
    }
  }
  return {groups,configurationHash:hash(JSON.stringify(groups))};
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

async function readCookie(context: BrowserContext, scope: Page | Frame, diagnostic?: (reason: ConsentConfirmationReason) => void) {
  const cookies = (await context.cookies(scope.url())).filter((cookie) => matchesCanonicalCmpCookieName(cookie.name, "OptanonConsent"));
  if (cookies.length !== 1) { diagnostic?.(cookies.length ? "receipt_ambiguous" : "receipt_missing"); return undefined; }
  const cookie = cookies[0]!;
  return { ...cookie, identityHash: oneTrustCookieIdentityHash(cookie) };
}

/** Keep baseline, candidate and independent readback bound to one exact cookie. */
export function oneTrustCookieIdentityHash(cookie: { name: string; domain: string; path: string; partitionKey?: string }): string {
  return hash(JSON.stringify([cookie.name, cookie.domain, cookie.path, cookie.partitionKey ?? ""]));
}

export async function captureOneTrustBaseline(context: BrowserContext, scope: Page | Frame): Promise<OneTrustBaseline | undefined> {
  let diagnosticReason: ConsentConfirmationReason | undefined;
  const diagnosticReasons: ConsentConfirmationReason[] = [];
  const configuration = await readConfiguration(scope, reason => { diagnosticReason = reason; if (!diagnosticReasons.includes(reason) && diagnosticReasons.length < 12) diagnosticReasons.push(reason); });
  // New actions require a known pre-click category universe. An unavailable
  // API cannot authorize legacy subset decoding; historical packet decoding
  // remains independent and unchanged.
  if (!configuration || configuration === "invalid") return { status: "invalid", reason: "configuration_unverifiable", diagnosticReason, diagnosticReasons };
  const cookie = await readCookie(context, scope, reason => { diagnosticReason = reason; });
  if (configuration.applicability && configuration.applicability.source !== readOneTrustSdkSource(scope)) {
    return {status:"invalid",reason:"configuration_unverifiable",diagnosticReason:"configuration_changed"};
  }
  const groups = cookie ? parseOneTrustCookieGroups(cookie.value) : undefined;
  if (!cookie) return { status: "invalid", reason: "cookie_missing_or_ambiguous", diagnosticReason };
  if (!groups) return { status: "invalid", reason: "cookie_groups_malformed", diagnosticReason: "receipt_malformed" };
  if ([...groups.keys()].some((id) => !configuration.groups.some((group) => group.id === id))) {
    return { status: "invalid", reason: "cookie_groups_unconfigured", diagnosticReason: "receipt_groups_unconfigured" };
  }
  return { status: "verified", diagnosticReasons, identityHash: cookie.identityHash, valueHash: hash(cookie.value),
    coverage: groups.size === configuration.groups.length ? "complete" : "partial",
    groupIds: [...groups.keys()].sort(), configurationHash: configuration.configurationHash,
    ...(configuration.applicability ? {applicability:configuration.applicability} : {}) };
}

export async function verifyOneTrustCookieDecision(context: BrowserContext, scope: Page | Frame,
  baseline: OneTrustBaseline, diagnostic?: (reason: ConsentConfirmationReason) => void): Promise<SemanticState | undefined> {
  for (const reason of baseline.diagnosticReasons ?? []) diagnostic?.(reason);
  if (baseline.status !== "verified") {
    diagnostic?.(baseline.diagnosticReason ?? (baseline.reason === "cookie_groups_malformed" ? "receipt_malformed" :
      baseline.reason === "cookie_groups_unconfigured" ? "receipt_groups_unconfigured" :
      baseline.reason === "cookie_missing_or_ambiguous" ? "baseline_receipt_unverified" : "configuration_unverifiable"));
    return undefined;
  }
  const configuration = await readConfiguration(scope, diagnostic);
  if (!configuration || configuration === "invalid") return undefined;
  if (configuration.configurationHash !== baseline.configurationHash) { diagnostic?.("configuration_changed"); return undefined; }
  const cookie = await readCookie(context, scope, diagnostic);
  if (configuration.applicability && configuration.applicability.source !== readOneTrustSdkSource(scope)) {
    diagnostic?.("configuration_changed"); return undefined;
  }
  const current = cookie ? parseOneTrustCookieGroups(cookie.value) : undefined;
  if (!cookie) return undefined;
  if (cookie.identityHash !== baseline.identityHash) { diagnostic?.("receipt_identity_changed"); return undefined; }
  if (!current) { diagnostic?.("receipt_malformed"); return undefined; }
  if ([...current.keys()].some(id => !configuration.groups.some(group => group.id === id))) { diagnostic?.("receipt_groups_unconfigured"); return undefined; }
  if (current.size !== configuration.groups.length) { diagnostic?.("group_universe_incomplete"); return undefined; }
  if (hash(cookie.value) === baseline.valueHash) { diagnostic?.("no_fresh_decision"); return undefined; }
  const groups = [...current].map(([id, consent]) => ({ id, consent, alwaysActive: configuration.groups.find((group) => group.id === id)?.alwaysActive }));
  const proof = oneTrustGroupEvidenceSchema.safeParse({
    // V1 keeps its complete-baseline contract. V2 permits only a known subset
    // before the click. V3 derives its universe only from pinned same-session
    // SDK inputs; the fresh receipt must cover every effective group.
    policyVersion: baseline.applicability ? baseline.applicability.policyVersion === ONETRUST_IKEA_APPLICABILITY.policyVersion ? "onetrust_cookie_groups.v3-sdk-applicability" : baseline.applicability.policyVersion === ONETRUST_ACTIVE_CATEGORY_POLICY ? "onetrust_cookie_groups.v5-active-scope" : "onetrust_cookie_groups.v4-effective-categories" : baseline.coverage === "partial" ? "onetrust_cookie_groups.v2" : "onetrust_cookie_groups.v1", cookieIdentitySha256: cookie.identityHash,
    beforeValueSha256: baseline.valueHash, afterValueSha256: hash(cookie.value),
    configurationSha256: baseline.configurationHash, baselineGroupIds: baseline.groupIds, configuredGroupIds: configuration.groups.map((group) => group.id), groups,
    ...(baseline.applicability && configuration.applicability ? {applicability:{...baseline.applicability,
      confirmationReadAtEpochMs:configuration.applicability.confirmationReadAtEpochMs}} : {}),
  });
  if (!proof.success) { diagnostic?.("category_proof_invalid"); diagnostic?.("configuration_or_groups_unverified"); return undefined; }
  const optional = proof.data.groups.filter((group) => !group.alwaysActive);
  const decision = optional.every((group) => group.consent) ? "granted"
    : optional.every((group) => !group.consent) ? "denied" : "mixed";
  return { key: cookie.name, stateHash: hash(cookie.value), decision, oneTrustGroupEvidence: proof.data };
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

/** Internal diagnostic only. Never substitutes for a complete semantic receipt. */
export function oneTrustBaselineLimitation(baseline: OneTrustBaseline | undefined): string | undefined {
  return baseline?.status === "invalid" && baseline.reason ? `onetrust_confirmation_baseline:${baseline.reason}` : undefined;
}
