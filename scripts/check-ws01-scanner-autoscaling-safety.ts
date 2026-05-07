import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const region = process.env.AWS_REGION ?? "us-west-1";
const cluster = process.env.WS01_SCANNER_CLUSTER ?? "certscore-validation-cluster";
const service = process.env.WS01_SCANNER_SERVICE ?? "ws01-scanner-worker";
const resourceId = `service/${cluster}/${service}`;
const scalableDimension = "ecs:service:DesiredCount";
const serviceNamespace = "ecs";
const queuePressurePolicyName = process.env.WS01_SCANNER_QUEUE_PRESSURE_POLICY ?? "ws01-scanner-worker-queue-pressure";
const drainedPolicyName = process.env.WS01_SCANNER_QUEUE_DRAINED_POLICY ?? "ws01-scanner-worker-queue-drained";
const drainedAlarmName = process.env.WS01_SCANNER_QUEUE_DRAINED_ALARM ?? "ws01-scanner-worker-queue-drained-scale-in";

type ScalingPolicy = {
  Alarms?: Array<{ AlarmName?: string }>;
  PolicyName?: string;
};

type MetricAlarm = {
  ActionsEnabled?: boolean;
  AlarmName?: string;
  MetricName?: string;
  Namespace?: string;
  StateValue?: string;
};

function fail(message: string): never {
  console.error(`FAIL ws01 scanner autoscaling safety: ${message}`);
  process.exit(1);
}

async function awsJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("aws", [...args, "--region", region, "--output", "json"], {
    maxBuffer: 10 * 1024 * 1024
  });

  return JSON.parse(stdout) as T;
}

async function main() {
  const [targets, policies, drainedPolicies, drainedAlarms] = await Promise.all([
    awsJson<{ ScalableTargets?: Array<{ MinCapacity?: number; SuspendedState?: Record<string, boolean> }> }>([
      "application-autoscaling",
      "describe-scalable-targets",
      "--service-namespace",
      serviceNamespace,
      "--resource-ids",
      resourceId,
      "--scalable-dimension",
      scalableDimension
    ]),
    awsJson<{ ScalingPolicies?: ScalingPolicy[] }>([
      "application-autoscaling",
      "describe-scaling-policies",
      "--service-namespace",
      serviceNamespace,
      "--resource-id",
      resourceId,
      "--scalable-dimension",
      scalableDimension
    ]),
    awsJson<{ ScalingPolicies?: ScalingPolicy[] }>([
      "application-autoscaling",
      "describe-scaling-policies",
      "--service-namespace",
      serviceNamespace,
      "--resource-id",
      resourceId,
      "--scalable-dimension",
      scalableDimension,
      "--policy-names",
      drainedPolicyName
    ]),
    awsJson<{ MetricAlarms?: MetricAlarm[] }>([
      "cloudwatch",
      "describe-alarms",
      "--alarm-names",
      drainedAlarmName
    ])
  ]);

  const target = targets.ScalableTargets?.[0];
  const queuePolicy = policies.ScalingPolicies?.find((policy) => policy.PolicyName === queuePressurePolicyName);
  const queueAlarmNames = (queuePolicy?.Alarms ?? []).map((alarm) => alarm.AlarmName).filter((value): value is string => Boolean(value));

  if (!target) {
    fail(`missing scalable target for ${resourceId}`);
  }

  if ((target.MinCapacity ?? 0) < 2) {
    fail(`MinCapacity is ${target.MinCapacity ?? "unset"}, expected >= 2`);
  }

  if (target.SuspendedState?.DynamicScalingInSuspended !== true) {
    fail("DynamicScalingInSuspended is not true");
  }

  if (target.SuspendedState?.DynamicScalingOutSuspended !== false) {
    fail("DynamicScalingOutSuspended is not false");
  }

  if ((drainedPolicies.ScalingPolicies ?? []).length > 0) {
    fail(`${drainedPolicyName} scale-in policy exists`);
  }

  if ((drainedAlarms.MetricAlarms ?? []).length > 0) {
    fail(`${drainedAlarmName} alarm exists`);
  }

  if (!queuePolicy) {
    fail(`${queuePressurePolicyName} scale-out policy is missing`);
  }

  if (queueAlarmNames.length === 0) {
    fail(`${queuePressurePolicyName} has no attached CloudWatch alarm`);
  }

  const queueAlarms = await awsJson<{ MetricAlarms?: MetricAlarm[] }>([
    "cloudwatch",
    "describe-alarms",
    "--alarm-names",
    ...queueAlarmNames
  ]);
  const enabledQueueAlarms = (queueAlarms.MetricAlarms ?? []).filter((alarm) => alarm.ActionsEnabled === true && alarm.StateValue !== "INSUFFICIENT_DATA");

  if (enabledQueueAlarms.length === 0) {
    fail(`${queuePressurePolicyName} has no enabled, data-backed CloudWatch alarm`);
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        resourceId,
        minCapacity: target.MinCapacity,
        suspendedState: target.SuspendedState,
        queuePressurePolicyName,
        queueAlarmNames,
        queueAlarms: enabledQueueAlarms.map((alarm) => ({
          actionsEnabled: alarm.ActionsEnabled,
          metricName: alarm.MetricName,
          name: alarm.AlarmName,
          namespace: alarm.Namespace,
          state: alarm.StateValue
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
