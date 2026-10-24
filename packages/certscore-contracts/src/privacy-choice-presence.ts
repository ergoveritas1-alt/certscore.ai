import { z } from "zod";
import { classifyPrivacySurface } from "./privacy-surface-classifier";

export const PRIVACY_CHOICE_PRESENCE_SIGNAL = "privacy.choice_link_presence.v1";
export const PRIVACY_CHOICE_PRESENCE_TITLE = "Sale/sharing opt-out link observed";
export const privacyChoicePresenceSchema = z.object({
  version: z.literal("privacy_choice_presence.v1"),
  effectiveness: z.literal("not_verified"),
  links: z.array(z.object({
    label: z.string().min(1).max(200), evidenceRef: z.string().min(1).max(240),
    sourceDocumentUrl: z.string().url().max(800),
    kind: z.enum(["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]),
  }).strict()).max(12),
}).strict().superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 8192)
    ctx.addIssue({code:"custom",message:"Presence metadata exceeds its 8 KiB retained limit."});
  for (const link of value.links) if (classifyPrivacySurface({linkText:link.label}).surfaceType !== link.kind)
    ctx.addIssue({code:"custom",message:"Presence label must retain its supported privacy meaning."});
});
