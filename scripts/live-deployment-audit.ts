export type EndpointPayload = {
  gitSha?: string | null;
  runtimeTarget?: string | null;
};

export type EndpointReport = {
  headers: Record<string, string>;
  payload: EndpointPayload | null;
};

export function assessPrimaryRuntime(params: {
  expectedRuntimeTarget: string;
  label: string;
  report: EndpointReport;
}) {
  const messages: string[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const payloadRuntime = params.report.payload?.runtimeTarget ?? "unknown";

  if (payloadRuntime !== params.expectedRuntimeTarget) {
    failures.push(
      `${params.label} runtime target is ${payloadRuntime}, expected ${params.expectedRuntimeTarget}`
    );
  } else {
    messages.push(`${params.label} runtime target matches ${params.expectedRuntimeTarget}`);
  }

  return { failures, messages, warnings };
}

export function assessSecondaryRuntime(params: {
  expectedRuntimeTarget: string;
  label: string;
  report: EndpointReport;
}) {
  const messages: string[] = [];
  const warnings: string[] = [];
  const payloadRuntime = params.report.payload?.runtimeTarget ?? "unknown";

  if (payloadRuntime !== params.expectedRuntimeTarget) {
    warnings.push(
      `${params.label} runtime target is ${payloadRuntime}, expected ${params.expectedRuntimeTarget}`
    );
  } else {
    messages.push(`${params.label} runtime target matches ${params.expectedRuntimeTarget}`);
  }

  return { messages, warnings };
}

export function assessGitSha(params: {
  expectedLiveGitSha: string;
  liveGitSha?: string | null;
  secondaryGitSha?: string | null;
  liveBaseUrl: string;
  liveLabel: string;
  secondaryLabel: string;
}) {
  const failures: string[] = [];
  const messages: string[] = [];
  const warnings: string[] = [];

  if (params.expectedLiveGitSha && params.liveGitSha) {
    if (params.liveGitSha === params.expectedLiveGitSha) {
      messages.push(`${params.liveLabel} git sha matches expected revision ${params.expectedLiveGitSha}`);
    } else {
      warnings.push(`${params.liveLabel} git sha is ${params.liveGitSha}, expected ${params.expectedLiveGitSha}`);
    }
  } else if (params.expectedLiveGitSha) {
    warnings.push(
      `Expected ${params.liveLabel.toLowerCase()} git sha is ${params.expectedLiveGitSha}, but the host did not return a git sha`
    );
  }

  if (
    params.expectedLiveGitSha &&
    params.secondaryGitSha === params.expectedLiveGitSha &&
    params.liveGitSha &&
    params.liveGitSha !== params.expectedLiveGitSha
  ) {
    failures.push(
      `${params.secondaryLabel} is serving expected revision ${params.expectedLiveGitSha} but ${params.liveLabel.toLowerCase()} ${params.liveBaseUrl} is still on ${params.liveGitSha}`
    );
  }

  if (params.secondaryGitSha && params.liveGitSha) {
    if (params.secondaryGitSha === params.liveGitSha) {
      messages.push(`${params.secondaryLabel} and ${params.liveLabel.toLowerCase()} agree on git sha ${params.liveGitSha}`);
    } else {
      warnings.push(
        `${params.secondaryLabel} git sha ${params.secondaryGitSha} differs from ${params.liveLabel.toLowerCase()} git sha ${params.liveGitSha}`
      );
    }
  }

  return { failures, messages, warnings };
}
