import {createHash} from 'node:crypto';
export const sha=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const TRACKING=['advertising','marketing','analytics','session_replay'];
export function summarize(requests:any[],start:number,horizon:number){
 const events=requests.filter(e=>e.at>=start&&e.at<start+horizon);
 const group=(purposes:string[])=>{const ee=events.filter(e=>e.classification.status==='resolved'&&purposes.includes(e.classification.purpose));return {requests:ee.length,services:[...new Set(ee.map(e=>e.classification.serviceId))].sort()};};
 return {horizonMs:horizon,requestSetSha256:sha(events.map(e=>({id:e.id,at:e.at,urlHash:e.urlHash}))),requests:events.length,thirdPartyRequests:events.filter(e=>e.thirdParty===true).length,unclassifiedThirdPartyRequests:events.filter(e=>e.thirdParty===true&&e.classification.status!=='resolved').length,trackers:group(TRACKING),advertisingMarketing:group(['advertising','marketing']),analyticsReplay:group(['analytics','session_replay']),otherPurposes:Object.fromEntries([...new Set(events.map(e=>e.classification.purpose).filter(Boolean))].sort().map(p=>[p,group([p as string])]))};
}
export function compare(a:any,b:any):any{return {requests:b.requests-a.requests,thirdPartyRequests:b.thirdPartyRequests-a.thirdPartyRequests,...Object.fromEntries(['trackers','advertisingMarketing','analyticsReplay'].map(k=>[k,{requests:b[k].requests-a[k].requests,services:b[k].services.length-a[k].services.length,removed:a[k].services.filter((x:string)=>!b[k].services.includes(x)),introduced:b[k].services.filter((x:string)=>!a[k].services.includes(x))}]))};}
