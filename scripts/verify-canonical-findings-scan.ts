import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { buildUnifiedFindingDisplayPackets, getUnifiedFindingCategoryRelation } from "../apps/web/lib/scans/unified-findings";
import { buildChildContextFallbackEvidence } from "../apps/web/lib/scans/signal-fallback-evidence";

type CandidateDefinition = {
  evidenceCategoryId: string;
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
  title: string;
  unifiedFindingId: string;
  buildCandidate: (snapshot: Record<string, unknown> | null, explicitSignals: Set<string>) => {
    description: string;
    fallbackEvidence?: Record<string, unknown> | null;
    observedValue: string;
  } | null;
};

const CANDIDATES: CandidateDefinition[] = [
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("privacy.children_privacy_context_without_supporting_disclosure");
      const derived =
        (snapshot?.children_audience_likely === true || snapshot?.kid_directed_content_detected === true) &&
        snapshot?.privacy_policy_present !== true &&
        snapshot?.privacy_contact_channel_type === "none";

      if (!explicit && !derived) {
        return null;
      }

      return {
        description: "Child-directed context without supporting privacy disclosure.",
        fallbackEvidence: buildChildContextFallbackEvidence({
          signalKey: "privacy.children_privacy_context_without_supporting_disclosure",
          signalLabel: "Child-directed context without supporting privacy disclosure",
          signalValue: true,
          snapshot
        }),
        observedValue: "Child-directed context with missing disclosure support"
      };
    },
    evidenceCategoryId: "children_youth_directed_data_practices",
    key: "privacy.children_privacy_context_without_supporting_disclosure",
    label: "Child-directed context without supporting privacy disclosure",
    severity: "medium",
    title: "Child-directed context without supporting privacy disclosure"
    ,
    unifiedFindingId: "children_privacy_context_without_supporting_disclosure"
  },
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("privacy.consent_surface_missing");
      const derived =
        snapshot?.consent_mechanism_type === "none" &&
        snapshot?.cookie_banner_present !== true &&
        !snapshot?.cmp_vendor_name &&
        (!snapshot?.consent_interaction_model || snapshot?.consent_interaction_model === "none");

      if (!explicit && !derived) {
        return null;
      }

      return {
        description: "No visible consent surface was detected during the scan.",
        observedValue: "No visible consent surface detected"
      };
    },
    evidenceCategoryId: "consent_interface_control_availability",
    key: "privacy.consent_surface_missing",
    label: "Consent surface missing",
    severity: "medium",
    title: "Consent surface missing",
    unifiedFindingId: "consent_surface_missing"
  },
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("privacy.consent_mechanism_absent");
      const derived = snapshot?.consent_mechanism_type === "none";

      if (!explicit && !derived) {
        return null;
      }

      return {
        description: "No consent mechanism was detected in the scanned experience.",
        observedValue: "Consent mechanism type: none"
      };
    },
    evidenceCategoryId: "consent_framework_cmp_signals",
    key: "privacy.consent_mechanism_absent",
    label: "Consent controls absent",
    severity: "medium",
    title: "Consent controls absent",
    unifiedFindingId: "consent_mechanism_absent"
  },
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("privacy.privacy_contact_channel_missing");
      const derived = snapshot?.privacy_contact_channel_type === "none";

      if (!explicit && !derived) {
        return null;
      }

      return {
        description: "No privacy-specific contact path was retained in the scan evidence.",
        observedValue: "Privacy contact channel: none"
      };
    },
    evidenceCategoryId: "privacy_contacts_accountability",
    key: "privacy.privacy_contact_channel_missing",
    label: "Privacy contact path missing",
    severity: "medium",
    title: "Privacy contact path missing",
    unifiedFindingId: "privacy_contact_channel_missing"
  },
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("privacy.sale_sharing_controls_missing");
      const retargetingObserved = snapshot?.retargeting_pixel_detected === true;
      const controlsMissing = snapshot?.do_not_sell_link_present === false;
      if (!explicit && !(retargetingObserved && controlsMissing)) {
        return null;
      }

      return {
        description: "Retargeting-like behavior was observed without a surfaced sale/sharing control path.",
        observedValue: "Retargeting observed without do-not-sell/share control"
      };
    },
    evidenceCategoryId: "opt_out_choice_design_dark_pattern_risk",
    key: "privacy.sale_sharing_controls_missing",
    label: "Sale or sharing controls missing",
    severity: "medium",
    title: "Sale or sharing controls missing",
    unifiedFindingId: "sale_sharing_controls_missing"
  },
  {
    buildCandidate(snapshot, explicitSignals) {
      const explicit = explicitSignals.has("accessibility.accessibility_support_path_missing");
      const derived = snapshot?.accessibility_contact_method_present === false;

      if (!explicit && !derived) {
        return null;
      }

      return {
        description: "No accessibility-specific support or accommodation path was retained in the scan evidence.",
        observedValue: "Accessibility support path missing"
      };
    },
    evidenceCategoryId: "accessibility_commitments_support_paths",
    key: "accessibility.accessibility_support_path_missing",
    label: "Accessibility support path missing",
    severity: "medium",
    title: "Accessibility support path missing",
    unifiedFindingId: "accessibility_support_path_missing"
  }
];

async function main() {
  const scanId = process.argv[2];
  if (!scanId) {
    throw new Error("Usage: verify-canonical-findings-scan.ts <scan-id>");
  }

  const db = createDatabaseClient(process.env);
  const { data: snapshotRow, error: snapshotError } = await db
    .from("scan_snapshots")
    .select(
      [
        "children_audience_likely",
        "kid_directed_content_detected",
        "privacy_policy_present",
        "privacy_contact_channel_type",
        "consent_mechanism_type",
        "cookie_banner_present",
        "cmp_vendor_name",
        "consent_interaction_model",
        "retargeting_pixel_detected",
        "do_not_sell_link_present",
        "accessibility_contact_method_present"
      ].join(", ")
    )
    .eq("scan_id", scanId)
    .maybeSingle();

  if (snapshotError) {
    throw snapshotError;
  }

  const snapshot = (snapshotRow ?? null) as Record<string, unknown> | null;
  const { data: signals, error: signalsError } = await db
    .from("scan_signals")
    .select("signal_key")
    .eq("scan_id", scanId);

  if (signalsError) {
    throw signalsError;
  }

  const explicitSignals = new Set((signals ?? []).map((signal) => signal.signal_key));
  const reviewFindingCandidates = CANDIDATES.flatMap((definition) => {
    const candidate = definition.buildCandidate(snapshot, explicitSignals);
    if (!candidate) {
      return [];
    }

    return [
      {
        description: candidate.description,
        fallbackEvidence: candidate.fallbackEvidence ?? undefined,
        observedValue: candidate.observedValue,
        severity: definition.severity,
        signalKey: definition.key,
        signalLabel: definition.label,
        signalSource: "snapshot_signal" as const,
        sourceType: "signal" as const,
        title: definition.title
      }
    ];
  });

  const packets = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const results = CANDIDATES.map((definition) => {
    const packet = packets.find((candidate) => candidate.unifiedFindingId === definition.unifiedFindingId);
    const explicitSignal = explicitSignals.has(definition.key);
    return {
      categoryRelation: packet ? getUnifiedFindingCategoryRelation(packet, definition.evidenceCategoryId) : null,
      evidenceCategoryId: definition.evidenceCategoryId,
      explicitSignal,
      key: definition.key,
      unifiedFindingId: definition.unifiedFindingId,
      presentationStatus: packet?.presentationDecision.status ?? null,
      surfaced: Boolean(packet)
    };
  });

  console.log(
    JSON.stringify(
      {
        results,
        snapshot
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
