import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, CardContent } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { SiteHeader } from "../../../../components/layout/site-header";
import { createPageMetadata } from "../../../../lib/seo";
import { getMonitorSiteRequestStatusByToken } from "../../../../server/monitor-site/get-monitor-site-request-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = createPageMetadata({
  title: "Monitoring Request Status",
  description: "Status page for a CertScore.ai website monitoring request.",
  path: "/monitor-site/status",
  robots: {
    index: false,
    follow: false
  }
});

type MonitorSiteStatusPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatFrequency(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusPresentation(input: {
  setupStatus: "activated" | "pending_setup" | null;
  status: "pending" | "contacted" | "converted" | "closed";
}) {
  if (input.setupStatus === "activated") {
    return {
      badge: "Monitoring confirmed",
      body: "Monitoring setup has been confirmed for public-web observations over time.",
      heading: "Monitoring setup confirmed",
      tone: "success" as const
    };
  }

  if (input.setupStatus === "pending_setup") {
    return {
      badge: "Setup pending",
      body: "The request has been linked for setup review, but monitoring is not active yet.",
      heading: "Setup review is in progress",
      tone: "neutral" as const
    };
  }

  if (input.status === "contacted") {
    return {
      badge: "Follow-up started",
      body: "We have started follow-up on this request. Monitoring is not active until setup is confirmed.",
      heading: "Follow-up is in progress",
      tone: "neutral" as const
    };
  }

  if (input.status === "converted") {
    return {
      badge: "In review",
      body: "This request is in the setup workflow. Monitoring is not active until setup is confirmed.",
      heading: "Setup review is in progress",
      tone: "neutral" as const
    };
  }

  if (input.status === "closed") {
    return {
      badge: "Closed",
      body: "This monitoring request is closed. Submit a new request if you want us to review monitoring setup again.",
      heading: "Request closed",
      tone: "neutral" as const
    };
  }

  return {
    badge: "Received",
    body: "This request is in the pending monitoring review queue. Monitoring is not active until setup is confirmed with you.",
    heading: "Request received",
    tone: "warning" as const
  };
}

export default async function MonitorSiteStatusPage({ params }: MonitorSiteStatusPageProps) {
  const { token } = await params;
  const request = await getMonitorSiteRequestStatusByToken(token);

  if (!request) {
    notFound();
  }

  const presentation = getStatusPresentation({
    setupStatus: request.setupStatus,
    status: request.status
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="space-y-6 p-8">
            <div className="space-y-3">
              <Badge tone={presentation.tone}>{presentation.badge}</Badge>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{presentation.heading}</h1>
              <p className="text-sm leading-7 text-slate-600">{presentation.body}</p>
            </div>

            <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium text-slate-500">Site</dt>
              <dd className="text-slate-900">{request.hostname}</dd>
              <dt className="font-medium text-slate-500">Submitted</dt>
              <dd className="text-slate-900">{formatDateTime(request.createdAt)}</dd>
              <dt className="font-medium text-slate-500">Last updated</dt>
              <dd className="text-slate-900">{formatDateTime(request.updatedAt)}</dd>
              {request.setupStatus === "activated" ? (
                <>
                  <dt className="font-medium text-slate-500">Cadence</dt>
                  <dd className="text-slate-900">{formatFrequency(request.activeFrequency)}</dd>
                  <dt className="font-medium text-slate-500">Confirmed</dt>
                  <dd className="text-slate-900">{formatDateTime(request.activatedAt)}</dd>
                </>
              ) : null}
            </dl>

            <p className="text-sm leading-7 text-slate-600">
              CertScore.ai uses automated public-web observations as review signals. Status shown here is operational setup context, not legal advice, and does not replace review of the underlying evidence.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/">Run a scan</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/monitor-site">Request another monitor</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
