import { writeFile } from "node:fs/promises";
import { handler } from "./local-full-site-handler";
async function main() {
  if(process.env.NODE_ENV === "production") throw new Error("Local runner is development-only");
  let input="";
  for await (const chunk of process.stdin) { input+=chunk; if(Buffer.byteLength(input)>256*1024) throw new Error("Input exceeds limit"); }
  const result=await handler(JSON.parse(input));
  await writeFile(process.argv[2]!,JSON.stringify(result),{mode:0o600});
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
