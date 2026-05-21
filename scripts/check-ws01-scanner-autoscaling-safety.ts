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
  StepScalingPolicyConfiguration?: {
    Cooldown?: number;
    StepAdjustments?: Array<{
      MetricIntervalUpperBound?: number;
      ScalingAdjustment?: number;
    }>;
  };
};

type MetricAlarm = {
  ActionsEnabled?: boolean;
  AlarmName?: string;
  ComparisonOperator?: string;
  EvaluationPeriods?: number;
  MetricName?: string;
  Namespace?: string;
  Period?: number;
  StateValue?: string;
  Threshold?: number;
  TreatMissingData?: string;
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
    awsJson<{ ScalableTargets?: Array<{ MaxCapacity?: number; MinCapacity?: number; SuspendedState?: Record<string, boolean> }> }>([
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

  if ((target.MinCapacity ?? 0) < 1) {
    fail(`MinCapacity is ${target.MinCapacity ?? "unset"}, expected >= 1`);
  }

  if ((target.MaxCapacity ?? 0) > 5) {
    fail(`MaxCapacity is ${target.MaxCapacity ?? "unset"}, expected <= 5`);
  }

  if (target.SuspendedState?.DynamicScalingInSuspended === true) {
    fail("DynamicScalingInSuspended is true");
  }

  if (target.SuspendedState?.DynamicScalingOutSuspended !== false) {
    fail("DynamicScalingOutSuspended is not false");
  }

  const drainedPolicy = drainedPolicies.ScalingPolicies?.[0];
  const drainedAlarm = drainedAlarms.MetricAlarms?.[0];

  if (!drainedPolicy) {
    fail(`${drainedPolicyName} scale-in policy is missing`);
  }

  const drainedStep = drainedPolicy.StepScalingPolicyConfiguration?.StepAdjustments?.[0];

  if (drainedStep?.ScalingAdjustment !== -1 || drainedStep.MetricIntervalUpperBound !== 0) {
    fail(`${drainedPolicyName} must scale in by exactly one task when the queue is drained`);
  }

  if ((drainedPolicy.StepScalingPolicyConfiguration?.Cooldown ?? 0) < 300) {
    fail(`${drainedPolicyName} cooldown is too short`);
  }

  if (!drainedAlarm) {
    fail(`${drainedAlarmName} alarm is missing`);
  }

  if (drainedAlarm.ActionsEnabled !== true) {
    fail(`${drainedAlarmName} actions are disabled`);
  }

  if (
    drainedAlarm.MetricName !== "ScannerQueuedCount" ||
    drainedAlarm.Namespace !== "CertScore/Operations" ||
    drainedAlarm.ComparisonOperator !== "LessThanThreshold" ||
    drainedAlarm.Threshold !== 1 ||
    (drainedAlarm.Period ?? 0) < 60 ||
    (drainedAlarm.EvaluationPeriods ?? 0) < 15 ||
    drainedAlarm.TreatMissingData !== "notBreaching"
  ) {
    fail(`${drainedAlarmName} must require a sustained empty scanner queue before scale-in`);
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
        maxCapacity: target.MaxCapacity,
        suspendedState: target.SuspendedState,
        drainedPolicyName,
        drainedAlarm: {
          actionsEnabled: drainedAlarm.ActionsEnabled,
          evaluationPeriods: drainedAlarm.EvaluationPeriods,
          metricName: drainedAlarm.MetricName,
          name: drainedAlarm.AlarmName,
          namespace: drainedAlarm.Namespace,
          period: drainedAlarm.Period,
          state: drainedAlarm.StateValue
        },
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
