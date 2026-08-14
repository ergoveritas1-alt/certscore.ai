import sharedPolicy from "@website-signal-risk-scanner/shared";
import type {
  ApiReadRateCostClass,
  ApiReadRateProfile,
  ApiReadRateScope
} from "@website-signal-risk-scanner/shared";

const {
  API_READ_RATE_MAX_WINDOW_SECONDS,
  API_READ_RATE_POLICY,
  apiReadRateLimitGuidance,
  apiReadRateUnits
} = sharedPolicy;

const CERTSCORE_ACCOUNT_URL = "https://certscore.ai/login?mode=create_account";
const CERTSCORE_SUPPORT_EMAIL = "support@certscore.ai";

export type McpReadCall = {
  profile: ApiReadRateProfile;
  target: string;
  tool: string;
  units: number;
};

type Event = { at: number; units: number };

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function units(costClass: ApiReadRateCostClass) {
  return apiReadRateUnits(costClass);
}

function readCallFromRequest(value: unknown): McpReadCall | null {
  const request = record(value);
  if (request?.method !== "tools/call") return null;
  const params = record(request.params);
  const args = record(params?.arguments);
  const tool = stringValue(params?.name);
  if (!tool) return null;
  if (tool === "certscore_get_scan_status") {
    const scanId = stringValue(args?.scanId);
    return scanId ? { profile: "status", target: `scan:${scanId}`, tool, units: units("ordinary") } : null;
  }
  const scanId = stringValue(args?.scanId);
  if (scanId) {
    const detail = stringValue(args?.detail);
    const costClass: ApiReadRateCostClass = tool === "certscore_get_scan_bundle"
      ? "bundle"
      : tool === "certscore_get_evidence"
        ? "evidence"
        : tool === "certscore_export_findings"
          ? "export"
          : tool === "certscore_get_report" && (detail === "evidence" || detail === "full")
            ? detail
            : "ordinary";
    const readTools = new Set([
      "certscore_get_scan",
      "certscore_get_report",
      "certscore_get_evidence",
      "certscore_get_scan_bundle",
      "certscore_export_findings",
      "certscore_list_findings",
      "certscore_get_pre_consent_cookies_trackers",
      "certscore_explain_finding"
    ]);
    return readTools.has(tool) ? { profile: "terminal", target: `scan:${scanId}`, tool, units: units(costClass) } : null;
  }
  const domain = stringValue(args?.domain)?.toLowerCase();
  if (domain && (tool === "certscore_get_latest_domain_scan" || tool === "certscore_get_latest_domain_pre_consent_cookies_trackers")) {
    return { profile: "terminal", target: `domain:${domain}`, tool, units: units("ordinary") };
  }
  return null;
}

export function mcpReadCallsFromJsonRpc(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(readCallFromRequest).filter((call): call is McpReadCall => Boolean(call));
  }
  const call = readCallFromRequest(value);
  return call ? [call] : [];
}

function rateLimitWindowDescription(windowSeconds: number) {
  if (windowSeconds === 600) return "10-minute rolling window";
  if (windowSeconds === 86_400) return "24-hour rolling window";
  return `${windowSeconds}-second rolling window`;
}

function rateLimitScopeDescription(scope: ApiReadRateScope | "provider", authenticated = false) {
  if (scope === "callerTarget") return authenticated ? "this authenticated OAuth identity and scan" : "this MCP session and scan";
  if (scope === "caller") return authenticated ? "this authenticated OAuth identity across scans" : "this MCP session across scans";
  if (scope === "target") return "this scan across all callers";
  return "the shared Anthropic provider service";
}

export function mcpReadRateLimitGuidance(call: McpReadCall, decision: {
  limitUnits: number;
  profile: ApiReadRateProfile;
  requestedUnits: number;
  retryAfterSeconds: number;
  scope: ApiReadRateScope | "provider";
  usedUnits: number;
  windowSeconds: number;
}, options: { anonymousLight?: boolean; authenticated?: boolean } = {}) {
  const canonical = apiReadRateLimitGuidance(decision.profile, decision.retryAfterSeconds);
  const scopeDescription = rateLimitScopeDescription(decision.scope, options.authenticated === true);
  const windowDescription = rateLimitWindowDescription(decision.windowSeconds);
  const unitDescription = decision.profile === "status" ? "status-poll units" : "terminal-read units";
  const requestDescription = call.tool === "certscore_get_scan_bundle"
    ? "bundle reads"
    : call.tool === "certscore_get_scan_status"
      ? "status polls"
      : "equivalent requests";
  const equivalentRequestLimit = Math.floor(decision.limitUnits / decision.requestedUnits);
  const callerScoped = decision.scope === "callerTarget" || decision.scope === "caller";
  const anonymousLightUpgrade = callerScoped && options.anonymousLight === true;
  const upgradeMessage = anonymousLightUpgrade
    ? `If you need higher-volume scanning, create an account at ${CERTSCORE_ACCOUNT_URL} and contact ${CERTSCORE_SUPPORT_EMAIL} to request a custom automated-access allowance. Creating an account does not automatically change the anonymous Light MCP limit.`
    : callerScoped
      ? `If you need higher-volume scanning, contact ${CERTSCORE_SUPPORT_EMAIL} to request a custom automated-access allowance for your authenticated MCP account.`
    : `This is a shared service or scan-resource limit; registering an account will not bypass the active window. Contact ${CERTSCORE_SUPPORT_EMAIL} if this repeatedly affects legitimate use.`;
  const limitDescription = `${decision.limitUnits} ${unitDescription} per ${windowDescription}`;
  const operationDescription = `${call.tool} costs ${decision.requestedUnits} ${decision.requestedUnits === 1 ? "unit" : "units"}, equivalent to up to ${equivalentRequestLimit} ${requestDescription} when no other reads use the window`;
  const recommendedNextAction = `${canonical.recommendedNextAction} ${upgradeMessage}`;

  return {
    accountUrl: anonymousLightUpgrade ? CERTSCORE_ACCOUNT_URL : null,
    anonymousLightLimitChangedByAccount: false,
    equivalentRequestLimit,
    limitDescription,
    message: `${canonical.message} The active limit for ${scopeDescription} is ${limitDescription}; ${operationDescription}, and ${decision.usedUnits} units are currently used. ${recommendedNextAction}`,
    operationCostUnits: decision.requestedUnits,
    recommendedNextAction,
    scopeDescription,
    supportEmail: CERTSCORE_SUPPORT_EMAIL,
    upgradeAvailable: callerScoped,
    upgradeMessage,
    windowDescription
  };
}

export class McpReadThrottle {
  private readonly events = new Map<string, Event[]>();
  private claims = 0;

  claim(caller: string, call: McpReadCall, now = Date.now(), provider?: string) {
    const keys: Array<{ key: string; reason: string; scope: ApiReadRateScope | "provider" }> = [
      { key: `${call.profile}:caller-target:${caller}:${call.target}`, reason: "caller_target", scope: "callerTarget" },
      { key: `${call.profile}:target:${call.target}`, reason: "target", scope: "target" },
      { key: `${call.profile}:caller:${caller}`, reason: "caller", scope: "caller" },
      ...(provider ? [{ key: `${call.profile}:provider:${provider}`, reason: "provider", scope: "provider" as const }] : [])
    ];
    const retentionCutoff = now - API_READ_RATE_MAX_WINDOW_SECONDS * 1000;
    const scoped = keys.map((scope) => {
      const events = (this.events.get(scope.key) ?? []).filter((event) => event.at > retentionCutoff);
      if (events.length > 0) this.events.set(scope.key, events);
      else this.events.delete(scope.key);
      return { ...scope, events };
    });
    let exceeded: {
      events: Event[];
      limitUnits: number;
      reason: string;
      scope: ApiReadRateScope | "provider";
      usedUnits: number;
      windowId: "burst" | "daily";
      windowSeconds: number;
    } | null = null;
    for (const window of API_READ_RATE_POLICY.profiles[call.profile].windows) {
      const limits: Partial<Record<ApiReadRateScope | "provider", number>> = {
        ...window.limits,
        ...(window.mcpProviderLimit === undefined ? {} : { provider: window.mcpProviderLimit })
      };
      const cutoff = now - window.windowSeconds * 1000;
      for (const scope of scoped) {
        const limit = limits[scope.scope];
        if (limit === undefined) continue;
        const events = scope.events.filter((event) => event.at > cutoff);
        const usedUnits = events.reduce((sum, event) => sum + event.units, 0);
        if (usedUnits + call.units > limit) {
          exceeded = {
            events,
            limitUnits: limit,
            reason: scope.reason,
            scope: scope.scope,
            usedUnits,
            windowId: window.id,
            windowSeconds: window.windowSeconds
          };
          break;
        }
      }
      if (exceeded) break;
    }
    if (exceeded) {
      const oldestAt = exceeded.events[0]?.at ?? now;
      return {
        allowed: false as const,
        limitUnits: exceeded.limitUnits,
        policyVersion: API_READ_RATE_POLICY.version,
        profile: call.profile,
        requestedUnits: call.units,
        reason: exceeded.windowId === "burst"
          ? `mcp_scan_read_${exceeded.reason}_limit`
          : `mcp_scan_read_${exceeded.windowId}_${exceeded.reason}_limit`,
        retryAfterSeconds: Math.max(1, Math.ceil((oldestAt + exceeded.windowSeconds * 1000 - now) / 1000)),
        scope: exceeded.scope,
        usedUnits: exceeded.usedUnits,
        windowId: exceeded.windowId,
        windowSeconds: exceeded.windowSeconds
      };
    }
    for (const scope of scoped) {
      this.events.set(scope.key, [...scope.events, { at: now, units: call.units }]);
    }
    this.claims += 1;
    if (this.claims % 100 === 0) {
      for (const [key, events] of this.events) {
        const current = events.filter((event) => event.at > retentionCutoff);
        if (current.length > 0) this.events.set(key, current);
        else this.events.delete(key);
      }
    }
    return {
      allowed: true as const,
      policyVersion: API_READ_RATE_POLICY.version,
      profile: call.profile,
      requestedUnits: call.units,
      retryAfterSeconds: 0
    };
  }
}
