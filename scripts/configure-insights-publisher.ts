import { execFileSync } from "node:child_process";

// Scoped bootstrap for the two resources declared in insights-publishing.tf.
// It avoids applying unrelated drift in the shared production Terraform stack.
const account = "199536052647";
const bucket = "ws01-scan-artifacts-199536052647-us-west-1";
const roleName = "certscore-web-insights-publisher";
const trust = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Federated: `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com` }, Action: "sts:AssumeRoleWithWebIdentity", Condition: { StringEquals: {
  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
  "token.actions.githubusercontent.com:sub": "repo:ergoveritas1-alt/certscore.ai:environment:insights-production"
} } }] };
const policy = { Version: "2012-10-17", Statement: [
  { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject"], Resource: `arn:aws:s3:::${bucket}/public-insights/*` },
  { Effect: "Allow", Action: "s3:ListBucket", Resource: `arn:aws:s3:::${bucket}`, Condition: { StringLike: { "s3:prefix": "public-insights/*" } } }
] };
function aws(...args: string[]) { return JSON.parse(execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) || "{}"); }
console.log(JSON.stringify({ roleName, trust, policy }, null, 2));
if (process.argv.includes("--apply")) {
  if (aws("sts", "get-caller-identity").Account !== account) throw new Error("Unexpected AWS account");
  let existing;
  try { existing = aws("iam", "get-role", "--role-name", roleName).Role; }
  catch (error) { if (!String((error as { stderr?: Buffer }).stderr).includes("NoSuchEntity")) throw error; }
  if (existing) {
    if (JSON.stringify(existing.AssumeRolePolicyDocument) !== JSON.stringify(trust)) throw new Error("Existing publisher trust differs; inspect before changing it");
  } else {
    aws("iam", "create-role", "--role-name", roleName, "--assume-role-policy-document", JSON.stringify(trust));
  }
  aws("iam", "put-role-policy", "--role-name", roleName, "--policy-name", "public-insights-only", "--policy-document", JSON.stringify(policy));
  console.log("Scoped Insights publishing role configured; no app or bucket settings changed.");
}
