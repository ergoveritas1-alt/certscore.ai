import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { API_READ_RATE_POLICY } from "@website-signal-risk-scanner/shared";
import { ApiReadRatePolicyDetails } from "../../../developers/developer-pages";
import { ANONYMOUS_SCAN_DAILY_LIMIT, LIGHT_MCP_NEW_SCAN_POLICY } from "../../../../server/pulse/anonymous-scan-quota";

export function McpThrottleReminder() {
  const light = LIGHT_MCP_NEW_SCAN_POLICY;
  return <Card className="border-slate-200 bg-white">
    <CardHeader className="pb-2">
      <CardTitle>MCP 429 throttle reminder</CardTitle>
      <p className="mt-1 text-sm text-slate-500">Current configured policies, not remaining allowance. A CertScore 429 means we throttled the caller; a target website returning 429 is a separate scan access issue.</p>
    </CardHeader>
    <CardContent className="space-y-5 pt-0">
      <ApiReadRatePolicyDetails />
      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-950">Shared provider read caps</h3>
        <p className="mt-1 text-sm text-slate-600">These aggregate limits apply to verified shared-provider traffic, not individual agents. All applicable scopes are enforced.</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {Object.entries(API_READ_RATE_POLICY.profiles).flatMap(([profile, policy]) => policy.windows.map(window =>
            <li key={`${profile}:${window.id}`}>{profile === "terminal" ? "Completed-result reads" : "Status polling"}: {window.mcpProviderLimit.toLocaleString("en-US")} units per rolling {window.windowSeconds >= 3600 ? `${window.windowSeconds / 3600} hours` : `${window.windowSeconds / 60} minutes`}.</li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-950">Light MCP — genuinely new scans</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr>
              <th className="px-4 py-3" scope="col">Scope</th>
              <th className="px-4 py-3" scope="col">Rolling {light.burstWindowSeconds / 60} minutes</th>
              <th className="px-4 py-3" scope="col">Per UTC day</th>
              <th className="px-4 py-3" scope="col">Concurrent active scans</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {(["session", "ip", "surface"] as const).map(scope => <tr key={scope}>
                <th className="px-4 py-3 font-semibold text-slate-900" scope="row">{scope === "session" ? "Session / requester binding" : scope === "ip" ? "Caller IP" : "Light entrypoint — all callers"}</th>
                <td className="px-4 py-3">{light[scope].burstLimit}</td>
                <td className="px-4 py-3">{light[scope].dailyLimit}</td>
                <td className="px-4 py-3">{light.concurrency[scope]}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-600">Eligible result reuse does not consume a new-scan slot. Light daily quotas reset at midnight UTC; concurrency denials advise retrying after {light.concurrencyRetryAfterSeconds} seconds. Anonymous full MCP uses the anonymous new-scan quota of {ANONYMOUS_SCAN_DAILY_LIMIT} per requester per UTC day. Authenticated calls also remain subject to their account and API-key allowances.</p>
      </div>
      <p className="text-xs leading-5 text-slate-500">The Usage row’s 5/10/60-minute counters are retained call counts, not weighted quota usage. Follow the actual denial’s scope and Retry-After value; stop status polling once a scan is terminal.</p>
    </CardContent>
  </Card>;
}
