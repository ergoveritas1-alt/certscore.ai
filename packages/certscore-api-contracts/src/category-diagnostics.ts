import {z} from "zod";

type CategoryDiagnosticResult = {
  state: "supported"|"no_optional_categories"|"unsupported"|"unknown";
  conflictingObservations: boolean;
  reasonsTruncated: boolean|null;
};
export type ApiV2ConsentCategoryDiagnostics = {
  policyVersion: "consent_category_diagnostics.v1";
  diagnosticOnly: true;
  source: "retained_reason_inventory";
  aggregate: CategoryDiagnosticResult;
  initial: CategoryDiagnosticResult|null;
  terminal: CategoryDiagnosticResult|null;
};
const resultSchema = z.object({
  state: z.enum(["supported", "no_optional_categories", "unsupported", "unknown"]),
  conflictingObservations: z.boolean(), reasonsTruncated: z.boolean().nullable(),
}).strict().refine(value => !(value.conflictingObservations || value.reasonsTruncated === true) || value.state === "unknown",
"Conflicting or truncated diagnostic inventories cannot establish a single category state.");
export const apiV2ConsentCategoryDiagnosticsSchema: z.ZodType<ApiV2ConsentCategoryDiagnostics> = z.object({
  policyVersion: z.literal("consent_category_diagnostics.v1"), source: z.literal("retained_reason_inventory"),
  diagnosticOnly: z.literal(true),
  aggregate: resultSchema, initial: resultSchema.nullable(), terminal: resultSchema.nullable(),
}).strict();

const resultOpenApi = {type: "object", additionalProperties: false,
  required: ["state", "conflictingObservations", "reasonsTruncated"], properties: {
    state: {type: "string", enum: ["supported", "no_optional_categories", "unsupported", "unknown"]},
    conflictingObservations: {type: "boolean"}, reasonsTruncated: {type: ["boolean", "null"]},
  }} as const;
export const categoryDiagnosticsOpenApi = {
  type: "object", additionalProperties: false,
  description: "Versioned interpretation of retained category diagnostic reasons, independently of category proof and consent confirmation. Malformed/unresolved inputs, mixed observations and truncated inventories remain unknown. Missing phase inventories are null; retained empty inventories yield unknown. Reasons do not establish chronology or verify a decision.",
  required: ["policyVersion", "diagnosticOnly", "source", "aggregate", "initial", "terminal"], properties: {
    policyVersion: {type: "string", const: "consent_category_diagnostics.v1"},
    diagnosticOnly: {type: "boolean", const: true},
    source: {type: "string", const: "retained_reason_inventory"}, aggregate: resultOpenApi,
    initial: {...resultOpenApi, type: ["object", "null"]}, terminal: {...resultOpenApi, type: ["object", "null"]},
  },
} as const;
