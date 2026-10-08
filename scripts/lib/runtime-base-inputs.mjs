import { createHash } from "node:crypto";

const dependencyInputs = value => {
  const data = JSON.parse(value);
  return JSON.stringify([data.dependencies, data.devDependencies, data.optionalDependencies,
    data.peerDependencies, data.engines, data.packageManager, data.pnpm]);
};

/** Ignore app compilation and revision metadata when comparing runtime bases.
 * Keep dependency installation, base images and prod-dependency assembly. */
export function runtimeBaseDockerInputs(source, component) {
  const stages = source.split(/(?=^FROM )/m);
  const runtimeName = component === "web" ? "web-runtime-base" : "validation-worker-runtime-base";
  const runtime = stages.find(stage => new RegExp(`^FROM .* AS ${runtimeName}\\s*$`, "m").test(stage));
  if (!runtime) throw new Error(`Missing ${runtimeName} stage`);
  if (component === "web") return runtime.trim();
  const build = stages.find(stage => /^FROM .* AS build\s*$/m.test(stage));
  const prod = stages.find(stage => /^FROM .* AS validation-worker-prod-deps\s*$/m.test(stage));
  if (!build || !prod || !build.includes("COPY packages/certscore-api-contracts ./")) {
    throw new Error("Unrecognized validation dependency layout");
  }
  // The app COPY used to precede package COPYs. Neither belongs to the base's
  // dependency-install inputs. Unknown layouts fail closed to a rebuild.
  const dependencyPrefix = build.slice(0, build.search(/^COPY (?:apps\/web|packages\/certscore-api-contracts) \./m))
    .replace(/^ARG BUILD_(?:GIT_REF|GIT_SHA|IMAGE_TAG|RUNTIME_TARGET)=.*\n/gm, "");
  return [dependencyPrefix.trim(), prod.trim(), runtime.trim()].join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function runtimeBaseInputsChanged(component, files, before, after) {
  const dockerfile = component === "web" ? "apps/web/Dockerfile" : "apps/validation-worker/Dockerfile";
  for (const file of files) {
    if ([".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(file) || file.startsWith("patches/")) return true;
    if (file !== dockerfile && !/^(?:package\.json|(?:apps|packages)\/[^/]+\/package\.json)$/.test(file)) continue;
    try {
      const [oldValue, newValue] = await Promise.all([before(file), after(file)]);
      if (file === dockerfile) {
        if (runtimeBaseDockerInputs(oldValue, component) !== runtimeBaseDockerInputs(newValue, component)) return true;
      } else {
        if (dependencyInputs(oldValue) !== dependencyInputs(newValue)) return true;
      }
    } catch { return true; }
  }
  return false;
}

/** Bind reuse to the actual published base, including after a failed deploy. */
export async function runtimeBaseSourceFingerprint(component, files, read) {
  const dockerfile = component === "web" ? "apps/web/Dockerfile" : "apps/validation-worker/Dockerfile";
  const selected = files.filter(file => file === dockerfile ||
    [".npmrc", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(file) || file.startsWith("patches/") ||
    /^(?:package\.json|(?:apps|packages)\/[^/]+\/package\.json)$/.test(file)).sort();
  if (!selected.includes(dockerfile)) throw new Error("Missing runtime-base Dockerfile");
  const inputs = await Promise.all(selected.map(async file => {
    const value = await read(file);
    return [file, file === dockerfile ? runtimeBaseDockerInputs(value, component) :
      file.endsWith("package.json") ? dependencyInputs(value) : value];
  }));
  return createHash("sha256").update(JSON.stringify(["runtime-base-inputs.v1", component, inputs])).digest("hex");
}
