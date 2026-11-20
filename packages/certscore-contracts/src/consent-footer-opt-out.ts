import {z} from "zod";
import {EXPLICIT_SALE_SHARING_LAUNCHER_LABEL, namesPrivacyChoiceEntrance} from "./explicit-opt-out-control";

export const consentFooterOptOutLimitations = ["no_footer_landmark", "traversal_limited", "controls_limited",
  "opaque_footer_content", "document_not_complete", "deadline", "unverified_control", "scroll_restore_failed", "unsupported_control_name"] as const;
const coord = z.number().finite().min(-10000000).max(10000000);
export const FOOTER_SHORT_OPT_OUT_LABEL_PATTERN = /^do not sell my (?:information|info|data)$/i;
// Navigation wording qualified only for structurally bound footer anchors.
export const FOOTER_LINK_OPT_OUT_LABEL_PATTERN =
  /^do not sell(?:\s*\/\s*share my personal information| or share my personal information \(opens in a new tab\))$/i;
export const FOOTER_ABBREVIATED_OPT_OUT_LABEL = "do not sell or share";
export const FOOTER_PRIVACY_ROUTE_PATH_PATTERN = /^\/(?:privacy-rights|privacy-choices|do-not-sell(?:-or-share)?)\/?$/;
export const FOOTER_PRIVACY_CHOICES_WITH_TAB_NOTICE =
  /^(your (?:california )?privacy choices)(?:\s*,\s*opens in a new tab| \(opens in a new tab\))$/i;
export const FOOTER_TAB_NOTICE_PRIVACY_PATH = /^\/(?:your-privacy-choices|privacy-choices|privacy-rights)\/?$/;
export const FOOTER_STATE_PRIVACY_LABEL = "your state-specific privacy choices";
export const FOOTER_STATE_PRIVACY_PATH = "/apps/privacy/regions";
export const FOOTER_SALE_AND_ADS_LABEL_PATTERN =
  /^do not sell or share my personal information\s*\/\s*opt[- ]out of targeted advertising$/i;
export const FOOTER_SALE_AND_ADS_PATH = "/policies/your-privacy-rights-opt-out";
export const FOOTER_PRIVACY_POLICY_PATH = /^\/privacy-policy(?:\/privacy-policy)?\/?$/;
export const FOOTER_COOKIE_POLICY_PATH = "/legal/cookie-and-similar-technologies-policy";
export const ONETRUST_FOOTER_SETTINGS_ID_SELECTOR = "#ot-sdk-btn";
export const ONETRUST_ALTERNATE_FOOTER_SETTINGS_ID_SELECTOR = "#ot-sdk-btn1";
export const FOOTER_ROKU_PRIVACY_CHOICES_LABEL = "my privacy choices";
export const FOOTER_ROKU_PRIVACY_CHOICES_URL = "https://privacy.roku.com/ccpa";
export const FOOTER_COOKIE_PREFERENCES_SALE_LABEL = "cookie preferences / do not sell";
export const FOOTER_REGISTER_CA_POLICY_PATH = "/Profile/privacy_policy_california_residents/";
export const FOOTER_SELL_DATA_LABEL = "do not sell my data";
export const FOOTER_CA_PREFIXED_SALE_LABEL_PATTERN = /^ca:\s*do not sell my personal information$/i;
export const FOOTER_WOOT_ADS_CHOICES_URL = "https://www.woot.com/privacy-settings?ref=w_ngf_privsett";
export const FOOTER_HEARST_SALE_ADS_LABEL = "your privacy choices: opt out of sale/targeted ads";
export const FOOTER_HEARST_SALE_ADS_LINK_PATTERN = /^your privacy choices\s*\/\s*\(opt-out of sale\s*\/\s*targeted ads\)$/i;
export const FOOTER_HEARST_SALE_ADS_LINK_PATH = "/yourdata";
export const FOOTER_CONTRACTED_SALE_LABEL_PATTERN = /^don['’]t sell my info$/i;
export const FOOTER_SENSITIVE_DATA_LABEL = "do not sell or share my personal information and limit the use of my sensitive personal information";
export const FOOTER_SENSITIVE_DATA_WEBFORM_LABEL = "do not sell or share my personal information or limit use of my sensitive personal information";
export const FOOTER_SALE_SHARING_REQUEST_LABEL = "do not sell or share my personal information";
export const FOOTER_SALE_SHARING_REQUEST_PATH = "/legal/do-not-sell-my-personal-information";
export const FOOTER_SLASH_SALE_BUTTON_LABEL = /^do not sell\s*\/\s*share my personal information$/i;
export const FOOTER_SLASH_SALE_FORM_LABEL = /^do not sell\s*\/\s*share my information$/i;
export const FOOTER_SLASH_SALE_FORM_PATH = "/about/legal/privacy/form/";
export const FOOTER_SHORT_SALE_SHARING_LABEL = /^do not sell or share my (?:info|information)$/i;
export const FOOTER_DATA_PRIVACY_PREFERENCES_PATH = "/data-privacy-preferences";
export const AEM_FOOTER_SHARING_PREFERENCES_PATH = "/sharing-preferences.html";
export const ENSIGHTEN_FOOTER_REVEAL_MAX_MS = 2050;
export const ONETRUST_CUSTOM_FOOTER_REVEAL_MAX_MS = 1050;
export const ADS_PRIVACY_CHOICES_LABEL = "your ads privacy choices";
export const footerStripSelectors = {
  funding_choices_dns: ".fc-dns-link",
  ezoic_ccpa: "#ez-ccpa-reject-all",
  consumer_privacy_footer: ".consumer-privacy-footer-btn",
} as const;
export const footerChoiceScopeByWitness = {
  amazon_ads_privacy_choices: "ads_privacy",
  woot_ads_privacy_choices: "ads_privacy",
  ca_prefixed_sale_link: "california_privacy",
  hearst_sale_ads_handler: "sale_sharing_and_targeted_advertising",
  hearst_sale_ads_link: "sale_and_targeted_advertising",
  sale_sharing_and_sensitive_data: "sale_sharing_and_sensitive_data",
  onetrust_sensitive_data_webform: "sale_sharing_and_sensitive_data",
  state_privacy_choices: "state_privacy",
  sale_sharing_and_targeted_advertising: "sale_sharing_and_targeted_advertising",
} as const;
export function footerChoiceScopeForWitness(witness: string | undefined) {
  return witness && Object.hasOwn(footerChoiceScopeByWitness, witness)
    ? footerChoiceScopeByWitness[witness as keyof typeof footerChoiceScopeByWitness] : undefined;
}
const visibility = z.object({
  visibility: z.enum(["rendered_exposed", "covered", "offscreen_unverified", "hidden", "unverified"]),
  view: z.enum(["original", "footer_position"]),
  bounds: z.tuple([coord, coord, coord.nonnegative(), coord.nonnegative()]),
  testedPoints: z.number().int().min(0).max(5), matchingPoints: z.number().int().min(0).max(5),
  occludingPoints: z.number().int().min(0).max(5),
  iframeOccludingPoints: z.number().int().positive().max(5).optional(),
}).strict();
function checkVisibility(c: z.infer<typeof visibility>, ctx: z.RefinementCtx) {
  const area = c.bounds[2] > 0 && c.bounds[3] > 0;
  if (c.matchingPoints + c.occludingPoints > c.testedPoints || (c.iframeOccludingPoints ?? 0) > c.occludingPoints ||
      c.visibility === "rendered_exposed" && (!area || c.matchingPoints === 0) ||
      c.visibility === "covered" && (!area || c.testedPoints === 0 || c.occludingPoints !== c.testedPoints) ||
      c.visibility === "offscreen_unverified" && (!area || c.testedPoints !== 0) ||
      c.visibility === "hidden" && c.testedPoints !== 0)
    ctx.addIssue({code:"custom",message:"Footer control geometry and pointer samples must support its visibility."});
}
const checkpoint = visibility.extend({
  phase: z.enum(["initial", "positioned", "settled", "alternate", "reveal"]),
  elapsedMs: z.number().int().nonnegative().max(ENSIGHTEN_FOOTER_REVEAL_MAX_MS),
  scrollX: coord, scrollY: coord,
}).strict().superRefine((row, ctx) => {
  checkVisibility(row,ctx);
  if (row.phase !== "reveal" && row.elapsedMs > 175)
    ctx.addIssue({code:"custom",message:"Ordinary footer checkpoints must stay within the ordinary capture window."});
});
const candidate = visibility.extend({
  evidenceId: z.string().regex(/^footer-control-[0-9]{1,3}$/).max(32),
  label: z.string().min(1).max(120),
  scope: z.enum(["footer", "contentinfo", "footer_strip", "legal_footer_navigation", "namespaced_legal_footer", "custom_legal_footer"]),
  semanticRole: z.enum(["link", "button", "settings_control"]),
  placementWitness: z.enum(["funding_choices_dns", "funding_choices_ipr", "ezoic_ccpa", "consumer_privacy_footer"]).optional(),
  controlWitness: z.enum(["onetrust_visible_label", "onetrust_no_href_anchor", "abbreviated_privacy_route", "amazon_ads_privacy_choices",
    "privacy_choices_tab_notice", "state_privacy_choices", "sale_sharing_and_targeted_advertising", "named_privacy_policy_entrance", "roku_privacy_choices", "cookie_preferences_do_not_sell",
    "onetrust_footer_sell_data", "quantcast_footer_sell_data", "ca_prefixed_sale_link", "mspa_footer_handler", "woot_ads_privacy_choices",
    "quantcast_persistent_anchor", "hal_leonard_footer_handler", "hearst_sale_ads_handler", "sale_sharing_and_sensitive_data",
    "mspa_footer_contracted_sale_handler", "hearst_sale_ads_link", "onetrust_sensitive_data_webform", "onetrust_footer_text_trigger",
    "onetrust_form_footer_settings", "sale_sharing_subject_access_request", "onetrust_footer_slash_sale_settings",
    "footer_slash_sale_form_link", "usercentrics_footer_sale_settings", "didomi_footer_settings", "footer_data_privacy_preferences_link",
    "footer_sale_sharing_settings_anchor", "aem_footer_sharing_preferences_link", "onetrust_reveal_footer_settings",
    "ensighten_footer_settings_anchor", "footer_sale_sharing_dialog_anchor", "footer_sale_sharing_dialog_notice",
    "onetrust_custom_legal_footer_settings"]).optional(),
  checkpoints: z.array(checkpoint).min(2).max(4).optional(),
}).strict().superRefine((c, ctx) => {
  checkVisibility(c, ctx);
  const label = c.label.trim().toLowerCase().replace(/\s+/g, " ");
  const noHref = c.controlWitness === "onetrust_no_href_anchor";
  const custom = c.controlWitness === "onetrust_visible_label" || noHref || c.controlWitness === "cookie_preferences_do_not_sell" ||
    c.controlWitness === "quantcast_footer_sell_data" || c.controlWitness === "mspa_footer_handler" ||
    c.controlWitness === "quantcast_persistent_anchor" || c.controlWitness === "hal_leonard_footer_handler" ||
    c.controlWitness === "hearst_sale_ads_handler" || c.controlWitness === "mspa_footer_contracted_sale_handler" ||
    c.controlWitness === "onetrust_footer_text_trigger" || c.controlWitness === "onetrust_form_footer_settings" ||
    c.controlWitness === "onetrust_footer_slash_sale_settings" || c.controlWitness === "usercentrics_footer_sale_settings" ||
    c.controlWitness === "didomi_footer_settings" || c.controlWitness === "footer_sale_sharing_settings_anchor" ||
    c.controlWitness === "onetrust_reveal_footer_settings" || c.controlWitness === "ensighten_footer_settings_anchor" ||
    c.controlWitness === "footer_sale_sharing_dialog_anchor" || c.controlWitness === "footer_sale_sharing_dialog_notice" ||
    c.controlWitness === "onetrust_custom_legal_footer_settings";
  const namedLink = c.semanticRole === "link";
  let validLabel: boolean;
  switch (c.controlWitness) {
    case "amazon_ads_privacy_choices":
    case "woot_ads_privacy_choices": validLabel = namedLink && label === ADS_PRIVACY_CHOICES_LABEL; break;
    case "abbreviated_privacy_route": validLabel = namedLink && label === FOOTER_ABBREVIATED_OPT_OUT_LABEL; break;
    case "privacy_choices_tab_notice": validLabel = namedLink && FOOTER_PRIVACY_CHOICES_WITH_TAB_NOTICE.test(label); break;
    case "state_privacy_choices": validLabel = namedLink && label === FOOTER_STATE_PRIVACY_LABEL; break;
    case "sale_sharing_and_targeted_advertising": validLabel = namedLink && FOOTER_SALE_AND_ADS_LABEL_PATTERN.test(label); break;
    case "named_privacy_policy_entrance":
      validLabel = namedLink && (label === "your privacy choices" && c.scope === "legal_footer_navigation" ||
        label === "do not share my personal information" && c.scope === "footer"); break;
    case "roku_privacy_choices": validLabel = namedLink && label === FOOTER_ROKU_PRIVACY_CHOICES_LABEL; break;
    case "cookie_preferences_do_not_sell":
      validLabel = c.scope === "legal_footer_navigation" && label === FOOTER_COOKIE_PREFERENCES_SALE_LABEL; break;
    case "onetrust_no_href_anchor": validLabel = namesPrivacyChoiceEntrance(label); break;
    case "onetrust_footer_sell_data": validLabel = c.semanticRole === "button" && c.scope === "footer" && label === FOOTER_SELL_DATA_LABEL; break;
    case "quantcast_footer_sell_data":
      validLabel = c.scope === "legal_footer_navigation" && label === FOOTER_SELL_DATA_LABEL; break;
    case "ca_prefixed_sale_link":
      validLabel = namedLink && c.scope === "legal_footer_navigation" && FOOTER_CA_PREFIXED_SALE_LABEL_PATTERN.test(label); break;
    case "mspa_footer_handler":
      validLabel = c.scope === "footer" && label === "do not sell or share my personal information"; break;
    case "quantcast_persistent_anchor":
    case "hal_leonard_footer_handler":
      validLabel = c.scope === "legal_footer_navigation" && label === "your privacy choices"; break;
    case "hearst_sale_ads_handler":
      validLabel = c.scope === "legal_footer_navigation" && label === FOOTER_HEARST_SALE_ADS_LABEL; break;
    case "hearst_sale_ads_link":
      validLabel = namedLink && c.scope === "footer" && FOOTER_HEARST_SALE_ADS_LINK_PATTERN.test(label); break;
    case "mspa_footer_contracted_sale_handler":
      validLabel = c.scope === "footer" && FOOTER_CONTRACTED_SALE_LABEL_PATTERN.test(label); break;
    case "sale_sharing_and_sensitive_data":
      validLabel = namedLink && c.scope === "legal_footer_navigation" && label === FOOTER_SENSITIVE_DATA_LABEL; break;
    case "onetrust_sensitive_data_webform":
      validLabel = namedLink && c.scope === "footer" && label === FOOTER_SENSITIVE_DATA_WEBFORM_LABEL; break;
    case "onetrust_footer_text_trigger":
      validLabel = c.scope === "footer" && label === "do not sell my personal information"; break;
    case "onetrust_form_footer_settings":
      validLabel = c.scope === "footer" && label === "your privacy choices"; break;
    case "sale_sharing_subject_access_request":
      validLabel = namedLink && c.scope === "footer" && label === FOOTER_SALE_SHARING_REQUEST_LABEL; break;
    case "onetrust_footer_slash_sale_settings":
      validLabel = c.scope === "legal_footer_navigation" && FOOTER_SLASH_SALE_BUTTON_LABEL.test(label); break;
    case "footer_slash_sale_form_link":
      validLabel = namedLink && c.scope === "footer" && FOOTER_SLASH_SALE_FORM_LABEL.test(label); break;
    case "usercentrics_footer_sale_settings":
      validLabel = ["footer", "contentinfo", "footer_strip"].includes(c.scope) && label === FOOTER_SALE_SHARING_REQUEST_LABEL; break;
    case "didomi_footer_settings":
      validLabel = ["footer", "contentinfo", "legal_footer_navigation"].includes(c.scope) && label === "your privacy choices"; break;
    case "footer_data_privacy_preferences_link":
      validLabel = namedLink && c.scope === "footer" && FOOTER_SHORT_SALE_SHARING_LABEL.test(label); break;
    case "footer_sale_sharing_settings_anchor":
      validLabel = c.scope === "footer" && label === "do not sell or share my information"; break;
    case "aem_footer_sharing_preferences_link":
      validLabel = namedLink && c.scope === "legal_footer_navigation" && label === FOOTER_SALE_SHARING_REQUEST_LABEL; break;
    case "onetrust_reveal_footer_settings":
      validLabel = c.scope === "legal_footer_navigation" && namesPrivacyChoiceEntrance(label); break;
    case "onetrust_custom_legal_footer_settings":
      validLabel = c.scope === "custom_legal_footer" && namesPrivacyChoiceEntrance(label); break;
    case "ensighten_footer_settings_anchor":
      validLabel = ["footer", "contentinfo", "footer_strip"].includes(c.scope) && namesPrivacyChoiceEntrance(label); break;
    case "footer_sale_sharing_dialog_anchor":
    case "footer_sale_sharing_dialog_notice":
      validLabel = c.scope === "footer" && EXPLICIT_SALE_SHARING_LAUNCHER_LABEL.test(label); break;
    default:
      validLabel = namesPrivacyChoiceEntrance(label) || FOOTER_SHORT_OPT_OUT_LABEL_PATTERN.test(label) ||
        (namedLink && FOOTER_LINK_OPT_OUT_LABEL_PATTERN.test(label));
  }
  if (!validLabel || custom !== (c.semanticRole === "settings_control") ||
      (c.placementWitness && (c.scope !== "footer_strip" || c.semanticRole !== "button")) ||
      (c.scope === "custom_legal_footer" && (!namesPrivacyChoiceEntrance(label) ||
        (c.controlWitness && c.controlWitness !== "onetrust_custom_legal_footer_settings"))) ||
      (c.placementWitness === "funding_choices_ipr" && label !== "do not sell or share my personal information")) {
    ctx.addIssue({code: "custom", message: "Footer labels must match the retained control and scope."});
  }
  if (c.checkpoints && (c.checkpoints[0]?.phase !== "initial" || c.checkpoints.some((row, index, all) =>
      index > 0 && (row.phase === "initial" || row.elapsedMs < all[index - 1]!.elapsedMs)) ||
      c.checkpoints.some(row => row.elapsedMs > (c.controlWitness === "ensighten_footer_settings_anchor" ? ENSIGHTEN_FOOTER_REVEAL_MAX_MS :
        c.controlWitness === "onetrust_custom_legal_footer_settings" ? ONETRUST_CUSTOM_FOOTER_REVEAL_MAX_MS : 450)) ||
      !c.checkpoints.some(row => row.visibility === c.visibility && row.view === c.view &&
        row.testedPoints === c.testedPoints && row.matchingPoints === c.matchingPoints && row.occludingPoints === c.occludingPoints &&
        row.iframeOccludingPoints === c.iframeOccludingPoints &&
        row.bounds.every((bound, index) => bound === c.bounds[index])))) {
    ctx.addIssue({code: "custom", message: "The reported visibility must match a retained footer checkpoint."});
  }
});
export const consentFooterOptOutObservationSchema = z.object({
  version: z.literal("consent_footer_opt_out.v1"), artifactId: z.literal("dom_text_pre_consent"),
  documentUrl: z.string().url().max(2000), documentToken: z.string().min(1).max(160),
  snapshotAtMs: z.number().int().nonnegative(), capturedAtMs: z.number().int().nonnegative(),
  coverage: z.enum(["complete", "limited"]), limitations: z.array(z.enum(consentFooterOptOutLimitations)).max(consentFooterOptOutLimitations.length),
  viewport: z.tuple([z.number().int().positive().max(32000), z.number().int().positive().max(32000)]),
  footerCount: z.number().int().min(0).max(16), inspectedControls: z.number().int().min(0).max(200),
  candidates: z.array(candidate).max(16),
}).strict().superRefine((p,ctx) => {
  if (p.capturedAtMs < p.snapshotAtMs || new Set(p.candidates.map(c => c.evidenceId)).size !== p.candidates.length ||
      p.candidates.length > p.inspectedControls || (p.coverage === "complete") !== (p.limitations.length === 0) ||
      (p.footerCount === 0 && (p.candidates.length > 0 || !p.limitations.includes("no_footer_landmark"))) ||
      p.coverage === "complete" && p.candidates.some(c => c.visibility === "unverified") ||
      (p.candidates.some(c => c.controlWitness === "amazon_ads_privacy_choices") &&
        !/^https:\/\/www\.amazon\.com(?:[/?#]|$)/.test(p.documentUrl)) ||
      (p.candidates.some(c => c.controlWitness === "woot_ads_privacy_choices") &&
        !/^https:\/\/www\.woot\.com(?:[/?#]|$)/.test(p.documentUrl)))
    ctx.addIssue({code:"custom",message:"Footer observation must have a bounded, coherent scope and the original capture time."});
});
export type ConsentFooterOptOutObservation = z.infer<typeof consentFooterOptOutObservationSchema>;
