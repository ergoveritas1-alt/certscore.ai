import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getDashboardContext } from "../../../server/auth";
import { listOrganizationChanges } from "../../../server/changes/list-organization-changes";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

export default async function ChangesPage() {
  const { organization } = await getDashboardContext();
  const changes = await listOrganizationChanges(organization.id);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Changes</h1>
        <p className="max-w-3xl text-slate-600">
          Review signal additions, removals, and tracker changes detected between completed scans.
        </p>
      </div>

      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Recent change events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {changes.length === 0 ? (
            <p className="text-sm text-slate-600">No change events are available yet.</p>
          ) : (
            changes.map((change) => (
              <div key={change.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{change.message}</p>
                  <p className="text-sm text-slate-500">
                    {change.domainHostname ?? "Unknown website"} · {formatDateTime(change.createdAt)}
                  </p>
                </div>
                {change.scanId ? (
                  <Button
                    asChild
                    className="h-11 w-11 rounded-full border-0 bg-[linear-gradient(180deg,#62cf63_0%,#4fbe51_100%)] p-0 text-white shadow-[0_10px_24px_rgba(79,190,81,0.24)] hover:brightness-[1.03]"
                    size="sm"
                    variant="secondary"
                  >
                    <Link aria-label={`View scan for ${change.domainHostname ?? "domain"} change`} href={`/app/scans/${change.scanId}`} prefetch={false}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5" />
                        <path d="m5 12 7-7 7 7" />
                      </svg>
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
