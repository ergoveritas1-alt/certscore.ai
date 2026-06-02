export type CaliforniaPrivacyCoverageOutcomeStatus =
  | "Checked"
  | "Gap observed"
  | "Review signal"
  | "Not observed"
  | "Not applicable"
  | "Not testable"
  | "Insufficient evidence";

export type CaliforniaPrivacyCoverageSourceSignalGap = {
  actual: unknown;
  expected: unknown;
  field: string;
  source: "WS01" | "WC01";
  whyNeeded: string;
};

export type CaliforniaPrivacyCoverageCriticalEvidence = {
  missingOrIncompleteSourceSignals: CaliforniaPrivacyCoverageSourceSignalGap[];
  pipeline: {
    concernPolicyKey: string;
    projectionStage: "coverage_policy" | "unified_finding" | "executive_projection" | "coverage_fallback";
    wc01NormalizedConcernKey: string;
    ws01EvidenceRole: string;
  };
  projectedFindings: Array<{
    id: string;
    label: string;
    severity?: string;
  }>;
  retainedEvidence: Record<string, unknown>;
  statusBasis: string;
};

export type CaliforniaPrivacyCoverageOutcome = {
  criticalEvidence: CaliforniaPrivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  limitation: string;
  rowId: string;
  status: CaliforniaPrivacyCoverageOutcomeStatus;
};

export type CaliforniaPrivacyCoveragePolicyInput = {
  coverageLimited: boolean;
  runtimeArtifacts?: Record<string, unknown> | null;
  scanCompleted: boolean;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === true || value === false) {
      return value;
    }
  }
  return null;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    }
  }
  return [...new Set(values)];
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

function sourceGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "WS01" | "WC01" = "WS01"
): CaliforniaPrivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function makeOutcome(
  rowId: string,
  status: CaliforniaPrivacyCoverageOutcomeStatus,
  limitation: string,
  evidenceRefs: string[] = [],
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: CaliforniaPrivacyCoverageSourceSignalGap[];
    retainedEvidence?: Record<string, unknown>;
  }
): CaliforniaPrivacyCoverageOutcome {
  return {
    criticalEvidence: {
      missingOrIncompleteSourceSignals: criticalEvidence?.missingOrIncompleteSourceSignals ?? [],
      pipeline: {
        concernPolicyKey: `california_privacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `california_privacy.coverage.${rowId}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: compactRecord({
        evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
        ...(criticalEvidence?.retainedEvidence ?? {})
      }),
      statusBasis: limitation
    },
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
    limitation,
    rowId,
    status
  };
}

function getCaliforniaEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.californiaPrivacyEvidence) ?? null;
}

function getCpraEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.cpraCbaOptOutEvidence) ?? null;
}

function getGpcEvidence(input: CaliforniaPrivacyCoveragePolicyInput) {
  return getRecord(input.runtimeArtifacts?.gpcVerification) ?? null;
}

function getEvidenceRefs(californiaEvidence: Record<string, unknown> | null, ...refs: Array<string | null>) {
  return [
    ...getStringArray(californiaEvidence, ["evidenceRefs", "evidence_refs"]),
    ...refs.filter((value): value is string => Boolean(value))
  ];
}

export function deriveCaliforniaPrivacyCoveragePolicyOutcomes(
  input: CaliforniaPrivacyCoveragePolicyInput
): Record<string, CaliforniaPrivacyCoverageOutcome> {
  const californiaEvidence = getCaliforniaEvidence(input);
  const cpraEvidence = getCpraEvidence(input);
  const gpcEvidence = getGpcEvidence(input);
  const outcomes: Record<string, CaliforniaPrivacyCoverageOutcome> = {};

  if (!input.scanCompleted || input.coverageLimited) {
    const rows = [
      "privacy_notice_availability",
      "notice_at_collection",
      "do_not_sell_share_availability",
      "gpc_opt_out_signal_handling",
      "targeted_advertising_signals",
      "sale_share_disclosure_alignment",
      "limit_use_sensitive_pi",
      "opt_out_friction_dark_patterns",
      "post_opt_out_tracking_behavior",
      "sensitive_forms_third_party_tracking",
      "privacy_control_accessibility"
    ];
    for (const rowId of rows) {
      outcomes[rowId] = makeOutcome(rowId, "Not testable", "The retained public-web scan context did not support this California privacy review row.", [], {
        missingOrIncompleteSourceSignals: [
          sourceGap("WS01.californiaPrivacyEvidence", "completed public-web California evidence packet", californiaEvidence ? "partial" : "missing", "Required before WC01 can evaluate this California checklist row.")
        ]
      });
    }
    return outcomes;
  }

  const privacyNoticeObserved = getBoolean(californiaEvidence, ["privacyNoticeObserved", "privacy_notice_observed"]);
  const privacyNoticeUrls = getStringArray(californiaEvidence, ["privacyNoticeUrls", "privacy_notice_urls"]);
  outcomes.privacy_notice_availability = privacyNoticeObserved === true
    ? makeOutcome("privacy_notice_availability", "Checked", "A public privacy notice or privacy policy surface was retained.", getEvidenceRefs(californiaEvidence, "Privacy notice observed"), {
        retainedEvidence: { privacyNoticeObserved, privacyNoticeUrls }
      })
    : privacyNoticeObserved === false
      ? makeOutcome("privacy_notice_availability", "Gap observed", "No public privacy notice or equivalent privacy disclosure was retained in the tested context.", getEvidenceRefs(californiaEvidence, "Privacy notice not observed"), {
          retainedEvidence: { privacyNoticeObserved, privacyNoticeUrls }
        })
      : makeOutcome("privacy_notice_availability", "Insufficient evidence", "Privacy notice availability could not be resolved from retained WS01 evidence.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.privacyNoticeObserved", "boolean privacy notice observation", "missing", "Required to determine whether a public privacy notice was observed.")
          ]
        });

  const collectionContextObserved = getBoolean(californiaEvidence, ["collectionContextObserved", "collection_context_observed"]);
  const collectionNoticeCueObserved = getBoolean(californiaEvidence, ["collectionNoticeCueObserved", "collection_notice_cue_observed"]);
  outcomes.notice_at_collection = collectionContextObserved === false
    ? makeOutcome("notice_at_collection", "Not observed", "No eligible public collection context was observed in the tested context.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: { collectionContextObserved }
      })
    : collectionContextObserved === true && collectionNoticeCueObserved === true
      ? makeOutcome("notice_at_collection", "Checked", "A collection-context privacy notice or disclosure cue was retained where relevant.", getEvidenceRefs(californiaEvidence, "Collection notice cue observed"), {
          retainedEvidence: { collectionContextObserved, collectionNoticeCueObserved }
        })
      : collectionContextObserved === true && collectionNoticeCueObserved === false
        ? makeOutcome("notice_at_collection", "Gap observed", "An eligible collection context was retained without a nearby privacy notice or collection disclosure cue.", getEvidenceRefs(californiaEvidence, "Collection context without nearby notice cue"), {
            retainedEvidence: { collectionContextObserved, collectionNoticeCueObserved }
          })
        : makeOutcome("notice_at_collection", "Insufficient evidence", "Collection context evidence was not complete enough to evaluate notice-at-collection cues.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.collectionContextObserved", "collection context observation", collectionContextObserved, "Required to know whether notice-at-collection review applies."),
              sourceGap("californiaPrivacyEvidence.collectionNoticeCueObserved", "nearby notice cue observation when collection context exists", collectionNoticeCueObserved, "Required to evaluate whether a public collection context had a nearby notice cue.")
            ]
          });

  const targetedAdvertisingSignalsObserved =
    getBoolean(californiaEvidence, ["targetedAdvertisingSignalsObserved", "targeted_advertising_signals_observed"]) ??
    ((getStringArray(cpraEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors"]).length > 0) ? true : null);
  const doNotSellSharePathObserved =
    getBoolean(californiaEvidence, ["doNotSellSharePathObserved", "do_not_sell_share_path_observed"]) ??
    getBoolean(cpraEvidence, ["optOutControlFound", "opt_out_control_found"]);
  const optOutPathLabel = getString(californiaEvidence, ["doNotSellSharePathLabel", "do_not_sell_share_path_label"]) ?? getString(cpraEvidence, ["optOutLinkText", "opt_out_link_text"]);
  const optOutPathUrl = getString(californiaEvidence, ["doNotSellSharePathUrl", "do_not_sell_share_path_url"]) ?? getString(cpraEvidence, ["optOutLinkHref", "opt_out_link_href"]);
  outcomes.do_not_sell_share_availability = targetedAdvertisingSignalsObserved === false
    ? makeOutcome("do_not_sell_share_availability", "Not applicable", "No sale/share or targeted-advertising runtime signal was retained in the tested context.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: { targetedAdvertisingSignalsObserved }
      })
    : targetedAdvertisingSignalsObserved === true && doNotSellSharePathObserved === true
      ? makeOutcome("do_not_sell_share_availability", "Checked", "A Do Not Sell or Share, Privacy Choices, or equivalent opt-out path was retained.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path observed"), {
          retainedEvidence: { targetedAdvertisingSignalsObserved, doNotSellSharePathObserved, optOutPathLabel, optOutPathUrl }
        })
      : targetedAdvertisingSignalsObserved === true && doNotSellSharePathObserved === false
        ? makeOutcome("do_not_sell_share_availability", "Gap observed", "Targeted-advertising or sale/share-like runtime signals were retained, but no clear opt-out path was observed.", getEvidenceRefs(californiaEvidence, "Do Not Sell/Share path not observed"), {
            retainedEvidence: { targetedAdvertisingSignalsObserved, doNotSellSharePathObserved }
          })
        : makeOutcome("do_not_sell_share_availability", "Insufficient evidence", "Opt-out path availability could not be resolved because runtime sale/share relevance or control discovery evidence was incomplete.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising/sale-share signal", targetedAdvertisingSignalsObserved, "Required to determine whether an opt-out path is applicable."),
              sourceGap("californiaPrivacyEvidence.doNotSellSharePathObserved", "boolean opt-out path observation", doNotSellSharePathObserved, "Required to determine whether an opt-out path was retained.")
            ]
          });

  const gpcTestRan = getBoolean(californiaEvidence, ["gpcTestRan", "gpc_test_ran"]) ?? Boolean(gpcEvidence);
  const gpcSignalSent = getBoolean(californiaEvidence, ["gpcSignalSent", "gpc_signal_sent"]) ?? getBoolean(gpcEvidence, ["gpcScanStateSent", "gpcRequestHeadersApplied"]);
  const gpcRecognitionObserved = getBoolean(californiaEvidence, ["gpcRecognitionObserved", "gpc_recognition_observed"]) ??
    (getString(gpcEvidence, ["status"]) === "honored" ? true : getString(gpcEvidence, ["status"]) === "ignored" ? false : null);
  outcomes.gpc_opt_out_signal_handling = !gpcTestRan
    ? makeOutcome("gpc_opt_out_signal_handling", "Not testable", "The retained scan context did not include a usable GPC or opt-out preference signal test.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence.gpcTestRan", true, gpcTestRan, "Required before WC01 can evaluate GPC handling.")
        ],
        retainedEvidence: { gpcTestRan }
      })
    : gpcSignalSent === true && gpcRecognitionObserved === true
      ? makeOutcome("gpc_opt_out_signal_handling", "Checked", "A GPC or opt-out preference signal was sent and evidence of handling or recognition was retained.", getEvidenceRefs(californiaEvidence, "GPC handling observed"), {
          retainedEvidence: { gpcTestRan, gpcSignalSent, gpcRecognitionObserved }
        })
      : gpcSignalSent === true && gpcRecognitionObserved === false && targetedAdvertisingSignalsObserved === true
        ? makeOutcome("gpc_opt_out_signal_handling", "Gap observed", "A GPC signal was sent while targeted-advertising signals were relevant, but no honoring or recognition evidence was retained.", getEvidenceRefs(californiaEvidence, "GPC signal not honored"), {
            retainedEvidence: { gpcTestRan, gpcSignalSent, gpcRecognitionObserved, targetedAdvertisingSignalsObserved }
          })
        : makeOutcome("gpc_opt_out_signal_handling", "Review signal", "GPC handling evidence was retained but remained ambiguous or partial.", getEvidenceRefs(californiaEvidence, "GPC handling ambiguous"), {
            retainedEvidence: { gpcTestRan, gpcSignalSent, gpcRecognitionObserved }
          });

  outcomes.targeted_advertising_signals = targetedAdvertisingSignalsObserved === true
    ? makeOutcome("targeted_advertising_signals", "Review signal", "Targeted advertising, cross-context tracking, or sale/share-like runtime signals were retained.", getEvidenceRefs(californiaEvidence, "Targeted advertising signal observed"), {
        retainedEvidence: {
          targetedAdvertisingSignalsObserved,
          advertisingSharingVendors: getStringArray(californiaEvidence, ["advertisingSharingVendors", "advertising_sharing_vendors"])
        }
      })
    : targetedAdvertisingSignalsObserved === false
      ? makeOutcome("targeted_advertising_signals", "Not observed", "No eligible targeted advertising or cross-context tracking signal was retained.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { targetedAdvertisingSignalsObserved }
        })
      : makeOutcome("targeted_advertising_signals", "Not testable", "Runtime vendor classification was unavailable or incomplete for California targeted-advertising review.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising signal", "missing", "Required to evaluate targeted advertising/cross-context behavioral advertising signals.")
          ]
        });

  const disclosureAlignment = getString(californiaEvidence, ["policyRuntimeDisclosureAlignment", "policy_runtime_disclosure_alignment"]);
  outcomes.sale_share_disclosure_alignment = disclosureAlignment === "aligned"
    ? makeOutcome("sale_share_disclosure_alignment", "Checked", "Observed runtime vendor categories appeared aligned with reviewed public disclosures.", getEvidenceRefs(californiaEvidence, "Disclosure alignment retained"), {
        retainedEvidence: { disclosureAlignment }
      })
    : disclosureAlignment === "gap_observed"
      ? makeOutcome("sale_share_disclosure_alignment", "Gap observed", "Material sale/share or adtech runtime signals were retained without clear corresponding disclosure alignment.", getEvidenceRefs(californiaEvidence, "Disclosure alignment gap"), {
          retainedEvidence: { disclosureAlignment }
        })
      : disclosureAlignment === "review"
        ? makeOutcome("sale_share_disclosure_alignment", "Review signal", "Runtime vendor and disclosure alignment requires human review from retained evidence.", getEvidenceRefs(californiaEvidence, "Disclosure alignment review"), {
            retainedEvidence: { disclosureAlignment }
          })
        : makeOutcome("sale_share_disclosure_alignment", "Not testable", "Privacy disclosures or runtime vendor evidence were unavailable for sale/share disclosure alignment.", getEvidenceRefs(californiaEvidence), {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.policyRuntimeDisclosureAlignment", "aligned | gap_observed | review", disclosureAlignment, "Required to evaluate sale/share disclosure alignment.")
            ],
            retainedEvidence: { disclosureAlignment }
          });

  const sensitivePiContextObserved = getBoolean(californiaEvidence, ["sensitivePiContextObserved", "sensitive_pi_context_observed"]);
  const limitUsePathObserved = getBoolean(californiaEvidence, ["limitUseSensitivePiPathObserved", "limit_use_sensitive_pi_path_observed"]);
  outcomes.limit_use_sensitive_pi = sensitivePiContextObserved === false
    ? makeOutcome("limit_use_sensitive_pi", "Not applicable", "No eligible sensitive personal information collection context was retained.", getEvidenceRefs(californiaEvidence), {
        retainedEvidence: { sensitivePiContextObserved }
      })
    : sensitivePiContextObserved === true && limitUsePathObserved === true
      ? makeOutcome("limit_use_sensitive_pi", "Checked", "A Limit Use of Sensitive Personal Information or equivalent path was retained for a sensitive PI context.", getEvidenceRefs(californiaEvidence, "Limit use path observed"), {
          retainedEvidence: { sensitivePiContextObserved, limitUsePathObserved }
        })
      : sensitivePiContextObserved === true && limitUsePathObserved === false
        ? makeOutcome("limit_use_sensitive_pi", "Gap observed", "Sensitive personal information context was retained, but no Limit Use path was observed.", getEvidenceRefs(californiaEvidence, "Limit use path not observed"), {
            retainedEvidence: { sensitivePiContextObserved, limitUsePathObserved }
          })
        : makeOutcome("limit_use_sensitive_pi", "Insufficient evidence", "Sensitive PI context or Limit Use path evidence was incomplete.", [], {
            missingOrIncompleteSourceSignals: [
              sourceGap("californiaPrivacyEvidence.sensitivePiContextObserved", "boolean sensitive PI context", sensitivePiContextObserved, "Required to determine whether Limit Use controls are applicable."),
              sourceGap("californiaPrivacyEvidence.limitUseSensitivePiPathObserved", "boolean Limit Use path observation", limitUsePathObserved, "Required when sensitive PI context is observed.")
            ]
          });

  outcomes.opt_out_friction_dark_patterns = doNotSellSharePathObserved !== true
    ? makeOutcome("opt_out_friction_dark_patterns", "Not testable", "No opt-out path was available or exercised, so opt-out friction could not be evaluated.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence.doNotSellSharePathObserved", true, doNotSellSharePathObserved, "Required before opt-out friction can be tested.")
        ],
        retainedEvidence: { doNotSellSharePathObserved }
      })
    : makeOutcome("opt_out_friction_dark_patterns", "Review signal", "An opt-out path was retained; review retained consent/choice path evidence for friction, imbalance, or confusing labels.", getEvidenceRefs(californiaEvidence, "Opt-out path retained for friction review"), {
        retainedEvidence: { doNotSellSharePathObserved, optOutPathLabel, optOutPathUrl }
      });

  const optOutInteractionConfirmed = getBoolean(californiaEvidence, ["optOutInteractionConfirmed", "opt_out_interaction_confirmed"]);
  const postOptOutTrackingReductionObserved = getBoolean(californiaEvidence, ["postOptOutTrackingReductionObserved", "post_opt_out_tracking_reduction_observed"]);
  const postOptOutTrackingPersisted = getBoolean(californiaEvidence, ["postOptOutTrackingPersisted", "post_opt_out_tracking_persisted"]);
  outcomes.post_opt_out_tracking_behavior = optOutInteractionConfirmed !== true
    ? makeOutcome("post_opt_out_tracking_behavior", "Not testable", "No confirmed opt-out or reject action was captured, so post-opt-out tracking behavior could not be evaluated.", getEvidenceRefs(californiaEvidence), {
        missingOrIncompleteSourceSignals: [
          sourceGap("californiaPrivacyEvidence.optOutInteractionConfirmed", true, optOutInteractionConfirmed, "Required before WC01 can evaluate post-opt-out tracking behavior.")
        ],
        retainedEvidence: { optOutInteractionConfirmed }
      })
    : postOptOutTrackingPersisted === true
      ? makeOutcome("post_opt_out_tracking_behavior", "Gap observed", "Targeted advertising or non-essential tracking appeared to persist after a confirmed opt-out/reject action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking persisted"), {
          retainedEvidence: { optOutInteractionConfirmed, postOptOutTrackingReductionObserved, postOptOutTrackingPersisted }
        })
      : postOptOutTrackingReductionObserved === true
        ? makeOutcome("post_opt_out_tracking_behavior", "Checked", "Tracking reduction was observed after a confirmed opt-out/reject action.", getEvidenceRefs(californiaEvidence, "Post-opt-out tracking reduction observed"), {
            retainedEvidence: { optOutInteractionConfirmed, postOptOutTrackingReductionObserved, postOptOutTrackingPersisted }
          })
        : makeOutcome("post_opt_out_tracking_behavior", "Review signal", "Post-opt-out tracking behavior was retained but remained ambiguous.", getEvidenceRefs(californiaEvidence), {
            retainedEvidence: { optOutInteractionConfirmed, postOptOutTrackingReductionObserved, postOptOutTrackingPersisted }
          });

  outcomes.sensitive_forms_third_party_tracking = sensitivePiContextObserved === true && targetedAdvertisingSignalsObserved === true
    ? makeOutcome("sensitive_forms_third_party_tracking", "Review signal", "A sensitive or high-risk collection context appeared alongside third-party tracking signals in the tested context.", getEvidenceRefs(californiaEvidence, "Sensitive context with third-party tracking signal"), {
        retainedEvidence: { sensitivePiContextObserved, targetedAdvertisingSignalsObserved }
      })
    : sensitivePiContextObserved === false || targetedAdvertisingSignalsObserved === false
      ? makeOutcome("sensitive_forms_third_party_tracking", "Not observed", "No eligible sensitive form and third-party tracking correlation was retained.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { sensitivePiContextObserved, targetedAdvertisingSignalsObserved }
        })
      : makeOutcome("sensitive_forms_third_party_tracking", "Not testable", "Form/sensitive field detection or runtime tracking classification was unavailable or incomplete.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.sensitivePiContextObserved", "boolean sensitive PI context", sensitivePiContextObserved, "Required to evaluate sensitive-form tracking correlation."),
            sourceGap("californiaPrivacyEvidence.targetedAdvertisingSignalsObserved", "boolean targeted advertising signal", targetedAdvertisingSignalsObserved, "Required to evaluate sensitive-form tracking correlation.")
          ]
        });

  const accessibilityIssueObserved = getBoolean(californiaEvidence, ["privacyControlAccessibilityIssueObserved", "privacy_control_accessibility_issue_observed"]);
  outcomes.privacy_control_accessibility = accessibilityIssueObserved === true
    ? makeOutcome("privacy_control_accessibility", "Review signal", "Basic automated accessibility signals were retained for privacy controls.", getEvidenceRefs(californiaEvidence, "Privacy control accessibility signal"), {
        retainedEvidence: {
          accessibilityIssueObserved,
          privacyControlAccessibilitySignals: getStringArray(californiaEvidence, ["privacyControlAccessibilitySignals", "privacy_control_accessibility_signals"])
        }
      })
    : accessibilityIssueObserved === false
      ? makeOutcome("privacy_control_accessibility", "Checked", "No basic automated accessibility issue was retained for observed privacy controls.", getEvidenceRefs(californiaEvidence), {
          retainedEvidence: { accessibilityIssueObserved }
        })
      : makeOutcome("privacy_control_accessibility", "Not testable", "Privacy controls were not observed or could not be evaluated for basic accessibility signals.", [], {
          missingOrIncompleteSourceSignals: [
            sourceGap("californiaPrivacyEvidence.privacyControlAccessibilityIssueObserved", "boolean privacy control accessibility signal", accessibilityIssueObserved, "Required to evaluate privacy control accessibility.")
          ]
        });

  return outcomes;
}
