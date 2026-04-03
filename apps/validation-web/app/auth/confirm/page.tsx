import { Button } from "@website-signal-risk-scanner/ui";
import { confirmMagicLinkAction } from "./actions";

function getSafeRedirectPath(nextParam: string | string[] | undefined) {
  if (typeof nextParam === "string" && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return nextParam;
  }

  return "/app";
}

export default async function AuthConfirmPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const tokenHash = typeof resolvedSearchParams.token_hash === "string" ? resolvedSearchParams.token_hash : null;
  const nextPath = getSafeRedirectPath(resolvedSearchParams.next);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(224,242,254,0.96)_0%,rgba(239,246,255,0.98)_100%)] text-[13px] font-semibold text-sky-700 ring-1 ring-sky-200">
            →
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Confirm sign-in</h1>
        </div>

        <p className="mb-6 text-sm leading-7 text-slate-600">
          Continue into CertScore.ai. The sign-in link will only be verified after you click the button below.
        </p>

        {tokenHash ? (
          <form action={confirmMagicLinkAction} className="space-y-4">
            <input name="token_hash" type="hidden" value={tokenHash} />
            <input name="next" type="hidden" value={nextPath} />
            <Button className="w-full" type="submit">
              Continue to workspace
            </Button>
          </form>
        ) : (
          <p className="text-sm text-red-600">This sign-in link is missing required token data.</p>
        )}
      </div>
    </main>
  );
}
