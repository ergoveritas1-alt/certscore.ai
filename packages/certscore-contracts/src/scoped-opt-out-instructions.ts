/** Canonical reviewed policy-language rules. Positives only; labels and scope
 * describe declared choices, never legal adequacy or operation verification. */
export type ScopedOptOutMatch={label:string;scope:"named_route"|"personalized_advertising"|"advertising_provider"|"localized_page";scopeLabel:string};
export function matchScopedOptOutInstructions(instruction:string,context:string,extended=false):ScopedOptOutMatch|undefined{
  if(/\[(?:link|enlace)\]|\b(?:example|hypothetical|plan to|no longer|does not provide|not available)\b/i.test(instruction+" "+context))return undefined;
  if(extended){
    if(/Política de privacidad/i.test(instruction)&&/Sus opciones de privacidad/.test(instruction)&&/Facebook|LinkedIn|©/.test(instruction))
      return {label:"Sus opciones de privacidad",scope:"localized_page",scopeLabel:"Localized Spanish privacy-choice page"};
    if(/Wenn Sie über einen Google-Account verfügen, können Sie der personalisierten Werbung unter folgendem Link widersprechen:\s*https:\/\/adssettings\.google\.com\/anonymous\?hl=de/i.test(instruction)&&
      /Werbe-Zielgruppen|Werbebotschaften|Nutzungs- und Surfverhaltens|personalisierte/i.test(context))
      return {label:"Personalisierter Google-Werbung widersprechen",scope:"advertising_provider",scopeLabel:"Google personalized advertising only"};
  }
  const footer=/Legal Inquiries\s+(Do Not Sell(?: or Share)? My Personal Information)\s*\|\s*Limit Use of My Sensitive Personal Information/i.exec(instruction);
  if(footer&&/Terms of Service\s*\|\s*Privacy Policy/i.test(instruction))
    return {label:footer[1]!,scope:"named_route",scopeLabel:"Named sale/sharing opt-out route"};
  if(/Sur le Site\s*:\s*Lien\s*[«“"]\s*Gérer les cookies\s*[»”"]/i.test(instruction)&&
     /publicités personnalisées|personnalisation publicitaire/i.test(context)&&
     /modifier ses choix/i.test(instruction)&&!/ne (?:peut|pouvez) pas|impossible/i.test(instruction+context))
    return {label:"Gérer les cookies",scope:"personalized_advertising",scopeLabel:"Personalized advertising choices"};
  const german=/\bdurch Klick auf den folgenden Link\s+der Nutzung von ([\p{L}\p{N} -]{2,50}) widersprechen/iu.exec(instruction);
  if(german&&/Werbung|Werbeflächen/.test(context)&&/Daten|IP-Adresse/.test(context)){
    const name=german[1]!.trim();
    // Preserve the declaration's exact label, including a spelling variant.
    return {label:`${name} widersprechen`,scope:"advertising_provider",scopeLabel:"Named advertising provider only"};
  }
  if(/privacy policy and opt[ -]out\s+here/i.test(instruction)&&
     /targeted advertising|interest-based|cross-channel advertising/i.test(context)&&/shar(?:e|ed|ing)/i.test(context))
    return {label:"Advertising provider opt-out",scope:"advertising_provider",scopeLabel:"Advertising identity provider only"};
  return undefined;
}
