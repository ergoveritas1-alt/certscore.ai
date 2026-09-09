import Link from "next/link";
import { McpDetailsPopup } from "./mcp-details-popup";
import React from "react";
import { mcpRequestDetailsSchema } from "@website-signal-risk-scanner/shared";
import type { AdminMcpTelemetryEvent } from "../../../../server/admin/mcp-telemetry";

export function McpRequestDetails({ event, traffic, period }: {
  event: Pick<AdminMcpTelemetryEvent, "request_details" | "session_id" | "actor_id" | "tool_name" | "requested_resource" | "requested_resource_type" | "quota_outcome" | "transport_outcome">;
  traffic: string; period: string;
}) {
  const parsed = mcpRequestDetailsSchema.safeParse(event.request_details);
  const details = parsed.success ? parsed.data : null;
  const href = (id: string) => `/app/admin/mcp?${new URLSearchParams({ q: id, traffic, timeSpan: period })}`;
  const actorBasis = details?.actorBasis === "authenticated" ? "Authenticated caller"
    : details?.actorBasis === "provider_ephemeral" ? "Provider-declared opaque caller"
    : details?.actorBasis === "requester_binding" ? "Requester binding (may represent shared IP)"
    : "Correlation basis not recorded";
  return <McpDetailsPopup title="Request details" trigger="Request details">
      <section aria-label="GPT prompt / shared question" className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <h3 className="font-semibold text-slate-950">GPT prompt / shared question</h3>
        {details?.taskContext?.questionSummary ? <>
          <p className="mt-1 text-xs text-slate-500">{details.taskContext.questionSource === "user_wording" ? "Shared user wording" : "Agent paraphrase"} · explicitly shared by the client · up to 300 characters</p>
          <p className="mt-2 whitespace-pre-wrap">{details.taskContext.questionSummary}</p>
        </> : <p className="mt-2">No prompt was provided for this request. The MCP client sends tool calls; it does not send the original ChatGPT conversation. A shared question summary appears here only when the client supplies one with user-approved sharing.</p>}
      </section>
      <p className="break-all"><strong>Requested resource:</strong> {event.requested_resource ?? "Not recorded"}</p>
      <h3 className="font-semibold text-slate-950">Tool request</h3>
      <p className="break-all font-mono text-xs">{event.tool_name}</p>
      {details ? <>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-xs">{JSON.stringify({ tool: event.tool_name, arguments: details.arguments }, null, 2)}</pre>
        <p className="text-slate-500">{details.captureBasis === "protocol_request" ? "Allowlisted submitted arguments." : "Allowlisted validated arguments; original payload completeness was not recorded."} URL paths, credentials, queries and fragments are omitted; original chat prompts are not received.</p>
        {details.argumentsOmitted ? <p className="text-amber-800">Some input was omitted or normalized. This is not the full request payload.</p> : null}
      </> : <p className="break-all text-slate-500">Detailed arguments were not recorded for this event. Retained {event.requested_resource_type ?? "resource"}: {event.requested_resource ?? "unavailable"}.</p>}
      {details?.taskContext ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-xs">{JSON.stringify({ callerDeclaredContext: details.taskContext }, null, 2)}</pre> : null}
      {details?.serverVersion ? <p>Server {details.serverVersion} · client version {details.clientVersion ?? "unknown"} · schema {details.toolSchemaVersion ?? "unknown"}</p> : null}
      {details?.response ? <p>Response: {details.response.bytes} bytes · truncation {details.response.truncated === null ? "not recorded" : details.response.truncated ? "yes" : "no"}</p> : null}
      <p>Session: {event.session_id ? <Link className="break-all text-sky-700 underline" href={href(event.session_id)} prefetch={false}>{event.session_id}</Link> : "Not recorded"}{details ? ` (${details.sessionBasis.replaceAll("_", " ")})` : ""}</p>
      <p>{actorBasis}: {event.actor_id ? <Link className="break-all text-sky-700 underline" href={href(event.actor_id)} prefetch={false}>{event.actor_id}</Link> : "Not recorded"}</p>
      <p className="text-slate-500">Neither session nor requester counts establish unique agents or people.</p>
      <p>Quota: {event.quota_outcome.replaceAll("_", " ")} · {event.transport_outcome.replaceAll("_", " ")}</p>
      {details?.rateLimit ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-xs">{JSON.stringify(details.rateLimit, null, 2)}</pre>
        : event.quota_outcome === "rate_limited" ? <p>Limit details were not retained.</p> : null}
  </McpDetailsPopup>;
}
