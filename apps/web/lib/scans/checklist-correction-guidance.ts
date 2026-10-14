import { checklistRemediation, readChecklistRemediation } from "./checklist-remediation";

type CorrectionGuidance = { kind: "none" | "steps"; message?: string; steps: string[] };
const getRecord = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const getString = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
const uniqueStrings = (values: string[]) => [...new Set(values)];
function getParsedEvidence(jsonPayload: string) {
  try { return getRecord(JSON.parse(jsonPayload)); } catch { return null; }
}
function getRetainedEvidence(jsonPayload: string) { return getRecord(getParsedEvidence(jsonPayload)?.retainedEvidence); }

/** Shared rendering guidance for retained checklist results; no assessment or finding changes. */
function getTraceSubjects(retainedEvidence: Record<string, unknown> | null) {
  const smokingGunRows = Array.isArray(retainedEvidence?.smokingGunEvidence)
    ? retainedEvidence.smokingGunEvidence
    : [];
  const subjects = smokingGunRows.flatMap((row) => {
    const record = getRecord(row);
    if (!record) {
      return [];
    }
    return [
      getString(record.cookieName),
      getString(record.vendor),
      getString(record.host),
      getString(record.label),
    ].filter((value): value is string => Boolean(value));
  });
  return uniqueStrings(subjects).slice(0, 4);
}

function formatSubjectList(subjects: string[], fallback: string) {
  if (subjects.length === 0) {
    return fallback;
  }
  if (subjects.length === 1) {
    return subjects[0]!;
  }
  const head = subjects.slice(0, -1).join(", ");
  return `${head}, and ${subjects[subjects.length - 1]}`;
}

function isPolicyDisclosureNotConfirmed(parsed: Record<string, unknown>, retainedEvidence: Record<string, unknown> | null) {
  const status = getString(parsed.status) ?? getString(parsed.statusLabel);
  const assessmentStatus = getString(parsed.assessmentStatus);
  const signalObserved = retainedEvidence?.signalObserved;
  const pipeline = getRecord(parsed.pipeline);
  const concernPolicyKey = getString(pipeline?.concernPolicyKey);
  return (
    (status === "Not confirmed" && assessmentStatus === "review_signal") ||
    signalObserved === "not_confirmed_row_specific_extraction" ||
    signalObserved === "not_confirmed_policy_disclosure_extraction" ||
    Boolean(concernPolicyKey?.endsWith(".not_confirmed"))
  );
}

export function getCorrectionGuidance(jsonPayload: string): CorrectionGuidance {
  const parsed = getParsedEvidence(jsonPayload);
  if (!parsed) {
    return { kind: "none", steps: [] };
  }
  const canonicalGuidance = readChecklistRemediation(getRetainedEvidence(jsonPayload)?.remediation) ?? checklistRemediation({
    rowId: getString(parsed.checklistItemId) ?? getString(parsed.rowId) ?? "",
    status: getString(parsed.status) ?? getString(parsed.statusLabel) ?? "Unknown",
  });
  if (canonicalGuidance) return canonicalGuidance;
  const coverageArea = getString(parsed.coverageArea) ?? "this coverage area";
  const normalizedCoverageArea = coverageArea.toLowerCase();
  const assessmentStatus = getString(parsed.assessmentStatus);
  const evidenceState = getString(parsed.evidenceState);
  const status = getString(parsed.status) ?? getString(parsed.statusLabel);
  const retainedEvidence = getRetainedEvidence(jsonPayload);
  const policyEvidenceAssessment = getRecord(retainedEvidence?.policyEvidenceAssessment);
  const policyEvidenceResult = getString(policyEvidenceAssessment?.result);
  const traceSubjects = getTraceSubjects(retainedEvidence);
  const subjectList = formatSubjectList(traceSubjects, "the signals listed in the evidence details");
  const isGapOrReview =
    assessmentStatus === "gap_observed" ||
    assessmentStatus === "review_signal" ||
    /gap|review|potential/i.test(status ?? "");
  const isNotTestable =
    evidenceState === "not_testable" ||
    assessmentStatus === "coverage_limitation" ||
    assessmentStatus === "needs_evidence" ||
    /not testable|insufficient evidence|coverage/i.test(status ?? "");
  const isPositiveOrClearOutcome =
    !isGapOrReview &&
    !isNotTestable &&
    (
      assessmentStatus === "checked" ||
      assessmentStatus === "not_applicable" ||
      evidenceState === "observed" ||
      evidenceState === "not_observed" ||
      evidenceState === "not_applicable" ||
      /observed|not observed|checked|out of scope|not applicable/i.test(status ?? "")
    );

  const verifyStep = "Rerun the scan and confirm the result reflects the change or clearly explains why the page could not be fully evaluated.";
  const evidenceStep = "Keep a short internal record of what changed so the next scan can be compared with the same page and settings.";

  if (policyEvidenceResult === "extraction_incomplete" || policyEvidenceResult === "not_located_automatically") {
    return {
      kind: "none",
      message: "The scan could not retrieve enough policy text to evaluate this item. This does not indicate a policy problem by itself. Review the source policy manually or improve how the policy page is made available to the scan.",
      steps: [],
    };
  }

  if (policyEvidenceAssessment && isPolicyDisclosureNotConfirmed(parsed, retainedEvidence)) {
    return {
      kind: "steps",
      steps: [
        "Review the privacy policy for the disclosure described in this result.",
        "If the disclosure exists, review why the scan did not identify it or add an internal review note.",
        "If the disclosure is missing, update the privacy notice or internal review record.",
        "Rerun the scan and confirm the updated result reflects the disclosure or clearly explains why it could not be evaluated.",
      ],
    };
  }

  if (isPositiveOrClearOutcome) {
    const statusText = status ?? assessmentStatus ?? "checked";
    return {
      kind: "none",
      message: `${coverageArea} is currently rated ${statusText}. No site remediation is indicated from this row alone; rerun after material site, policy, or tag changes.`,
      steps: [],
    };
  }

  if (isNotTestable && !isGapOrReview) {
    return {
      kind: "steps",
      steps: [
        `The scan could not fully evaluate ${coverageArea}, so improve access to the relevant page or feature before treating this as a confirmed issue.`,
        "Resolve any blocked or unavailable page or path noted in the evidence details.",
        "Confirm the relevant page, policy, or user-choice control is reachable without authentication or bot challenge.",
        "Rerun the scan with the same location and settings so the result can be compared consistently.",
        evidenceStep,
      ],
    };
  }

  if (/cookies? or storage before consent|storage before consent/.test(normalizedCoverageArea)) {
    return {
      kind: "steps",
      steps: [
      `Inventory ${subjectList} and confirm which tag, script, or response sets each item before consent.`,
      "Configure the CMP/tag manager so non-essential cookies and browser storage are not written until the user has made the appropriate consent choice.",
      "Put analytics, advertising, personalization, and cross-site measurement tags behind the matching consent category.",
      "Clear existing test cookies and verify a fresh first visit does not set those non-essential cookies before consent.",
      verifyStep,
    ]};
  }

  if (/pre-consent (?:third-party|3rd party) tracking|targeted advertising/.test(normalizedCoverageArea)) {
    return {
      kind: "steps",
      steps: [
      `Identify ${subjectList} and the page-load rule that caused the request before consent or opt-out was applied.`,
      "Move advertising, retargeting, analytics, and cross-site measurement requests behind the relevant consent or opt-out gate.",
      "Check tag-manager firing rules, embedded pixels, iframes, and ad slots for requests that fire on initial page load.",
      "Verify a fresh pre-consent visit does not call the listed tracking endpoints.",
      verifyStep,
    ]};
  }

  if (/consent banner|preference surface|cookie notice/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Confirm the first visible consent or cookie notice clearly explains the relevant cookie/tracking use.",
      "Make accept, reject, and manage-preference choices easy to locate from the same initial surface where applicable.",
      "Ensure the cookie notice or policy link opens a reachable page with current, bounded cookie/tracking details.",
      "Test the flow in a fresh browser context with no prior consent cookies.",
      verifyStep,
    ]};
  }

  if (/decline|reject option|reject-all|refusal path/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add or expose a clear reject-all or equivalent refusal control wherever the consent surface offers accept-all.",
      "Keep the reject path reachable without requiring unnecessary extra steps compared with accepting.",
      "Confirm the reject action stores a durable refusal state and closes or updates the consent surface.",
      "Rerun the scan and confirm the reject action is available and works in a fresh visit.",
      verifyStep,
    ]};
  }

  if (/tracking after refusal|post[- ]reject|post opt-out|post-opt-out/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Confirm the reject or opt-out action completed successfully before comparing post-choice tracking.",
      `Review ${subjectList} and any other vendors, cookies, or endpoints that persisted after the user choice.`,
      "Update tag-manager, ad-tech, and CMP integrations so non-essential tracking is suppressed after refusal or opt-out.",
      "Test pre-choice and post-choice traffic in isolated browser contexts and compare the same page journey.",
      verifyStep,
    ]};
  }

  if (/withdrawal|post-choice consent controls|preference/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a persistent footer, privacy page, or settings control that lets users reopen cookie or consent preferences.",
      "Make the control label clear, such as Cookie Settings, Privacy Choices, or Manage Preferences.",
      "Verify a user can change a prior choice and that tags update after the new choice is saved.",
      "Retest after clearing prior consent state and after making an initial choice.",
      verifyStep,
    ]};
  }

  if (/privacy notice/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add or repair a public privacy notice link in a predictable location such as the footer.",
      "Ensure the notice page loads without authentication, bot challenge, or broken redirects.",
      "Include clear sections for data collection, use, sharing, cookies/tracking, rights, and contact paths as applicable.",
      "Rerun the scan and confirm the privacy notice is found and can be reviewed.",
      verifyStep,
    ]};
  }

  if (/notice at collection/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Place a privacy or collection notice near forms, sign-up flows, checkout, account creation, or other data-entry points.",
      "Make the notice visible before the user submits personal information.",
      "Link the notice to the relevant privacy notice or collection-specific explanation.",
      "Test the specific collection page, not only the homepage or footer.",
      verifyStep,
    ]};
  }

  if (/do not sell|sell or share|privacy choices|opt-out/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a clear Do Not Sell or Share, Your Privacy Choices, or equivalent opt-out path where applicable.",
      "Ensure the link is reachable from the homepage footer and relevant privacy surfaces.",
      "Make the opt-out control complete without broken redirects, blocked pages, or ambiguous save states.",
      "Verify advertising or sharing-related tags respect the saved opt-out choice.",
      verifyStep,
    ]};
  }

  if (/gpc|global privacy control/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Detect the Sec-GPC signal on relevant requests and route it into the same preference system as other opt-out choices.",
      "Show or retain a bounded acknowledgement when the signal is recognized, if your experience supports that.",
      "Suppress sale/share or targeted-advertising tags when GPC is active where applicable.",
      "Run a GPC-enabled browser test and compare the resulting cookies, requests, and opt-out state.",
      verifyStep,
    ]};
  }

  if (/session replay|fingerprinting|behavior/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Review ${subjectList} and any other replay, behavioral analytics, or fingerprinting-like vendor signals.`,
      "Disable recording on sensitive forms, account pages, health/financial inputs, and other high-risk entry points.",
      "Gate replay or behavioral analytics behind the appropriate consent category where required by your policy.",
      "Verify collection endpoints do not receive sensitive field values or unmasked interaction content.",
      verifyStep,
    ]};
  }

  if (/vendor alignment|disclosure alignment|runtime vendor/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Compare ${subjectList} against the privacy/cookie disclosures and confirm whether each observed runtime vendor is disclosed clearly enough for review.`,
      "Add missing vendors or categories to the relevant notice, or remove/replace unexpected runtime vendors.",
      "Confirm vendor ownership where domains are operated by an ad-tech, analytics, or infrastructure partner.",
      "Retest after policy and tag changes so runtime and disclosure evidence can be matched.",
      verifyStep,
    ]};
  }

  if (/cross-border|endpoint/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      `Identify ${subjectList} and any other 3rd party endpoint hosts shown in the trace.`,
      "Confirm where each endpoint is operated, processed, or routed, using vendor documentation if needed.",
      "Update transfer, vendor, or subprocessor disclosures when the privacy policy does not cover the activity observed during the scan.",
      "Remove or regionalize endpoints that are not needed for the tested page or visitor context.",
      verifyStep,
    ]};
  }

  if (/rights/.test(normalizedCoverageArea)) {
    return { kind: "steps", steps: [
      "Add a clear method for users to exercise privacy rights, such as a web form, email, portal, or toll-free number where applicable.",
      "Make the method reachable from the privacy notice and relevant footer/privacy-choice surfaces.",
      "Describe the request types supported and any verification steps users should expect.",
      "Rerun the scan and confirm the rights-request method is found.",
      verifyStep,
    ]};
  }

  if (isGapOrReview) {
    return { kind: "steps", steps: [
      `Review the evidence details for the specific signal behind ${coverageArea}.`,
      "Update the affected consent, policy, tag-manager, vendor, or user-choice implementation.",
      "Retest in a fresh browser context so prior cookies or preferences do not hide the change.",
      verifyStep,
      evidenceStep,
    ]};
  }

  return {
    kind: "none",
    message: `${coverageArea} does not currently indicate a corrective action from this scan result.`,
    steps: [],
  };
}
