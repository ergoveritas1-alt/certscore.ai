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
          <Badge tone="neutral">Homepage-only preview</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Run a homepage preview before you sign up</h1>
          <p className="text-lg text-slate-600">
            This preview shows a small set of sample scan findings for the homepage only. Create an account to save websites, run larger scans, and keep scan history.
          </p>
        </div>

        <div className="mt-8">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Start a new preview</CardTitle>
            </CardHeader>
            <CardContent>
              <DomainScanForm buttonLabel="Run homepage preview" />
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Accessibility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Homepage-only signals from automated accessibility checks.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Tracker and consent-related signal checks.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Disclosure</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Policy-page and disclosure-link detection.
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
