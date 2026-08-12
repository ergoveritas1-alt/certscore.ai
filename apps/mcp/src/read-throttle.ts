import sharedPolicy from "@website-signal-risk-scanner/shared";
import type {
  ApiReadRateCostClass,
  ApiReadRateProfile,
  ApiReadRateScope
} from "@website-signal-risk-scanner/shared";

const {
  API_READ_RATE_MAX_WINDOW_SECONDS,
  API_READ_RATE_POLICY,
  apiReadRateUnits
} = sharedPolicy;

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
  if (tool === "get_scan_status") {
    const scanId = stringValue(args?.scanId);
    return scanId ? { profile: "status", target: `scan:${scanId}`, tool, units: units("ordinary") } : null;
  }
  const scanId = stringValue(args?.scanId);
  if (scanId) {
    const detail = stringValue(args?.detail);
    const costClass: ApiReadRateCostClass = tool === "get_scan_bundle"
      ? "bundle"
      : tool === "get_evidence"
        ? "evidence"
        : tool === "export_findings"
          ? "export"
          : tool === "get_report" && (detail === "evidence" || detail === "full")
            ? detail
            : "ordinary";
    const readTools = new Set([
      "get_scan",
      "get_report",
      "get_evidence",
      "get_scan_bundle",
      "export_findings",
      "list_findings",
      "get_pre_consent_cookies_trackers",
      "explain_finding"
    ]);
    return readTools.has(tool) ? { profile: "terminal", target: `scan:${scanId}`, tool, units: units(costClass) } : null;
  }
  const domain = stringValue(args?.domain)?.toLowerCase();
  if (domain && (tool === "get_latest_domain_scan" || tool === "get_latest_domain_pre_consent_cookies_trackers")) {
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

export class McpReadThrottle {
  private readonly events = new Map<string, Event[]>();
  private claims = 0;

  claim(caller: string, call: McpReadCall, now = Date.now()) {
    const keys: Array<{ key: string; reason: string; scope: ApiReadRateScope }> = [
      { key: `${call.profile}:caller-target:${caller}:${call.target}`, reason: "caller_target", scope: "callerTarget" },
      { key: `${call.profile}:target:${call.target}`, reason: "target", scope: "target" },
      { key: `${call.profile}:caller:${caller}`, reason: "caller", scope: "caller" }
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
      scope: ApiReadRateScope;
      usedUnits: number;
      windowId: "burst" | "daily";
      windowSeconds: number;
    } | null = null;
    for (const window of API_READ_RATE_POLICY.profiles[call.profile].windows) {
      const limits: Partial<Record<ApiReadRateScope, number>> = window.limits;
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
