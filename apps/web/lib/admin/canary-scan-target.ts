/** The server-retained starting target also exists when no page/request row was created. */
export function scanCanaryTargetSql(configExpression: string) {
  if (!/^[a-z_][a-z0-9_]*[.][a-z_][a-z0-9_]*$/i.test(configExpression)) {
    throw new Error("Invalid scan config SQL reference");
  }
  return `coalesce(${configExpression}->>'normalizedUrl', '') ~* '^https?://[^/?#]+/[.]well-known/certscore-canary/'`;
}
