import {COVERAGE_MAP} from './audit-progress-coverage';

export type CoverageCell = {status:string; detail:string};
export type CoverageItem = {id:string; item:string; report:CoverageCell; standard:CoverageCell; full:CoverageCell; audit:CoverageCell; metricIds:string[]};
const c=(status:string,detail:string):CoverageCell=>({status,detail});
const shown=(detail:string)=>c('Conditional',detail);
const included=(detail:string)=>c('Included',detail);
const partial=(detail:string)=>c('Partial',detail);
const omitted=(detail:string)=>c('Not included',detail);
const tracked=(detail:string)=>c('Tracked',detail);
const untracked=(detail:string)=>c('Not tabulated',detail);
const row=(id:string,item:string,report:CoverageCell,standard:CoverageCell,full:CoverageCell,audit:CoverageCell,metricIds:string[]=[]):CoverageItem=>({id,item,report,standard,full,audit,metricIds});
const checks=(label:string)=>shown(`${label}; retained checks follow the report’s review focus.`);
const publicCheck=included('Bounded checklist/finding rows; evidence states and verdicts are separate.');
const fullCheck=included('Displayed rows, summaries and evidence references; diagnostic JSON is excluded.');
const auditCheck=tracked('Returned evidence states and verdicts; missing or unreturned checks remain unavailable.');
const internal=omitted('Internal audit diagnostics, not a customer report field.');
const noPublic=omitted('Not part of the standard SDK Evidence JSON.');
const noFull=omitted('Not part of the full report-display JSON allowlist.');

/** Capability comparison, not a claim that every historical scan contains each item.
 * Standard = SDK pulse.evidence/detail=evidence (the Mac mini bot file).
 * Full = API v2 report-evidence?format=download, report_display_content.
 * Full is a different projection, not a guaranteed superset of standard.
 */
const ITEMS:Record<(typeof COVERAGE_MAP)[number]['id'],CoverageItem[]>={
  site_integrity:[
    row('findings','Site-integrity findings',shown('Box appears when retained findings exist.'),partial('Surfaced finding narrative and bounded finding evidence.'),partial('Generic findings can be included; the dedicated siteIntegrity field is not allowlisted.'),tracked('Canonical finding IDs; incomplete inventories stay explicit.')),
    row('links','Inspected links and retained link evidence',shown('Finding-specific link evidence and inspection context.'),partial('Finding examples only; no dedicated complete siteIntegrity projection.'),omitted('Dedicated siteIntegrity projection is omitted; generic findings are not equivalent.'),tracked('Recent sealed projections provide inspected-link and retained-evidence counts.'),['site.links_inspected','site.link_evidence']),
  ],
  cmp:[
    row('provider','CMP provider / identity',shown('Recognized provider and evidence availability.'),included('executiveSummary.consentPlatform.'),included('consentVendor and public cmpAudit experience.'),tracked('Provider states, kept separate from action support.'),['cmp_provider']),
    ...([
      ['banner','Cookie banner available','checklist.consent_surface_observed'],
      ['reject','Option to reject cookies available','checklist.reject_all_path_availability'],
      ['prominence','Accept / Reject prominence comparison','sealed.cmp_check.prominence'],
      ['categories','Selection by categories available','sealed.cmp_check.categories'],
      ['services','Individual services identified in the CMP','sealed.cmp_check.services'],
      ['privacy_link','Link to privacy policy available','privacy_policy'],
      ['privacy_access','Privacy-policy link reachable before consent','sealed.cmp_check.privacy_access'],
      ['consent_record','Client-side consent decision recorded','sealed.cmp_check.consent_record'],
      ['implementation','Tracking activity after consent choices','sealed.cmp_check.implementation'],
      ['duration','Consent-cookie expiry observed','sealed.cmp_check.duration'],
      ['declared_not_found','CMP declarations compared with capture','sealed.cmp_check.declared_not_found'],
      ['found_not_declared','Observed cookies missing from CMP declarations','sealed.cmp_check.found_not_declared'],
      ['cookie_information','Cookie information / storage duration','sealed.cmp_check.cookie_information'],
    ] as const).map(([id,label,metric])=>row(id,label,shown('Named CMP criterion; may be not assessed or linked to shared evidence.'),['banner','reject','privacy_link'].includes(id)?publicCheck:partial('Related checklist/finding facts may be returned; no complete cmpAudit.rows inventory.'),included('Named public cmpAudit row and detailedEvidence section, when retained.'),tracked(metric.startsWith('sealed.')?'Separate retained CMP criterion status; old missing criteria remain unavailable.':'Related canonical control/checklist state; not a byte-for-byte CMP row copy.'),[metric])),
    row('defaults','Framework signals and optional defaults',shown('Returned CMP/consent evidence.'),included('Consent-surface and checklist facts, when retained.'),included('Public CMP and consent rows.'),auditCheck,['checklist.cmp_framework_signal_observed','checklist.consent_optional_defaults_on']),
    row('screenshots','Banner and choice screenshots',shown('Previews when retained and accessible.'),partial('Screenshot references, not image bytes.'),partial('Report scan/snapshot links when supplied; image bytes excluded.'),untracked('No image-content or screenshot-quality comparison.')),
  ],
  consent:[
    ...(['accept','reject','options'] as const).map(action=>row(action,`${action[0]!.toUpperCase()+action.slice(1)} control presence`,shown('First-layer control status; shared evidence may link to CMP details.'),included('consentSurfaceEvidence.firstLayerConsentChoices.'),included('controls and public consent rows.'),tracked('Observed, not observed, unknown and unavailable remain separate.'),['control.'+action])),
    ...(['accept','reject'] as const).flatMap(action=>[
      row(action+'_execution',`${action==='accept'?'Accept':'Reject'} click / execution`,shown('Available path card; execution is separate from registration.'),included(`post${action==='accept'?'Accept':'Refusal'}Observation execution and after-action summary, when retained.`),included(`${action}Path display projection.`),tracked('Click completion, execution, returned verdict and stop reason.'),['click.'+action,'execution.'+action,'detail.'+action+'.verdict']),
      row(action+'_registration',`${action==='accept'?'Accept':'Reject'} initial registration`,shown('Registration facts when projected; no inference from a completed click.'),included('Returned registration / confirmation summary; version dependent.'),partial('Display-path registration facts; not the complete source packet.'),tracked('Initial registration remains independent of terminal verification.'),['registration.'+action]),
      row(action+'_terminal',`${action==='accept'?'Accept':'Reject'} terminal verification`,partial('Path display may summarize confirmation; no separate raw terminal-witness box.'),partial('Newer confirmation summaries can state terminal verification; the complete bound witness is not guaranteed.'),partial('Display path only; not the underlying terminal witness and capture packet.'),tracked('Strict source-bound terminal witness and capture checks; optional v2 audit extract supplements older public gaps.'),['terminal.'+action,'sealed.terminal.audit_'+action]),
      row(action+'_activity',`${action==='accept'?'Accept':'Reject'} after-click activity`,shown('Retained activity and observation limitations inside the path card.'),included('Bounded after-action counts and observations.'),included('Path evidence rows, timeline and coverage.'),tracked('Request/storage counts and capture limits; not a claim of effectiveness.'),[action+'.requests',action+'.storage_writes']),
    ]),
  ],
  tracking:[
    ...([
      ['tracking','Pre-consent third-party tracking','pre_consent_third_party_tracking'],
      ['iframes','Third-party iframes','third_party_iframe_pre_consent'],
      ['social','Social-media embeds','social_media_embed_pre_consent'],
      ['embedded','Embedded content','embedded_content_pre_consent'],
      ['replay','Session replay / fingerprinting review','session_replay_fingerprinting_review'],
      ['device','Device-identification signals','device_identification_fingerprinting_signal_observed'],
    ] as const).map(([id,label,metric])=>row(id,label,checks(label),publicCheck,fullCheck,auditCheck,['checklist.'+metric])),
    row('per_page','Per-page / sitewide observations',shown('Sitewide variant when available.'),partial('Starting-page bounded inventories; not the full-site display inventory.'),included('Full-site report rows when the authorized completed full-site export is available.'),untracked('No full per-page report replication.')),
  ],
  policy:[
    row('link','Privacy-policy link / surface',checks('Policy discovery'),publicCheck,fullCheck,auditCheck,['privacy_policy']),
    ...([
      ['controller_contact','Controller / contact'],['processing_purposes','Processing purposes'],['legal_basis','Legal basis'],
      ['recipients_or_vendor_categories','Recipients / vendor categories'],['data_retention','Retention'],['data_subject_rights','Data-subject rights'],
      ['international_transfers','International transfers'],['dpo_contact','DPO contact'],['supervisory_authority','Supervisory authority'],
      ['automated_decision_making_or_profiling','Automated decisions / profiling'],
    ] as const).map(([id,label])=>row(id,label,checks(label),publicCheck,fullCheck,auditCheck,['topic.'+id])),
    row('cookie_notice','Cookie notice / policy',checks('Cookie disclosures'),publicCheck,fullCheck,auditCheck,['checklist.cookie_notice_policy_availability']),
    row('stale_framework','Outdated transfer-framework references',checks('Framework references'),publicCheck,fullCheck,auditCheck,['checklist.outdated_transfer_framework_reference']),
    row('passages','Supporting excerpts and source links',shown('Policy evidence viewer and supporting passages.'),partial('Bounded topic/finding examples and source links; no complete policy text.'),included('Displayed policy evidence/passages and references where retained; not necessarily full document bytes.'),partial('Topic and source-availability states; passages are not individually tabulated.')),
  ],
  accessibility:[
    row('coverage','Audit status and scope',shown('Box requires an accessibility projection.'),included('accessibilityAudit summary and coverage.'),included('accessibilityAudit and retained accessibilityEvidence.'),tracked('Coverage, unavailable results and manual review remain distinct.'),['accessibility','accessibility.coverage']),
    row('rules','Failed rules / affected nodes',shown('Retained violations and counts.'),partial('Summary counts and bounded finding examples.'),included('Displayed rules, nodes and retained examples, within capture limits.'),tracked('Failed-rule and affected-node counts plus canonical findings.'),['accessibility.failed_rules','accessibility.affected_nodes']),
    row('manual','Manual-review rules',shown('Retained manual-review items.'),included('reviewRuleCount and example coverage in the summary.'),included('Retained review items and limitations.'),tracked('Manual-review counts and coverage.'),['accessibility.review_rules']),
    row('examples','Individual node examples',shown('Bounded examples, not a complete DOM.'),partial('Bounded examples; omitted-node coverage can be returned.'),partial('Retained display examples only; no full DOM.'),partial('Example coverage is tracked; individual nodes are not tabulated.'),['accessibility.examples']),
  ],
  page_information:[
    ...['Platform','Version','Industry (estimated)','Language','Page title'].map((label,i)=>row('metadata_'+i,label,shown('Non-compact Page information; unknown values omitted.'),partial('Some context may occur elsewhere; no equivalent Page information inventory.'),included('scan / siteMetadata fields where present in the report model.'),untracked('No dedicated daily metric for this displayed metadata field.'))),
  ],
  runtime:[
    row('classification','Pre-consent storage classification',checks('Storage classification'),included('executiveSummary and storageEvidenceSummary.'),included('Runtime rows and displayed inventories.'),tracked('Classification and unknown-record counts.'),['detail.storage.classification','storage.unclassified']),
    row('writes','Timestamped writes versus snapshot-only records',shown('Retained cookie/storage evidence; coverage qualifications apply.'),included('storageEvidenceSummary distinguishes retained proof and snapshot records.'),partial('Displayed inventory/context; not a guaranteed copy of the standard summary counters.'),tracked('Separate write and snapshot counts.'),['storage.proven_writes','storage.snapshot_only']),
    row('inventory','Cookie and vendor inventories',shown('Displayed inventory and runtime checks.'),included('Bounded cookieStorageInventory, trackerVendorInventory and footprint data.'),included('Displayed inventory/resource/service records; internal occurrences excluded.'),partial('Counts, classification and caps; not every inventory item.'),['inventory.cookies','inventory.vendors']),
    row('requests','Unclassified requests / inventory truncation',shown('Retained inventory and coverage limitations.'),included('Bounded request inventory and cap metadata.'),partial('Visible resource fields and limitations; raw occurrence details excluded.'),tracked('Unknown-request counts and returned inventory caps.'),['inventory.unclassified_requests','detail.inventory.requests']),
  ],
  privacy:[
    row('workpaper','California review and coverage',shown('California focus only.'),partial('Selected findings and public summaries; no complete California workpaper projection.'),included('californiaPrivacyReview, privacyAuditEvidence and displayed coverage when in focus.'),partial('Canonical findings/choice records; not every workpaper subfield.')),
    row('rights','Rights / collection-notice / sale-sharing assessments',shown('Retained California review assessments.'),partial('Bounded related findings, not the complete assessment set.'),included('Public review/score assessment fields where retained and in focus.'),partial('Selected canonical record states; full subfield coverage is not tabulated.')),
    row('optout','First-layer opt-out control presence',shown('California choices / presence evidence where available.'),c('Version dependent','Explicit first-layer opt-out fields start at pulse-public-v11; v4/v5/v10 do not export them.'),partial('Public California choice evidence; not necessarily the same first-layer inventory contract.'),tracked('Public presence and retained assessment are separate rows.'),['control.privacyOptOut','sealed.control.privacyOptOut']),
    row('canonical','Canonical GPC / GPP / opt-out result records',shown('Applicable surfaced findings; neutral records need not appear as findings.'),partial('Public finding list is not the complete canonical GPC/opt-out record inventory.'),partial('Displayed findings/workpapers only, not every canonical record.'),tracked('Exact IDs with surfaced / not surfaced / not returned / unavailable states.')),
  ],
  transport:[
    ...([['https_delivery','HTTPS delivery'],['tls_certificate','TLS certificate'],['http_redirect','HTTP redirect'],['mixed_content','Mixed content'],['form_transport','Form transport']] as const).map(([id,label])=>row(id,label,checks(label),publicCheck,fullCheck,auditCheck,['checklist.transport_security_'+id])),
  ],
  forms:[
    row('counts','Form counts and capture phase',shown('Forms & fields in non-compact layout; forms can also appear in other report views.'),included('formsSummary counts and pre-consent / after-Accept states.'),included('formsSummary and displayed collection records.'),tracked('Observed counts and capture states.'),['forms.observed','detail.forms.before','detail.forms.after']),
    row('fields','Individual fields, type, required state and confidence',shown('Retained read-only field metadata; no entered field values.'),omitted('formsSummary is a summary, not the complete field inventory.'),included('collectionSurfaces / collectionTableRows retain field metadata; repeated records may use reportContentRef.'),untracked('No item-level field inventory table.')),
    row('action','Form action host, method and evidence references',shown('Retained form metadata.'),partial('Related bounded findings may expose facts; no complete form inventory.'),included('Displayed form action metadata and evidence references.'),untracked('No complete field/action-host comparison.')),
    row('snapshots','Form snapshots',shown('When a retained snapshot is available in the report view.'),omitted('Standard formsSummary does not embed form screenshots.'),partial('Snapshot download links and status, not image bytes.'),untracked('No screenshot-content comparison.')),
  ],
  gpc:[
    row('delivery','GPC delivery and response',shown('California focus; unavailable projection has a limited box.'),included('Verified gpcResponse public projection, when retained.'),included('Verified gpcResponse, filtered by review focus and delivery checks.'),tracked('Path, delivery and response states.'),['gpc_delivery','detail.gpc.response']),
    row('receipt','CMP receipt and semantic readiness',shown('Receipt and readiness evidence when retained.'),included('gpcResponse observation fields; older missing details remain absent.'),included('Public GPC observation fields when verified and in focus.'),tracked('Receipt, readiness reason and checkpoint timing; no honoring inference.'),['detail.gpc.cmp_receipt','detail.gpc.semantic_readiness']),
    row('pair','Paired behavioral window / request counts',shown('Available paired activity comparison.'),included('gpcResponse.activityComparison with retained counts and window coverage.'),included('Same public paired comparison when verified and in focus.'),tracked('Bound pairs/windows; advertising/analytics counts stay source-qualified.'),['detail.gpc.paired_pair','detail.gpc.paired_window']),
    row('cmp_pair','Paired CMP snapshots and sale/sharing transitions',shown('Available paired settings and scope in GPC evidence.'),c('Version dependent','cmpStateComparison only when returned and bound; historical absence stays unavailable.'),c('Version dependent','Public paired CMP projection when retained, valid and in focus.'),tracked('Public paired data and optional v2 audit summaries are separate sources.'),['detail.gpc.paired_cmp','sealed.choice_evidence.paired_cmp','sealed.choice_evidence.paired_sale_transition','sealed.choice_evidence.paired_sharing_transition']),
    row('full_visit','Full-visit collection and horizon',shown('Retained GPC collection evidence and coverage.'),included('gpcResponse.observation requests and full-visit coverage, when retained.'),included('Verified public observation; distinct from the paired window.'),tracked('Full-visit counts/horizon and early-zero/later-positive coverage remain separate.'),['detail.gpc.session_collection','detail.gpc.session_request_coverage','detail.gpc.early_zero_later_collection']),
    row('samples','Request roles, processing declarations and recipients',shown('Retained qualified activity/collection evidence; bounded examples.'),partial('Public classified/capped samples and declarations; no raw request bodies.'),partial('Verified public projection and display examples; not raw browser evidence.'),partial('Supported/unresolved roles, declarations, recipient counts and caps; not every raw request.')),
  ],
  cms:[
    row('detections','Technology / CMS / plugin detections',shown('Box shown only when detections exist.'),omitted('No complete cmsSecurity inventory in the standard evidence projection.'),included('Public cmsSecurity detections, plugins and technology inventory when schema/scan binding is valid.'),partial('Recent sealed detection counts and availability; not full versions inventory.'),['technology.detections']),
    row('advisories','Advisory matches and version evidence',shown('Applicable retained advisory evidence.'),partial('Related surfaced finding facts only; no complete advisory projection.'),included('Public advisory and detection/version details when retained.'),partial('Recent sealed advisory-match counts.'),['technology.matches']),
  ],
  audit_choices:[
    row('configuration','Configured enablement / worker outcome / limitation',internal,noPublic,noFull,tracked('Separate configured, lane outcome and limitation states.'),['sealed.opt_out.configured','sealed.opt_out.lane','sealed.opt_out.lane_stop']),
    row('route','Broader opt-out routes / signals / scope',partial('Related California presence and policy evidence, not an audit diagnostic box.'),partial('Related public facts do not supply the full persisted opt-out summary.'),partial('Displayed California facts, not the full internal summary.'),tracked('Presence, basis, inspection scope and signal scope separately.'),['sealed.opt_out.presence','sealed.opt_out.scope']),
    row('dispatch','Packet / recipe / dispatch / action execution',internal,noPublic,noFull,tracked('Presence, configured enablement and dispatch are distinct; missing packet is not failed action.'),['sealed.opt_out.packet','sealed.opt_out.recipe','sealed.opt_out.dispatch','sealed.opt_out.actions']),
    row('submission','Submission / registration / confirmation / effectiveness',partial('Applicable customer assessment summaries; not all internal stage diagnostics.'),partial('Selected finding evidence; not the complete stage summary.'),partial('Displayed California assessments; not the complete internal stage packet.'),tracked('Stages kept separate; source-bound v2 summaries only.'),['sealed.opt_out.submission','sealed.opt_out.registration','sealed.opt_out.choice_confirmation','sealed.opt_out.effectiveness']),
  ],
  audit_gpc:[
    row('coverage','Cross-scan paired/both-zero/baseline coverage',internal,partial('Per-scan inputs when retained, not cross-scan statistics.'),partial('Per-report inputs when retained, not cross-scan statistics.'),tracked('Coverage by compatible source/window, with missing packets unavailable.'),['detail.gpc.paired_advertising_opportunity']),
    row('source_groups','Cross-version qualification and measurement groups',internal,partial('Version and bounded per-scan proof metadata.'),partial('Public per-report metadata, not audit source-series groups.'),tracked('Separate source/schema/engine/window series; incompatible aggregate rates remain null.')),
  ],
  audit_operations:[
    row('acquisition','Pending IDs, cache reuse, additions and updates',internal,noPublic,noFull,tracked('Local delta/cache receipts; ID-only proof never supplies report contents.')),
    row('integrity','Original creator, source hashes and receipt ancestry',internal,partial('Export metadata and report-source hash; not the internal original-creator/receipt chain.'),partial('Public source references where projected; not the full audit chain.'),tracked('Verified local hashes, generation joins, original-creator proof and nested ancestry.')),
    row('gaps','Publication outcomes, exclusions and missing days/files',partial('Individual report status/coverage; not the audit cohort inventory.'),partial('Per-scan outcome and limitations; missing files contain no data.'),partial('Authorized completed report content; no full attempt inventory.'),tracked('Separate cohort outcomes, exclusions, gaps and ID-only rows.'),['outcome','publication','evidence']),
  ],
  audit_references:[
    row('graphs','Relationship graphs and request ancestry',partial('Separate report inventory/graph views, outside these evidence boxes.'),partial('Bounded request/reference facts, not a full graph.'),omitted('Internal runtimeEvidenceGraph and graph JSON viewers excluded.'),partial('Verified reference availability and node/edge counts; deferred bytes not verified.'),['graph.nodes','graph.edges']),
    row('destinations','Form-destination trace',partial('May support other report views, not a standalone Detailed evidence box.'),omitted('No dedicated formDestinations projection.'),omitted('Dedicated formDestinations field is not allowlisted; displayed form action metadata is separate.'),partial('Recent sealed trace availability and event counts.'),['form.events']),
  ],
  audit_inventory:[
    row('records','Canonical record inventory and completeness',partial('Surfaced report content, not all internal canonical records.'),partial('Bounded projected findings and cap metadata.'),partial('Displayed findings and evidence sections, not every internal record.'),tracked('Canonical IDs and inventory completeness remain distinct from customer visibility.')),
    row('versions','Rates and summary coverage by date/version',internal,partial('Per-export schema/projection metadata only.'),partial('Per-report projection metadata only.'),tracked('Daily qualified rates, sample sizes and new-summary coverage; no incompatible pooled rate.')),
  ],
  audit_policy:[
    row('fetch','Policy candidate fetch and producer ownership',partial('Related policy evidence; not internal candidate diagnostics.'),omitted('Original fetch/ownership receipts intentionally omitted.'),partial('Displayed source context, not the complete producer verification receipt.'),tracked('Retained original artifacts and optional operations summary are separately qualified.'),['sealed.policy_fetch','sealed.policy_owner','sealed.operations.policy_fetch']),
    row('bytes','Policy full-text bytes and verification',partial('Supporting excerpts / links do not establish full-byte completeness.'),omitted('Full policy text and original artifact receipts are not included.'),partial('Displayed passages and links; not a complete raw policy artifact bundle.'),partial('Already-retained local byte verification and producer receipt states; no new fetch or full semantic review.'),['sealed.policy_full_text','sealed.operations.policy_text_receipt']),
  ],
};
/** Reviewed output notes retained from the original 99-row comparison. These are
 * migration/output annotations, not canonical evidence identities. */
export const COVERAGE_SOURCE_NOTES=COVERAGE_MAP.flatMap(area=>ITEMS[area.id].map(item=>({...item,key:area.id+'.'+item.id,areaId:area.id})));
