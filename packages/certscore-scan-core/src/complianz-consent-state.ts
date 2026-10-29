import { captureExactCookieWrite } from "./exact-cookie-write-capture.js";
import { createHash } from "node:crypto";
import { COMPLIANZ_OPTIONAL_CATEGORIES, complianzConfigurationSchema, complianzReceiptEvidenceSchema,
  complianzReceiptDecision, type ConsentConfirmationReason } from "@certscore/contracts";
import type { Locator, BrowserContext } from "playwright";
import type { ActionStateWrite, SemanticState } from "./consent-action-semantic-state";
const sha = (value:string) => createHash("sha256").update(value).digest("hex");
type Cookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];
/** No cookie defaults, incomplete universes, service overrides or stale values.
 * Browser readback and all three exact instrumented writes are required. */
export function verifyComplianzReceipt(input:{configuration:unknown; documentUrl:string; cookies:Cookie[];
  writes:ActionStateWrite[]; actionAt:number; readAt:number; onDiagnostic?:(reason:ConsentConfirmationReason)=>void}): SemanticState | undefined {
  const fail = (reason:ConsentConfirmationReason) => {input.onDiagnostic?.(reason);return undefined;};
  const configuration = complianzConfigurationSchema.safeParse(input.configuration);
  if (!configuration.success) return fail("configuration_unverifiable");
  const names = [...COMPLIANZ_OPTIONAL_CATEGORIES, "functional", "consented_services"];
  const cookies:Cookie[] = [];
  for (const name of names) {
    const matches = input.cookies.filter(row => row.name === `cmplz_${name}`);
    if (matches.length !== 1) return fail(matches.length ? "receipt_ambiguous" : "group_universe_incomplete");
    cookies.push(matches[0]!);
  }
  const scope = (cookie:Cookie) => JSON.stringify([cookie.domain,cookie.path,cookie.partitionKey ?? null]);
  if (cookies.some(cookie => scope(cookie) !== scope(cookies[0]!) || cookie.httpOnly)) return fail("receipt_ambiguous");
  const identity = (cookie:Cookie) => sha(JSON.stringify(["cookie_name_domain_path_partition",cookie.domain.toLowerCase().replace(/^\./,""),cookie.path,cookie.partitionKey ?? "",cookie.name]));
  if (cookies[3]!.value !== "allow" || cookies[4]!.value !== "") return fail("receipt_format_unsupported");
  const categories = [];
  for (let index=0;index<3;index++) {
    const cookie=cookies[index]!;
    if (cookie.value !== "allow" && cookie.value !== "deny") return fail("receipt_malformed");
    const write=[...input.writes].reverse().find(row=>row.storageType==="cookie" && row.name===cookie.name);
    if (!write || write.observedAtEpochMs < input.actionAt || write.observedAtEpochMs > input.readAt) return fail("no_fresh_decision");
    const exact = write.cookieAssignment && write.documentUrl === input.documentUrl
      ? captureExactCookieWrite({assignment:write.cookieAssignment,url:write.documentUrl,
        observedAtMs:Math.round(write.observedAtEpochMs),source:"main_document_setter"}) : undefined;
    if (!exact || exact.identityHash !== identity(cookie) || exact.valueHash !== sha(cookie.value)) return fail("receipt_identity_changed");
    if (write.value !== cookie.value) return fail("receipt_readback_mismatch");
    categories.push({category:COMPLIANZ_OPTIONAL_CATEGORIES[index]!,value:cookie.value,
      identitySha256:identity(cookie),valueSha256:sha(cookie.value),writtenAtEpochMs:Math.round(write.observedAtEpochMs)});
  }
  const parsed = complianzReceiptEvidenceSchema.safeParse({policyVersion:"complianz_complete_categories.v1",
    writeBinding:"exact_document_cookie_assignment",configuration:configuration.data, documentSha256:sha(input.documentUrl), cookieScopeSha256:sha(scope(cookies[0]!)),
    stateSha256:sha(JSON.stringify(cookies.map(cookie=>[identity(cookie),sha(cookie.value)]))),
    readAtEpochMs:input.readAt,categories,functional:{value:"allow",identitySha256:identity(cookies[3]!)},
    services:{value:"",identitySha256:identity(cookies[4]!)}});
  if (!parsed.success) return fail("category_proof_invalid");
  const proof = parsed.data;
  return {key:"cmplz_complete_categories", stateHash:proof.stateSha256, decision:complianzReceiptDecision(proof),
    observedAtEpochMs:Math.max(...categories.map(row=>row.writtenAtEpochMs)),complianzReceiptEvidence:proof};
}

/** Bind the generic authorized control to the loaded Complianz first layer. */
export async function isComplianzControl(control:Locator):Promise<boolean> {
  return control.evaluate(element => Boolean(element.isConnected && element.closest(".cmplz-cookiebanner .cmplz-buttons")))
    .catch(()=>false);
}
