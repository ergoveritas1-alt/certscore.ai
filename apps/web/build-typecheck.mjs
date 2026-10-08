/** CI checks generated route types and the full web source before building.
 * A receipt is usable only for that exact immutable image revision. */
export function hasVerifiedBuildTypecheck(env = process.env) {
  return /^[a-f0-9]{40}$/.test(env.BUILD_GIT_SHA ?? "") &&
    env.WEB_TYPECHECK_VERIFIED_SHA === env.BUILD_GIT_SHA;
}
