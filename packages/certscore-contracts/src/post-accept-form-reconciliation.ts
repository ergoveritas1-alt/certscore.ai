import type { PostAcceptFormCapture } from "./post-accept-form-capture";
import { postAcceptFormInventorySchema, postAcceptImageInventoryMatchesLaterInventory,
  projectPostAcceptFormInventory, type PostAcceptFormSnapshotProjection } from "./post-accept-form-snapshots";

/** Reconcile only new producer-bound samples. Historical captures retain their
 * original inventory. Image bytes, hashes and capture time always stay intact. */
export function reconcilePostAcceptFormInventory(images: PostAcceptFormSnapshotProjection, capture?: PostAcceptFormCapture) {
  const original = projectPostAcceptFormInventory(images);
  if (!original) return null;
  const unchanged = {inventory:original, structuredFrame:undefined as PostAcceptFormCapture["frames"][number] | undefined,
    additionalFormRefs:[] as string[]};
  if (capture?.version !== "post_accept_form_capture.v3" || capture.status !== "captured" ||
    !capture.window?.terminalSampleCompleted || capture.exactTargetSha256 !== images.exactTargetSha256 ||
    capture.actionDispatchedAtMs !== images.actionDispatchedAtMs ||
    capture.window.startedAtMs !== (images.contractVersion === "certscore.post_accept_form_snapshots.v7"
      ? images.actionDispatchedAtMs : images.acceptanceRegisteredAtMs)) return unchanged;
  const originalCapturedAtMs = images.contractVersion === "certscore.post_accept_form_snapshots.v5" ||
    images.contractVersion === "certscore.post_accept_form_snapshots.v6" ? images.postCaptureInventory.capturedAtMs : images.capturedAtMs;
  const frames = capture.frames.filter(frame => frame.frameRef === "accept_frame_0" &&
    frame.documentBinding?.source === "cdp_loader_id" && frame.documentBinding.token === images.documentIdentity.token &&
    frame.documentBinding.boundAtMs >= images.actionDispatchedAtMs &&
    frame.documentBinding.boundAtMs <= frame.capturedAtMs &&
    frame.documentUrl === original.pageUrl && frame.capturedAtMs >= originalCapturedAtMs &&
    frame.capturedAtMs <= capture.window!.endedAtMs);
  if (frames.length !== 1) return unchanged;
  const frame = frames[0]!;
  if (frame.forms.some(form=>!form.formRef.startsWith(`${frame.frameRef}_`))) return unchanged;
  const candidate = postAcceptFormInventorySchema.safeParse({...original, forms:frame.forms.map(form => ({
    ...form, formRef:form.formRef.startsWith(`${frame.frameRef}_`) ? form.formRef.slice(frame.frameRef.length+1) : form.formRef,
  }))});
  if (!candidate.success || new Set(candidate.data.forms.map(form=>form.formRef)).size !== candidate.data.forms.length ||
    candidate.data.forms.some(form=>form.pageUrl !== original.pageUrl || form.fieldsTruncated ||
      new Set(form.fields.map(field=>field.controlIndex)).size !== form.fields.length) ||
    !postAcceptImageInventoryMatchesLaterInventory(original,candidate.data) ||
    original.forms.some(form=>!form.fields.length || form.fields.some(field=>field.controlIndex === undefined) ||
      new Set(form.fields.map(field=>field.controlIndex)).size !== form.fields.length ||
      candidate.data.forms.find(later=>later.formRef===form.formRef)?.actionRelationship !== form.actionRelationship)) return unchanged;
  // Additional forms keep their structured references and have no invented
  // image. Only already imaged forms use the independently retained image URL.
  const forms = original.forms.map(form => {
    const later = candidate.data.forms.find(item=>item.formRef===form.formRef)!;
    return {...later, ...(!later.privacyDisclosure?.excerpts.length && form.privacyDisclosure?.excerpts.length
      ? {privacyDisclosure:form.privacyDisclosure} : {})};
  });
  const enriched = forms.some((form,index)=>form.fields.length>original.forms[index]!.fields.length ||
    form.privacyDisclosure?.excerpts.length && JSON.stringify(form.privacyDisclosure)!==JSON.stringify(original.forms[index]!.privacyDisclosure));
  const additionalFormRefs = frame.forms.filter(form=>!original.forms.some(originalForm=>
    form.formRef===`${frame.frameRef}_${originalForm.formRef}`)).map(form=>form.formRef);
  return enriched || additionalFormRefs.length ? {inventory:{...original,forms},structuredFrame:frame,additionalFormRefs} : unchanged;
}
