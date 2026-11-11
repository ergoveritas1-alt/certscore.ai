"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import Link from "next/link";
import { BF26_CAPTCHA_ACTION,BUSINESS_TYPES,SITE_COUNTS,SUCCESS_MESSAGE } from "../../lib/promotions/black-friday";
import { ANALYTICS_CONSENT_CHANGE_EVENT } from "../../lib/analytics/consent";
import { campaignAttribution,createCampaignVisit } from "./campaign-tracking";
import { TurnstileChallenge } from "../ui/turnstile-challenge";
export function CampaignView() {
  const [recordVisit] = useState(createCampaignVisit);
  useEffect(() => {
    recordVisit("bf26_landing_view");
    // Capture a referral when the visitor opts in on the landing page, without sending another view.
    window.addEventListener(ANALYTICS_CONSENT_CHANGE_EVENT, campaignAttribution);
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGE_EVENT, campaignAttribution);
  }, [recordVisit]);
  return null;
}
export function CampaignForm({open,captchaSiteKey}:{open:boolean;captchaSiteKey?:string}) {
  const [recordVisit]=useState(createCampaignVisit);
  const [busy,setBusy]=useState(false),[success,setSuccess]=useState(false),[error,setError]=useState(""),[fields,setFields]=useState<Record<string,string>>({});
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (success || error) feedbackRef.current?.focus();
  }, [success, error]);
  const [requestId]=useState(()=>typeof crypto!=="undefined"?crypto.randomUUID():"");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy || (captchaSiteKey && !captchaToken))return;setBusy(true);setError("");setFields({});
    const form=new FormData(e.currentTarget);const tracking=campaignAttribution();
    try {
      const response=await fetch("/api/promotions/black-friday/applications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...Object.fromEntries(form),requestId,captchaToken:captchaSiteKey?captchaToken:undefined,terms:form.get("terms")==="on",marketingOptIn:form.get("marketingOptIn")==="on",analyticsConsent:tracking.consent,attribution:tracking.attribution})});
      const data=await response.json();if(!response.ok){setFields(data.fields??{});setError(data.error??"Please try again.");return;}setSuccess(true);
    }catch{setError("We couldn’t submit your application. Check your connection and try again.");}finally{
      if (captchaSiteKey) {
        setCaptchaToken("");
        setCaptchaAttempt(attempt => attempt + 1);
      }
      setBusy(false);
    }
  }
  const control="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#2563eb]";
  function input(name:string,label:string,type="text",required=true) {return <label className="block text-sm font-medium text-slate-800">{label}{!required&&" (optional)"}<input name={name} type={type} inputMode={name==="website"?"url":undefined} placeholder={name==="website"?"example.com":undefined} required={required} maxLength={name==="email"?254:name==="website"||name==="linkedIn"?300:160} autoComplete={name==="fullName"?"name":name==="email"?"email":name==="company"?"organization":name==="website"?"url":"off"} className={control} aria-invalid={!!fields[name]} aria-describedby={fields[name]?`${name}-error`:undefined}/>{fields[name]&&<span id={`${name}-error`} className="mt-1 block text-red-700">{fields[name]}</span>}</label>;}
  function select(name:string,label:string,options:readonly string[]) {return <label className="block text-sm font-medium text-slate-800">{label}<select aria-label={label} name={name} required defaultValue="" className={control} aria-invalid={!!fields[name]} aria-describedby={fields[name]?`${name}-error`:undefined}><option value="" disabled>Select an option</option>{options.map(v=><option key={v}>{v}</option>)}</select>{fields[name]&&<span id={`${name}-error`} className="mt-1 block text-red-700">{fields[name]}</span>}</label>;}
  if(success)return <div ref={feedbackRef} tabIndex={-1} role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-8 text-lg leading-8 text-blue-950">{SUCCESS_MESSAGE}<p className="mt-4 text-sm">If approved, you’ll receive an email with a link to activate Pro within 14 days. If you already applied, we’ll use your existing application.</p></div>;
  if(!open)return <div role="status" className="rounded-2xl bg-slate-100 p-8">Applications are currently closed. Existing applications and approved invitations remain valid under their original terms.</div>;
  return <form onSubmit={submit} onFocusCapture={()=>recordVisit("bf26_form_start")} data-analytics-submit="manual" data-analytics-form="bf26_application" className="space-y-6">
    <p className="text-sm text-slate-600">All fields are required unless marked optional. No account or credit card is needed.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      {input("fullName","Full name")}
      {input("email","Email address","email")}
      {input("company","Company")}
      {input("website","Company website")}
      {select("businessType","Company type",BUSINESS_TYPES)}
      {select("clientSites","Websites you manage, oversee or advise on",SITE_COUNTS)}
    </div>
    <label className="block text-sm font-medium text-slate-800">Primary intended use of CertScore.ai<textarea name="intendedUse" placeholder="e.g., Reviewing client websites before launch, checking consent behavior, or adding privacy checks to maintenance plans." required rows={3} maxLength={600} className={control} aria-invalid={!!fields.intendedUse} aria-describedby={fields.intendedUse?"intendedUse-error":undefined}/>{fields.intendedUse&&<span id="intendedUse-error" className="text-red-700">{fields.intendedUse}</span>}</label>
    {input("linkedIn","LinkedIn profile","url",false)}
    <label className="block text-sm font-medium text-slate-800">Additional comments (optional)<textarea name="comments" rows={3} maxLength={1500} className={control}/></label>
    <input type="text" name="websiteConfirm" autoComplete="off" hidden inert />
    <label className="flex items-start gap-3 text-sm leading-6"><input name="terms" type="checkbox" required className="mt-1 h-5 w-5 shrink-0"/><span>I agree to the <Link className="underline" href="/black-friday#terms" target="_blank">promotional terms</Link> and acknowledge the <Link className="underline" href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
    <label className="flex items-start gap-3 text-sm leading-6"><input name="marketingOptIn" type="checkbox" className="mt-1 h-5 w-5 shrink-0"/><span>Send me occasional CertScore.ai product and marketing emails (optional). This does not affect eligibility.</span></label>
    {captchaSiteKey && <TurnstileChallenge key={captchaAttempt} siteKey={captchaSiteKey} action={BF26_CAPTCHA_ACTION} requestId={requestId} token={captchaToken} onToken={setCaptchaToken}/>}
    {error&&<div ref={feedbackRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}
    <button disabled={busy || Boolean(captchaSiteKey && !captchaToken)} className="w-full rounded-xl bg-[#1d4ed8] px-6 py-4 font-semibold text-white hover:bg-[#1e40af] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1d4ed8] disabled:opacity-60">{busy?"Submitting application…":"Submit Application"}</button>
    <p className="text-xs leading-5 text-slate-500">We use your application to review eligibility and send operational updates.</p>
  </form>;
}
