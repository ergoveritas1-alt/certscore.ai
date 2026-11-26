import { boundOptOutControlSchema } from "./explicit-opt-out-control";
import { z } from "zod";

export const TOOM_ACCEPT_SELECTOR = '#usercentrics-root #uc-center-container button[data-testid="uc-accept-all-button"]';

/** Native DOM identity read from the same CDP backend node as an AX record.
 * This is corroborating observation provenance, never an action authorization. */
export const consentAccessibilityDomBindingSchema = z.object({
  version: z.enum(["ax_backend_dom_binding.v1", "ax_backend_dom_binding.v2", "ax_backend_dom_binding.v4", "ax_backend_dom_binding.v5", "ax_backend_dom_binding.v6"]),
  verifiedButtonSelector: z.union([z.string().regex(/^#[A-Za-z][A-Za-z0-9_-]{0,79}$/), z.literal(TOOM_ACCEPT_SELECTOR)]).optional(),
  optOutControl: boundOptOutControlSchema.optional(),
  axNodeId: z.string().min(1).max(80),
  backendNodeId: z.number().int().positive().max(2_147_483_647),
  nodeType: z.literal(1),
  tagName: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  documentUrl: z.string().url().max(2048),
  documentIdentity: z.object({source: z.literal("cdp_loader_id"), token: z.string().min(1).max(160)}).strict(),
}).strict().superRefine((row,ctx)=>{
  const cookieScript = row.verifiedButtonSelector === "#cookiescript_accept" || row.verifiedButtonSelector === "#cookiescript_reject";
  const bindingMatches = row.version === "ax_backend_dom_binding.v4" ? cookieScript && row.tagName === "div" :
    row.version === "ax_backend_dom_binding.v5" ? Boolean(row.verifiedButtonSelector) && row.verifiedButtonSelector !== TOOM_ACCEPT_SELECTOR && row.tagName === "button" :
    row.version === "ax_backend_dom_binding.v6" ? row.documentUrl === "https://toom.de/" &&
      row.verifiedButtonSelector === TOOM_ACCEPT_SELECTOR && row.tagName === "button" :
    row.verifiedButtonSelector === undefined;
  if (!bindingMatches)
    ctx.addIssue({code:"custom",message:"The selector must match the reviewed button type and binding version."});
  if((row.version === "ax_backend_dom_binding.v2") !== Boolean(row.optOutControl) || row.optOutControl && row.optOutControl.selector.split(/[.#]/)[0]!==row.tagName)
    ctx.addIssue({code:"custom",message:"Opt-out metadata must bind the native element under v2."});
});

export type ConsentAccessibilityDomBinding = z.infer<typeof consentAccessibilityDomBindingSchema>;
