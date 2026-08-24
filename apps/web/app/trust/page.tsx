import { Badge } from "@website-signal-risk-scanner/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata, createPublicWebPageSchema } from "../../lib/seo";

const title = "Trust & Security";
const description =
  "Review CertScore.ai security, privacy, data-handling, operational resilience, and vulnerability-reporting practices.";

export const metadata: Metadata = createPageMetadata({
  title,
  description,
  path: "/trust",
  robots: {
    index: true,
    follow: true
  }
});

const practices = [
  {
    title: "Security architecture",
    paragraphs: [
      "CertScore.ai production services run in hosted Amazon Web Services infrastructure. Production is deployed through repository-controlled AWS workflows; local development tooling is not used as the production runtime.",
      "Public web and MCP endpoints use HTTPS/TLS. Administrative product routes require authenticated platform-administrator authorization. Service roles and infrastructure policies scope workload access to the resources needed for each service, and sensitive runtime values are injected from managed secret stores rather than committed to application source."
    ]
  },
  {
    title: "Authentication & credentials",
    paragraphs: [
      "Application credentials and signing material are supplied to production workloads through dedicated secret-management systems rather than stored in source code.",
      "Hosted MCP connections support the OAuth 2.0 authorization code flow with PKCE. Approved scopes limit read and scan-creation access, and protected requests validate the resulting access token before processing."
    ]
  },
  {
    title: "Data handling & privacy",
    paragraphs: [
      "CertScore.ai primarily analyzes publicly accessible website behavior. Retained scan evidence can include cookie and storage observations, tracker or vendor detections, consent controls, privacy-policy content or bounded excerpts, HTTPS/TLS observations, screenshots, and scan metadata.",
      "The service also processes the account, authentication, billing, support, and operational data needed to provide the product. Details are described in the Privacy Policy."
    ],
    link: { href: "/privacy", label: "Read the Privacy Policy" }
  },
  {
    title: "Encryption & transport",
    paragraphs: [
      "Public production endpoints use HTTPS/TLS with managed certificates. Checked-in AWS infrastructure configures encryption at rest and public-access blocking for managed object stores used by the service where those stores are defined in infrastructure code.",
      "MCP authorization tokens are validated before protected requests are processed. MCP telemetry is designed to exclude authorization headers, bearer tokens, request bodies, raw IP addresses, and client secrets."
    ]
  }
] as const;

const providers = [
  {
    provider: "Amazon Web Services",
    purpose: "Production hosting, managed compute, object storage, queues, and secret management."
  },
  {
    provider: "Cloudflare",
    purpose: "DNS and edge services for CertScore.ai public properties."
  },
  {
    provider: "Google",
    purpose: "Business and transactional email where configured, plus optional website analytics after consent."
  },
  {
    provider: "Stripe",
    purpose: "Payment and subscription processing; CertScore.ai does not directly store payment card details."
  },
  {
    provider: "OpenAI",
    purpose: "Bounded model-assisted extraction or internal review of retained public-policy evidence where that workflow is enabled."
  }
] as const;

export default function TrustPage() {
  const schema = createPublicWebPageSchema({ description, path: "/trust", title });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <Badge tone="neutral">Current practices</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Trust &amp; Security
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            CertScore.ai provides evidence-backed privacy diagnostics for public websites. We design the
            service to minimize unnecessary data collection, protect credentials and operational data, and
            keep customer-facing findings grounded in observable public-web evidence.
          </p>
          <p className="mt-5 max-w-3xl border-l-4 border-sky-500 pl-4 text-sm leading-6 text-slate-600">
            This page summarizes CertScore.ai&apos;s current security, privacy, and operational practices. It
            does not represent a third-party certification or legal compliance determination.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <section aria-labelledby="trust-principles" className="mb-12">
          <h2 id="trust-principles" className="text-2xl font-semibold tracking-tight text-slate-950">
            Trust principles
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ["Public-web scope", "Scanning focuses on observable public website behavior and bounded supporting evidence."],
              ["Evidence before conclusions", "Findings follow the canonical evidence and policy pipeline and remain review signals, not legal determinations."],
              ["Narrow claims", "We describe implemented practices without representing unverified certifications, audits, or controls."]
            ].map(([heading, body]) => (
              <article key={heading} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-950">{heading}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {practices.map((practice) => (
            <section key={practice.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{practice.title}</h2>
              <div className="mt-3 space-y-3">
                {practice.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-slate-600">
                    {paragraph}
                  </p>
                ))}
              </div>
              {"link" in practice ? (
                <Link className="mt-4 inline-flex font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900" href={practice.link.href}>
                  {practice.link.label}
                </Link>
              ) : null}
            </section>
          ))}
        </div>

        <section aria-labelledby="providers" className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="max-w-3xl">
            <h2 id="providers" className="text-2xl font-semibold tracking-tight text-slate-950">
              Service &amp; infrastructure providers
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Major providers used in the current service are listed below. A provider&apos;s involvement depends
              on the feature and operational configuration. The Privacy Policy is the canonical public description
              of how service-provider categories relate to data handling.
            </p>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
              <caption className="sr-only">Major CertScore.ai service and infrastructure providers</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-950">
                  <th className="py-3 pr-6 font-semibold" scope="col">Provider</th>
                  <th className="py-3 font-semibold" scope="col">Current purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers.map((provider) => (
                  <tr key={provider.provider}>
                    <th className="py-4 pr-6 align-top font-medium text-slate-900" scope="row">{provider.provider}</th>
                    <td className="py-4 leading-6 text-slate-600">{provider.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="mt-5 inline-flex font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900" href="/privacy">
            Review data handling and provider categories
          </Link>
        </section>

        <section aria-labelledby="assurance" className="mt-6 rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
          <h2 id="assurance" className="text-2xl font-semibold tracking-tight">Compliance &amp; assurance</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            CertScore.ai maintains technical and organizational controls appropriate to its current service and
            risk profile. CertScore.ai is not currently representing this service as SOC 2, ISO 27001, FedRAMP,
            HIPAA, PCI DSS, or another third-party certified service unless explicitly stated here.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link className="font-medium text-sky-300 underline decoration-sky-700 underline-offset-4 hover:text-sky-200" href="/privacy">Privacy Policy</Link>
            <Link className="font-medium text-sky-300 underline decoration-sky-700 underline-offset-4 hover:text-sky-200" href="/terms">Terms of Service</Link>
            <Link className="font-medium text-sky-300 underline decoration-sky-700 underline-offset-4 hover:text-sky-200" href="/contact">Support and contact</Link>
          </div>
        </section>

        <section aria-labelledby="report-security" className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-6 sm:p-8">
          <h2 id="report-security" className="text-2xl font-semibold tracking-tight text-slate-950">
            Report a security issue
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
            If you believe you have identified a security issue affecting CertScore.ai, contact{" "}
            <a className="font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950" href="mailto:security@certscore.ai">
              security@certscore.ai
            </a>{" "}
            with sufficient detail to reproduce and investigate the issue. Please do not include unnecessary
            personal data, credentials, or sensitive third-party information.
          </p>
          <Link className="mt-4 inline-flex font-medium text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950" href="/security">
            Read the vulnerability reporting policy
          </Link>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
