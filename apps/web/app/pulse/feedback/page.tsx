import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PulseFeedbackForm } from "./pulse-feedback-form";

export const dynamic = "force-dynamic";

type FeedbackPageProps = {
  searchParams: Promise<{
    pulseRequestId?: string;
    rating?: string;
  }>;
};

export default async function PulseFeedbackPage({ searchParams }: FeedbackPageProps) {
  const params = await searchParams;
  const pulseRequestId = params.pulseRequestId ?? "";

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Pulse feedback</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Was this Pulse useful?</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Feedback is stored privately and helps improve the agent-readable summary experience. You can also email support@certscore.ai.
        </p>
        <div className="mt-6">
          <PulseFeedbackForm initialRating={params.rating} pulseRequestId={pulseRequestId} />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
