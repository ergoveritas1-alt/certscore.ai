/** Activation is a distinct phase: every code lane must succeed and all regional
 * producers must verify before any consumer emits the new dispatch profile. */
export async function activateReviewedOptOutAfterProducer<T>(results:ReadonlyArray<{status:string}>,verifyProducers:()=>Promise<unknown>,activations:ReadonlyArray<()=>Promise<T>>):Promise<T[]> {
 if(!results.length || results.some(result=>result.status!=='succeeded'))return [];
 await verifyProducers();
 return Promise.all(activations.map(activate=>activate()));
}
