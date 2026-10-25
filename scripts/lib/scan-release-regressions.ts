import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { Check } from "../predeploy.js";

export const RELEASE_REGRESSION_MATRIX = "docs/certscore-v2/scan-release-regressions.json";
export type RegressionReference = {
  file: string;
  test: string;
  expectation: string;
  fastChanges: string[];
};
export type ReleaseRegressionMatrix = {
  schemaVersion: "certscore.scan_release_regressions.v1";
  cases: Array<{
    id: string;
    risk: string;
    issues: string[];
    regression: RegressionReference;
    control: RegressionReference;
  }>;
};
type Plan = (files: string[], options?: { full?: boolean }) => { checks: Check[] };
type TestRun = { cwd: string; patterns: string[]; include?: string; exclude?: string; only: boolean };

// Deliberately a read-only recognizer of the checked-in command grammar, not a
// shell interpreter. Unsupported operators cannot establish test coverage.
export function commandWords(command: string): string[] {
  const words: string[] = [];
  let word = "", quote = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (quote) {
      if (char === quote) quote = "";
      else word += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (/\s/.test(char)) { if (word) words.push(word); word = ""; }
    else if (char === "&" && command[i + 1] === "&") {
      if (word) words.push(word);
      words.push("&&"); word = ""; i++;
    } else if (/[;|<>`$\\]/.test(char)) throw Error("Unsupported shell syntax in release test command");
    else word += char;
  }
  if (quote) throw Error("Unterminated quote in release test command");
  if (word) words.push(word);
  return words;
}

function repositoryPath(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  if (!relative || path.isAbsolute(relative) || !resolved.startsWith(root + path.sep)) {
    throw Error(`Release regression path must stay in the repository: ${relative}`);
  }
  return resolved;
}

function testDeclarations(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Array<{ name: string; skipped: boolean; only: boolean }> = [];
  function visit(node: ts.Node, nested = false) {
    let testScope = false;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const direct = ts.isIdentifier(expression) && /^(test|it)$/.test(expression.text);
      const modified = ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
        && /^(test|it)$/.test(expression.expression.text);
      testScope = (ts.isIdentifier(expression) && /^(test|it|describe|suite)$/.test(expression.text))
        || (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
          && /^(test|it|describe|suite)$/.test(expression.expression.text));
      const name = node.arguments[0];
      if ((direct || modified) && name && ts.isStringLiteralLike(name)) {
        // Nested declarations need ancestor-aware names/filters. Keep this
        // index restricted to independently addressable top-level tests.
        let skipped = nested || (modified && /^(skip|todo)$/.test(expression.name.text));
        const options = node.arguments[1];
        if (options && ts.isObjectLiteralExpression(options)) {
          skipped ||= options.properties.some(property => ts.isPropertyAssignment(property)
            && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
            && /^(skip|todo)$/.test(property.name.text) && property.initializer.kind !== ts.SyntaxKind.FalseKeyword);
        }
        const callback = node.arguments.at(-1);
        if (callback) {
          const findSkip = (child: ts.Node) => {
            if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
              && /^(skip|todo)$/.test(child.expression.name.text)) skipped = true;
            ts.forEachChild(child, findSkip);
          };
          findSkip(callback);
        }
        found.push({ name: name.text, skipped, only: modified && expression.name.text === "only" });
      }
    }
    ts.forEachChild(node, child => visit(child, nested || testScope));
  }
  visit(source);
  return found;
}

export function createTestCommandResolver(rootDirectory: string) {
  const root = path.resolve(rootDirectory);
  const packages = new Map<string, string>();
  for (const parent of ["apps", "packages"]) {
    for (const entry of readdirSync(path.join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const cwd = path.join(root, parent, entry.name);
        const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
        if (typeof pkg.name === "string") packages.set(pkg.name, cwd);
      } catch { /* Directory without a package manifest. */ }
    }
  }
  function expand(command: string[], cwd: string, ancestors: string[] = []): TestRun[] {
    if (ancestors.length > 12) throw Error("Release test command nesting exceeds bound");
    let words = [...command];
    while (words[0]?.match(/^[A-Z_][A-Z_0-9]*=/)) words.shift();
    if (words.includes("&&")) {
      const runs: TestRun[] = [];
      while (words.length) {
        const index = words.indexOf("&&");
        runs.push(...expand(index < 0 ? words : words.slice(0, index), cwd, ancestors));
        words = index < 0 ? [] : words.slice(index + 1);
      }
      return runs;
    }
    const program = words[0];
    if (program === "pnpm") {
      words.shift();
      if (words[0] === "--filter") {
        const target = packages.get(words[1]!);
        if (!target) return [];
        cwd = target; words.splice(0, 2);
      }
      if (words[0] === "exec") return expand(words.slice(1), cwd, ancestors);
      if (words[0] === "run") words.shift();
      const script = words.shift();
      const scripts = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")).scripts ?? {};
      if (!script || typeof scripts[script] !== "string") return [];
      const key = `${cwd}:${script}`;
      if (ancestors.includes(key)) throw Error(`Cyclic release test command: ${key}`);
      return expand([...commandWords(scripts[script]), ...words.filter(word => word !== "--")], cwd, [...ancestors, key]);
    }
    if (!["node", "tsx"].includes(words[0]!) || !words.includes("--test")) return [];
    function flag(name: string) {
      const index = words.indexOf(name);
      return index < 0 ? words.find(word => word.startsWith(name + "="))?.slice(name.length + 1) : words[index + 1];
    }
    const patterns: string[] = [];
    const valueOptions = new Set(["--import", "--require", "-r", "--loader", "--tsconfig", "--test-name-pattern", "--test-skip-pattern",
      "--test-reporter", "--test-reporter-destination", "--test-timeout", "--test-concurrency", "--test-shard"]);
    for (let index = 1; index < words.length; index++) {
      const word = words[index]!;
      if (valueOptions.has(word)) { index++; continue; }
      if (!word.startsWith("-") && /(?:\.test\.[cm]?[jt]sx?|\*.*\.[jt]sx?)$/.test(word)) patterns.push(word);
    }
    return [{ cwd, patterns,
      include: flag("--test-name-pattern"), exclude: flag("--test-skip-pattern"), only: words.includes("--test-only") }];
  }
  return (command: string[]) => expand(command, root);
}

export function reviewReleaseRegressions(rootDirectory: string, matrix: ReleaseRegressionMatrix, plan: Plan) {
  const root = path.resolve(rootDirectory);
  if (matrix.schemaVersion !== "certscore.scan_release_regressions.v1" || !Array.isArray(matrix.cases) || !matrix.cases.length) {
    throw Error("Missing or unsupported release regression matrix");
  }
  const errors: string[] = [], ids = new Set<string>();
  const resolveCommands = createTestCommandResolver(root);
  const cache = new Map<string, TestRun[]>();
  function covers(check: Check, file: string, name: string, only: boolean) {
    const key = JSON.stringify(check.command);
    let runs = cache.get(key);
    if (!runs) { runs = resolveCommands(check.command); cache.set(key, runs); }
    return runs.some(run => (!run.only || only) && (!run.include || new RegExp(run.include).test(name))
      && (!run.exclude || !new RegExp(run.exclude).test(name)) && run.patterns.some(pattern =>
        path.matchesGlob(file, path.resolve(run.cwd, pattern))));
  }
  const rows: Array<{ id: string; role: string; file: string; test: string; fullChecks: string[]; fastChecks: Record<string, string[]> }> = [];
  for (const item of matrix.cases) {
    if (!item.id || ids.has(item.id) || !item.risk || !Array.isArray(item.issues)) throw Error(`Invalid/duplicate release regression case: ${item.id}`);
    ids.add(item.id);
    for (const role of ["regression", "control"] as const) {
      const ref = item[role];
      if (!ref?.test || !ref.expectation || !Array.isArray(ref.fastChanges) || !ref.fastChanges.length) {
        throw Error(`Missing ${role} expectation or fast selection for ${item.id}`);
      }
      const file = repositoryPath(root, ref.file);
      const actual = realpathSync(file);
      if (!actual.startsWith(realpathSync(root) + path.sep)) throw Error(`External release regression source: ${ref.file}`);
      const declarations = testDeclarations(file).filter(test => test.name === ref.test);
      if (declarations.length !== 1 || declarations[0]!.skipped) {
        errors.push(`${item.id}/${role}: test missing, ambiguous or skipped: ${ref.file} :: ${ref.test}`); continue;
      }
      const fullChecks = plan([], { full: true }).checks.filter(check => covers(check, file, ref.test, declarations[0]!.only)).map(check => check.key);
      if (!fullChecks.length) errors.push(`${item.id}/${role}: not selected by full preflight`);
      const fastChecks: Record<string, string[]> = {};
      for (const change of ref.fastChanges) {
        if (!statSync(repositoryPath(root, change)).isFile()) throw Error(`Missing representative change file: ${change}`);
        fastChecks[change] = plan([change]).checks.filter(check => covers(check, file, ref.test, declarations[0]!.only)).map(check => check.key);
        if (!fastChecks[change]!.length) errors.push(`${item.id}/${role}: not selected by fast preflight for ${change}`);
      }
      rows.push({ id: item.id, role, file: ref.file, test: ref.test, fullChecks, fastChecks });
    }
  }
  return { schemaVersion: "certscore.scan_release_regression_review.v1", cases: ids.size, references: rows.length, passed: errors.length === 0, errors, rows };
}
