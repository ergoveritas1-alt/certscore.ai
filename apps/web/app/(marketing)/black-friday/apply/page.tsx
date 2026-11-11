import Link from "next/link";
import { SiteHeader } from "../../../../components/layout/site-header";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { CampaignForm } from "../../../../components/promotions/campaign-form";
import { campaignStore } from "../../../../server/promotions/repository";
import { createPageMetadata } from "../../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = createPageMetadata({
  title: "Apply for Complimentary Pro | Black Friday 2026",
  description: "Apply for three months of CertScore.ai Pro to use in your client or internal website reviews. No account or credit card is required to apply.",
  path: "/black-friday/apply"
});

export default async function ApplyPage() {
  const availability = await campaignStore.availability().catch(() => null);

  return (
    <main className="min-h-screen bg-[#fbfaf6] text-[#152624]">
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-10 sm:px-10 sm:py-14">
        <Link href="/black-friday" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#235b41] hover:underline">
          <span aria-hidden="true">←</span> Back to the offer
        </Link>
        <div className="mt-5 grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[#365e4d]">Black Friday 2026</p>
            <h1 className="mt-4 max-w-md text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Apply for three months of Pro.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-8 text-[#425750]">
              Tell us about your organization and the website privacy work you’d like to use CertScore.ai for.
            </p>
            <div className="mt-6 max-w-md rounded-xl border border-[#d8e2db] bg-[#edf2eb] p-5">
              <h2 className="font-semibold">What happens next</h2>
              <p className="mt-2 text-sm leading-6 text-[#425750]">
                We review complete applications in submission order. If approved, you’ll receive a personal link to activate within 14 days.
              </p>
            </div>
          </div>
          <div className="min-w-0 rounded-2xl border border-[#d8e2db] bg-white p-5 shadow-sm sm:p-8">
            <CampaignForm open={availability?.open ?? false} />
          </div>
        </div>
      </section>
      <SiteFooter highContrast />
    </main>
  );
}
