import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_TARGET = "x86_64-pc-windows-msvc";
const updaterTargets = ["windows-x86_64", "windows-x86_64-nsis"];
const gtkPackages = new Set(["glib", "glib-sys", "gtk", "gtk-sys", "webkit2gtk", "webkit2gtk-sys"]);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const issueUrl = "https://github.com/ThelGreenlMan/FokusDeck/issues/13";

export function assertReleaseTarget(target) {
  if (target !== RELEASE_TARGET) {
    throw new Error(`Unsupported release target: ${String(target)}. Only ${RELEASE_TARGET} is approved. See ${issueUrl}`);
  }
}

export function assertWindowsDependencyTree(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) {
    throw new Error("Cargo returned no dependency graph; refusing to approve the release.");
  }
  let foundApplication = false;
  for (const line of stdout.split(/\r?\n/).map((entry) => entry.trim())) {
    if (!line || line === "[build-dependencies]") continue;
    const match = /^([a-zA-Z0-9_-]+) v(\d+\.\d+\.\d+(?:[-+][^\s]+)?)(?:\s.*)?$/.exec(line);
    if (!match) throw new Error(`Unexpected Cargo dependency output: ${line}`);
    const [, name, version] = match;
    if (name === "fokusdeck") foundApplication = true;
    // Enforce the reviewed Windows graph, not a blanket advisory suppression.
    // Even a fixed GTK generation needs a deliberate platform-policy review.
    if (gtkPackages.has(name)) {
      throw new Error(`Unexpected GTK dependency in the Windows graph: ${name} ${version}. Review ${issueUrl}`);
    }
  }
  if (!foundApplication) throw new Error("Cargo graph does not contain FokusDeck; refusing to approve the release.");
}

export function checkDependencies(target, runCargo = spawnSync) {
  assertReleaseTarget(target);
  const result = runCargo("cargo", [
    "tree", "--locked", "--manifest-path", "src-tauri/Cargo.toml",
    "--target", target, "--prefix", "none", "--format", "{p}",
    "--edges", "normal,build", "--color", "never",
  ], { cwd: repositoryRoot, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024, shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`Cargo dependency check failed: ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`);
  }
  assertWindowsDependencyTree(result.stdout);
}

export function assertReleaseAssets(assets) {
  if (!Array.isArray(assets) || assets.length !== 3 || assets.some((asset) =>
    !asset || typeof asset.name !== "string" || /[\\/]/.test(asset.name))) {
    throw new Error("Release must contain exactly the Windows installer, its signature and latest.json.");
  }
  const names = assets.map((asset) => asset.name);
  const installers = names.filter((name) => name.endsWith(".exe"));
  if (new Set(names).size !== 3 || installers.length !== 1 ||
      !names.includes(`${installers[0]}.sig`) || !names.includes("latest.json")) {
    throw new Error("Unexpected release assets; Linux/macOS packages and unmatched signatures must not be published.");
  }
}

export function assertUpdaterPlatforms(manifest) {
  const platforms = manifest?.platforms;
  if (!platforms || typeof platforms !== "object" || Array.isArray(platforms) ||
      Object.keys(platforms).length !== updaterTargets.length ||
      updaterTargets.some((target) => !Object.hasOwn(platforms, target) ||
        !platforms[target] || typeof platforms[target] !== "object" || Array.isArray(platforms[target]))) {
    throw new Error("latest.json must contain only the two approved Windows x64 updater targets.");
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

export function runCli(args) {
  if (args[0] === "dependencies" && args.length === 2) {
    checkDependencies(args[1]);
  } else if (args[0] === "artifacts" && args.length === 3) {
    assertReleaseAssets(readJson(args[1]).assets);
    assertUpdaterPlatforms(readJson(args[2]));
  } else {
    throw new Error("Usage: release-policy.mjs dependencies <target> | artifacts <release.json> <latest.json>");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
    console.log("Windows release policy verified.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
