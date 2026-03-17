import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PrivacyRequestForm } from "../../components/privacy/privacy-request-form";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Request",
  description:
    "Submit a CertScore.ai privacy request for data access, deletion, correction, portability, objection, or opt-out.",
  path: "/privacy-request"
});

type PrivacyRequestPageProps = {
  searchParams?: Promise<{
    requestId?: string;
    submitted?: string;
  }>;
};

export default async function PrivacyRequestPage({ searchParams }: PrivacyRequestPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isSubmitted = resolvedSearchParams?.submitted === "1";
  const requestId = resolvedSearchParams?.requestId?.trim();

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Data access, deletion, correction, portability, objection, and opt-out</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Privacy request</h1>
            <p className="text-lg text-slate-600">
              Use this form to submit a data subject request or other privacy rights request to CertScore.ai.
              You can also email{" "}
              <a className="font-medium text-sky-700 hover:text-sky-800" href="mailto:privacy@certscore.ai">
                privacy@certscore.ai
              </a>{" "}
              if you prefer.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
            <Card className="relative overflow-hidden border border-slate-200 bg-white shadow-none">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(15,139,215,0.18)_0%,rgba(103,199,240,0.3)_100%)]" />
              <CardHeader>
                <CardTitle>Submit a privacy request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {isSubmitted ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="font-medium">Request received.</p>
                    <p className="mt-1">
                      {requestId ? `Reference ID: ${requestId}. ` : ""}
                      We will review the request, confirm any verification needed, and respond through the provided email channel.
                    </p>
                  </div>
                ) : null}
                <PrivacyRequestForm />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border border-slate-200 bg-white shadow-none">
                <CardHeader>
                  <CardTitle>What to expect</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>Submit the request from your account email when possible. That gives us a lower-friction verification path.</p>
                  <p>We may ask for proportionate identity verification before disclosing, deleting, or changing records.</p>
                  <p>Requests are triaged by request type, identifiers provided, and applicable jurisdiction.</p>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-none">
                <CardHeader>
                  <CardTitle>Related links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                  <p>
                    Read the{" "}
                    <Link href="/privacy" className="font-medium text-sky-700 hover:text-sky-800">
                      Privacy Policy
                    </Link>{" "}
                    for details on what CertScore.ai collects and how scan data is handled.
                  </p>
                  <p>
                    For commercial questions, use{" "}
                    <Link href="/contact-sales" className="font-medium text-sky-700 hover:text-sky-800">
                      Contact us
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
