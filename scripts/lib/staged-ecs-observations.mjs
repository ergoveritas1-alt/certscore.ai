/** Best-effort samples. ECS stability never depends on these reads. */
export function stagedAlbObservations(cluster, aws, now = () => performance.now()) {
  const started = now();
  const observed = new Map();

  return {
    async observe(service, deployment) {
      const [balancer] = service.loadBalancers ?? [];
      if (service.loadBalancers?.length !== 1 || !balancer?.targetGroupArn ||
          !Number.isInteger(balancer.containerPort) || !deployment.id || !Number.isInteger(deployment.runningCount) || deployment.runningCount < 1) return;
      const existing = observed.get(service.serviceName);
      const state = existing?.deploymentId === deployment.id ? existing : {
        deploymentId: deployment.id, nextMs: 0, reads: 0, failures: 0, targets: [], pending: false,
      };
      observed.set(service.serviceName, state);
      if (state.pending || state.reads >= 40 || now() < state.nextMs) return;
      state.pending = true;
      state.reads++;
      try {
        if (state.targets.length < deployment.runningCount) {
          const listing = await aws(['ecs', 'list-tasks', '--cluster', cluster, '--started-by', deployment.id, '--max-items', '20']);
          if (!listing.taskArns?.length || listing.NextToken) return;
          const result = await aws(['ecs', 'describe-tasks', '--cluster', cluster, '--tasks', ...listing.taskArns,
            '--query', '{failures:failures,tasks:tasks[].{taskArn:taskArn,taskDefinitionArn:taskDefinitionArn,startedBy:startedBy,lastStatus:lastStatus,attachments:attachments,startedAt:startedAt,pullStartedAt:pullStartedAt,pullStoppedAt:pullStoppedAt}}']);
          if (result.failures?.length) return;
          for (const task of result.tasks ?? []) {
            if (task.taskDefinitionArn !== deployment.taskDefinition || task.startedBy !== deployment.id ||
                task.lastStatus !== 'RUNNING' || !task.taskArn || state.targets.some(target => target.taskArn === task.taskArn)) continue;
            const ip = task.attachments?.find(item => item.type === 'ElasticNetworkInterface')?.details
              ?.find(item => item.name === 'privateIPv4Address')?.value;
            if (ip) state.targets.push({ taskArn: task.taskArn, ip, port: balancer.containerPort,
              startedAt: task.startedAt ?? null, pullStartedAt: task.pullStartedAt ?? null, pullStoppedAt: task.pullStoppedAt ?? null,
              firstHealthyObservedMs: null, firstHealthyObservedAt: null, lastStatus: null });
          }
        }
        if (!state.targets.length) return;
        const health = await aws(['elbv2', 'describe-target-health', '--target-group-arn', balancer.targetGroupArn]);
        const elapsed = Math.round(now() - started);
        for (const target of state.targets) {
          const sample = health.TargetHealthDescriptions?.find(entry => entry.Target?.Id === target.ip && entry.Target.Port === target.port);
          target.lastStatus = sample?.TargetHealth?.State ?? null;
          if (target.lastStatus === 'healthy' && target.firstHealthyObservedMs === null) {
            target.firstHealthyObservedMs = elapsed;
            target.firstHealthyObservedAt = new Date().toISOString();
          }
        }
      } catch {
        state.failures++;
      } finally {
        state.pending = false;
        state.nextMs = now() + 8000;
      }
    },
    summary() {
      return [...observed.entries()].map(([name, state]) => ({ name, deploymentId: state.deploymentId,
        sampleAttempts: state.reads, sampleFailures: state.failures,
        tasks: state.targets.map(({ ip, port, ...target }) => target),
      }));
    },
  };
}
