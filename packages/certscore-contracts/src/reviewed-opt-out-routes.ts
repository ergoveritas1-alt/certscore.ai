/** Reviewed, positive-only purpose/route pairs. The rule version fixes meaning
 * for persisted evidence. A route never establishes operation or legal scope. */
export const REVIEWED_OPT_OUT_ROUTE_RULES = [
 {id:'linkedin_retargeting',route:/You can opt out of cookies from LinkedIn/i,purpose:/We use the LinkedIn Insight Tag[^.!?]{0,160}retarget Site visitors[^.!?]{0,110}/i,label:'LinkedIn cookie opt-out',scope:'advertising_provider',scopeLabel:'LinkedIn retargeting only'},
 {id:'mobile_interest_ads',route:/You may opt out of interest-based advertising on mobile devices\s+by activating the [“"]Limit Ad Tracking[”"] or equivalent feature offered by your mobile platform\.?/i,label:'Limit Ad Tracking',scope:'mobile_advertising',scopeLabel:'Mobile-device interest-based advertising only'},
 {id:'personalised_cookie_form',route:/You can always withdraw your consent[^.!?]{0,180}opting out of personalised cookies and contacting us via this form/i,purpose:/Personalised ads outside of[^.!?]{0,230}/i,label:'Personalised advertising cookies / request form',scope:'personalized_advertising',scopeLabel:'Personalised advertising choices on the observed service'},
 {id:'cookie_preference_centre',route:/You can manage what Cookies are set on your device[^.!?]{0,100}Cookie Preference Centre/i,purpose:/show you relevant content, including personalised advertisements/i,label:'Cookie Preference Centre',scope:'personalized_advertising',scopeLabel:'Personalised-advertising cookies only'},
 {id:'interest_ad_programmes',route:/For information about interest-based advertising, and to opt out[^.!?]{0,230}thenai\.org\/opt-out/i,label:'NAI / DAA interest-based advertising opt-out',scope:'advertising_provider',scopeLabel:'Participating advertising providers only'},
 {id:'eu_marketing_pixels',route:/you can adjust cookie consent options on our website to not accept marketing cookies when you visit from the E\.U\./i,purpose:/We use pixels to track visitors and to serve ads[^.!?]{0,80}/i,label:'Website marketing-cookie choices',scope:'eu_advertising',scopeLabel:'EU visitors: advertising pixels / marketing cookies only'},
 {id:'browser_cookie_manager',route:/link to our cookie manager[^.!?]{0,180}choose to opt-in or opt-out of each cookie type/i,purpose:/This may include personalising content or advertising for you[^.!?]{0,60}/i,label:'Cookie manager',scope:'browser_advertising',scopeLabel:'Advertising-cookie choices in the selected browser'},
 {id:'facebook_custom_audiences',route:/Widerspruchsmöglichkeit \(Opt-Out\):\s*https:\/\/www\.facebook\.com\/settings\?tab=ads/i,purpose:/Facebook-Pixel und Zielgruppenbildung \(Custom Audiences\)/i,label:'Facebook advertising preferences',scope:'advertising_provider',scopeLabel:'Facebook Custom Audiences / advertising only'},
] as const;
/** v6 additions use declared, purpose-scoped choices, without a functionality claim. */
export const REVIEWED_SCOPED_OPT_OUT_RULES = [
 {id:'named_ad_preferences',route:/Opt-out Mechanisms:\s*You can opt-out of certain Tracking Technologies by using the following links:\s*Google Analytics Opt-Out\s+Google Ads Settings\s+Meta \(Facebook\) Ad Preferences\s+Reddit Ad Preferences/i,label:'Google / Meta / Reddit advertising preferences',scope:'advertising_provider',scopeLabel:'Named advertising-provider preferences only'},
 {id:'declared_personalized_platform_choices',route:/You can manage or opt out of personalized advertising through the following methods:\s*Adjust your browser privacy settings;\s*Use the ad preference management tools provided by the advertising platforms;\s*Follow the opt-out mechanisms provided by the third-party advertising service providers\.?/i,label:'Personalized-advertising opt-out instructions',scope:'personalized_advertising',scopeLabel:'Declared browser / advertising-platform choices only'},
 {id:'declared_japanese_behavioral_choices',route:/行動ターゲティング広告の無効化を希望するお客様は\s*各広告配信事業者のオプトアウトページにアクセスして、Cookieの使用を無効にできます。/i,label:'行動ターゲティング広告のオプトアウト',scope:'advertising_provider',scopeLabel:'Declared behavioural-advertising provider choices only'},
 {id:'declared_dnt_advertising_suppression',route:/We honor Do Not Track signals and do not track, plant cookies, or use advertising when a Do Not Track \(DNT\) browser mechanism is in place\.?/i,label:'Do Not Track advertising choice',scope:'browser_advertising',scopeLabel:'Declared DNT advertising suppression; GPC unverified'},
 {id:'declared_advertiser_directory',route:/Some, but not all, third-party advertising companies provide a mechanism to opt out of their technology\.\s*For more information and identification of advertisers that provide an opt-out mechanism, please visit the following:\s*http:\/\/www\.networkadvertising\.org\/managing\/opt_out\.asp/i,label:'NAI advertiser opt-out reference',scope:'advertising_provider',scopeLabel:'Participating advertisers only; property coverage unverified'},
] as const;
/** v7 additions retain the declared cookie scope and destination limitations. */
export const REVIEWED_COOKIE_REFUSAL_RULES = [
 {id:'declared_russian_marketing_cookie_refusal',route:/На нашем сайте используются все виды файлов cookie\.\s*Отказаться от обработки cookie-файлов вы можете с помощью соответствующих настроек вашего браузера\./i,
  purpose:/Маркетинговые файлы cookie\s*,\s*которые используются для отслеживания посетителей на разных веб-сайтах\.\s*Они предназначены для того, чтобы показывать рекламу/i,
  label:'Browser advertising-cookie refusal',scope:'browser_advertising',scopeLabel:'Declared browser refusal, including marketing cookies'},
 {id:'declared_advertising_cookie_instructions',route:/For more information about this type of online advertising, about cookies, and about how to turn this feature off, please visit this link\./i,
  purpose:/Please note that turning off advertising cookies won[’']t mean that you are not served any advertising, merely that it will not be tailored to your interests\./i,
  label:'Advertising-cookie opt-out instructions',scope:'browser_advertising',scopeLabel:'Declared advertising-cookie choices; destination unverified',evidenceLimitations:['instruction_destination_unverified'] as const},
] as const;
/** v8: only usable with the exact reviewed UK policy redirect source binding. */
export const REVIEWED_UK_COOKIE_REFUSAL_RULE = {
 id:'declared_uk_advertising_cookie_refusal',
 route:/4\.2 Within your browser you can change your cookie preferences and choose whether you wish to accept cookies or not\. The choices you can make and how you make them differs per browser, such as denying all third-party cookies\./i,
 purpose:/3\.5 Targeting \/ advertising cookies: a\. Tracking cookies are used to follow the behaviour of website visitors across multiple websites\./i,
 label:'Advertising-cookie refusal instructions',scope:'browser_advertising',scopeLabel:'UK policy: declared advertising-cookie refusal',
} as const;
function disqualifiedLead(text:string,start:number){
 const lead=text.slice(Math.max(0,start-120),start).split(/[.!?\n]/).at(-1)??'';
 return /\b(?:example|sample|hypothetical|plan(?:s|ning)? to|no longer|not available|does not provide)\b/i.test(lead);
}
export function matchReviewedOptOutRoute(instruction:string,context:string,extended=false,cookieRefusal=false,ukCookieRefusal=false){
 if(/\b(?:hypothetical|for example|plan to|not available|no longer)\b|\[(?:link|enlace)\]/i.test(instruction))return undefined;
 return [...REVIEWED_OPT_OUT_ROUTE_RULES,...(extended?REVIEWED_SCOPED_OPT_OUT_RULES:[]),...(cookieRefusal?REVIEWED_COOKIE_REFUSAL_RULES:[]),...(ukCookieRefusal?[REVIEWED_UK_COOKIE_REFUSAL_RULE]:[])].find(rule=>rule.route.test(instruction)&&(!('purpose' in rule)||rule.purpose.test(context)));
}
/** Priority candidates, sharing the caller's existing 256 slots.
 * Purpose may precede/follow the route in the same complete policy document. */
export function* reviewedOptOutRouteCandidates(text:string,extended=false,cookieRefusal=false,ukCookieRefusal=false){
 for(const rule of [...REVIEWED_OPT_OUT_ROUTE_RULES,...(extended?REVIEWED_SCOPED_OPT_OUT_RULES:[]),...(cookieRefusal?REVIEWED_COOKIE_REFUSAL_RULES:[]),...(ukCookieRefusal?[REVIEWED_UK_COOKIE_REFUSAL_RULE]:[])]){
  const purpose='purpose' in rule?rule.purpose.exec(text):null;if('purpose' in rule&&!purpose)continue;
  const candidates=[];for(const match of text.matchAll(new RegExp(rule.route.source,rule.route.flags+'g'))){candidates.push(match);if(candidates.length===8)break;}
  const eligible=candidates.filter(m=>!disqualifiedLead(text,m.index!));
  const route=eligible.find(m=>!purpose||m.index!>=purpose.index)??eligible[0];if(!route)continue;
  yield {excerpt:route[0],start:route.index!,context:purpose?{excerpt:purpose[0],start:purpose.index,end:purpose.index+purpose[0].length}:undefined};
 }
}
export function matchAdvertisingDomChoice(label:string,context:string){
 if(/\b(?:personalized|personalised) (?:and non-personalized )?advertising|ads personali[sz]ation|adverts[^.!?]{0,100}customised[^.!?]{0,100}(?:preferences|browsing)/i.test(context)&&
   /^(?:Accept only (?:essential|necessary) cookies|Reject all|Cookies Settings)$/i.test(label))
  return {scope:'personalized_advertising' as const,scopeLabel:'Advertising-cookie choices on the observed page'};
 if(/publicités personnalisées/.test(context)&&/^(?:Tout refuser|gestion des cookies)$/.test(label))
  return {scope:'personalized_advertising' as const,scopeLabel:'French page: personalised-advertising cookies only'};
 return undefined;
}
export function findAdvertisingDomChoice(text:string){
 const purpose=/\b(?:personalized|personalised) (?:and non-personalized )?advertising|ads personali[sz]ation[^.!?\n]{0,100}|adverts[^.!?\n]{0,100}customised[^.!?\n]{0,100}(?:preferences|browsing)|publicités personnalisées/gi;
 for(const m of text.matchAll(purpose)){
  if(disqualifiedLead(text,m.index!))continue;
  // Same local cookie-banner text, never a page-wide purpose inference.
  const before=text.slice(Math.max(0,m.index!-400),m.index!);if(!/cookies/i.test(before+m[0]))continue;
  const end=Math.min(text.length,m.index!+m[0].length+650),tail=text.slice(m.index!+m[0].length,end);
  const choice=/Accept only (?:essential|necessary) cookies|Reject all|Cookies Settings|Tout refuser|gestion des cookies/i.exec(tail);if(!choice)continue;
  const context=m[0].slice(0,180),label=choice[0],match=matchAdvertisingDomChoice(label,context);if(!match)continue;
  const start=m.index!+m[0].length+choice.index;
  return {label,start,end:start+label.length,...match,context:{start:m.index!,end:m.index!+context.length,excerpt:context}};
 }
 return undefined;
}
