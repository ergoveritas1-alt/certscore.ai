import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";

type ValidationUnavailableNoticeProps = {
  detail?: string;
};

export function ValidationUnavailableNotice({ detail }: ValidationUnavailableNoticeProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Validation unavailable</h1>
        <p className="max-w-3xl text-slate-600">
          This CertScore environment is authenticated correctly, but the connected Supabase project does not appear to have the validation pipeline schema available yet.
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>What needs to happen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-amber-950">
          <p>Apply the latest validation-related database migrations to the active Supabase project if they have not been applied yet.</p>
          <p>Then reload the REST schema cache with `NOTIFY pgrst, 'reload schema';` in the Supabase SQL editor.</p>
          {detail ? <p className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 font-mono text-xs text-amber-900">{detail}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
