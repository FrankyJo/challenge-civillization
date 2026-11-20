// Dependency-boundary checker. Parses every source file's import/export/
// require/dynamic-import specifiers with the TypeScript pre-processor (Vue
// SFC <script> blocks included) and checks them, plus package.json
// declarations, against the workspace policy.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo", "playwright-report", "test-results"]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const BUILTINS = new Set(builtinModules);

/**
 * @typedef {{ workspace: string, file: string, specifier?: string, rule: string, message: string }} Violation
 * @typedef {{ workspace: string[], external: string[] | null, nodeBuiltins: boolean }} WorkspacePolicy
 * @typedef {{ policy: Record<string, WorkspacePolicy>, testSupport: string[], testSupportExcluded: string[] }} Policy
 */

/** List workspaces (apps/*, packages/*) with their manifests. */
export function discoverWorkspaces(root) {
  const workspaces = [];
  for (const group of ["apps", "packages"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const manifestPath = join(base, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      workspaces.push({ name: manifest.name, dir: join(base, entry.name), group, manifest });
    }
  }
  return workspaces.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Analyse TS/JS source or a Vue SFC. Returns literal module specifiers and the
 * module-loading forms that cannot be checked statically: non-literal
 * `import()`/`require()`, `createRequire`, `import.meta.glob`,
 * `new URL(…, import.meta.url)` and `<script src>`.
 */
export function analyzeSource(file, text) {
  const specifiers = [];
  const dynamic = [];
  const scripts = [];
  if (file.endsWith(".vue")) {
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc\s*=/.test(match[1] ?? "")) dynamic.push("<script src>");
      scripts.push(match[2] ?? "");
    }
  } else {
    scripts.push(text);
  }
  const literal = (node) =>
    node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : undefined;
  const isImportMetaUrl = (node) =>
    node !== undefined &&
    ts.isPropertyAccessExpression(node) &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.name.text === "url";
  for (const script of scripts) {
    const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
        const text = literal(node.moduleSpecifier);
        if (text !== undefined) specifiers.push(text);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const text = literal(node.moduleReference.expression);
        if (text === undefined) dynamic.push("import = require(<expression>)");
        else specifiers.push(text);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        const text = literal(node.argument.literal);
        if (text !== undefined) specifiers.push(text);
      } else if (ts.isCallExpression(node)) {
        const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
        if (isImport || isRequire) {
          const text = literal(node.arguments[0]);
          if (text === undefined) dynamic.push(`${isImport ? "import" : "require"}(<expression>)`);
          else specifiers.push(text);
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "createRequire") {
          dynamic.push("createRequire()");
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "glob" &&
          ts.isMetaProperty(node.expression.expression)
        ) {
          dynamic.push("import.meta.glob()");
        }
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL") {
        if (isImportMetaUrl(node.arguments?.[1])) dynamic.push("new URL(…, import.meta.url)");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { specifiers, dynamic };
}

/** Literal module specifiers only (see analyzeSource). */
export function moduleSpecifiers(file, text) {
  return analyzeSource(file, text).specifiers;
}

export function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function isBuiltin(specifier) {
  return specifier.startsWith("node:") || BUILTINS.has(specifier) || BUILTINS.has(packageNameOf(specifier));
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(join(dir, entry.name));
    } else if (SOURCE_EXTENSIONS.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield join(dir, entry.name);
    }
  }
}

/** Production code is anything under src/ that is not a test file. */
function isProductionFile(workspaceDir, file) {
  const rel = relative(workspaceDir, file).split(sep).join("/");
  return rel.startsWith("src/") && !TEST_FILE.test(rel);
}

const keys = (record) => Object.keys(record ?? {});

/**
 * @param {string} root repository root
 * @param {Policy} policy
 * @returns {Violation[]}
 */
export function checkArchitecture(root, { policy, testSupport, testSupportExcluded }) {
  const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const rootDeclared = new Set([...keys(rootManifest.dependencies), ...keys(rootManifest.devDependencies)]);
  const workspaces = discoverWorkspaces(root);
  const workspaceNames = new Set(workspaces.map((workspace) => workspace.name));
  /** @type {Violation[]} */
  const violations = [];

  for (const workspace of workspaces) {
    const rules = policy[workspace.name];
    const report = (file, rule, message, specifier) =>
      violations.push({
        workspace: workspace.name,
        file: relative(root, file).split(sep).join("/"),
        ...(specifier === undefined ? {} : { specifier }),
        rule,
        message,
      });
    if (rules === undefined) {
      report(
        join(workspace.dir, "package.json"),
        "unknown-workspace",
        "workspace has no entry in the architecture policy",
      );
      continue;
    }
    const mayUseTestSupport = !testSupportExcluded.includes(workspace.name);
    const prodDeclared = new Set([
      ...keys(workspace.manifest.dependencies),
      ...keys(workspace.manifest.peerDependencies),
      ...keys(workspace.manifest.optionalDependencies),
    ]);
    const devDeclared = new Set(keys(workspace.manifest.devDependencies));
    const manifestFile = join(workspace.dir, "package.json");

    for (const dependency of prodDeclared) {
      if (workspaceNames.has(dependency) && !rules.workspace.includes(dependency)) {
        report(
          manifestFile,
          "forbidden-workspace-dependency",
          `${workspace.name} may not depend on ${dependency}`,
          dependency,
        );
      } else if (!workspaceNames.has(dependency) && rules.external !== null && !rules.external.includes(dependency)) {
        report(
          manifestFile,
          "forbidden-external-dependency",
          `${workspace.name} may not depend on ${dependency}`,
          dependency,
        );
      }
    }
    for (const dependency of devDeclared) {
      if (!workspaceNames.has(dependency)) continue;
      const allowed = rules.workspace.includes(dependency) || (mayUseTestSupport && testSupport.includes(dependency));
      if (!allowed) {
        report(
          manifestFile,
          "forbidden-workspace-dependency",
          `${workspace.name} may not depend on ${dependency}`,
          dependency,
        );
      }
    }

    for (const file of sourceFiles(workspace.dir)) {
      const production = isProductionFile(workspace.dir, file);
      const { specifiers, dynamic } = analyzeSource(file, readFileSync(file, "utf8"));
      for (const form of production ? dynamic : []) {
        // Non-literal import()/require() can load anything: forbidden in all
        // production code. The other forms are legitimate in Node services
        // (e.g. locating migration files) but not in pure/browser workspaces.
        if (form.endsWith("(<expression>)") || !rules.nodeBuiltins) {
          report(file, "unanalyzable-import", `${form} cannot be checked against the policy`, form);
        }
      }
      for (const specifier of specifiers) {
        if (specifier.startsWith(".") || specifier.startsWith("/")) {
          const target = resolve(dirname(file), specifier);
          const rel = relative(workspace.dir, target);
          if (rel.startsWith("..") || resolve(workspace.dir, rel) !== target) {
            report(
              file,
              "relative-escape",
              "relative import leaves the workspace; import the package instead",
              specifier,
            );
          }
          continue;
        }
        if (isBuiltin(specifier)) {
          if (production && !rules.nodeBuiltins) {
            report(
              file,
              "forbidden-node-builtin",
              `${workspace.name} production code may not import Node built-ins`,
              specifier,
            );
          }
          continue;
        }
        const name = packageNameOf(specifier);
        if (name === workspace.name) continue;
        if (workspaceNames.has(name)) {
          const allowed = production
            ? rules.workspace.includes(name)
            : rules.workspace.includes(name) || (mayUseTestSupport && testSupport.includes(name));
          if (!allowed) {
            report(file, "forbidden-workspace-import", `${workspace.name} may not import ${name}`, specifier);
          } else if (production && !prodDeclared.has(name)) {
            report(file, "undeclared-dependency", `${name} must be listed in dependencies`, specifier);
          } else if (!production && !prodDeclared.has(name) && !devDeclared.has(name)) {
            report(file, "undeclared-dependency", `${name} must be listed in package.json`, specifier);
          }
          continue;
        }
        if (production) {
          if (rules.external !== null && !rules.external.includes(name)) {
            report(
              file,
              "forbidden-external-import",
              `${workspace.name} production code may not import ${name}`,
              specifier,
            );
          } else if (!prodDeclared.has(name)) {
            report(file, "undeclared-dependency", `${name} must be listed in dependencies`, specifier);
          }
        } else if (!prodDeclared.has(name) && !devDeclared.has(name) && !rootDeclared.has(name)) {
          report(
            file,
            "undeclared-dependency",
            `${name} must be listed in the workspace or root package.json`,
            specifier,
          );
        }
      }
    }
  }
  return violations;
}
