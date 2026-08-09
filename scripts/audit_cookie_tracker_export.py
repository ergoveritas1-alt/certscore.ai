#!/usr/bin/env python3
import csv, json, sys, zipfile, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/Volumes/miniben/CertScore/evidence')
if not ROOT.is_dir():
    print(f'ERROR: evidence root does not exist: {ROOT}', file=sys.stderr); sys.exit(2)
FILES = [Path(x) for x in subprocess.check_output(['find',str(ROOT),'-type','f','-name','*.json'],text=True).splitlines()]
if not FILES:
    print(f'ERROR: evidence root is empty: {ROOT}', file=sys.stderr); sys.exit(2)
ERRORS=[]; valid=[]
def dt(v):
    try: return datetime.fromisoformat(v.replace('Z','+00:00')) if isinstance(v,str) else None
    except Exception: return None
def g(d,*ks):
    for k in ks:
        if not isinstance(d,dict): return None
        d=d.get(k)
    return d
def val(v):
    if v is None: return ''
    if isinstance(v,bool): return 'true' if v else 'false'
    return v
def jval(v): return '' if v is None else json.dumps(v,ensure_ascii=False,separators=(',',':'))
for p in FILES:
    try:
        with p.open(encoding='utf-8') as f: d=json.load(f)
    except Exception: ERRORS.append({'file':str(p),'error':'malformed_json'}); continue
    if not isinstance(d,dict): ERRORS.append({'file':str(p),'error':'invalid_top_level'}); continue
    miss=[k for k in ('scanId','domain','calibrationContext','executiveSummary') if k not in d]
    if miss: ERRORS.append({'file':str(p),'error':'missing_'+'_'.join(miss)}); continue
    if not d.get('scanId'): ERRORS.append({'file':str(p),'error':'missing_scanId'}); continue
    gd=dt(g(d,'timestamps','generatedAt'))
    if gd is None: ERRORS.append({'file':str(p),'error':'missing_or_invalid_generatedAt'}); continue
    valid.append((str(p),d.get('scanId'),gd,dt(g(d,'timestamps','lastUpdatedAt')) or datetime.min.replace(tzinfo=timezone.utc)))
by={}; groups={}
for r in valid:
    groups.setdefault(r[1],[]).append(r)
    if r[1] not in by or (r[3],r[0])>(by[r[1]][3],by[r[1]][0]): by[r[1]]=r
for sid,rs in groups.items():
    if len(rs)>1:
        win=by[sid][0]
        ERRORS.extend({'file':r[0],'error':'duplicate_scanId'} for r in rs if r[0]!=win)
selected=sorted(by.values(),key=lambda r:(r[2],r[0]),reverse=True)[:2000]
stamp=datetime.now().strftime('%Y%m%d_%H%M%S'); out=ROOT.parent/f'audit_export_{stamp}'; n=1
while out.exists(): out=ROOT.parent/f'audit_export_{stamp}_{n}'; n+=1
out.mkdir()
SF='scan_id domain scan_from scanner_region generated_at scan_status pages_scanned overall_score benchmark footprint_vendors footprint_cookies footprint_trackers footprint_consent_platforms footprint_purpose_counts_json footprint_priority_counts_json footprint_confidence_counts_json preconsent_aggregate_count preconsent_essential_count preconsent_nonessential_count preconsent_excluded_count storage_cookies_before_consent storage_distinct_cookie_count storage_third_party_before_consent storage_eligible_nonessential_preconsent'.split()
CF='scan_id domain scan_from source_array cookie_name cookie_domain party category non_essential_flag essentiality essentiality_confidence essentiality_reason_codes essentiality_source description data_types first_observed_at_ms set_at_ms primary_provider related_or_initiating_vendor initiator_domain initiator_vendor set_method timing_basis timing_evidence evidence_grade'.split()
TF='scan_id domain scan_from vendor_name category host domains cookie_names raw_products attribution_signatures before_consent first_seen_ms confidence'.split()
RF='scan_id domain scan_from hostname path method vendor essentiality cookie_names_sent response_cookie_names_set identifier_parameter_names response_observed response_storage_attempted'.split()
def writer(name,fields):
    f=(out/name).open('w',encoding='utf-8',newline=''); w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); return f,w
f,w=writer('scan_index.csv',SF)
for p,sid,gd,lu in selected:
    with open(p,encoding='utf-8') as q: d=json.load(q)
    c=d.get('calibrationContext') or {}; e=d.get('executiveSummary') or {}; fp=d.get('trackerFootprintBreakdown') or {}; ap=g(d,'coverageDiagnostics','accessPosture') or {}; pre=e.get('preConsentStorageAssessment') or {}; st=d.get('storageEvidenceSummary') or {}
    row={'scan_id':d.get('scanId'),'domain':d.get('domain'),'scan_from':c.get('scanFrom'),'scanner_region':c.get('scannerRegion'),'generated_at':g(d,'timestamps','generatedAt'),'scan_status':d.get('scanStatus'),'pages_scanned':ap.get('pagesScanned'),'overall_score':e.get('score'),'benchmark':e.get('benchmark'),'footprint_vendors':fp.get('vendors'),'footprint_cookies':fp.get('cookies'),'footprint_trackers':fp.get('trackers'),'footprint_consent_platforms':fp.get('consentPlatforms'),'footprint_purpose_counts_json':jval(fp.get('purposeCounts')),'footprint_priority_counts_json':jval(fp.get('priorityCounts')),'footprint_confidence_counts_json':jval(fp.get('confidenceCounts')),'preconsent_aggregate_count':pre.get('aggregateObservedCount'),'preconsent_essential_count':pre.get('classifiedEssentialCount'),'preconsent_nonessential_count':pre.get('classifiedNonEssentialCount'),'preconsent_excluded_count':pre.get('excludedFunctionalOrConsentCount'),'storage_cookies_before_consent':st.get('cookiesBeforeConsentCount'),'storage_distinct_cookie_count':st.get('distinctCookieCount'),'storage_third_party_before_consent':st.get('thirdPartyCookieBeforeConsentCount'),'storage_eligible_nonessential_preconsent':st.get('eligibleNonEssentialPreConsentStorageCount')}
    w.writerow({k:val(row.get(k)) for k in SF})
f.close()
miss_cookie=fallback=miss_tracker=0
f,w=writer('cookie_classification_audit.csv',CF)
for p,sid,gd,lu in selected:
    with open(p,encoding='utf-8') as q: d=json.load(q)
    inv=d.get('cookieStorageInventory') or {}; items=inv.get('items') if isinstance(inv,dict) else None; src='cookieStorageInventory'
    if not isinstance(items,list) or not items:
        miss_cookie+=1; pre=g(d,'executiveSummary','preConsentStorageAssessment') or {}; items=pre.get('evidenceRows') if isinstance(pre,dict) else None
        if isinstance(items,list) and items: src='preConsentEvidenceRows'; fallback+=1
        else: items=[]
    for x in items:
        x=x if isinstance(x,dict) else {}; row={'scan_id':d.get('scanId'),'domain':d.get('domain'),'scan_from':g(d,'calibrationContext','scanFrom'),'source_array':src,'cookie_name':x.get('cookieName') if src=='cookieStorageInventory' else x.get('name'),'cookie_domain':x.get('domain'),'party':x.get('party'),'category':x.get('category'),'non_essential_flag':x.get('nonEssential'),'essentiality':x.get('essentiality'),'essentiality_confidence':x.get('essentialityConfidence'),'essentiality_reason_codes':jval(x.get('essentialityReasonCodes')),'essentiality_source':x.get('essentialitySource'),'description':x.get('description'),'data_types':jval(x.get('dataTypes')),'first_observed_at_ms':x.get('firstObservedAtMs') if src=='cookieStorageInventory' else x.get('firstObservedMs'),'set_at_ms':x.get('setAtMs'),'primary_provider':x.get('primaryProvider'),'related_or_initiating_vendor':x.get('relatedOrInitiatingVendor'),'initiator_domain':x.get('initiatorDomain'),'initiator_vendor':x.get('initiatorVendor'),'set_method':x.get('setMethod'),'timing_basis':x.get('timingBasis'),'timing_evidence':x.get('timingEvidence'),'evidence_grade':x.get('evidenceGrade')}; w.writerow({k:val(row.get(k)) for k in CF})
f.close()
f,w=writer('tracker_classification_audit.csv',TF)
for p,sid,gd,lu in selected:
    with open(p,encoding='utf-8') as q: d=json.load(q)
    inv=d.get('trackerVendorInventory') or {}; items=inv.get('items') if isinstance(inv,dict) else None
    if not isinstance(items,list): items=[]; miss_tracker+=1
    for x in items:
        x=x if isinstance(x,dict) else {}; row={'scan_id':d.get('scanId'),'domain':d.get('domain'),'scan_from':g(d,'calibrationContext','scanFrom'),'vendor_name':x.get('name'),'category':x.get('category'),'host':x.get('host'),'domains':jval(x.get('domains')),'cookie_names':jval(x.get('cookieNames')),'raw_products':jval(x.get('rawProducts')),'attribution_signatures':jval(x.get('attributionSignatures')),'before_consent':x.get('beforeConsent'),'first_seen_ms':x.get('firstSeenMs'),'confidence':x.get('confidence')}; w.writerow({k:val(row.get(k)) for k in TF})
f.close()
f,w=writer('request_classification_audit.csv',RF)
for p,sid,gd,lu in selected:
    with open(p,encoding='utf-8') as q: d=json.load(q)
    inv=d.get('requestEvidenceInventory') or {}; items=inv.get('items') if isinstance(inv,dict) else None
    if not isinstance(items,list): items=[]
    for x in items:
        x=x if isinstance(x,dict) else {}; row={'scan_id':d.get('scanId'),'domain':d.get('domain'),'scan_from':g(d,'calibrationContext','scanFrom'),'hostname':x.get('hostname'),'path':x.get('path'),'method':x.get('method'),'vendor':x.get('vendor'),'essentiality':x.get('essentiality'),'cookie_names_sent':jval(x.get('cookieNamesSent')),'response_cookie_names_set':jval(x.get('responseCookieNamesSet')),'identifier_parameter_names':jval(x.get('identifierParameterNames')),'response_observed':x.get('responseObserved'),'response_storage_attempted':x.get('responseStorageAttempted')}; w.writerow({k:val(row.get(k)) for k in RF})
f.close()
docs=[]
for p,sid,gd,lu in selected:
    with open(p,encoding='utf-8') as q: docs.append(json.load(q))
manifest={'evidence_root':str(ROOT),'total_json_files_found':len(FILES),'total_valid_scan_files':len(valid),'duplicate_scan_ids_skipped':sum(e['error']=='duplicate_scanId' for e in ERRORS),'malformed_or_unparseable_files_skipped':sum(e['error']!='duplicate_scanId' for e in ERRORS),'scans_selected_for_export':len(selected),'date_range_covered':{'earliest_generated_at':min((g(d,'timestamps','generatedAt') for d in docs),default=''),'latest_generated_at':max((g(d,'timestamps','generatedAt') for d in docs),default='')},'distinct_domains_covered':len({d.get('domain') for d in docs}),'scans_missing_cookieStorageInventory':miss_cookie,'scans_using_preConsentEvidenceRows_fallback':fallback,'scans_missing_trackerVendorInventory':miss_tracker,'errors':ERRORS}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
zip_path=out.with_suffix('.zip')
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for p in out.iterdir(): z.write(p, f'{out.name}/{p.name}')
print(json.dumps({'output_dir':str(out),'zip_path':str(zip_path),'manifest':manifest},ensure_ascii=False,indent=2))
