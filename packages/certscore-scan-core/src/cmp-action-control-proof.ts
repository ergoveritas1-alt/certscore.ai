import {
  CONSENT_ACTION_CONTROL_PROOF_VERSION,
  classifyConsentControlLabel,
  normalizeConsentControlText,
  type ConsentActionControlProof,
} from "@certscore/contracts";
import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright";
import {
  readClosedShadowAccessibleControlLabel,
  type CmpAccessibleActionResolution,
} from "./cmp-accessible-action.js";

type ControlLabelFields = {
  ariaLabel?: string;
  title?: string;
  value?: string;
  visibleText?: string;
};

export type ConsentActionControlProofResolution =
  | { status: "verified"; proof: ConsentActionControlProof }
  | { status: "label_mismatch" | "label_unverifiable"; reason: string };

export async function buildConsentActionControlProof(input: {
  action: "accept" | "reject";
  authorizedTargetSha256?: string;
  canonicalNecessaryOnly?: { expectedNormalizedLabel: string };
  cmpId?: string;
  control: Locator;
  controlFrameUrl?: string;
  expectedAccessibleControl?: CmpAccessibleActionResolution;
  observedAtMs: number;
  page: Page;
  recipeId: string;
  selectorHint: string;
}): Promise<ConsentActionControlProofResolution> {
  const fields = input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control"
    ? {
        ariaLabel: await readClosedShadowAccessibleControlLabel(
          input.page,
          input.expectedAccessibleControl,
        ),
      }
    : await readControlLabelFields(input.control);
  const bounded = boundFields(fields);
  const classification = classifyConsentControlLabel({
    label: bounded.visibleText,
    ariaLabel: bounded.ariaLabel,
    title: bounded.title,
    value: bounded.value,
    hasConsentContext: true,
  });
  const conflictingIntent = sourceIntentConflict(bounded);
  if (conflictingIntent) {
    return {
      status: "label_mismatch",
      reason: `resolved_control_label_conflict:${conflictingIntent}`,
    };
  }
  if (
    input.action === "reject" &&
    (classification.variant === "reject_with_subscription" ||
      classification.variant === "reject_with_payment")
  ) {
    return {
      status: "label_mismatch",
      reason: `resolved_control_transactional_variant:${classification.variant}`,
    };
  }
  const necessaryOnlyLabelVerified = input.canonicalNecessaryOnly
    ? Object.values(bounded).some((label) =>
        normalizeConsentControlText(label) ===
          normalizeConsentControlText(input.canonicalNecessaryOnly?.expectedNormalizedLabel)
      )
    : false;
  if (input.canonicalNecessaryOnly && !necessaryOnlyLabelVerified) {
    return {
      status: "label_mismatch",
      reason: "resolved_control_label_did_not_match_canonical_necessary_only_recipe",
    };
  }
  if (!necessaryOnlyLabelVerified && classification.intent !== input.action) {
    return classification.intent === "unknown"
      ? {
          status: "label_unverifiable",
          reason: "resolved_control_label_not_classified",
        }
      : {
          status: "label_mismatch",
          reason: `resolved_control_intent_${classification.intent}`,
        };
  }
  if (!necessaryOnlyLabelVerified && classification.confidence < 0.8) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_label_below_confidence_threshold",
    };
  }
  const selected = preferredLabel(bounded);
  if (!selected) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_accessible_label_missing",
    };
  }
  const selectorHint = bound(input.selectorHint, 500);
  if (!selectorHint) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_selector_hint_missing",
    };
  }
  return {
    status: "verified",
    proof: {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION,
      action: input.action,
      observedAtMs: input.observedAtMs,
      accessibleLabel: selected.value,
      labelSource: input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control"
        ? "accessibility_tree"
        : selected.source,
      actionSemantics: necessaryOnlyLabelVerified
        ? "canonical_necessary_only_recipe"
        : "direct_label",
      classifierIntent: classification.intent,
      classifierConfidence: classification.confidence,
      ...(classification.matchedLocale ? { matchedLocale: classification.matchedLocale } : {}),
      ...(classification.matchStrength ? { matchStrength: classification.matchStrength } : {}),
      classifierReasonCodes: [
        ...classification.reasonCodes,
        ...(necessaryOnlyLabelVerified ? ["canonical_necessary_only_recipe_verified"] : []),
      ].slice(0, 16),
      ...(input.cmpId ? { cmpId: bound(input.cmpId, 120) } : {}),
      recipeId: bound(input.recipeId, 160),
      selectorHint,
      ...(input.controlFrameUrl
        ? { frameIdentitySha256: sha256(input.controlFrameUrl) }
        : {}),
      ...(input.authorizedTargetSha256
        ? { authorizedTargetSha256: input.authorizedTargetSha256 }
        : {}),
      visible: true,
      enabled: true,
      uniquelyActionable: true,
    },
  };
}

async function readControlLabelFields(control: Locator): Promise<ControlLabelFields> {
  return control.evaluate((element) => {
    const html = element as HTMLElement;
    const inputElement = element as HTMLInputElement;
    return {
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      title: element.getAttribute("title") ?? undefined,
      value: "value" in inputElement ? String(inputElement.value ?? "") : undefined,
      visibleText: html.innerText || element.textContent || undefined,
    };
  }).catch(() => ({}));
}

function boundFields(fields: ControlLabelFields): ControlLabelFields {
  return {
    ...(bound(fields.ariaLabel, 160) ? { ariaLabel: bound(fields.ariaLabel, 160) } : {}),
    ...(bound(fields.title, 160) ? { title: bound(fields.title, 160) } : {}),
    ...(bound(fields.value, 160) ? { value: bound(fields.value, 160) } : {}),
    ...(bound(fields.visibleText, 160) ? { visibleText: bound(fields.visibleText, 160) } : {}),
  };
}

function preferredLabel(fields: ControlLabelFields): {
  source: "aria_label" | "visible_text" | "value" | "title";
  value: string;
} | undefined {
  if (fields.ariaLabel) return { source: "aria_label", value: fields.ariaLabel };
  if (fields.visibleText) return { source: "visible_text", value: fields.visibleText };
  if (fields.value) return { source: "value", value: fields.value };
  if (fields.title) return { source: "title", value: fields.title };
  return undefined;
}

function sourceIntentConflict(fields: ControlLabelFields) {
  const intents = new Set(
    [fields.ariaLabel, fields.visibleText, fields.value, fields.title]
      .filter((value): value is string => Boolean(value))
      .map((label) => classifyConsentControlLabel({ label, hasConsentContext: true }).intent)
      .filter((intent) => intent !== "unknown"),
  );
  return intents.size > 1 ? [...intents].sort().join("_") : undefined;
}

function bound(value: string | undefined, maxLength: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maxLength) ?? "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
