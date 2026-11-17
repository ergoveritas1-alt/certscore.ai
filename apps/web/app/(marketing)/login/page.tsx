import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@website-signal-risk-scanner/ui";
import { LoginForm } from "../../../components/auth/login-form";
import { SiteHeader } from "../../../components/layout/site-header";
import { isGoogleAuthAllowedForHost, isGoogleAuthEnabled } from "../../../lib/env";
import { isPublicAccountCreationEnabled } from "../../../server/access-control";
import { getFreshCurrentUser } from "../../../server/auth";

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
  const user = await getFreshCurrentUser();
  const resolvedSearchParams = await searchParams;

  if (user) {
    redirect(getSafeRedirectPath(resolvedSearchParams?.next));
  }

  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const allowGoogle = isGoogleAuthEnabled() && isGoogleAuthAllowedForHost(requestHost);
  const allowCreateAccount = isPublicAccountCreationEnabled();
  const isMarketplaceLight = getSafeRedirectPath(resolvedSearchParams?.next).split(/[?#]/)[0] === "/marketplace/light";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_85%_85%,rgba(121,190,52,0.1),transparent_30%),#f8fafc]">
      <SiteHeader />
      <section className="mx-auto flex max-w-xl justify-center px-6 py-12 sm:py-16 lg:py-24">
        <Card className="relative w-full overflow-hidden border-slate-200/90 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_55%,#79be34_100%)]" />
          <CardContent className="p-6 pb-0 sm:p-9 sm:pb-0">
            {isMarketplaceLight && <aside aria-label="Marketplace setup" className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-sky-900">Continue your AWS Marketplace setup</p>
              <p className="mt-2">Sign in with the CertScore account you want to link to your subscription. After signing in, you will return to MCP Light to confirm the AWS account and create your key.</p>
              <p className="mt-2">Keep using this browser. If the setup handoff expires, choose <strong>Set up your account</strong> in AWS Marketplace again.</p>
              <Link className="mt-2 inline-block font-medium text-sky-800 underline underline-offset-4" href="/marketplace/light/guide">Read the setup guide</Link>
            </aside>}
            <LoginForm allowCreateAccount={allowCreateAccount} allowGoogle={allowGoogle} footerMode="default" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
