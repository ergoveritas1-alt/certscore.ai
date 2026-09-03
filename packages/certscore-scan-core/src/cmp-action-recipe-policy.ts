export const CMP_ACTION_RECIPE_DISABLED_ENV =
  "CERTSCORE_CMP_ACTION_RECIPE_DISABLED" as const;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function parseDisabledCmpActionRecipes(value = process.env[CMP_ACTION_RECIPE_DISABLED_ENV]) {
  return new Set((value ?? "")
    .split(",")
    .map(normalize)
    .filter(Boolean));
}

export function cmpActionRecipeEnabled(input: {
  action: "accept" | "reject";
  canonicalName: string;
  disabled?: ReadonlySet<string>;
}) {
  const disabled = input.disabled ?? parseDisabledCmpActionRecipes();
  const canonicalName = normalize(input.canonicalName);
  return ![
    "*",
    `${canonicalName}:*`,
    `${canonicalName}:${input.action}`,
  ].some((key) => disabled.has(key));
}
