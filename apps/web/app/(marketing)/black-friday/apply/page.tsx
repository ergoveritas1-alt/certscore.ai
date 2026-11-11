import Link from "next/link";
import { SiteHeader } from "../../../../components/layout/site-header";
import { SiteFooter } from "../../../../components/layout/site-footer";
import { CampaignForm } from "../../../../components/promotions/campaign-form";
import { campaignStore } from "../../../../server/promotions/repository";
import { createPageMetadata } from "../../../../lib/seo";
export const dynamic="force-dynamic";
export const metadata=createPageMetadata({title:"Apply for complimentary Pro — Black Friday 2026",description:"Apply for three months of CertScore.ai Pro. A separate promotion for qualified U.S. businesses, with no account or credit card required.",path:"/black-friday/apply"});
export default async function ApplyPage(){const availability=await campaignStore.availability().catch(()=>null);return <main className="min-h-screen bg-slate-50"><SiteHeader/><section className="mx-auto max-w-3xl px-6 py-12"><Link href="/black-friday" className="text-sm text-indigo-700">← Back to the offer</Link><p className="mt-8 text-xs font-bold tracking-widest text-indigo-600">BLACK FRIDAY 2026</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Apply for Free Pro Access</h1><p className="mt-4 leading-7 text-slate-600">Three months. 1,000 page scans per month. Ten qualified businesses. Applications are reviewed in submission order.</p><div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-9"><CampaignForm open={availability?.open??false}/></div></section><SiteFooter highContrast/></main>;}
