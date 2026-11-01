import type { OneTrustBaseline } from './onetrust-consent-state';

/** One immutable baseline applies to one initial OR terminal verification
 * invocation. An invalid baseline can never authorize the cookie branch, but
 * keep its first read for bounded receipt/write diagnostics. Independent TCF
 * reads stay outside this gate. A new terminal invocation gets a fresh gate. */
export function createConsentCookieReadGate<T>(cookieName:string|undefined,baseline:OneTrustBaseline|undefined,onSkipped?:()=>void) {
  const blocked=cookieName==='OptanonConsent'&&baseline?.status!=='verified';
  let diagnosticRead:Promise<T|undefined>|undefined;
  return (read:()=>Promise<T|undefined>):Promise<T|undefined> => {
    if(!blocked)return read();
    // An ineligible diagnostic branch cannot supply a semantic decision.
    if(diagnosticRead){onSkipped?.();return diagnosticRead;}
    return diagnosticRead=read().then(()=>undefined);
  };
}
