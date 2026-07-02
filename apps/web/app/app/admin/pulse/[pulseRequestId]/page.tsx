import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { EvidenceJsonBlock } from "../../../../../components/scans/evidence-json-block";
import { formatAdminDateTime } from "../../../../../lib/admin/date-time";
import { PULSE_STANDARD_DISCLAIMER } from "../../../../../lib/pulse/constants";
import { getAdminPulseRequestDetail } from "../../../../../server/admin/list-pulse-requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminPulseDetailPageProps = {
  params: Promise<{ pulseRequestId: string }>;
};

function formatLabel(value: string | null) {
  if (!value) {
    return "Not recorded";
  }
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function getString(value: Record<string, unknown>, key: string) {
  const nested = value[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested.trim() : null;
}

export default async function AdminPulseDetailPage({ params }: AdminPulseDetailPageProps) {
  const { pulseRequestId } = await params;
  const request = await getAdminPulseRequestDetail(pulseRequestId);

  if (!request) {
    notFound();
  }

  const detail = getString(request.requestContext, "detail");
  const format = getString(request.requestContext, "format");
  const freshness = getString(request.requestContext, "freshness");
  const waitSeconds = request.requestContext.waitSeconds;

  return (
    <div className="space-y-6">
      <Link className="text-sm font-semibold text-sky-700" href="/app/admin/pulse">
        Back to Pulse requests
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle>Pulse Request</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
            <Field label="Request ID" value={request.publicId} />
            <Field label="Job ID" value={request.jobId} />
            <Field label="Status" value={formatLabel(request.status)} />
            <Field label="Phase" value={formatLabel(request.phase)} />
            <Field label="Domain" value={request.normalizedDomain ?? "Unknown"} />
            <Field label="Requested URL" value={request.requestedUrl ?? "Not recorded"} />
            <Field label="Normalized URL" value={request.normalizedUrl ?? "Not recorded"} />
            <Field label="Resolution" value={formatLabel(request.resolutionMode)} />
            <Field label="Scan from" value={request.scanFromLabel} />
            <Field label="Detail / format" value={`${formatLabel(detail)} / ${formatLabel(format)}`} />
            <Field label="Freshness / wait" value={`${formatLabel(freshness)} / ${typeof waitSeconds === "number" ? waitSeconds : 0}s`} />
            <Field label="Requested" value={formatAdminDateTime(request.requestedAt, { includeSeconds: true })} />
            <Field label="Completed" value={formatAdminDateTime(request.completedAt, { includeSeconds: true })} />
            <Field label="Elapsed" value={request.elapsedSeconds === null ? "Not recorded" : `${request.elapsedSeconds}s`} />
            <Field label="Updated" value={formatAdminDateTime(request.updatedAt, { includeSeconds: true })} />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {request.scanId ? <AdminLink href={`/app/admin/scans/${request.scanId}`} label="Admin scan detail" /> : null}
            {request.scanId ? <AdminLink href={`/scan/${request.scanId}`} label="Public report" /> : null}
            {request.resultPulseUrl ? <AdminLink href={request.resultPulseUrl} label="Pulse JSON" /> : null}
            {request.scanId ? <AdminLink href={`/api/v1/pulse?scanId=${request.scanId}&detail=summary`} label="Summary JSON" /> : null}
            {request.scanId ? <AdminLink href={`/api/v1/pulse?scanId=${request.scanId}&detail=evidence`} label="Evidence JSON" /> : null}
            {request.resultReportUrl ? <AdminLink href={request.resultReportUrl} label="Report URL" /> : null}
            <AdminLink href={`/api/v1/pulse/status/${request.jobId}`} label="Status API" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Versioning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <Field label="API" value={request.apiVersion} />
            <Field label="Schema" value={request.schemaVersion} />
            <Field label="Pulse" value={request.pulseVersion} />
            <Field label="Projection" value={request.projectionVersion} />
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{PULSE_STANDARD_DISCLAIMER}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Throttle / Errors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <Field label="Throttle reason" value={formatLabel(request.throttleReason)} />
            <Field label="Retry after" value={request.retryAfterSeconds === null ? "Not recorded" : `${request.retryAfterSeconds}s`} />
            <Field label="Error code" value={request.errorCode ?? "None"} />
            <Field label="Error message" value={request.errorMessage ?? "None"} />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Requester</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <Field label="Type" value={request.requestType} />
            <Field label="Channel" value={request.requestChannel} />
            <Field label="Anonymous" value={String(request.requestedBy.anonymous ?? "unknown")} />
            <Field label="Source IP" value={getString(request.requestContext, "sourceIp") ?? "Not recorded"} />
            <Field label="IP hash" value={getString(request.requestContext, "ipHash") ?? "Not recorded"} />
            <Field label="User agent" value={getString(request.requestContext, "userAgent") ?? "Not recorded"} />
            <Field label="Referer" value={getString(request.requestContext, "referer") ?? "Not recorded"} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Response Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceJsonBlock
            payload={formatJson(request.responseSummary)}
            preClassName="overflow-x-auto whitespace-pre-wrap break-words p-4 pr-12 text-xs leading-5 text-slate-100"
          />
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>JSON Downloads ({request.artifactDownloads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {request.artifactDownloads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 pr-4 font-medium">Artifact</th>
                    <th className="pb-3 pr-4 font-medium">Source</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Bytes</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {request.artifactDownloads.map((download) => (
                    <tr key={download.id}>
                      <td className="py-3 pr-4 align-top font-medium text-slate-900">{formatLabel(download.artifactType)}</td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <p>{formatLabel(download.requestSource)}</p>
                        <p className="text-xs text-slate-500">{formatLabel(download.requestChannel)} · {formatLabel(download.routeName)}</p>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <p>{download.responseStatus}</p>
                        <p className="text-xs text-slate-500">{download.cachedOrReused === null ? "Cache unknown" : download.cachedOrReused ? "Cached/reused" : "Fresh"}</p>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">{download.byteSize === null ? "Not recorded" : download.byteSize.toLocaleString()}</td>
                      <td className="py-3 align-top text-slate-700">{formatAdminDateTime(download.createdAt, { includeSeconds: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No Summary JSON or Evidence JSON downloads recorded for this Pulse request.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Feedback ({request.feedback.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {request.feedback.length > 0 ? (
            request.feedback.map((feedback) => (
              <article className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700" key={feedback.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{formatLabel(feedback.rating)}</span>
                  {feedback.reason ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{formatLabel(feedback.reason)}</span>
                  ) : null}
                  <span className="text-xs text-slate-500">{formatAdminDateTime(feedback.createdAt, { includeSeconds: true })}</span>
                </div>
                {feedback.comment ? <p className="mt-3 whitespace-pre-wrap leading-6">{feedback.comment}</p> : null}
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <p>Email: {feedback.email ?? "Not provided"}</p>
                  <p>IP hash: {feedback.ipHash ?? "Not recorded"}</p>
                  <p className="truncate">User agent: {feedback.userAgent ?? "Not recorded"}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-600">No feedback submissions linked to this Pulse request.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Raw Request Context</CardTitle>
        </CardHeader>
        <CardContent>
          <EvidenceJsonBlock
            payload={formatJson({
            requestedBy: request.requestedBy,
            requestContext: request.requestContext
          })}
            preClassName="overflow-x-auto whitespace-pre-wrap break-words p-4 pr-12 text-xs leading-5 text-slate-100"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-slate-800">{value}</p>
    </div>
  );
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="block rounded-lg border border-slate-200 px-3 py-2 font-semibold text-sky-700" href={href}>
      {label}
    </Link>
  );
}
