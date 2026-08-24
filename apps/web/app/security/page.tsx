import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Security and Vulnerability Reporting",
  description:
    "Report suspected security vulnerabilities affecting CertScore.ai through the published security contact channel.",
  path: "/security"
});

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="space-y-4">
          <Badge tone="neutral">Security contact</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
            Security and vulnerability reporting
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            If you believe you have found a security vulnerability affecting CertScore.ai, email a written
            report to the security address below.
          </p>
        </div>

        <div className="mt-10 space-y-8 rounded-[2rem] border border-slate-200 bg-white p-8">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Reporting address</h2>
            <p className="text-sm leading-6 text-slate-600">
              Email{" "}
              <a
                className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900"
                href="mailto:security@certscore.ai"
              >
                security@certscore.ai
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">What to include</h2>
            <p className="text-sm leading-6 text-slate-600">
              Include the affected URL or service, a concise description, reproducible steps, the observed
              and expected behavior, and the potential impact. Include a safe way to contact you if you want
              a response.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Safe reporting</h2>
            <p className="text-sm leading-6 text-slate-600">
              Please do not include passwords, access tokens, unnecessary personal information, or data
              belonging to other people. Do not disrupt the service, access or alter data without
              authorization, or continue testing beyond what is necessary to describe the suspected issue.
            </p>
            <p className="text-sm leading-6 text-slate-600">
              This reporting channel does not establish a bug-bounty program or a promise of compensation.
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
