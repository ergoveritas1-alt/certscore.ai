import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { getDashboardContext } from "../../../server/auth";
import { listOrganizationChanges } from "../../../server/changes/list-organization-changes";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
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
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/app/scans/${change.scanId}`}>View scan</Link>
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
