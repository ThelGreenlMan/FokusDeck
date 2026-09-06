import { describe, it, expect, vi } from "vitest";
import {
  RELEASE_TARGET,
  assertReleaseTarget,
  assertWindowsDependencyTree,
  assertReleaseAssets,
  assertUpdaterPlatforms,
  checkDependencies,
} from "./release-policy.mjs";

const rootPackage = "fokusdeck v0.4.0 (C:\\work\\FokusDeck\\src-tauri)";
const windowsTree = [
  rootPackage,
  "tauri v2.11.0",
  "windows-sys v0.61.2",
  "serde v1.0.228",
  "[build-dependencies]",
  "tauri-build v2.6.0",
  "serde v1.0.228 (*)",
].join("\n");
const installer = "FokusDeck_0.4.0_x64-setup.exe";
const releaseAssets = [
  { name: installer },
  { name: `${installer}.sig` },
  { name: "latest.json" },
];
const updaterManifest = {
  version: "0.4.0",
  platforms: {
    "windows-x86_64": { url: "https://example.test/setup.exe", signature: "signed" },
    "windows-x86_64-nsis": { url: "https://example.test/setup.exe", signature: "signed" },
  },
};

describe("release target policy", () => {
  it("accepts only the supported Windows x64 target", () => {
    expect(RELEASE_TARGET).toBe("x86_64-pc-windows-msvc");
    expect(() => assertReleaseTarget(RELEASE_TARGET)).not.toThrow();
  });

  it.each([
    "x86_64-unknown-linux-gnu",
    "aarch64-apple-darwin",
    "aarch64-pc-windows-msvc",
    "i686-pc-windows-msvc",
    "x86_64-pc-windows-gnu",
    " x86_64-pc-windows-msvc ",
    "",
    null,
    undefined,
  ])("rejects unsupported target %j", (target) => {
    expect(() => assertReleaseTarget(target)).toThrow();
  });
});

describe("Windows dependency tree policy", () => {
  it("accepts a nonempty Windows tree, repeated packages and build dependencies", () => {
    expect(() => assertWindowsDependencyTree(windowsTree)).not.toThrow();
  });

  it("accepts CRLF, empty lines and absolute package paths", () => {
    const tree = `${windowsTree}\nlocal-helper v1.0.0 (/work/helper)\n\n`;
    expect(() => assertWindowsDependencyTree(tree.replaceAll("\n", "\r\n"))).not.toThrow();
  });

  it.each([
    "glib",
    "glib-sys",
    "gtk",
    "gtk-sys",
    "webkit2gtk",
    "webkit2gtk-sys",
  ])("requires %s to be absent from the Windows tree at any version", (name) => {
    // This is a target-isolation invariant, not a vulnerability version range.
    for (const version of ["0.1.0", "99.0.0"]) {
      expect(() => assertWindowsDependencyTree(`${windowsTree}\n${name} v${version}`)).toThrow();
    }
  });

  it("also detects a forbidden dependency marked as repeated", () => {
    expect(() => assertWindowsDependencyTree(`${windowsTree}\nglib v0.18.5 (*)`)).toThrow();
  });

  it.each([
    "",
    " \r\n\t",
    "[build-dependencies]\n",
    "serde v1.0.228",
    "another-app v0.4.0 (C:\\work\\another-app)\nserde v1.0.228",
  ])("rejects empty output or a tree without the FokusDeck root: %j", (output) => {
    expect(() => assertWindowsDependencyTree(output)).toThrow();
  });

  it.each([
    "warning: unexpected output",
    "not-a-package",
    "serde 1.0.228",
    "serde vnot-a-version",
    "├── serde v1.0.228",
    "[unrecognized-section]",
  ])("fails closed on an unexpected tree line: %j", (line) => {
    expect(() => assertWindowsDependencyTree(`${windowsTree}\n${line}`)).toThrow();
  });
});

describe("release asset policy", () => {
  it("accepts exactly one installer, its matching signature and latest.json", () => {
    expect(() => assertReleaseAssets(releaseAssets)).not.toThrow();
    expect(() => assertReleaseAssets([...releaseAssets].reverse())).not.toThrow();
  });

  it("allows normal GitHub metadata on asset objects", () => {
    const assets = releaseAssets.map((asset, index) => ({
      ...asset,
      id: index + 1,
      size: 123,
      browser_download_url: `https://example.test/${asset.name}`,
    }));
    expect(() => assertReleaseAssets(assets)).not.toThrow();
  });

  it.each(releaseAssets.map(({ name }) => name))("requires the asset %s", (missing) => {
    expect(() => assertReleaseAssets(releaseAssets.filter(({ name }) => name !== missing))).toThrow();
  });

  it.each([
    "another-setup.exe",
    "another-setup.exe.sig",
    "FokusDeck.AppImage",
    "FokusDeck.dmg",
    "source.zip",
    "notes.txt",
  ])("rejects an additional asset %s", (name) => {
    expect(() => assertReleaseAssets([...releaseAssets, { name }])).toThrow();
  });

  it.each(releaseAssets.map(({ name }) => name))("rejects a duplicated asset name %s", (name) => {
    expect(() => assertReleaseAssets([...releaseAssets, { name }])).toThrow();
  });

  it("rejects a signature for a different installer", () => {
    expect(() => assertReleaseAssets([
      { name: installer },
      { name: "different-setup.exe.sig" },
      { name: "latest.json" },
    ])).toThrow();
  });

  it.each([
    `nested/${installer}`,
    `nested\\${installer}`,
    `../${installer}`,
    `C:\\release\\${installer}`,
  ])("rejects installer folder paths even with a matching signature: %s", (name) => {
    expect(() => assertReleaseAssets([
      { name },
      { name: `${name}.sig` },
      { name: "latest.json" },
    ])).toThrow();
  });

  it.each([undefined, null, {}, "assets", [], [null], [{ name: 123 }]].map((value) => [value]))(
    "rejects malformed asset metadata %j",
    (assets) => {
      expect(() => assertReleaseAssets(assets)).toThrow();
    },
  );
});

describe("updater platform policy", () => {
  it("accepts exactly the two supported Windows platform entries", () => {
    expect(() => assertUpdaterPlatforms(updaterManifest)).not.toThrow();
  });

  it.each(["windows-x86_64", "windows-x86_64-nsis"])("requires the platform %s", (missing) => {
    const platforms = { ...updaterManifest.platforms };
    delete platforms[missing];
    expect(() => assertUpdaterPlatforms({ ...updaterManifest, platforms })).toThrow();
  });

  it.each(["linux-x86_64", "darwin-aarch64", "windows-aarch64", "windows-i686"])(
    "rejects an additional platform %s",
    (platform) => {
      expect(() => assertUpdaterPlatforms({
        ...updaterManifest,
        platforms: { ...updaterManifest.platforms, [platform]: {} },
      })).toThrow();
    },
  );

  it.each([null, [], "installer", 123, false].map((value) => [value]))("rejects a non-object platform value %j", (value) => {
    expect(() => assertUpdaterPlatforms({
      ...updaterManifest,
      platforms: { ...updaterManifest.platforms, "windows-x86_64": value },
    })).toThrow();
  });

  it.each([undefined, null, {}, { platforms: null }, { platforms: [] }, { platforms: {} }])(
    "rejects missing or malformed platforms %j",
    (manifest) => {
      expect(() => assertUpdaterPlatforms(manifest)).toThrow();
    },
  );
});

describe("Cargo dependency check", () => {
  it("checks the locked Windows normal/build tree with machine-readable output", () => {
    const runCargo = vi.fn(() => ({ status: 0, stdout: windowsTree, stderr: "" }));

    expect(() => checkDependencies(RELEASE_TARGET, runCargo)).not.toThrow();

    expect(runCargo).toHaveBeenCalledTimes(1);
    expect(runCargo.mock.calls[0][0]).toBe("cargo");
    expect(runCargo.mock.calls[0][1]).toEqual([
      "tree",
      "--locked",
      "--manifest-path", "src-tauri/Cargo.toml",
      "--target", RELEASE_TARGET,
      "--prefix", "none",
      "--format", "{p}",
      "--edges", "normal,build",
      "--color", "never",
    ]);
  });

  it("rejects an unsupported target before calling Cargo", () => {
    const runCargo = vi.fn();
    expect(() => checkDependencies("x86_64-unknown-linux-gnu", runCargo)).toThrow();
    expect(runCargo).not.toHaveBeenCalled();
  });

  it.each([
    { status: 0, stdout: windowsTree, error: new Error("Cargo unavailable") },
    { status: 1, stdout: windowsTree, stderr: "resolution failed" },
    { status: null, stdout: windowsTree, signal: "SIGTERM" },
    { stdout: windowsTree },
    { status: 0, stdout: "" },
    { status: 0, stdout: " \r\n" },
    { status: 0 },
    { status: 0, stdout: null },
    { status: 0, stdout: "serde v1.0.228" },
    { status: 0, stdout: `${windowsTree}\nwebkit2gtk v99.0.0` },
  ])("fails closed for an unsuccessful or untrustworthy Cargo result %#", (result) => {
    const runCargo = vi.fn(() => result);
    expect(() => checkDependencies(RELEASE_TARGET, runCargo)).toThrow();
  });

  it("fails closed when launching Cargo itself throws", () => {
    const runCargo = vi.fn(() => { throw new Error("Process start failed"); });
    expect(() => checkDependencies(RELEASE_TARGET, runCargo)).toThrow();
  });
});
