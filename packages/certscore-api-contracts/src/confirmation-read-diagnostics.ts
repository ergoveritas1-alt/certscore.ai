import {z} from "zod";

export type ApiV2ConsentConfirmationReadDiagnostics = {
  policyVersion: "consent_confirmation_read_diagnostics.v1";
  diagnosticOnly: true;
  source: "retained_confirmation_diagnostics";
  sourceDiagnosticsPolicyVersion: "consent_confirmation_diagnostics.v1" | "consent_confirmation_diagnostics.v2" | "consent_confirmation_diagnostics.v3";
  passCountLimit: 10_000;
  initialPasses: number;
  terminalPasses: number;
  terminalRead: "not_started" | "started" | "unverified" | "verified" | "discarded";
};

export const apiV2ConsentConfirmationReadDiagnosticsSchema: z.ZodType<ApiV2ConsentConfirmationReadDiagnostics> = z.object({
  policyVersion: z.literal("consent_confirmation_read_diagnostics.v1"),
  diagnosticOnly: z.literal(true), source: z.literal("retained_confirmation_diagnostics"),
  sourceDiagnosticsPolicyVersion: z.enum(["consent_confirmation_diagnostics.v1", "consent_confirmation_diagnostics.v2", "consent_confirmation_diagnostics.v3"]),
  passCountLimit: z.literal(10_000),
  initialPasses: z.number().int().min(0).max(10_000),
  terminalPasses: z.number().int().min(0).max(10_000),
  terminalRead: z.enum(["not_started", "started", "unverified", "verified", "discarded"]),
}).strict();

export const confirmationReadDiagnosticsOpenApi = {
  type: ["object", "null"], additionalProperties: false,
  description: "Retained confirmation-read diagnostics only, bound to the enclosing source packet. Missing diagnostics are null; zero is a recorded count. Passes are capped polling iterations, not SDK calls or elapsed time; a count at passCountLimit is a lower bound. The terminal read state is an operational diagnostic and cannot verify a consent decision, prove a completed observation or identify why a read did not start or was discarded.",
  required: ["policyVersion", "diagnosticOnly", "source", "sourceDiagnosticsPolicyVersion", "passCountLimit", "initialPasses", "terminalPasses", "terminalRead"],
  properties: {
    policyVersion: {type: "string", const: "consent_confirmation_read_diagnostics.v1"},
    diagnosticOnly: {type: "boolean", const: true},
    source: {type: "string", const: "retained_confirmation_diagnostics"},
    sourceDiagnosticsPolicyVersion: {type: "string", enum: ["consent_confirmation_diagnostics.v1", "consent_confirmation_diagnostics.v2", "consent_confirmation_diagnostics.v3"]},
    passCountLimit: {type: "integer", const: 10_000},
    initialPasses: {type: "integer", minimum: 0, maximum: 10_000},
    terminalPasses: {type: "integer", minimum: 0, maximum: 10_000},
    terminalRead: {type: "string", enum: ["not_started", "started", "unverified", "verified", "discarded"]},
  },
} as const;
