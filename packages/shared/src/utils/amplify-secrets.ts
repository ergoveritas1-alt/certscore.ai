type AmplifySecretMap = Record<string, string>;

function normalizeSecretValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

export function readAmplifyEnvironmentSecrets(env: NodeJS.ProcessEnv = process.env): AmplifySecretMap {
  const rawSecrets = env.secrets?.trim();

  if (!rawSecrets) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawSecrets);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<AmplifySecretMap>((accumulator, [key, value]) => {
      const normalizedValue = normalizeSecretValue(value);

      if (normalizedValue !== null) {
        accumulator[key] = normalizedValue;
      }

      return accumulator;
    }, {} as AmplifySecretMap);
  } catch {
    return {};
  }
}

export function mergeAmplifyEnvironmentSecrets(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const amplifySecrets = readAmplifyEnvironmentSecrets(env);

  if (Object.keys(amplifySecrets).length === 0) {
    return env;
  }

  return {
    ...amplifySecrets,
    ...env
  };
}
