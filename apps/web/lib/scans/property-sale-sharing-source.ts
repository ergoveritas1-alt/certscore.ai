import {postRefusalReportProjectionSchema,type PostRefusalReportProjection,type CanonicalEvidenceBundle} from "@certscore/contracts";
import {extractPropertySaleSharingSource} from "@certscore/vendor-resolver/property-sale-sharing";
/** Static purpose evidence is joined only from a verified same-scan policy source.
 * Runtime identifiers, timing and restrictions remain in the action session. */
export function withPropertySaleSharingSource(projection:PostRefusalReportProjection|null,bundle:CanonicalEvidenceBundle,
 source:{verificationStatus:string;sha256?:string|null}|undefined):PostRefusalReportProjection|null {
 if(!projection||source?.verificationStatus!=="verified"||!source.sha256)return projection;
 const property=extractPropertySaleSharingSource({scanId:bundle.scanId,targetUrl:bundle.url,sourceBundleSha256:source.sha256,observations:bundle.policySurfaceObservations});
 if(!property.declarations.length||property.scanId!==projection.sourceIdentity?.scanId||property.targetSha256!==projection.sourceIdentity.targetSha256)return projection;
 return postRefusalReportProjectionSchema.parse({...projection,propertySaleSharingSource:property});
}
