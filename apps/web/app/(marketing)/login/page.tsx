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
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="mx-auto flex max-w-xl px-6 py-12 sm:py-16">
        <Card className="relative overflow-hidden border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.1)]">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_55%,#79be34_100%)]" />
          <CardContent className="p-6 pb-0 sm:p-8 sm:pb-0">
            <LoginForm allowCreateAccount={allowCreateAccount} allowGoogle={allowGoogle} footerMode="default" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
