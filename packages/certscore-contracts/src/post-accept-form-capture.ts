import { z } from "zod";
import { collectionSurfaceFormSchema } from "./collection-surface-form";

export const POST_ACCEPT_FORM_CAPTURE_MAX_BYTES = 8192;
export interface PostAcceptFormCapture {
  version: "post_accept_form_capture.v1" | "post_accept_form_capture.v2";
  phase: "after_accept_click";
  sessionId: string;
  exactTargetSha256: string;
  actionDispatchedAtMs: number;
  status: "captured" | "limited";
  reasonCodes: Array<"window_ended" | "document_changed" | "cancelled" | "frame_unavailable" | "capture_limit" | "document_loading" | "capture_invalid">;
  inspectedFrameCount: number;
  candidateFrameCount: number;
  window?: { startedAtMs: number; endedAtMs: number; terminalSampleCompleted: boolean };
  frames: Array<{frameRef: string; documentToken: string; documentUrl: string; capturedAtMs: number; forms: Array<z.output<typeof collectionSurfaceFormSchema>>}>;
}
export const postAcceptFormCaptureSchema: z.ZodType<PostAcceptFormCapture, z.ZodTypeDef, unknown> = z.object({
  version: z.enum(["post_accept_form_capture.v1", "post_accept_form_capture.v2"]),
  phase: z.literal("after_accept_click"),
  sessionId: z.string().uuid(),
  exactTargetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  status: z.enum(["captured", "limited"]),
  reasonCodes: z.array(z.enum(["window_ended", "document_changed", "cancelled", "frame_unavailable", "capture_limit", "document_loading", "capture_invalid"])).max(7),
  inspectedFrameCount: z.number().int().min(0).max(3),
  candidateFrameCount: z.number().int().nonnegative(),
  window: z.object({ startedAtMs: z.number().int().nonnegative(), endedAtMs: z.number().int().nonnegative(),
    terminalSampleCompleted: z.boolean() }).strict().optional(),
  frames: z.array(z.object({
    frameRef: z.string().min(1).max(80),
    documentToken: z.string().uuid(),
    documentUrl: z.string().url().max(500).refine(value => /^https?:\/\//i.test(value)),
    capturedAtMs: z.number().int().nonnegative(),
    forms: z.array(collectionSurfaceFormSchema).max(2),
  }).strict()).max(3),
}).strict().superRefine((value, ctx) => {
  if (value.version === "post_accept_form_capture.v2" ? !value.window || value.window.startedAtMs < value.actionDispatchedAtMs ||
    value.window.endedAtMs <= value.window.startedAtMs || (value.status === "captured" && (!value.window.terminalSampleCompleted || !value.candidateFrameCount)) ||
    value.frames.some(frame => frame.capturedAtMs > value.window!.endedAtMs) : value.window !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Windowed capture requires bounded terminal coverage; legacy samples keep their original contract." });
  }
  if (value.inspectedFrameCount < value.frames.length || value.inspectedFrameCount > value.candidateFrameCount ||
    new Set(value.frames.map(frame => frame.frameRef)).size !== value.frames.length ||
    (value.status === "limited" && !value.reasonCodes.length)) ctx.addIssue({code:z.ZodIssueCode.custom, message:"Invalid form capture coverage"});
  if (value.status === "captured" && (value.reasonCodes.length || value.inspectedFrameCount !== value.candidateFrameCount)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Complete capture requires complete frame coverage" });
  if (value.frames.some(frame => frame.capturedAtMs < value.actionDispatchedAtMs || frame.forms.some(form => form.pageUrl !== frame.documentUrl))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Form capture must be bound to its frame and action" });
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > POST_ACCEPT_FORM_CAPTURE_MAX_BYTES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Form capture exceeds byte limit" });
});
