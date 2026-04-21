import type { RuntimeVersionInfo } from "./runtime-version";

type RuntimeTarget = RuntimeVersionInfo["runtimeTarget"];

export type GeneratedBuildInfo = {
  gitRef: string | null;
  gitSha: string | null;
  imageTag: string | null;
  runtimeTarget: RuntimeTarget | null;
};

export const generatedBuildInfo: GeneratedBuildInfo = {
  gitRef: null,
  gitSha: null,
  imageTag: null,
  runtimeTarget: null
};
