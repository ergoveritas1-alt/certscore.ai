import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REGIONS = ["eu-west-1", "eu-central-1", "us-west-1"] as const;
type Region = (typeof REGIONS)[number];

const EXPECTED_CONTEXT: Record<Region, {
  acceptLanguage: string;
  locale: string;
  timezone: string;
}> = {
  "eu-west-1": {
    acceptLanguage: "en-IE,en;q=0.9",
    locale: "en-IE",
    timezone: "Europe/Dublin",
  },
  "eu-central-1": {
    acceptLanguage: "de-DE,de;q=0.9,en;q=0.8",
    locale: "de-DE",
    timezone: "Europe/Berlin",
  },
  "us-west-1": {
    acceptLanguage: "en-US,en;q=0.9",
    locale: "en-US",
    timezone: "America/Los_Angeles",
  },
};

const EXPECTED_PROXY_CONFIG_TAG: Record<Region, string> = {
  "eu-west-1": "ireland-parity-v1",
  "eu-central-1": "ireland-parity-v1",
  "us-west-1": "us-ca-vpc-v1",
};

const functionName = process.env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME?.trim() ||
  "certscore-v2-dag-local-lambda";
const canonicalTemplate = readFileSync(
  path.join(process.cwd(), "scripts/local-v2-dag-lambda/canonical-regional-proxy-user-data.sh"),
  "utf8",
);

type LambdaFunction = {
  Code?: { ResolvedImageUri?: string };
  Configuration?: {
    Architectures?: string[];
    Environment?: { Variables?: Record<string, string> };
    EphemeralStorage?: { Size?: number };
    MemorySize?: number;
    Timeout?: number;
    VpcConfig?: {
      SecurityGroupIds?: string[];
      SubnetIds?: string[];
    };
  };
};

type Address = {
  AllocationId?: string;
  InstanceId?: string;
  PrivateIpAddress?: string;
};

type Instance = {
  Architecture?: string;
  ImageId?: string;
  InstanceId?: string;
  InstanceType?: string;
  State?: { Name?: string };
  Tags?: Array<{ Key?: string; Value?: string }>;
};

function awsJson<T>(region: Region, args: string[]): T {
  return JSON.parse(execFileSync("aws", [
    ...args,
    "--region",
    region,
    "--output",
    "json",
  ], { encoding: "utf8" })) as T;
}

function normalizedProxyUserData(region: Region, instanceId: string): string {
  const response = awsJson<{ UserData?: { Value?: string } }>(region, [
    "ec2",
    "describe-instance-attribute",
    "--instance-id",
    instanceId,
    "--attribute",
    "userData",
  ]);
  const encoded = response.UserData?.Value;
  if (!encoded) {
    throw new Error(`${region}: proxy user data is missing.`);
  }
  return Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/visible_hostname\s+\S+/, "visible_hostname __CERTSCORE_VISIBLE_HOSTNAME__")
    .replace(/acl vpcsrc src\s+\S+/, "acl vpcsrc src __CERTSCORE_LAMBDA_VPC_CIDR__")
    .trim();
}

const errors: string[] = [];
const observed = REGIONS.map((region) => {
  const fn = awsJson<LambdaFunction>(region, [
    "lambda",
    "get-function",
    "--function-name",
    functionName,
  ]);
  const config = fn.Configuration ?? {};
  const env = config.Environment?.Variables ?? {};
  const context = EXPECTED_CONTEXT[region];
  const required = [
    ["memory", config.MemorySize, 3008],
    ["timeout", config.Timeout, 75],
    ["architecture", config.Architectures?.[0], "x86_64"],
    ["ephemeral storage", config.EphemeralStorage?.Size, 512],
    ["locale", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE, context.locale],
    ["accept language", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE, context.acceptLanguage],
    ["timezone", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID, context.timezone],
    ["proxy enabled", env.SCAN_PROXY_ENABLED, "true"],
  ] as const;
  for (const [label, value, expected] of required) {
    if (value !== expected) {
      errors.push(`${region}: ${label} expected ${expected}, received ${value ?? "missing"}.`);
    }
  }

  const allocationId = env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID?.split(":").at(-1);
  if (!allocationId?.startsWith("eipalloc-")) {
    throw new Error(`${region}: EC2 proxy allocation ID is missing.`);
  }
  const addresses = awsJson<{ Addresses?: Address[] }>(region, [
    "ec2",
    "describe-addresses",
    "--allocation-ids",
    allocationId,
  ]);
  const address = addresses.Addresses?.[0];
  if (!address?.InstanceId) {
    throw new Error(`${region}: proxy Elastic IP is not associated with an instance.`);
  }
  const reservations = awsJson<{ Reservations?: Array<{ Instances?: Instance[] }> }>(region, [
    "ec2",
    "describe-instances",
    "--instance-ids",
    address.InstanceId,
  ]);
  const instance = reservations.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(`${region}: proxy instance was not found.`);
  }
  for (const [label, value, expected] of [
    ["proxy instance type", instance.InstanceType, "t4g.micro"],
    ["proxy architecture", instance.Architecture, "arm64"],
    ["proxy state", instance.State?.Name, "running"],
    [
      "proxy configuration tag",
      instance.Tags?.find((tag) => tag.Key === "CertScoreProxyConfig")?.Value,
      EXPECTED_PROXY_CONFIG_TAG[region],
    ],
  ] as const) {
    if (value !== expected) {
      errors.push(`${region}: ${label} expected ${expected}, received ${value ?? "missing"}.`);
    }
  }
  const normalizedUserData = normalizedProxyUserData(region, address.InstanceId);
  if (normalizedUserData !== canonicalTemplate.trim()) {
    errors.push(`${region}: proxy user data differs from the canonical regional configuration.`);
  }
  return {
    imageDigest: fn.Code?.ResolvedImageUri?.split("@")[1],
    region,
  };
});

const baselineDigest = observed[0]?.imageDigest;
for (const entry of observed) {
  if (!baselineDigest || entry.imageDigest !== baselineDigest) {
    errors.push(`${entry.region}: scanner image digest does not match the Ireland baseline.`);
  }
}

if (errors.length > 0) {
  console.error("Regional scanner parity check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Regional scanner parity passed for ${REGIONS.join(", ")}.`);
