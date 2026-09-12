"use client";

import { createContext, useContext } from "react";

type RegulatoryChecklistAdvancedEvidenceContextValue = {
  expandAllAdvancedEvidence: boolean;
};

const RegulatoryChecklistAdvancedEvidenceContext = createContext<RegulatoryChecklistAdvancedEvidenceContextValue>({
  expandAllAdvancedEvidence: false
});

export const RegulatoryChecklistAdvancedEvidenceProvider = RegulatoryChecklistAdvancedEvidenceContext.Provider;

export function useRegulatoryChecklistAdvancedEvidence() {
  return useContext(RegulatoryChecklistAdvancedEvidenceContext);
}
