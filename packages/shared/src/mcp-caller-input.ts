import { z } from "zod";
import { sanitizeMcpTaskContext } from "./mcp-product-context";

export const MCP_CALLER_INPUT_MAX_BYTES = 4096;
const reasons = ["sensitive_field", "sensitive_content", "url_components_removed", "invalid_field_name", "unsupported_type", "depth_limit", "text_limit", "field_limit", "byte_limit", "task_context_separate"] as const;
const fieldSchema = z.object({
  path: z.string().max(160).regex(/^[a-zA-Z0-9_.\[\]-]+$/),
  type: z.enum(["string", "number", "boolean", "null", "array", "object", "other"]),
  value: z.union([z.string().max(300), z.number().finite(), z.boolean(), z.null()]).optional(),
  disposition: z.enum(["retained", "redacted", "omitted", "truncated"]),
  reason: z.enum(reasons).optional(),
}).strict();
export const mcpCallerInputSchema = z.object({
  version: z.literal(1),
  fields: z.array(fieldSchema).max(24),
  limits: z.array(z.enum(["field_limit", "byte_limit"])).max(2),
  questionStatus: z.enum(["retained", "not_provided", "sharing_not_confirmed", "invalid_context", "filtered"]),
}).strict().superRefine((input, context) => {
  for (const [index, field] of input.fields.entries()) {
    const finalKey = field.path.split(".").at(-1) ?? "";
    if (field.value !== undefined && sensitiveKey.test(finalKey)
      || typeof field.value === "string" && previewText(field.value, finalKey).value !== field.value
      || typeof field.value === "number" && Math.abs(field.value) >= 1_000_000
      || field.path.startsWith("arguments.taskContext.")
      || (field.disposition === "omitted" && field.value !== undefined)) {
      context.addIssue({ code: "custom", path: ["fields", index], message: "Caller input must be sanitized before ingestion." });
    }
  }
}).refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= MCP_CALLER_INPUT_MAX_BYTES, "Caller input exceeds its byte budget.");
export type McpCallerInput = z.infer<typeof mcpCallerInputSchema>;
type Field = z.infer<typeof fieldSchema>;

const sensitiveKey = /password|passwd|secret|token|authorization|cookie|credential|api.?key|private.?key|email|phone|address|account|payment|card|conversation|transcript|chat.?history|messages|(^|_)history|user.?id|session.?id/i;
const sensitiveText = /\b(?:bearer|password|passwd|secret|token|api[_ -]?key)\b|\b(?:sk|ghp|gho|xoxb|xoxp)[_-][a-z0-9-]+|[a-z0-9_+=/-]{40,}/i;

/** Display-safe bounded previews, never a raw request/header/body archive. */
function previewText(value: string, key?: string): { value: string; reason?: Field["reason"] } {
  if (key === "protocolVersion" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return { value };
  if (sensitiveText.test(value)) return { value: "[redacted]", reason: "sensitive_content" };
  let redacted = value.replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email redacted]")
    .replace(/(?:\+?\d[\d ().-]{5,}\d)/g, "[number redacted]")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, match => {
      try { return new URL(match.startsWith("www.") ? `https://${match}` : match).origin; }
      catch { return "[URL redacted]"; }
    })
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ");
  const reason = redacted !== value ? "sensitive_content" : undefined;
  if (redacted.length > 300) return { value: redacted.slice(0, 299) + "…", reason: "text_limit" };
  return { value: redacted, reason };
}

export function mcpQuestionStatus(args: Record<string, unknown>): McpCallerInput["questionStatus"] {
  const raw = args.taskContext;
  if (raw === undefined) return "not_provided";
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "invalid_context";
  const context = raw as Record<string, unknown>;
  if (context.questionSummary !== undefined && context.shareForImprovement !== true) return "sharing_not_confirmed";
  const sanitized = sanitizeMcpTaskContext(raw);
  if (!sanitized) return "invalid_context";
  if (!context.questionSummary) return "not_provided";
  return sanitized.questionSummary ? "retained" : "filtered";
}

export function captureMcpCallerInput(args: Record<string, unknown>, metadata?: unknown): McpCallerInput {
  const result: McpCallerInput = { version: 1, fields: [], limits: [], questionStatus: mcpQuestionStatus(args) };
  let stopped = false;
  const add = (field: Field) => {
    if (stopped) return;
    if (result.fields.length >= 24) { result.limits.push("field_limit"); stopped = true; return; }
    result.fields.push(field);
    // Reserve room for the terminal byte-limit marker.
    if (new TextEncoder().encode(JSON.stringify(result)).length > MCP_CALLER_INPUT_MAX_BYTES - 32) {
      result.fields.pop(); result.limits.push("byte_limit"); stopped = true;
    }
  };
  const visit = (value: unknown, path: string, depth: number, key: string) => {
    if (stopped) return;
    const type: Field["type"] = value === null ? "null" : Array.isArray(value) ? "array" : ["string", "number", "boolean", "object"].includes(typeof value) ? typeof value as Field["type"] : "other";
    if (path.length > 160) { add({ path: "[omitted]", type, disposition: "omitted", reason: "depth_limit" }); return; }
    if (sensitiveKey.test(key)) { add({ path, type, disposition: "redacted", reason: "sensitive_field" }); return; }
    if (path === "arguments.taskContext") { add({ path, type, disposition: "omitted", reason: "task_context_separate" }); return; }
    if (typeof value === "string") {
      // Don't inspect unbounded strings, nor retain a prefix that could cut a secret in half.
      if (value.length > 4096) { add({ path, type, disposition: "omitted", reason: "text_limit" }); return; }
      const preview = previewText(value, key);
      if (key === "url" && preview.value !== value && preview.value !== "[redacted]" && /^https?:\/\//i.test(value)) preview.reason = "url_components_removed";
      add({ path, type, value: preview.value, disposition: preview.reason === "text_limit" ? "truncated" : preview.reason ? "redacted" : "retained", ...(preview.reason ? { reason: preview.reason } : {}) });
    } else if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1_000_000) {
      add({ path, type, disposition: "redacted", reason: "sensitive_content" });
    } else if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) {
      add({ path, type, value, disposition: "retained" });
    } else if (value && typeof value === "object") {
      if (depth >= 2) { add({ path, type, disposition: "omitted", reason: "depth_limit" }); return; }
      const keys = Object.keys(value);
      if (!keys.length) add({ path, type, disposition: "retained", value: Array.isArray(value) ? "[]" : "{}" });
      for (const child of keys) {
        if (child === "io.modelcontextprotocol/clientInfo" && path === "request_meta") {
          visit((value as Record<string, unknown>)[child], `${path}.clientInfo`, depth + 1, "clientInfo"); continue;
        }
        if (stopped) break;
        // Unrecognized names themselves can contain personal data or credentials.
        if ((child.length >= 24 && /[0-9]/.test(child)) || !/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/.test(child) && !(Array.isArray(value) && /^\d{1,3}$/.test(child))) {
          add({ path: `${path}.[omitted]`, type: "other", disposition: "omitted", reason: "invalid_field_name" }); continue;
        }
        visit((value as Record<string, unknown>)[child], `${path}.${child}`, depth + 1, child);
      }
    } else add({ path, type, disposition: "omitted", reason: "unsupported_type" });
  };
  visit(args, "arguments", -1, "arguments");
  if (metadata !== undefined) visit(metadata, "request_meta", -1, "request_meta");
  return result;
}

/** Merge already sanitized sections under one shared byte/field budget. */
export function mergeMcpCallerInputs(primary: McpCallerInput, secondary: McpCallerInput): McpCallerInput {
  const merged: McpCallerInput = { ...primary, fields: [...primary.fields], limits: [...primary.limits] };
  for (const field of secondary.fields) {
    if (merged.fields.length >= 24) { if (!merged.limits.includes("field_limit")) merged.limits.push("field_limit"); break; }
    merged.fields.push(field);
    if (new TextEncoder().encode(JSON.stringify(merged)).length > MCP_CALLER_INPUT_MAX_BYTES - 32) {
      merged.fields.pop(); if (!merged.limits.includes("byte_limit")) merged.limits.push("byte_limit"); break;
    }
  }
  for (const limit of secondary.limits) if (!merged.limits.includes(limit)) merged.limits.push(limit);
  return merged;
}
