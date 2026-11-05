/** Positive installed-artifact proof shared by local and workflow selectors. */
export function installedEcsRevision(state, definition, expected) {
  const fail = () => { throw new Error('Installed runtime identity or stabilization is unverified.'); };
  if (!expected || !/^[a-z0-9-]+$/.test(expected.region ?? '') || !/^[a-z0-9][a-z0-9._/-]*$/.test(expected.repository ?? '') || !expected.container) return fail();
  const service = state?.services?.[0];
  if (state?.failures?.length || state?.services?.length !== 1 || service.status !== 'ACTIVE' ||
    !Number.isInteger(service.desiredCount) || service.desiredCount < 1 || service.runningCount !== service.desiredCount || service.pendingCount !== 0 ||
    service.deployments?.length !== 1 || service.deployments[0].status !== 'PRIMARY' || service.deployments[0].rolloutState !== 'COMPLETED' ||
    !service.taskDefinition || service.deployments[0].taskDefinition !== service.taskDefinition || definition?.taskDefinition?.taskDefinitionArn !== service.taskDefinition) return fail();
  const containers = definition.taskDefinition.containerDefinitions?.filter(value => value.name === expected.container);
  if (containers?.length !== 1) return fail();
  const prefix = `199536052647.dkr.ecr.${expected.region}.amazonaws.com/${expected.repository}:`;
  const image = containers[0].image;
  if (typeof image !== 'string' || !image.startsWith(prefix) || !/^[a-f0-9]{40}$/.test(image.slice(prefix.length))) return fail();
  return image.slice(prefix.length);
}
