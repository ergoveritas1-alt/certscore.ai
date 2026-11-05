/** Positive installed-artifact proof shared by local and workflow selectors. */
export async function installedEcsRevision(state, definition, expected) {
  const fail = () => { throw new Error('Installed runtime identity or stabilization is unverified.'); };
  if (!expected || !/^[a-z0-9-]+$/.test(expected.region ?? '') || !/^[a-z0-9][a-z0-9._/-]*$/.test(expected.repository ?? '') || !expected.container) return fail();
  const service = state?.services?.[0];
  if (state?.failures?.length || state?.services?.length !== 1 || service.status !== 'ACTIVE' ||
    !Number.isInteger(service.desiredCount) || service.desiredCount < 1 || service.runningCount !== service.desiredCount || service.pendingCount !== 0 ||
    service.deployments?.length !== 1 || service.deployments[0].status !== 'PRIMARY' || service.deployments[0].rolloutState !== 'COMPLETED' ||
    !service.taskDefinition || service.deployments[0].taskDefinition !== service.taskDefinition || definition?.taskDefinition?.taskDefinitionArn !== service.taskDefinition) return fail();
  const containers = definition.taskDefinition.containerDefinitions?.filter(value => value.name === expected.container);
  if (containers?.length !== 1) return fail();
  const prefix = `199536052647.dkr.ecr.${expected.region}.amazonaws.com/${expected.repository}`;
  const container = containers[0];
  if (typeof container.image !== 'string') return fail();
  if (container.image.startsWith(prefix + ':')) {
    const sha = container.image.slice(prefix.length + 1);
    if (!/^[a-f0-9]{40}$/.test(sha)) return fail();
    return sha;
  }
  if (!container.image.startsWith(prefix + '@')) return fail();
  const digest = container.image.slice(prefix.length + 1);
  const sha = container.dockerLabels?.['org.opencontainers.image.revision'];
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{40}$/.test(sha ?? '') ||
      typeof expected.resolveDigest !== 'function' || await expected.resolveDigest(sha) !== digest) return fail();
  return sha;
}
