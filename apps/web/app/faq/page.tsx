import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "FAQ",
  description:
    "Frequently asked questions about CertScore.ai, including scan scope, accuracy, plan limits, and monitoring.",
  path: "/faq"
});

const faqs = [
  {
    question: "What does CertScore.ai scan?",
    answer:
      "CertScore.ai scans public website pages for accessibility issues, privacy and cookie-consent signals, tracker behavior, policy-page presence, and basic disclosure-related signals."
  },
  {
    question: "How accurate are the results?",
    answer:
      "Results are based on observed technical and content signals from public pages. They are designed for review and monitoring, not as a legal or formal accessibility determination."
  },
  {
    question: "Does CertScore.ai scan private or logged-in pages?",
    answer:
      "No. The MVP scans public websites only. Logged-in, private, or staging-only pages are outside the current scan scope."
  },
  {
    question: "How long does a scan take?",
    answer:
      "Homepage previews return quickly. Larger scans usually take a few minutes depending on site responsiveness, page count, and the selected scan scope."
  },
  {
    question: "How many websites can I monitor?",
    answer:
      "Free includes 1 website. Pro includes 3 websites. Ultra includes 50 websites."
  },
  {
    question: "What do I get after the preview scan?",
    answer:
      "After signup, you can save websites, run larger scans, review signals and changes in the app, and track scan history over time."
  },
  {
    question: "Does CertScore.ai fix issues automatically?",
    answer:
      "No. CertScore.ai identifies observed issues and changes. Review and remediation still need to be handled by your team."
  },
  {
    question: "How often can my site be rescanned?",
    answer:
      "That depends on your plan. Free includes 1 scan per month. Pro and Ultra support on-demand re-scans every 5 minutes per website."
  },
  {
    question: "What happens if my site changes after the scan?",
    answer:
      "Run another scan. CertScore.ai compares each completed scan to the previous one so you can see added, removed, and changed signals over time."
  },
  {
    question: "Is CertScore.ai legal advice?",
    answer:
      "No. CertScore.ai scans public pages for observable website signals and change history. It does not provide legal advice or certify compliance."
  }
];

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    })),
    url: `${SITE_URL}/faq`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="max-w-3xl space-y-4">
          <Badge tone="neutral">FAQ</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
            Practical answers about scan scope and plan limits
          </h1>
          <p className="text-lg text-slate-600">
            These answers explain what CertScore.ai scans, what it stores, and what to expect from the product.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
            >
              <Link href="/">Start free scan</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6">
          {faqs.map((faq) => (
            <Card key={faq.question} className="relative overflow-hidden border-slate-200 bg-white shadow-none">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(148,163,184,0.22)_0%,rgba(226,232,240,0.4)_100%)]" />
              <CardHeader>
                <CardTitle>{faq.question}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-600">{faq.answer}</CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 rounded-[2rem] border border-slate-200 bg-white p-8">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">What to do next</h2>
            <p className="text-sm text-slate-600">
              Start with a free homepage preview, then create an account to save websites, run larger scans, and track signal changes over time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white shadow-[0_14px_32px_rgba(15,139,215,0.18)] hover:brightness-[1.04]"
              >
                <Link href="/">Start free scan</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,253,244,0.98)_100%)] text-slate-900 ring-1 ring-emerald-200 hover:bg-emerald-50"
              >
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
