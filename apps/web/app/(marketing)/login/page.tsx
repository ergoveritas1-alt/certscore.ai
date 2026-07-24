import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@website-signal-risk-scanner/ui";
import { LoginForm } from "../../../components/auth/login-form";
import { SiteHeader } from "../../../components/layout/site-header";
import { isGoogleAuthAllowedForHost, isGoogleAuthEnabled } from "../../../lib/env";
import { isPublicAccountCreationEnabled } from "../../../server/access-control";
import { getCurrentUser } from "../../../server/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function getSafeRedirectPath(nextPath: string | undefined) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return "/app";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  const resolvedSearchParams = await searchParams;

  if (user) {
    redirect(getSafeRedirectPath(resolvedSearchParams?.next));
  }

  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const allowGoogle = isGoogleAuthEnabled() && isGoogleAuthAllowedForHost(requestHost);
  const allowCreateAccount = isPublicAccountCreationEnabled();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(121,190,52,0.1),transparent_30%),#f8fafc]">
      <SiteHeader />
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,34rem)] lg:gap-20 lg:py-24">
        <div className="hidden max-w-xl lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">CertScore.ai workspace</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 xl:text-5xl">Make every website decision easier to defend.</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">
            Review privacy, consent, accessibility, and disclosure signals in one calm, evidence-led workspace.
          </p>
          <div className="mt-8 grid max-w-md gap-3 sm:grid-cols-3">
            {[
              ["Evidence", "Retained observations"],
              ["Clarity", "Review-ready findings"],
              ["Momentum", "Track what changes"]
            ].map(([label, detail]) => (
              <div className="rounded-2xl border border-white/80 bg-white/75 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur" key={label}>
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="relative overflow-hidden border-slate-200/90 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_55%,#79be34_100%)]" />
          <CardContent className="p-6 pb-0 sm:p-9 sm:pb-0">
            <LoginForm allowCreateAccount={allowCreateAccount} allowGoogle={allowGoogle} footerMode="default" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
