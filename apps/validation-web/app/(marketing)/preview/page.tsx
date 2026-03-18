import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../../components/marketing/domain-scan-form";
import { SiteHeader } from "../../../components/layout/site-header";

export default function PreviewPage() {
  return (
    <main className="min-h-screen bg-sand">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="neutral">Full scan review</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Run a full scan and open the review report</h1>
          <p className="text-lg text-slate-600">
            This flow now queues the same full scan path used in the app and opens the scan report review directly instead of generating a lightweight homepage preview.
          </p>
        </div>

        <div className="mt-8">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Start a full scan</CardTitle>
            </CardHeader>
            <CardContent>
              <DomainScanForm buttonLabel="Run full scan" />
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Accessibility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Full scan report sections include persisted automated accessibility evidence.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Full scan report sections include tracker, consent, and pre-consent evidence.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Review findings</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Findings consolidate policy review queue, policy section review, and accessibility review outputs.
            </CardContent>
          </Card>
        </div>

        <div className="mt-10">
          <Button asChild>
            <Link href="/login?next=/app">Create account to continue</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
