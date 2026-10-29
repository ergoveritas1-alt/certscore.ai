import { oneTrustGroupEvidenceSchema } from "../consent-action-evidence-policy";
import { ONETRUST_IKEA_APPLICABILITY as pin } from "../onetrust-applicability";

/** Synthetic runtime contract witness; never historical or production proof. */
export function oneTrustApplicabilityFixture(start:number,click:number,read:number,grant:boolean) {
  return oneTrustGroupEvidenceSchema.parse({policyVersion:"onetrust_cookie_groups.v3-sdk-applicability",
    cookieIdentitySha256:"1".repeat(64),beforeValueSha256:"2".repeat(64),afterValueSha256:"a".repeat(64),configurationSha256:"4".repeat(64),
    baselineGroupIds:["C0001","C0002"],configuredGroupIds:["C0001","C0002"],
    groups:[{id:"C0001",alwaysActive:true,consent:true},{id:"C0002",alwaysActive:false,consent:grant}],
    applicability:{policyVersion:pin.policyVersion,configurationSha256:"4".repeat(64),baselineReadAtEpochMs:start+click-1,
      confirmationReadAtEpochMs:start+read,source:{sdkUrl:pin.sdkUrl,sdkSha256:pin.sdkSha256,sdkBytes:pin.sdkBytes,
        documentSha256:pin.documentSha256,documentEpochSha256:"5".repeat(64),observedAtEpochMs:start+1,responseStatus:200,redirected:false,serviceWorker:false},
      inputs:{isIabEnabled:false,vendorLevelOptOut:false,useGoogleVendors:false,
        groups:[1,2,3].map(i=>({id:`C000${i}`,status:i===1?"always active":"inactive",type:"COOKIE",root:true,named:true,
          isIabPurpose:false,showInPopup:true,alwaysShowCategory:i<=2,firstPartyCookies:0,hosts:0,generalVendors:0,vendorServices:0}))}}});
}
