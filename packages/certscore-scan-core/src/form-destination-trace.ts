import { createHmac, randomBytes } from "node:crypto";
import type { Page } from "playwright";
import { formDestinationTraceSchema, type FormDestinationTrace } from "@certscore/contracts";
import { classifyCollectionSurfaceSemanticCategory } from "./collection-surface-inventory.js";
import { getRegistrableDomain } from "./domain-utils.js";
const personal = new Set(["email", "phone", "name", "address", "date_of_birth", "health", "government_id", "social_security_number", "bank_account", "payment_card", "password", "geolocation", "free_text"]);
const safeUrl = (value: string) => { try { const u = new URL(value); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null; u.search = ""; u.hash = ""; return u.href.length <= 2048 ? u.href : null; } catch { return null; } };
const domain = (url: string) => getRegistrableDomain(new URL(url).hostname) ?? new URL(url).hostname;
type EventInput = { kind: "input" | "change" | "submit"; time: number; pageUrl: string; formIndex: number; actionUrl: string; fields: Array<{ name: string; value: string; type: string; label: string; autocomplete: string }> };
/** Raw values/bodies remain only in bounded per-session memory and are discarded on finish. */
export function createFormDestinationCollector(startedAt: number) {
  const secret = randomBytes(32);
  const events: Array<{ event: FormDestinationTrace["events"][number]; values: Array<{ name: string; value: string; fieldRef: string }> }> = [];
  const pending: Array<{ id: string; url: string; method: string; time: number; body: string | null | undefined; token: string; status: "request_observed" | "response_observed" | "failed" }> = [];
  let truncated = false, unsupportedPayloads = 0, finished = false;
  return {
    event(input: EventInput, token: string, actualPageUrl: string) {
      if (finished || input.pageUrl !== actualPageUrl || !token || !["input", "change", "submit"].includes(input.kind) || !Array.isArray(input.fields) || !Number.isFinite(input.time) || input.time < startedAt || input.time > Date.now() + 1000) return;
      const pageUrl = safeUrl(input.pageUrl), actionUrl = safeUrl(input.actionUrl);
      if (!pageUrl || !actionUrl || !Number.isInteger(input.formIndex) || input.formIndex < 0) return;
      if (events.length >= 10) { truncated = true; return; }
      if (!events.length) { const cutoff = input.time - startedAt; for (let n = pending.length - 1; n >= 0; n--) if (pending[n]!.time < cutoff) pending.splice(n, 1); }
      const i = events.length;
      const fields = input.fields.slice(0,30).map((f,j) => ({ evidenceRef: `form_trace:field:${i}:${j}`, name: String(f.name).slice(0,100), category: classifyCollectionSurfaceSemanticCategory({ inputType: String(f.type), elementType: f.type === "textarea" ? "textarea" : "input", label: String(f.label).slice(0,100), autocompleteToken: String(f.autocomplete).slice(0,100) }) })).map((f,j) => { const value = input.fields[j]?.value; return { ...f, personal: personal.has(f.category), ...(personal.has(f.category) && typeof value === "string" && value.length >= 4 && value.length <= 2048 && f.name ? { valueHmac: createHmac("sha256",secret).update(`${f.name}\0${value}`).digest("hex") } : {}) }; });
      if (!fields.some(f => f.personal)) return;
      if (input.fields.length > 30) truncated = true;
      events.push({ event: { evidenceRef: `form_trace:event:${i}`, kind: input.kind, observedAtMs: input.time - startedAt, documentUrl: pageUrl, documentToken: token, formIndex: input.formIndex, actionUrl, actionDomain: domain(actionUrl), fields },
        values: fields.flatMap((f,j) => { const value = input.fields[j]?.value; return f.personal && typeof value === "string" && value.length >= 4 && value.length <= 2048 && f.name ? [{ name: f.name, value, fieldRef: f.evidenceRef }] : []; }) });
    },
    request(id: string, url: string, method: string, time: number, body: string | null | undefined, token: string) {
      if (finished) return;
      if (pending.length >= 100) { if (events.length) { truncated = true; return; } pending.shift(); }
      if (!safeUrl(url)) return;
      if ((body?.length ?? 0) > 32768 || url.length > 8192) { truncated = true; body = null; }
      pending.push({ id, url: url.slice(0,8192), method, time, body, token, status: "request_observed" });
    },
    status(id: string, status: "response_observed" | "failed") { const request = pending.find(r => r.id === id); if (request && !finished) request.status = status; },
    finish(): FormDestinationTrace {
      finished = true;
      const requests: FormDestinationTrace["requests"] = [];
      for (const r of pending) {
        // Nearest preceding event in the same browser document; time alone never proves submission causality.
        const event = [...events].reverse().find(e => e.event.documentToken === r.token && e.event.observedAtMs <= r.time);
        if (!event) continue;
        if (r.body === undefined) unsupportedPayloads++;
        const pairs: Array<{ key: string; value: string; location: "body" | "query" }> = [...new URL(r.url).searchParams].map(([key,value])=>({key,value,location:"query"}));
        if (r.body) {
          try { const json = JSON.parse(r.body); if (json && typeof json === "object" && !Array.isArray(json)) for (const [key,value] of Object.entries(json).slice(0,100)) if (typeof value === "string") pairs.push({key,value,location:"body"}); }
          catch { if (r.body.includes("=") && !r.body.includes("\r\n")) for (const [key,value] of new URLSearchParams(r.body)) { if (pairs.length >= 100) { truncated = true; break; } pairs.push({key,value,location:"body"}); } else unsupportedPayloads++; }
        }
        const matches = event.values.flatMap(f => { const pair = pairs.find(p => p.key === f.name && p.value === f.value); return pair ? [{ fieldRef:f.fieldRef, valueHmac:createHmac("sha256",secret).update(`${f.name}\0${f.value}`).digest("hex"), location:pair.location }] : []; });
        let url = safeUrl(r.url)!;
        for (const f of event.values) url = url.replaceAll(encodeURIComponent(f.value), "REDACTED").replaceAll(f.value, "REDACTED");
        const destination = domain(r.url), pageDomain = domain(event.event.documentUrl);
        requests.push({ evidenceRef:`form_trace:request:${requests.length}`, networkRequestId:r.id, eventRef:event.event.evidenceRef, observedAtMs:r.time, url, domain:destination, method:r.method.slice(0,20), party: destination === pageDomain ? "first_party" : "third_party", outsideDeclaredDestination:destination !== event.event.actionDomain, status:r.status, relation:matches.length ? "exact_field_value_match" : "temporal_only", matches });
      }
      const result = formDestinationTraceSchema.parse({ contractVersion:"certscore.form-destination-trace.v1",mode:"passive",events:events.map(e=>e.event),requests,coverage:{ truncated,unsupportedPayloads,scope:"main_document_existing_window",activeSubmission:false } });
      events.length=0; pending.length=0; secret.fill(0);
      return result;
    },
  };
}
export async function installFormDestinationTracing(page: Page, startedAt: number, identity: () => { token: string } | undefined) {
  const collector = createFormDestinationCollector(startedAt);
  await page.exposeBinding("__certscoreFormTrace", ({ frame }, input: EventInput) => { if (frame === page.mainFrame()) collector.event(input, identity()?.token ?? "", page.url()); });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    let count = 0;
    const seen = new WeakMap<HTMLFormElement, Set<string>>();
    for (const kind of ["input", "change", "submit"] as const) document.addEventListener(kind, event => {
      if (count >= 10) return;
      const target = event.target;
      const form = target instanceof HTMLFormElement ? target : target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ? target.form : null;
      if (!form) return;
      const kinds = seen.get(form) ?? new Set<string>();
      if (kind !== "submit" && kinds.has(kind)) return;
      kinds.add(kind); seen.set(form,kinds); count++;
      const fields = Array.from(form.elements).slice(0,30).flatMap(element => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || element.disabled || ["file","password","submit","button"].includes(element.type)) return [];
        return [{ name:element.name.slice(0,100), value:element.value.slice(0,2049), type:element instanceof HTMLTextAreaElement ? "textarea" : element.type, label:(element.labels?.[0]?.textContent ?? element.name).slice(0,100), autocomplete:element.autocomplete.slice(0,100) }];
      });
      void (window as unknown as { __certscoreFormTrace: (input: unknown) => Promise<void> }).__certscoreFormTrace({kind,time:Date.now(),pageUrl:location.href,formIndex:Array.from(document.forms).indexOf(form),actionUrl:form.action || location.href,fields}).catch(()=>{});
    }, true);
  });
  return collector;
}
