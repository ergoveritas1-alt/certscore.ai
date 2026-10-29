import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyProgressPins(){
 const root=realpathSync(fileURLToPath(new URL('../..',import.meta.url)));
 const file=path.join(root,'artifacts/daily-scan-audit/progress-dashboard-activation.json');
 const activation=JSON.parse(readFileSync(file,'utf8'));
 if(activation.moduleVersion!=='certscore.mac-mini-daily-progress.v5'||activation.metricContractVersion!=='certscore.audit-metrics.v1')throw Error('Metric contract activation is not pinned');
 for(const name of ['audit-progress-contracts.ts','audit-progress-engine.ts','audit-progress-pins.ts','validate-audit-progress-dashboard.ts','validate-audit-progress-browser.mjs','publish-audit-progress-dashboard.py'])if(!activation.toolSources.some((s:any)=>path.basename(s.file)===name))throw Error(`Missing required source pin: ${name}`);
 for(const source of activation.toolSources){const p=realpathSync(source.file);if(!p.startsWith(root+path.sep)||createHash('sha256').update(readFileSync(p)).digest('hex')!==source.sha256)throw Error(`Pinned audit source changed: ${source.file}`);}
 return activation.toolSources;
}
