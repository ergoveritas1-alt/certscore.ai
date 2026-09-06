import { z } from "zod";

/** Describes a service, not observed tracking, necessity, consent or severity. */
export const vendorServicePurposeSchema = z.enum([
  "A/B Testing", "Accessibility", "Advertising", "Advertising library", "Advertising measurement",
  "Analytics", "Analytics configuration", "Audience measurement", "Authentication",
  "CDN", "Commerce", "Consent management", "Content delivery", "Content management",
  "Customer support", "Embedded maps", "Embedded media", "Font delivery",
  "Infrastructure", "Maps / location services", "Marketing automation", "Media delivery",
  "Payment processors", "Performance monitoring", "Personalisation", "Reviews widget",
  "Security", "Service status", "Session replay", "Site search", "Social media embed",
  "Tag management", "Unknown",
]);

export type VendorServicePurpose = z.infer<typeof vendorServicePurposeSchema>;
