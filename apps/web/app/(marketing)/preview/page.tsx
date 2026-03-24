import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { DomainScanForm } from "../../../components/marketing/domain-scan-form";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PendingButtonLink } from "../../../components/ui/pending-link";

export default function PreviewPage() {
  return (
    <main className="min-h-screen bg-sand">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="neutral">Homepage preview</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Run a homepage scan before signup</h1>
          <p className="text-lg text-slate-600">
            Start with a lightweight preview that checks the homepage for sample accessibility, privacy, and disclosure findings before you create an account.
          </p>
        </div>

        <div className="mt-8">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Start a homepage preview</CardTitle>
            </CardHeader>
            <CardContent>
              <DomainScanForm
                buttonLabel="Start homepage scan"
                helperText="The preview is lightweight and shows sample findings for the homepage before signup."
                mode="preview"
              />
            </CardContent>
          </Card>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Accessibility</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              The homepage preview highlights visible accessibility signals before you queue a deeper scan.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Sample findings call out consent, tracker, and disclosure issues visible from the public homepage.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Continue after signup</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Create an account to unlock deeper scans, saved history, and the full review workflow.
            </CardContent>
          </Card>
        </div>

        <div className="mt-10">
          <PendingButtonLink href="/login?next=/app" idleContent="Create account to continue" pendingContent="Opening..." />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
