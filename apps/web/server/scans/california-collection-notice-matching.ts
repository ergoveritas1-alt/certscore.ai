import {californiaCollectionNoticeV4Schema,californiaCollectionNoticeV5Schema} from "@certscore/contracts";
import {assessRuntimeStoragePurposes,assessRuntimeStoragePurposesV2} from "./runtime-storage-purpose-assessment";
import {
  californiaCollectionNoticeAssessmentSchema,californiaCollectionNoticeV2Schema,californiaCollectionNoticeV3Schema,californiaPolicyClauses,retainedCaliforniaPassage,collectionSurfaceInventorySchema,
  type CaliforniaPolicyDocument,type CaliforniaCollectionNoticeAssessment,type CanonicalEvidenceBundle,
} from "@certscore/contracts";

const baseline=(scenario:string|undefined)=>scenario === "pre_consent" || scenario === "fresh_pre_consent";
const containsToken=(text:string,token:string)=>Boolean(token) && new RegExp(`(?<![a-zA-Z0-9_-])${token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![a-zA-Z0-9_-])`,"i").test(text);
function normalizedUrl(value:string) {try {const url=new URL(value);url.search="";url.hash="";return url.toString();}catch{return null;}}
const categoryPatterns:Record<string,RegExp>={
  search:/\b(?:search (?:terms?|quer\w*|histor\w*|information)|(?:terms?|queries) (?:you|that you) (?:search|enter)|site search)\b/i,
  name:/\b(?:name|contact information|contact details)\b/i,email:/\b(?:e.?mail|contact information|contact details)\b/i,
  phone:/\b(?:phone|telephone|contact information|contact details)\b/i,address:/\b(?:address|contact information|contact details)\b/i,
  payment_card:/\b(?:credit cards?|payment cards?|card (?:details|information))\b/i,bank_account:/\b(?:bank account|financial account)\b/i,
  government_id:/\b(?:government (?:id|identification)|passport|driver.s licen[cs]e)\b/i,social_security_number:/\b(?:social security|ssn)\b/i,
  date_of_birth:/\b(?:date of birth|birth date|birthday)\b/i,health:/\b(?:health|medical)\b/i,geolocation:/\b(?:geolocation|precise location|location data)\b/i,
  file_upload:/\b(?:uploaded files?|attachments?|documents? (?:you|that you) (?:upload|submit))\b/i,
  selection:/\b(?:preferences?|selections?|choices?)\b/i,boolean_choice:/\b(?:preferences?|selections?|choices?)\b/i,website_url:/\b(?:website address|website url|web address)\b/i,
  password:/\b(?:password|login credentials|account credentials)\b/i,free_text:/\b(?:message|enquir\w*|inquir\w*|comments?|submitted content)\b/i,
};
const purpose=/\b(?:use\w*|collect\w*|process\w*|purpose\w*|provide\w*|respond\w*|answer\w*|enable\w*|remember\w*|track\w*)\b/i;

/** Matches retained wording and association, never legal notice adequacy. A
 * footer policy link does not establish association with a personal-data form
 * in this match; a notice need not be titled 'Notice at Collection'. */
export function matchCaliforniaCollectionNotices(input:{bundle:CanonicalEvidenceBundle;sourceHash:string;documentUrl:string;
  documents:CaliforniaPolicyDocument[];policyComplete:boolean;inventoryComplete:boolean}):CaliforniaCollectionNoticeAssessment {
  const {bundle,documents}=input;const clauses=californiaPolicyClauses(documents);
  const inventoryResult=collectionSurfaceInventorySchema.safeParse(bundle.collectionSurfaceInventory);
  const inventory=inventoryResult.success && baseline(inventoryResult.data.scenario) && inventoryResult.data.pageUrl === input.documentUrl ? inventoryResult.data:null;
  const points:CaliforniaCollectionNoticeAssessment["points"]=[];
  for(const form of inventory?.forms ?? []) {
    const fields=form.fields.filter(field=>!field.disabled && !field.readOnly);
    if(!fields.length) continue;
    const categories=[...new Set(fields.map(field=>field.semanticCategory))];
    const complete=input.inventoryComplete && !form.fieldsTruncated && !categories.includes("unknown");
    const supportsCategories=(text:string)=>categories.length>0 && categories.every(category=>categoryPatterns[category]?.test(text));
    const related=clauses.filter(clause=>supportsCategories(clause.text) && purpose.test(clause.text));
    const local=form.privacyDisclosure;
    const associationInspected=Boolean(local && !local.truncated && (local.version === 2 || local.excerpts.length>0));
    const inline=local?.excerpts.some(excerpt=>supportsCategories(excerpt.text) && purpose.test(excerpt.text)) === true;
    const linked=related.filter(clause=>local?.excerpts.some(excerpt=>excerpt.links.some(link=>normalizedUrl(link.url) === normalizedUrl(clause.document.url))));
    const association=inline || linked.length ? "form_notice" as const:"not_verified" as const;
    // Inline excerpts remain retained form evidence; policy passages are only
    // attached when a separately verified matching document was retained.
    const matched=association === "form_notice" && related.length>0 && local && !local.truncated;
    points.push({id:form.formRef,kind:"form",label:form.surfaceType === "search"?"Search form":form.title??`${form.surfaceType.replaceAll("_"," ")} form`,
      categories,status:!complete || !input.policyComplete || !associationInspected?"limited":matched?"matched_text":related.length?"policy_text_only":"not_matched",
      association,reason:!complete?"Field inventory is incomplete or includes unclassified fields.":!input.policyComplete?"Complete supported-language policy text was not verified.":!associationInspected?"The form-associated notice inspection is missing or truncated; no negative notice conclusion is supported.":matched?
        "Relevant category/purpose wording and a form-associated notice were retained. This is a text match, not a notice-adequacy conclusion.":related.length?
          "Relevant category/purpose wording exists in the policy, but its association with this collection point is unverified.":
          "No category/purpose notice match for the retained fields. Search input is recorded without assuming what a visitor would enter or submit.",
      evidenceRefs:form.evidenceRefs.map(ref=>ref.refId).slice(0,8),passages:(linked.length?linked:related).slice(0,2).map(clause=>retainedCaliforniaPassage(clause))});
  }
  const policyLinked=documents.some(document=>bundle.policySurfaceObservations.some(surface=>`policy-text:${surface.observationId}` === document.evidenceRef &&
    surface.linkSourcePageUrl === input.documentUrl && surface.linkVisibility === "visible" && surface.directlyLinkedFromScannedPage));
  const cookies=(bundle.cookieEvents??[]).filter(event=>baseline(event.scenario) && event.documentUrl === input.documentUrl);
  const storage=(bundle.storageSnapshots??[]).filter(snapshot=>baseline(snapshot.scenario) && snapshot.url === input.documentUrl &&
    snapshot.localStorageKeys.length+snapshot.sessionStorageKeys.length>0);
  if(cookies.length || storage.length) {
    const names=[...new Set(cookies.map(event=>event.cookieName))];
    const cookieText=clauses.filter(clause=>/\bcookies?\b/i.test(clause.text) && purpose.test(clause.text) ||
      names.some(name=>name && new RegExp(`(?<![a-zA-Z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![a-zA-Z0-9_-])`).test(clause.text)) && /\b(?:cookies?|session|identifier)\b/i.test(clause.text));
    const storageText=clauses.filter(clause=>/\b(?:local ?storage|session ?storage|browser storage)\b/i.test(clause.text) && purpose.test(clause.text));
    const matching=[...cookieText,...storageText];
    const allCategories=(!cookies.length || cookieText.length>0) && (!storage.length || storageText.length>0);
    points.push({id:"baseline-cookies-storage",kind:"cookies_storage",label:storage.length?"Observed cookies and browser storage":"Observed cookies",
      categories:[...(cookies.length?["cookie_identifiers"]:[]),...(storage.length?["browser_storage_keys"]:[])],
      status:!input.policyComplete?"limited":matching.length && policyLinked && allCategories?"matched_text":matching.length?"policy_text_only":"not_matched",
      association:policyLinked?"page_policy_link":"not_verified",reason:matching.length?allCategories?
        "Relevant cookie/storage wording is retained in the linked policy. Category relevance does not verify each purpose or the timing of notice.":
        "Policy wording matches some observed categories; cookie wording alone does not establish browser-storage disclosure. Review unmatched categories and purposes.":
        "Observed cookie/storage activity has no matched wording in the inspected policy; this alone does not establish a legal notice failure.",
      evidenceRefs:[...cookies.map(event=>event.eventId),...storage.map(snapshot=>snapshot.artifactId)].slice(0,8),passages:matching.slice(0,2).map(clause=>retainedCaliforniaPassage(clause))});
  }
  const contacts=(bundle.networkEvents??[]).filter(event=>baseline(event.scenario) && event.thirdParty && event.documentUrl === input.documentUrl);
  if(contacts.length) {
    const matching=clauses.filter(clause=>/\b(?:web ?site|brows\w*|online|internet|cookies?)\b/i.test(clause.text) &&
      /\b(?:third.part\w*|service providers?|partners?|google|recipients?)\b/i.test(clause.text));
    points.push({id:"baseline-third-party-resources",kind:"third_party_resources",label:"Third-party resource contacts",categories:["third_party_resource_activity"],
      status:!input.policyComplete?"limited":matching.length?"policy_text_only":"not_matched",association:policyLinked?"page_policy_link":"not_verified",
      reason:"Resource contacts are observed. Website/recipient wording can be located, but transmitted personal data, recipient roles and notice adequacy remain unassessed.",
      evidenceRefs:contacts.map(event=>event.eventId).slice(0,8),passages:matching.slice(0,2).map(clause=>retainedCaliforniaPassage(clause))});
  }
  return californiaCollectionNoticeAssessmentSchema.parse({contractVersion:"certscore.california-collection-notice-matching.v1",sourceBundleSha256:input.sourceHash,
    inventoryComplete:input.inventoryComplete,points,limitationKeys:["starting_page_only","notice_adequacy_not_assessed","no_form_submission",...(!input.policyComplete?["policy_text_unavailable"]:[])]});
}

/** V2 separates categories and requires a precise canonical product identity for
 * recipient wording. It never equates a resource request with collection of PI. */
export function matchCaliforniaCollectionNoticesV2(input:Parameters<typeof matchCaliforniaCollectionNotices>[0]) {
  const original=matchCaliforniaCollectionNotices(input);
  const clauses=californiaPolicyClauses(input.documents);
  const points:import("@certscore/contracts").CaliforniaCollectionNoticeV2["points"]=original.points.filter(point=>point.kind === "form").map(point=>({...point,
    kind:"form",scope:point.categories.length === 1 && point.categories[0] === "search"?"search_input":"form_fields",
    purposeMatch:point.passages.length?"wording_retained":"unresolved",recipientMatch:"not_assessed"}));
  const linked=input.documents.some(document=>input.bundle.policySurfaceObservations.some(surface=>`policy-text:${surface.observationId}` === document.evidenceRef &&
    surface.linkSourcePageUrl === input.documentUrl && surface.linkVisibility === "visible" && surface.directlyLinkedFromScannedPage));
  const cookies=(input.bundle.cookieEvents??[]).filter(event=>baseline(event.scenario) && event.documentUrl === input.documentUrl);
  const storage=(input.bundle.storageSnapshots??[]).filter(snapshot=>baseline(snapshot.scenario) && snapshot.url === input.documentUrl && snapshot.localStorageKeys.length+snapshot.sessionStorageKeys.length>0);
  for(const kind of ["cookies","browser_storage"] as const) {
    if(kind === "cookies"?!cookies.length:!storage.length)continue;
    const category=kind === "cookies"?/\bcookies?\b/i:/\b(?:local ?storage|session ?storage|browser storage)\b/i;
    const matching=clauses.filter(clause=>category.test(clause.text) && purpose.test(clause.text));
    const retained=matching.length>0;
    const matched=kind === "cookies"?cookies.every(cookie=>matching.some(clause=>containsToken(clause.text,cookie.cookieName) ||
      cookie.cookiePurpose && cookie.cookiePurpose!=="unknown" && containsToken(clause.text,cookie.cookiePurpose.replaceAll("_"," ")))):
      storage.every(snapshot=>[...snapshot.localStorageKeys,...snapshot.sessionStorageKeys].every(key=>matching.some(clause=>containsToken(clause.text,key))));
    points.push({id:`baseline-${kind}`,kind,label:kind === "cookies"?"Observed cookies":"Observed browser storage",
      scope:kind === "cookies"?"cookie_identifiers":"storage_keys",categories:[kind === "cookies"?"cookie_identifiers":"browser_storage_keys"],
      status:!input.policyComplete?"limited":matched && linked?"matched_text":retained?"policy_text_only":"not_matched",
      association:linked?"page_policy_link":"not_verified",purposeMatch:matched?"wording_retained":"unresolved",recipientMatch:"not_assessed",
      reason:matched?"Category and item/purpose wording retained in the policy; notice timing and legal adequacy remain separate checks.":retained?
        "Category wording exists, but it does not resolve every observed item or its canonically identified purpose. Generic wording alone receives no full match credit.":
        kind === "cookies"?"No cookie category/purpose wording matched in the inspected policy.":"No browser-storage category/purpose wording matched; cookie wording is assessed separately.",
      evidenceRefs:(kind === "cookies"?cookies.map(event=>event.eventId):storage.map(snapshot=>snapshot.artifactId)).slice(0,8),
      passages:matching.slice(0,2).map(clause=>retainedCaliforniaPassage(clause,category))});
  }
  const contacts=(input.bundle.networkEvents??[]).filter(event=>baseline(event.scenario) && event.thirdParty && event.documentUrl === input.documentUrl);
  const contactIds=new Set(contacts.map(event=>event.eventId));
  const vendors=(input.bundle.normalizedVendorObservations??[]).filter(vendor=>vendor.registryAttribution && vendor.product && vendor.matchSources.some(match=>baseline(match.scenario) && match.sourceEventId && contactIds.has(match.sourceEventId)));
  const unique=vendors.filter(vendor=>!vendors.some(other=>other!==vendor && other.registryAttribution!.serviceId!==vendor.registryAttribution!.serviceId &&
    vendor.matchSources.some(match=>baseline(match.scenario) && match.sourceEventId && contactIds.has(match.sourceEventId) && other.matchSources.some(otherMatch=>baseline(otherMatch.scenario) && otherMatch.sourceEventId === match.sourceEventId))));
  const seen=new Set<string>(),covered=new Set<string>();
  for(const vendor of unique) {
    const identity=vendor.registryAttribution!.serviceId;if(seen.has(identity))continue;seen.add(identity);
    const refs=[...new Set(vendor.matchSources.filter(match=>baseline(match.scenario) && match.sourceEventId && contactIds.has(match.sourceEventId)).map(match=>match.sourceEventId!))];
    refs.forEach(ref=>covered.add(ref));
    const product=new RegExp(`(?<![a-zA-Z0-9])${vendor.product!.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?![a-zA-Z0-9])`,"i");
    const recipient=clauses.filter(clause=>product.test(clause.text));
    const matching=recipient.filter(clause=>purpose.test(clause.text));
    points.push({id:`recipient-${identity}`,kind:"third_party_resources",label:`${vendor.product} resources`.slice(0,120),scope:"resource_contact_only",
      categories:[vendor.purpose],status:!input.policyComplete?"limited":recipient.length?"policy_text_only":"not_matched",
      association:linked?"page_policy_link":"not_verified",purposeMatch:matching.length?"wording_retained":"unresolved",recipientMatch:recipient.length?"wording_retained":"unresolved",
      reason:recipient.length?"Precise product wording retained. Requests prove resource contact; transmitted personal data and recipient legal roles remain unassessed.":
        "No precise product wording matched. Generic provider wording or another product from the same vendor does not establish this product's disclosure.",
      evidenceRefs:refs.slice(0,8),passages:(matching.length?matching:recipient).slice(0,2).map(clause=>retainedCaliforniaPassage(clause,product))});
  }
  const remaining=contacts.filter(event=>!covered.has(event.eventId));
  if(remaining.length)points.push({id:"unattributed-third-party-resources",kind:"third_party_resources",label:"Other third-party resources",scope:"resource_contact_only",
    categories:["third_party_resource_activity"],status:"limited",association:"not_verified",purposeMatch:"unresolved",recipientMatch:"unresolved",
    reason:"Resource contact retained without one verified canonical product attribution; no recipient or data-category match is inferred.",evidenceRefs:remaining.map(event=>event.eventId).slice(0,8),passages:[]});
  return californiaCollectionNoticeV2Schema.parse({contractVersion:"certscore.california-collection-notice-matching.v2",sourceBundleSha256:input.sourceHash,
    inventoryComplete:input.inventoryComplete && points.length<=12,points:points.slice(0,12),
    limitationKeys:[...original.limitationKeys,...(points.length>12?["matching_points_truncated"]:[])]});
}

/** V3 assesses disclosed categories/purposes separately from technical names.
 * Only canonical baseline observations establish what can be compared. */
export function matchCaliforniaCollectionNoticesV3(input:Parameters<typeof matchCaliforniaCollectionNotices>[0]) {
  const previous=matchCaliforniaCollectionNoticesV2(input);
  const clauses=californiaPolicyClauses(input.documents);
  const windows=clauses.map((clause,index)=>{
    const next=clauses[index+1];
    if(next?.document===clause.document && next.start+next.text.length-clause.start<=800 && /\b(?:it|this information|that information|such information|this data|that data|these details)\b/i.test(next.text))
      return {...clause,text:clause.document.text.slice(clause.start,next.start+next.text.length)};
    return clause;
  });
  const affirmativePurpose=(text:string)=>! /\b(?:do not|does not|will not|never|don.t)\s+(?:use|collect|process)\b/i.test(text) &&
    /\b(?:to|for|in order to|purposes? of)\s+(?:provid\w*|respond\w*|answer\w*|fulfil\w*|process\w*|verif\w*|authenticat\w*|remember\w*|customi[sz]\w*|deliver\w*|analy[sz]\w*|analytics|measur\w*|improv\w*|secur\w*|protect\w*|search\w*|contact\w*|market\w*|advertis\w*)\b/i.test(text);
  const inventoryResult=collectionSurfaceInventorySchema.safeParse(input.bundle.collectionSurfaceInventory);
  const inventory=inventoryResult.success && baseline(inventoryResult.data.scenario) && inventoryResult.data.pageUrl === input.documentUrl?inventoryResult.data:null;
  const cookies=(input.bundle.cookieEvents??[]).filter(event=>baseline(event.scenario) && event.documentUrl === input.documentUrl);
  const points:import("@certscore/contracts").CaliforniaCollectionNoticeV3["points"]=previous.points.map(point=>{
    if(point.scope === "resource_contact_only")return {...point,assessmentScope:"technical_context",categoryMatch:"not_assessed",
      purposeMatch:"not_assessed",
      technicalMatch:point.status === "limited"?"not_assessed":point.recipientMatch === "wording_retained"?"exact_name_retained":"not_retained",
      reason:point.status === "limited"?"Product attribution remains unresolved. Retained resource contact alone establishes no data-category, purpose or notice conclusion.":point.recipientMatch === "wording_retained"?"Exact product wording retained as technical context. Data-category, purpose and legal recipient-role coverage are assessed separately.":
        "Exact product wording not retained. This technical lookup is not a missing-notice finding or a requirement to name every product."};
    let categoryRows:typeof windows=[],purposeRows:typeof windows=[],associated=false,complete=input.policyComplete && input.inventoryComplete;
    let technicalMatch:import("@certscore/contracts").CaliforniaCollectionNoticeV3["points"][number]["technicalMatch"]="not_assessed";
    if(point.kind === "form") {
      const form=inventory?.forms.find(form=>form.formRef === point.id);
      complete=complete && Boolean(form && !form.fieldsTruncated && !point.categories.includes("unknown") && form.privacyDisclosure && !form.privacyDisclosure.truncated &&
        (form.privacyDisclosure.version === 2 || form.privacyDisclosure.excerpts.length));
      categoryRows=windows.filter(clause=>point.categories.length>0 && point.categories.every(category=>categoryPatterns[category]?.test(clause.text)));
      purposeRows=categoryRows.filter(clause=>affirmativePurpose(clause.text));
      const local=form?.privacyDisclosure;
      const linked=purposeRows.filter(clause=>local?.excerpts.some(excerpt=>excerpt.links.some(link=>normalizedUrl(link.url) === normalizedUrl(clause.document.url))));
      const inline=local?.excerpts.some(excerpt=>point.categories.every(category=>categoryPatterns[category]?.test(excerpt.text)) && affirmativePurpose(excerpt.text));
      associated=Boolean(linked.length || inline);
      if(linked.length)purposeRows=linked;
    } else if(point.kind === "cookies") {
      categoryRows=windows.filter(clause=>/\b(?:cookies?|online identifiers?|unique identifiers?)\b/i.test(clause.text));
      // Unknown runtime purpose cannot borrow the purpose of a different cookie
      // described in the policy. Exact cookie names are optional evidence only.
      if(cookies.length && cookies.every(cookie=>cookie.cookiePurpose && cookie.cookiePurpose!=="unknown"))
        purposeRows=categoryRows.filter(clause=>cookies.every(cookie=>containsToken(clause.text,cookie.cookiePurpose.replaceAll("_"," "))) && affirmativePurpose(clause.text));
      technicalMatch=cookies.every(cookie=>categoryRows.some(clause=>containsToken(clause.text,cookie.cookieName)))?"exact_name_retained":"not_retained";
      associated=point.association === "page_policy_link";
    } else {
      categoryRows=windows.filter(clause=>/\b(?:local ?storage|session ?storage|browser storage)\b/i.test(clause.text));
      // Key names reveal neither stored values nor the purpose of their use.
      // Keep purpose unresolved until upstream evidence provides that semantics.
      associated=point.association === "page_policy_link";
    }
    if(!complete){categoryRows=[];purposeRows=[];}
    const categoryMatch=!complete?"unresolved":categoryRows.length?"wording_retained":point.kind === "browser_storage"?"unresolved":"not_observed";
    const purposeKnown=point.kind === "form" || point.kind === "cookies" && cookies.length>0 && cookies.every(cookie=>cookie.cookiePurpose && cookie.cookiePurpose!=="unknown");
    const purposeMatch=purposeRows.length?"wording_retained":complete && purposeKnown?"not_observed":"unresolved";
    const matched=categoryMatch === "wording_retained" && purposeMatch === "wording_retained" && associated;
    const passages=[...(purposeRows[0]?[retainedCaliforniaPassage(purposeRows[0],/\b(?:to|for|purposes? of)\b/i)]:[]),
      ...(categoryRows[0]?[retainedCaliforniaPassage(categoryRows[0])]:[])].filter((passage,index,rows)=>rows.findIndex(other=>other.evidenceRef === passage.evidenceRef && other.start === passage.start && other.end === passage.end) === index);
    return {...point,assessmentScope:"category_purpose",categoryMatch,purposeMatch,technicalMatch,
      status:!complete?"limited":matched?"matched_text":categoryRows.length?"policy_text_only":"not_matched",
      association:point.kind === "form"?associated?"form_notice":"not_verified":point.association,
      reason:!complete?"Complete retained policy and collection-point inspection are required for this comparison.":point.kind === "form"?
        matched?"Relevant data-category and use-purpose wording is associated with this form; exact field or product names are not required.":
          "Form category, purpose wording and local notice association are assessed separately. Search input does not establish submitted personal information.":point.kind === "cookies"?
        matched?"Cookie category and canonically observed purpose match the linked policy wording; exact cookie names are not required.":
          categoryRows.length?"Cookie category wording is retained; the observed cookie's purpose remains unresolved. A different cookie's described purpose is not borrowed.":"No cookie-category wording was located in the inspected text; observed purpose remains separate.":
        "Browser-storage wording and stored-data purpose are separate. Key presence alone does not establish what data is stored or how it is used.",passages};
  });
  return californiaCollectionNoticeV3Schema.parse({...previous,contractVersion:"certscore.california-collection-notice-matching.v3",points});
}

/** V4 connects verified runtime/source semantics while preserving disclosure scope. */
export function matchCaliforniaCollectionNoticesV4(input:Parameters<typeof matchCaliforniaCollectionNotices>[0]) {
  const runtimePurposeAssessment=assessRuntimeStoragePurposes(input.bundle,input.documentUrl,input.sourceHash);
  const prior=matchCaliforniaCollectionNoticesV3(input);
  const points=prior.points.map(point=>{
    if(point.kind!=="cookies"&&point.kind!=="browser_storage")return point;
    const items=runtimePurposeAssessment.items.filter(item=>point.kind === "cookies"?item.kind === "cookie":item.kind!=="cookie");
    const purposePatterns:Record<string,RegExp>={marketing:/\bmarket\w*\b/i,personalization:/\b(?:personali[sz]\w*|customi[sz]\w*)\b/i,session_replay:/\b(?:session replay|session recording)\b/i,consent_management:/\b(?:remember\w*|sav\w*|stor\w*|manag\w*)\b.{0,70}\b(?:consent|choices?|settings?)\b/i,tag_management:/\btag management\b/i,infrastructure:/\b(?:site|website) (?:operation|function)\w*\b/i,performance_monitoring:/\b(?:performance|monitor\w*)\b/i,customer_support:/\b(?:customer support|customer service|live chat)\b/i,preferences:/\b(?:remember\w*|sav\w*|stor\w*)\b.{0,70}\b(?:preferences?|choices?|settings?)\b/i,analytics:/\b(?:analytics|analy[sz]\w*|measur\w*)\b/i,advertising:/\b(?:advertis\w*|market\w*)\b/i,functional:/\b(?:provid\w*|deliver\w*)\b.{0,70}\b(?:service|function)\w*\b/i,security:/\b(?:secur\w*|protect\w*|fraud)\b/i};
    const clauses=californiaPolicyClauses(input.documents);
    const known=items.length>0&&items.every(item=>item.purpose!=="unknown");
    const cookieCategories=clauses.filter(clause=>/\b(?:cookies?|online identifiers?|unique identifiers?)\b/i.test(clause.text));
    // A category and its use can span an adjacent sentence/list. Only join an
    // explicit cookie continuation, never an unrelated collection purpose.
    const cookieWindows=cookieCategories.map(clause=>{
      const index=clauses.indexOf(clause),next=clauses[index+1];
      const continuation=next&&next.document===clause.document&&next.start-clause.start<600&&
        /^(?:These cookies|Such cookies|They|We use (?:them|these cookies)|Their purposes?|Purposes? include)\b/i.test(next.text);
      const text=continuation?clause.document.text.slice(clause.start,next.start+next.text.length):clause.text;
      return {...clause,text};
    }).filter(clause=>clause.text.length<=900);
    const purposeRows=point.kind === "cookies"&&known?cookieWindows.filter(clause=>items.every(item=>purposePatterns[item.purpose]?.test(clause.text))&&!/\b(?:do not|does not|never)\s+(?:use|collect)\b/i.test(clause.text)):[];
    let assessed={...point};
    if(point.kind === "cookies"&&known&&input.policyComplete&&input.inventoryComplete){
      const retainedPurposeRows=purposeRows.flatMap(clause=>{
        const passages=[retainedCaliforniaPassage(clause)];
        for(const item of items){const pattern=purposePatterns[item.purpose];if(pattern&&!passages.some(p=>pattern.test(p.excerpt)))passages.push(retainedCaliforniaPassage(clause,pattern));}
        return passages.slice(0,2).every(p=>p.excerpt.length>0)&&items.every(item=>passages.slice(0,2).some(p=>purposePatterns[item.purpose]?.test(p.excerpt)))?passages.slice(0,2):[];
      }).slice(0,2);
      const purposeMatch=retainedPurposeRows.length?"wording_retained" as const:"not_observed" as const;
      const matched=purposeMatch === "wording_retained"&&point.categoryMatch === "wording_retained"&&point.association === "page_policy_link";
      assessed={...point,purposeMatch,status:matched?"matched_text":point.status,passages:retainedPurposeRows.length?retainedPurposeRows:point.passages};
    }
    if(point.kind === "browser_storage"&&items.length&&items.every(item=>item.dataOrigin === "document_referrer")&&input.policyComplete&&input.inventoryComplete){
      const categoryRows=clauses.filter(clause=>/\b(?:referr(?:er|ing)|referral|browsing history|navigation history)\b/i.test(clause.text));
      assessed={...point,categoryMatch:categoryRows.length?"wording_retained":"not_observed",passages:categoryRows.slice(0,2).map(clause=>retainedCaliforniaPassage(clause))};
    }
    const context=items.map(item=>`${item.name}: ${item.purpose!=="unknown"?item.purpose:item.dataOrigin === "document_referrer"?"referrer data; business use unresolved":"purpose unresolved"}`).join("; ");
    return {...assessed,reason:`${context}. ${point.kind === "cookies"?"Notice purpose coverage requires every observed cookie purpose to be resolved and matched.":"Source data is identified separately from its business use and notice wording."}`.slice(0,350)};
  });
  return californiaCollectionNoticeV4Schema.parse({...prior,contractVersion:"certscore.california-collection-notice-matching.v4",runtimePurposeAssessment,points});
}

/** V5 recognizes a verified named-cookie declaration as disclosure evidence,
 * independently of whether its claimed purpose has been behaviorally verified. */
export function matchCaliforniaCollectionNoticesV5(input:Parameters<typeof matchCaliforniaCollectionNotices>[0]) {
  const prior=matchCaliforniaCollectionNoticesV4(input);
  const runtimePurposeAssessment=assessRuntimeStoragePurposesV2(input.bundle,input.documentUrl,input.sourceHash,input.documents,input.policyComplete);
  const sourcePoints=[...prior.points];
  const cookieItems=runtimePurposeAssessment.items.filter(item=>item.kind === "cookie");
  if(cookieItems.length&&!sourcePoints.some(point=>point.kind === "cookies")){
    const category=californiaPolicyClauses(input.documents).filter(clause=>/\bcookies?\b/i.test(clause.text));
    const linked=input.documents.some(document=>input.bundle.policySurfaceObservations.some(surface=>`policy-text:${surface.observationId}`===document.evidenceRef&&surface.linkSourcePageUrl===input.documentUrl&&surface.linkVisibility === "visible"&&surface.directlyLinkedFromScannedPage));
    sourcePoints.push({id:"baseline-cookies",kind:"cookies",label:"Observed cookies",categories:["cookie_identifiers"],scope:"cookie_identifiers",assessmentScope:"category_purpose",categoryMatch:input.policyComplete?category.length?"wording_retained":"not_observed":"unresolved",purposeMatch:"unresolved",technicalMatch:"not_assessed",recipientMatch:"not_assessed",status:!input.policyComplete||runtimePurposeAssessment.inventoryLimited?"limited":category.length?"policy_text_only":"not_matched",association:linked?"page_policy_link":"not_verified",reason:"Observed cookie inventory is bound to this document; named-purpose wording is assessed separately.",evidenceRefs:cookieItems.flatMap(item=>item.evidenceRefs).slice(0,8),passages:category.slice(0,2).map(clause=>retainedCaliforniaPassage(clause))});
  }
  const kindOrder={form:0,cookies:1,browser_storage:2,third_party_resources:3};
  sourcePoints.sort((a,b)=>kindOrder[a.kind]-kindOrder[b.kind]);
  // Snapshot-bound cookies may add a row after V2 has filled its bounded set.
  // Keep category/purpose rows first and retain an explicit truncation limit.
  const truncated=sourcePoints.length>12;
  const points=sourcePoints.slice(0,12).map(point=>{
    let purposeBasis: "observed_or_inferred"|"declared_only"|"unresolved"|"not_assessed"=point.purposeMatch === "not_assessed"?"not_assessed":point.purposeMatch === "wording_retained"?"observed_or_inferred":"unresolved";
    if(point.kind!=="cookies")return {...point,purposeBasis};
    if(runtimePurposeAssessment.inventoryLimited)return {...point,status:"limited" as const,purposeMatch:"unresolved" as const,purposeBasis:"unresolved" as const,reason:"The bounded cookie-purpose inventory is incomplete; no full-purpose disclosure conclusion is supported."};
    const items=runtimePurposeAssessment.items.filter(item=>item.kind === "cookie");
    const declarations=items.map(item=>item.declaredPurpose);
    const complete=input.policyComplete&&input.inventoryComplete&&!runtimePurposeAssessment.inventoryLimited&&items.length>0&&declarations.every((row,index)=>row&&row.purpose!=="unknown"&&(items[index]!.purpose === "unknown"||items[index]!.purpose === row.purpose||items[index]!.purpose === "consent_management"&&row.purpose === "preferences"));
    if(!complete)return {...point,purposeBasis};
    purposeBasis="declared_only";
    const matched=point.categoryMatch === "wording_retained"&&point.association === "page_policy_link";
    return {...point,technicalMatch:"exact_name_retained" as const,purposeMatch:"wording_retained" as const,purposeBasis,status:matched?"matched_text" as const:"policy_text_only" as const,
      reason:`${items.map(item=>`${item.name}: declared ${item.declaredPurpose!.purpose}`).join("; ")}. Named cookie-purpose disclosures are retained; runtime behavior is assessed independently.`.slice(0,350),
      passages:declarations.slice(0,2).map(row=>row!.passage)};
  });
  return californiaCollectionNoticeV5Schema.parse({...prior,contractVersion:"certscore.california-collection-notice-matching.v5",runtimePurposeAssessment,points,
    inventoryComplete:prior.inventoryComplete&&!truncated,
    limitationKeys:[...new Set([...prior.limitationKeys,...(truncated?["matching_points_truncated"]:[])])]});
}
