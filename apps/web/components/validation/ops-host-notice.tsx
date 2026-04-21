import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";

type ValidationOpsHostNoticeProps = {
  destinationUrl: string;
  title: string;
};

export function ValidationOpsHostNotice({ destinationUrl, title }: ValidationOpsHostNoticeProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-3xl text-slate-600">
          Validation controls for this environment are hosted on the dedicated validation operations surface instead of the primary app.
        </p>
      </div>

      <Card className="border-sky-200 bg-sky-50">
        <CardHeader>
          <CardTitle>Continue on the validation operations host</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-sky-950">
          <p>
            Open the dedicated validation app to manage runs, review findings, or trigger rescans for the validation queue lane.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex rounded-full bg-slate-950 px-4 py-2 font-medium text-white transition hover:bg-slate-800"
              href={destinationUrl}
            >
              Open validation ops
            </Link>
            <span className="font-mono text-xs text-slate-600">{destinationUrl}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
