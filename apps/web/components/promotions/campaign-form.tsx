"use client";
import { useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { BUSINESS_TYPES,SITE_COUNTS,SUCCESS_MESSAGE } from "../../lib/promotions/black-friday";
import { campaignAttribution,createCampaignVisit } from "./campaign-tracking";
export function CampaignView() {const [recordVisit]=useState(createCampaignVisit);useEffect(()=>recordVisit("bf26_landing_view"),[recordVisit]);return null;}
export function CampaignForm({open}:{open:boolean}) {
  const [recordVisit]=useState(createCampaignVisit);
  const [busy,setBusy]=useState(false),[success,setSuccess]=useState(false),[error,setError]=useState(""),[fields,setFields]=useState<Record<string,string>>({});
  const [requestId]=useState(()=>typeof crypto!=="undefined"?crypto.randomUUID():"");
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;setBusy(true);setError("");setFields({});
    const form=new FormData(e.currentTarget);const tracking=campaignAttribution();
    try {
      const response=await fetch("/api/promotions/black-friday/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(form),requestId,terms:form.get("terms")==="on",marketingOptIn:form.get("marketingOptIn")==="on",analyticsConsent:tracking.consent,attribution:tracking.attribution})});
      const data=await response.json();if(!response.ok){setFields(data.fields??{});setError(data.error??"Please try again.");return;}setSuccess(true);
    }catch{setError("We couldn’t submit your application. Check your connection and try again.");}finally{setBusy(false);}
  }
  const control="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#367150]";
  function input(name:string,label:string,type="text",required=true) {return <label className="block text-sm font-medium text-slate-800">{label}{!required&&" (optional)"}<input name={name} type={type} required={required} maxLength={name==="email"?254:name==="website"||name==="linkedIn"?300:160} autoComplete={name==="fullName"?"name":name==="email"?"email":name==="company"?"organization":"off"} className={control} aria-invalid={!!fields[name]} aria-describedby={fields[name]?`${name}-error`:undefined}/>{fields[name]&&<span id={`${name}-error`} className="mt-1 block text-red-700">{fields[name]}</span>}</label>;}
  function select(name:string,label:string,options:readonly string[]) {return <label className="block text-sm font-medium text-slate-800">{label}<select aria-label={label} name={name} required defaultValue="" className={control} aria-invalid={!!fields[name]} aria-describedby={fields[name]?`${name}-error`:undefined}><option value="" disabled>Select an option</option>{options.map(v=><option key={v}>{v}</option>)}</select>{fields[name]&&<span id={`${name}-error`} className="mt-1 block text-red-700">{fields[name]}</span>}</label>;}
  if(success)return <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-lg leading-8 text-emerald-950">{SUCCESS_MESSAGE}<p className="mt-4 text-sm">If this is a new eligible application, we’ll send a confirmation. If you applied before, we keep your existing application and another email may not be sent.</p></div>;
  if(!open)return <div role="status" className="rounded-2xl bg-slate-100 p-8">Applications are currently closed. Existing applications and approved invitations remain valid under their original terms.</div>;
  return <form onSubmit={submit} onFocusCapture={()=>recordVisit("bf26_form_start")} data-analytics-submit="manual" data-analytics-form="bf26_application" className="space-y-6">
    <p className="text-sm text-slate-600">All fields are required unless marked optional. No account or credit card is needed.</p>
    <div className="grid gap-5 sm:grid-cols-2">{input("fullName","Full name")}{input("email","Business email","email")}{input("company","Organization name")}{input("website","Organization website","url")}{select("businessType","Organization type",BUSINESS_TYPES)}{select("clientSites","Websites you manage, oversee or advise on",SITE_COUNTS)}</div>
    <label className="block text-sm font-medium text-slate-800">Primary intended use of CertScore.ai<textarea name="intendedUse" required rows={3} maxLength={600} className={control} aria-invalid={!!fields.intendedUse}/>{fields.intendedUse&&<span className="text-red-700">{fields.intendedUse}</span>}</label>
    {input("linkedIn","LinkedIn profile","url",false)}
    <label className="block text-sm font-medium text-slate-800">Additional comments (optional)<textarea name="comments" rows={3} maxLength={1500} className={control}/></label>
    <div className="hidden" aria-hidden="true"><label>Leave this empty<input name="websiteConfirm" autoComplete="off" tabIndex={-1}/></label></div>
    <label className="flex items-start gap-3 text-sm leading-6"><input name="terms" type="checkbox" required className="mt-1 h-5 w-5 shrink-0"/><span>I agree to the <Link className="underline" href="/black-friday#terms" target="_blank">promotional terms</Link> and acknowledge the <Link className="underline" href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
    <label className="flex items-start gap-3 text-sm leading-6"><input name="marketingOptIn" type="checkbox" className="mt-1 h-5 w-5 shrink-0"/><span>Send me occasional CertScore.ai product and marketing emails (optional). This does not affect eligibility.</span></label>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    <button disabled={busy} className="w-full rounded-xl bg-[#235b41] px-6 py-4 font-semibold text-white hover:bg-[#163f2c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#235b41] disabled:opacity-60">{busy?"Submitting application…":"Submit Application"}</button>
    <p className="text-xs leading-5 text-slate-500">We use your application to review eligibility and send operational updates.</p>
  </form>;
}
