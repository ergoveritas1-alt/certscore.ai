"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import { pushLeadFormSubmitAttempted } from "../analytics/data-layer-events";
import {
  sendMonitorSiteRequestAction,
  type SendMonitorSiteRequestActionState
} from "../../server/monitor-site/send-monitor-site-request";

type MonitorSiteFormProps = {
  defaultWebsite?: string;
  sourceContext?: string;
  sourcePageUrl?: string;
  sourcePlan?: string;
  sourceReportUrl?: string;
};

export function MonitorSiteForm({
  defaultWebsite = "",
  sourceContext = "",
  sourcePageUrl = "",
  sourcePlan = "",
  sourceReportUrl = ""
}: MonitorSiteFormProps) {
  const initialState: SendMonitorSiteRequestActionState = {
    error: null
  };
  const [state, action, isPending] = useActionState(sendMonitorSiteRequestAction, initialState);

  return (
    <form action={action} className="space-y-5" onSubmit={() => pushLeadFormSubmitAttempted("monitor_request")}>
      <input name="sourceContext" type="hidden" value={sourceContext} />
      <input name="sourcePageUrl" type="hidden" value={sourcePageUrl} />
      <input name="sourcePlan" type="hidden" value={sourcePlan} />
      <input name="sourceReportUrl" type="hidden" value={sourceReportUrl} />
      <input
        autoComplete="off"
        className="hidden"
        name="companyWebsite"
        tabIndex={-1}
        type="text"
      />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteWorkEmail">
            Work email
          </label>
          <Input id="monitorSiteWorkEmail" name="workEmail" placeholder="name@company.com" type="email" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteWebsite">
            Website to monitor
          </label>
          <Input
            defaultValue={defaultWebsite}
            id="monitorSiteWebsite"
            name="website"
            placeholder="example.com"
            type="text"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteFullName">
            Full name <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="monitorSiteFullName" name="fullName" placeholder="Your name" type="text" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteCompany">
            Company <span className="text-slate-400">(optional)</span>
          </label>
          <Input id="monitorSiteCompany" name="company" placeholder="Company name" type="text" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteInterest">
          Monitoring interest
        </label>
        <select
          id="monitorSiteInterest"
          name="monitoringGoal"
          defaultValue="changes"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        >
          <option value="changes">Tracking, consent, accessibility</option>
          <option value="pre-consent-tracking">Pre-consent tracking changes</option>
          <option value="cookies">Cookie and third-party request changes</option>
          <option value="accessibility">Accessibility review changes</option>
          <option value="vendor-review">Vendor or diligence monitoring</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="monitorSiteMessage">
          Notes <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          id="monitorSiteMessage"
          name="message"
          placeholder="Tell us what changed, how often you want review, or which findings you care about most."
          rows={5}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
        />
        <p className="text-xs leading-5 text-slate-500">
          Submitting this form creates a pending monitoring request. CertScore reviews requests before activation and follow-up.
        </p>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <Button disabled={isPending} type="submit">
        {isPending ? "Sending..." : "Request monitoring follow-up"}
      </Button>
    </form>
  );
}
