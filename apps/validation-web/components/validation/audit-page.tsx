import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { listValidationAuditEvents } from "../../server/validation/repository";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatEventType(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function actorEmailFromRow(row: Record<string, unknown>) {
  const users = row.users;
  if (Array.isArray(users)) {
    const first = safeRecord(users[0]);
    return typeof first?.email === "string" ? first.email : null;
  }

  const user = safeRecord(users);
  return typeof user?.email === "string" ? user.email : null;
}

export async function ValidationAuditPage() {
  const events = await listValidationAuditEvents();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Audit history</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Operator actions and validation pipeline state changes are recorded here so pause events, target edits, and manual runs are easy to trace.
        </p>
      </div>

      <Card className="border-white/10 bg-white/5 text-slate-100">
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-slate-300">No validation audit events have been recorded yet.</p>
          ) : (
            events.map((event) => {
              const previousValue = safeRecord(event.previous_value_json);
              const nextValue = safeRecord(event.next_value_json);
              const actorEmail = actorEmailFromRow(event);

              return (
                <div key={String(event.id)} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{formatEventType(String(event.event_type))}</Badge>
                        <span className="text-xs text-slate-400">{formatDateTime(event.created_at as string | null)}</span>
                      </div>
                      <div className="text-sm text-slate-300">
                        Actor: <span className="text-slate-100">{actorEmail ?? "System or unknown user"}</span>
                      </div>
                      {typeof event.reason === "string" && event.reason.length > 0 ? (
                        <div className="text-sm text-slate-300">{event.reason}</div>
                      ) : null}
                    </div>
                  </div>

                  {previousValue || nextValue ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Previous</div>
                        <pre className="overflow-x-auto rounded-xl bg-slate-950/70 p-3 text-xs text-slate-300">
                          {JSON.stringify(previousValue ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Next</div>
                        <pre className="overflow-x-auto rounded-xl bg-slate-950/70 p-3 text-xs text-slate-300">
                          {JSON.stringify(nextValue ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
