"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import {
  sendPrivacyRequestAction,
  type SendPrivacyRequestActionState
} from "../../server/privacy-request/send-privacy-request";

export function PrivacyRequestForm() {
  const initialState: SendPrivacyRequestActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendPrivacyRequestAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyRequestType">
            Request type
          </label>
          <select
            id="privacyRequestType"
            name="requestType"
            defaultValue="access"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            <option value="access">Access my data</option>
            <option value="delete">Delete my data</option>
            <option value="correct">Correct my data</option>
            <option value="portability">Portability / export</option>
            <option value="object">Object or restrict processing</option>
            <option value="opt-out">Opt out of sale/share or marketing</option>
            <option value="other">Other privacy request</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyJurisdiction">
            Jurisdiction
          </label>
          <select
            id="privacyJurisdiction"
            name="jurisdiction"
            defaultValue="other"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            <option value="other">Not sure / other</option>
            <option value="gdpr">GDPR / EEA</option>
            <option value="uk-gdpr">UK GDPR</option>
            <option value="ccpa-cpra">CCPA / CPRA / CIPA</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyFullName">
            Full name <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="privacyFullName" name="fullName" placeholder="Your name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyEmail">
            Email
          </label>
          <Input id="privacyEmail" name="email" placeholder="name@company.com" type="email" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyOrganization">
            Company or organization <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="privacyOrganization" name="organization" placeholder="Company name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="privacyCountryOrState">
            Country or state <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="privacyCountryOrState" name="countryOrState" placeholder="California, Germany, United Kingdom" type="text" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="privacyVerificationStatus">
          How should we verify the request?
        </label>
        <select
          id="privacyVerificationStatus"
          name="verificationStatus"
          defaultValue="account-email"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        >
          <option value="account-email">Reply to the email already associated with my CertScore.ai account</option>
          <option value="alternate-email">I am using another email and can provide additional verification</option>
          <option value="authorized-agent">I am an authorized agent submitting on someone else&apos;s behalf</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="privacyIdentifiers">
          Relevant identifiers <span className="text-slate-400">(optional)</span>
        </label>
        <Input
          id="privacyIdentifiers"
          name="identifiers"
          placeholder="Account email, organization name, domain, prior ticket ID, or other identifiers"
          type="text"
        />
        <p className="text-xs text-slate-500">Include the account email, scanned domain, or other context that helps us locate the relevant records.</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="privacyDetails">
          Request details
        </label>
        <textarea
          id="privacyDetails"
          name="details"
          placeholder="Describe what you want to access, delete, correct, export, or object to. Include date ranges or systems if you know them."
          rows={8}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        We may ask for proportionate verification before completing a request. Existing account holders can speed this up by submitting from the email tied to their CertScore.ai account.
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Submitting..." : "Submit privacy request"}
      </Button>
    </form>
  );
}
