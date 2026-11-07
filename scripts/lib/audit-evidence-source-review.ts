import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const MASTER_SOURCE_REVIEW={
  "version": "certscore.audit-master-source-review.v1",
  "scope": "Owner-authorized production release review. Source changes reconciled with live ancestry; immutable historical receipts retain their original hashes.",
  "sources": [
    {
      "file": "apps/web/app/(marketing)/scan/[scanId]/page.tsx",
      "sha256": "5d5fb7e4a6e4eca88febbf3b5b5f891619a9e5dd10eadf7b6cf5c7a911aaaf04",
      "bytes": 7878,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/app/app/scans/[scanId]/page.tsx",
      "sha256": "61957af3a95945f75cd8a73bf6034197c36c8abd666e058893358493c4c37f9d",
      "bytes": 6779,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/components/scans/accessibility-evidence.tsx",
      "sha256": "919c0e87a9136110d0e7dba822b0db612f704e95cc3a04a67c7d3720dcbf172e",
      "bytes": 7996,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/components/scans/cmp-details.tsx",
      "sha256": "913a2203234121fb41c14d533b94c76402791d2879b5fb8c703fb8d3b6f21f22",
      "bytes": 24583,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/components/scans/cms-security-evidence.tsx",
      "sha256": "753d64f30345e6184e3bdecdb87f7f5108687717f60759117ec9e3956df2dd9f",
      "bytes": 10695,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/components/scans/evidence-columns.tsx",
      "sha256": "b0cac577f14e3593380515d56868f93fc764e72fb319bfa23eba63a2bd15d8cb",
      "bytes": 1242,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/components/scans/regulatory-review-focus.tsx",
      "sha256": "4b2a89a572514cb77122e7043682ee0449d0b2acc78d75614d5976ebed2c6cf7",
      "bytes": 29441,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/components/scans/report-lab/shadow-scan-report.tsx",
      "sha256": "e7f017eee677d5e017da10e8d69f908b13ac08c3aa49a63c2ea451e88732c951",
      "bytes": 114149,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/components/scans/site-integrity-evidence.tsx",
      "sha256": "f8a279a51d197a8e3d5e61715989de0e8229ee4ab32a8d52d98977b215a47067",
      "bytes": 14919,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/components/scans/sitewide-evidence-card.tsx",
      "sha256": "52beb862ed61b6be48127495f3608559e1b39f2ed7d1ad03d3be1505d2541d7f",
      "bytes": 4313,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/lib/scans/accessibility-report.ts",
      "sha256": "2ee6cc823f91b2e8b26344f83f13597343305880c37ea511f56a8003f92e6d5f",
      "bytes": 5078,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/lib/scans/california-privacy-evidence.ts",
      "sha256": "dca36f6b2f39ff6d8099c9197569baf1d40e00fe5988cd2242211dd6dd79f460",
      "bytes": 3228,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/lib/scans/cmp-audit-projection.ts",
      "sha256": "5ddb3c8814132cac446d8caf5e068587c252a507ea4193f3faa32ae80c0831f2",
      "bytes": 29898,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/scans/detailed-evidence-presentation.ts",
      "sha256": "4132a410eba006afa6f4fcb51458316b0713c19e2878c377e3ebfb4517d71f68",
      "bytes": 7836,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/scans/gpc-customer-policy.ts",
      "sha256": "ec3649cc132894ba4c440e1b296b1ee1820549621b1a6fd87c4fc72eca0ab266",
      "bytes": 2372,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/lib/scans/report-framework-scope.ts",
      "sha256": "3d28e3a9a0f0a056971386f45d603ecd07daa50459dd8c8fd5ff4bd8ab5808c8",
      "bytes": 3993,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/pulse/projection.ts",
      "sha256": "b0a79d60db47779c636cdc60ceccdbd8190afcddab19b4787c6b0882d03911af",
      "bytes": 118685,
      "review": "Owner-approved local 8 KiB versioned customer-consent evidence projection from persisted snapshot only; no deployment, historical rewrite or capture."
    },
    {
      "file": "packages/certscore-sdk/src/client.ts",
      "sha256": "8355bfaff567ad5486437f49df5135c933b103409c87fe58f4aada35f56bbec4",
      "bytes": 34177,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "packages/certscore-sdk/src/client.test.ts",
      "sha256": "245709779d6e74186ef80aa65be861ebd766a0ba7bd6e301c7e97c58dbf4095f",
      "bytes": 36983,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/app/api/v2/scans/[scanId]/report-evidence/route.ts",
      "sha256": "974895db3fc826240fda47b6aee4c183e8ef8b7d743921c849b7ef09a564dae1",
      "bytes": 11238,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/api-v2/report-display-export.ts",
      "sha256": "3bd2307665551fddd28396a9add01c37f05d2f5cb6fe5df3a607bbd06bc6838d",
      "bytes": 5956,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/api-v2/report-visible-fields.ts",
      "sha256": "31975870bbc6e94e4461ebfc9bd76101ce1085382e5416a9533a64845456411a",
      "bytes": 3318,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/lib/scans/detailed-evidence-report.ts",
      "sha256": "504c4eddb4992137edfc5e781507fd5f4856526b8ebbea52f174c68873894998",
      "bytes": 12666,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/lib/api-v2/after-action-summary.ts",
      "sha256": "dcc1aa545c41bc5a745d4eeedbf0f76e99333c7e0e1354e024af95d7f1e39010",
      "bytes": 3705,
      "review": "Existing report/export capability review; bytes reverified unchanged."
    },
    {
      "file": "apps/web/components/scans/report-lab/shadow-report-data.ts",
      "sha256": "d868e896386d2c9cdca5ed7b06d405408d119b327b5be9ac67ab0a5ad01cb47b",
      "bytes": 39155,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "scripts/lib/audit-progress-contracts.ts",
      "sha256": "f2a77d27912056dfffe7b3b162891e0b982bad78736ebe5f6489d9551b456a8f",
      "bytes": 21553,
      "review": "Reviewed audit-only priority delivery diagnostics and four independently source/scope-bound CMP arm states; no producer schema change."
    },
    {
      "file": "packages/certscore-contracts/src/site-metadata.ts",
      "sha256": "56d386f050b3a48477b518738e31c1c429c05c84e41865968acd80da5391aed7",
      "bytes": 3910,
      "review": "describeSiteTechnology: page summary, WordPress indicators, combined declarations and Unknown version differ from detection records."
    },
    {
      "file": "packages/certscore-contracts/src/technology-inventory.ts",
      "sha256": "91d6f145797597bc778bb898174e4b38e1dd2d46c3e109edc7ce7b6335288887",
      "bytes": 11616,
      "review": "technologyInventorySchema and matchTechnologySignal: supplemental identities, scope, confidence, conflict states and exact signal rules."
    },
    {
      "file": "apps/web/server/scans/cms-security-projection.ts",
      "sha256": "b9123e9876c461162169b1f3b10ca6f9cae6e85ef9fde8933b55263d53b95e1b",
      "bytes": 4763,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "apps/web/server/scans/technology-inventory-projection.ts",
      "sha256": "3d9b6f1aeb72b3db408cde79d73a91cd57bd1aa20cc359bf630055e7c0f7c1c2",
      "bytes": 3303,
      "review": "projectTechnologyInventory: exact main-document request/response joins for headers; no host-only attribution."
    },
    {
      "file": "packages/certscore-contracts/src/collection-surface-form.ts",
      "sha256": "9bf791ba4d28d33bf68de52d3d7babcdfb9ef6f29b1a3988bebe2018cd7a1b4f",
      "bytes": 5044,
      "review": "collectionSurfaceFieldSchema: confidence is numeric 0..1; disabled/readOnly are separate booleans; no entered values."
    },
    {
      "file": "apps/web/components/scans/collection-surfaces-table.tsx",
      "sha256": "9e9d6ee7f69e79d3b5621087a2a72b2401123df5753a4dd9d6ac7b50cbb803eb",
      "bytes": 20384,
      "review": "Field state is a displayed combination of disabled/readOnly; preserve both flags in logical contract."
    },
    {
      "file": "packages/certscore-contracts/src/consent-action-stages.ts",
      "sha256": "36eab8b2846c7934c4d95306659b034e45aa27188a1d842c3265181a9136c5de",
      "bytes": 8161,
      "review": "CONSENT_ACTION_EVIDENCE_STAGE_KEYS and evidenceStages: initial registration and terminal verification remain independent."
    },
    {
      "file": "packages/certscore-contracts/src/terminal-consent-decision.ts",
      "sha256": "6d70ba7f8823aa263521d87d640c8fc3d02d63127d60d07992cbc4584b8de7f2",
      "bytes": 2646,
      "review": "terminalConsentDecisionBound: exact action/control target and capture/read time binding."
    },
    {
      "file": "packages/certscore-contracts/src/gpc-cmp-state-comparison.ts",
      "sha256": "2c9352a4fb3579d6904af1f21cfedb12e5669134ff353387974cd501d6e7f7cf",
      "bytes": 4925,
      "review": "gpcCmpStateComparisonSchema: distinct source pairs, arm/purpose states and semantic checkpoints; v1/v2 scope separation."
    },
    {
      "file": "packages/certscore-contracts/src/gpc-activity-comparison.ts",
      "sha256": "73cc6ecea70ce74cc2ee693192911b882e96b85f76e5a4675761ac5969d637a9",
      "bytes": 2444,
      "review": "gpcActivityComparisonSchema: matched request window, fixed duration and separately bound collection samples."
    },
    {
      "file": "packages/certscore-contracts/src/cmp-audit-evidence.ts",
      "sha256": "7ded2d4d7ba7b3fe6ce92c05682307545b045a30d079b328354f51682f1ae891",
      "bytes": 48646,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    },
    {
      "file": "packages/certscore-contracts/src/site-integrity.ts",
      "sha256": "d69b9295c1d6db571bccdbc79f43b486000e6b72764fe0188bebe474d357072b",
      "bytes": 7288,
      "review": "Inspected-link count and retained bounded records have different scopes."
    },
    {
      "file": "packages/certscore-api-contracts/src/accessibility-audit.ts",
      "sha256": "c30a9b7129c3e2d74a5320a1dda163e734587e312585c323787d126dfb5c4c83",
      "bytes": 2262,
      "review": "apiAccessibilityAuditSummarySchema: rule/node/review counts and separate example coverage."
    },
    {
      "file": "packages/certscore-api-contracts/src/privacy-audit.ts",
      "sha256": "1d8fae2ebf1d4588ce08ceed289bd96f375ab31935918925e4157716ceffbaba",
      "bytes": 4131,
      "review": "privacyAuditEvidenceSchema: bounded source-bound controls/notices, explicit unverified negative coverage and neutral summary scope."
    },
    {
      "file": "apps/web/components/scans/report-lab/timeline-report-model.ts",
      "sha256": "708d9df13203521a04e512d470605d72e460e83cf20c0696dff64e24c2f4c0b1",
      "bytes": 40724,
      "review": "Three-way reconciliation preserves integrated report/form fixes and adds owner-requested canonical output parity. Static source reviewed for generation binding and public evidence safety."
    }
  ]
} as const;
export function verifyMasterSources(){
 for(const s of MASTER_SOURCE_REVIEW.sources){const bytes=readFileSync(new URL('../../'+s.file,import.meta.url));if(bytes.length!==s.bytes||createHash('sha256').update(bytes).digest('hex')!==s.sha256)throw Error('Unreviewed master-catalog source change: '+s.file);}
 return MASTER_SOURCE_REVIEW;
}
