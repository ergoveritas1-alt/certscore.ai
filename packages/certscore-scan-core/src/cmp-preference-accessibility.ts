import axe,{type AxeResults} from "axe-core";
import type {Locator,Page} from "playwright";
import {cmpPreferenceAccessibilitySchema,type CmpPreferenceAccessibility} from "@certscore/contracts";
import {normalizeAccessibilityRule} from "./accessibility-audit.js";

const rules=["button-name","link-name","label","aria-toggle-field-name","aria-input-field-name","aria-hidden-focus","nested-interactive","label-content-name-mismatch"];
/** No keyboard/choice mutation, frame navigation, extra browser or extended
 * deadline. A slow audit yields no result and never discards prior capture. */
export async function inspectPreferenceAccessibility(input:{page:Page;panel:Locator;panelSelector:string;scanId:string;documentUrl:string;documentToken:string;budgetMs:number;verify:()=>Promise<unknown>}):Promise<CmpPreferenceAccessibility|undefined>{
  const started=Date.now(),budget=Math.min(800,Math.floor(input.budgetMs));if(budget<100)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([(async()=>{
    await input.verify();
    await input.page.evaluate(axe.source);
    const handle=await input.panel.elementHandle();if(!handle)return;
    const result=await input.page.evaluate(async({panel,rules})=>{
      if(!panel?.isConnected)return null;
      const engine=(window as unknown as {axe:{run:(context:Element,options:unknown)=>Promise<AxeResults>}}).axe;
      return engine.run(panel,{runOnly:{type:"rule",values:rules},iframes:false,resultTypes:["violations","incomplete"],performanceTimer:false});
    },{panel:handle,rules});
    await input.verify();
    if(!result||Date.now()-started>=budget||!await input.panel.evaluate((panel,original)=>panel===original&&panel.isConnected,handle))return;
    const row={contractVersion:"certscore.cmp-preference-accessibility.v1",scanId:input.scanId,sourceLane:"cmp_preferences",scope:"opened_preference_panel",
      documentUrl:input.documentUrl,documentToken:input.documentToken,panelSelector:input.panelSelector,engine:"axe-core",engineVersion:result.testEngine.version,
      positiveFindingsOnly:true,status:result.incomplete.length?"limited":"completed",startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),durationMs:Date.now()-started,
      rulesEvaluated:[...new Set([...result.passes,...result.violations,...result.incomplete,...result.inapplicable].map(rule=>rule.id))],
      violations:result.violations.map(normalizeAccessibilityRule),reviewItems:result.incomplete.map(normalizeAccessibilityRule)};
    const parsed=cmpPreferenceAccessibilitySchema.safeParse(row);return parsed.success?parsed.data:undefined;
  })(),new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),budget);})]);}catch{return undefined;}finally{if(timer)clearTimeout(timer);}
}
