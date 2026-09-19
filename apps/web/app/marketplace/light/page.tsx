import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "../../../server/auth";
import { getMarketplaceClaim, listMarketplaceLicenses } from "../../../server/marketplace/repository";
import { marketplaceConfig, MARKETPLACE_CLAIM_COOKIE, MARKETPLACE_LIGHT_ENDPOINT } from "../../../server/marketplace/config";
import { MarketplaceLightAction } from "../../../components/settings/marketplace-light-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "AWS Marketplace MCP Light setup", robots: { index: false, follow: false } };

export default async function MarketplaceLightPage() {
  const enabled = marketplaceConfig().CERTSCORE_MARKETPLACE_LIGHT_ENABLED === "1";
  const user = enabled ? await getCurrentUser() : null;
  const claimToken = enabled ? (await cookies()).get(MARKETPLACE_CLAIM_COOKIE)?.value : null;
  const claim = claimToken ? await getMarketplaceClaim(claimToken) : null;
  const licenses = user ? (await listMarketplaceLicenses(user.id)).rows : [];
  return <main className="mx-auto max-w-3xl space-y-7 px-6 py-12 text-slate-900">
    <Link href="/" className="text-sky-700">CertScore.ai</Link>
    <h1 className="text-3xl font-semibold">AWS Marketplace MCP Light</h1>
    <p>Free public website privacy scanning with four MCP tools. Marketplace access uses an API key and shares Light&apos;s public scan allowance. It does not include private workspace history.</p>
    {!enabled ? <p>Marketplace setup is not available yet. You can use <Link href="/mcp/light" className="underline">public MCP Light</Link> now.</p> : <>
      {!user ? <p><Link className="font-medium text-sky-700 underline" href="/login?next=%2Fmarketplace%2Flight">Sign in or create your CertScore account</Link> to link your AWS subscription and manage its key.</p> : <p>Signed in as {user.email}.</p>}
      {claim && user && <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-xl font-medium">Link your subscription</h2>
        <p>Confirm that AWS account <strong>{claim.buyer_account_id}</strong> belongs to you or your organization. Link this subscription to {user.email}.</p>
        <MarketplaceLightAction operation="claim" label="Confirm and link subscription" />
      </section>}
      {user && !claim && licenses.length === 0 && <p>Open your subscribed product in AWS Marketplace and choose <strong>Set up your account</strong> to link it here.</p>}
      {licenses.map(license => <section key={license.license_arn} className="space-y-4 rounded-xl border p-5">
        <h2 className="text-xl font-medium">AWS account {license.buyer_account_id}</h2>
        <p>Status: {license.status}. License: <span className="break-all font-mono text-xs">{license.license_arn}</span></p>
        {license.status === "pending" && <p>AWS activation is pending. Refresh this page in a moment; no key is issued until activation is verified.</p>}
        {license.token_prefix && <p>Key: {license.token_prefix}... {license.revoked_at ? "(revoked)" : `(expires ${String(license.key_expires_at).slice(0, 10)})`}</p>}
        {license.status === "active" && <MarketplaceLightAction operation="rotate" licenseArn={license.license_arn} label={license.token_prefix ? "Replace key (invalidates previous key)" : "Create API key"} />}
        {license.token_prefix && !license.revoked_at && <MarketplaceLightAction operation="revoke" licenseArn={license.license_arn} label="Revoke key" />}
      </section>)}
    </>}
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Connect your MCP client</h2>
      <p>Add a remote Streamable HTTP server with this endpoint:</p>
      <pre className="overflow-auto rounded bg-slate-100 p-4">{MARKETPLACE_LIGHT_ENDPOINT}</pre>
      <p>Set the authentication header to <code>Authorization: Bearer YOUR_API_KEY</code>. Keys expire after 90 days. Replacing or revoking a key disables it immediately; initialize a new MCP session after replacing it.</p>
      <p>Ask your assistant to scan a public website, check progress while pending, and retrieve the result bundle and supporting evidence. Honor rate-limit responses and stop polling terminal scans.</p>
      <p><Link href="/developers/mcp" className="underline">MCP tool documentation</Link> · <a href="mailto:support@certscore.ai" className="underline">Email support</a></p>
    </section>
  </main>;
}
