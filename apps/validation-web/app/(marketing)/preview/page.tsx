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
          <Badge tone="neutral">Homepage preview</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">Run a homepage scan before signup</h1>
          <p className="text-lg text-slate-600">
            Start with a lightweight preview that checks the homepage for sample accessibility, privacy, consent, and disclosure findings before you create an account.
          </p>
        </div>

        <div className="mt-8">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Start a homepage preview</CardTitle>
            </CardHeader>
            <CardContent>
              <DomainScanForm
                buttonLabel="Scan a website"
                helperText="The preview is lightweight and shows the kinds of findings and observable signals CertScore can surface on a homepage before signup."
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
              The homepage preview highlights visible accessibility signals before you queue a broader scan.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Sample findings call out consent, tracker, and disclosure signals visible from the public homepage.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Continue after signup</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Create an account to unlock broader scans, saved history, and the full review workflow.
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
