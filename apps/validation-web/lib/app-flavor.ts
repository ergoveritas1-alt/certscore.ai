export function isValidationOpsApp(env: NodeJS.ProcessEnv = process.env) {
  return env.APP_FLAVOR === "validation_ops";
}
