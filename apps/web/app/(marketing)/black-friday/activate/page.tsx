import { cookies } from "next/headers";
import { getCurrentUser } from "../../../../server/auth";
import { SiteHeader } from "../../../../components/layout/site-header";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { CampaignActivation } from "../../../../components/promotions/campaign-activation";
export const dynamic="force-dynamic";
export const metadata={title:"Activate your CertScore.ai Pro invitation",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function ActivatePage(){const user=await getCurrentUser();return <main className="min-h-screen bg-slate-50"><SiteHeader/><section className="mx-auto max-w-2xl px-6 py-16"><h1 className="mb-8 text-4xl font-semibold">Your Pro invitation</h1><div className="rounded-2xl border bg-white p-8"><CampaignActivation signedIn={!!user} hasInvite={!!(await cookies()).get("bf26-invite")}/></div></section><SiteFooter highContrast/></main>;}
