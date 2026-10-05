import fs from 'node:fs';import esbuild from 'esbuild';
const root='artifacts/research/gpc-controlled-study-2026/study_runner';fs.mkdirSync(root,{recursive:true});
for(const name of ['run','lambda','fixture-test'])await esbuild.build({entryPoints:[`scripts/research/gpc-study/${name}.ts`],outfile:`${root}/${name}.cjs`,bundle:true,platform:'node',format:'cjs',target:'node22',external:['playwright'],tsconfig:'tsconfig.base.json',logLevel:'warning'});
fs.copyFileSync('scripts/research/gpc-study/browser-probe.cjs',`${root}/browser-probe.cjs`);
