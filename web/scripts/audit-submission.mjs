import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, lstat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../../", import.meta.url));
const run = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const parse = (s) => s.split("\0").filter(Boolean);
const changed = [
  ...new Set([
    ...parse(run(["diff", "--name-only", "-z", "HEAD"])),
    ...parse(run(["ls-files", "--others", "--exclude-standard", "-z"])),
    // The worker consumes this review response even when Git's local excludes hide it.
    ...((await lstat(resolve(root, ".imd-responses.json")).catch(() => null))
      ? [".imd-responses.json"]
      : []),
  ]),
].filter((p) => !p.startsWith("test/scratch/"));
const allowed = (p) =>
  p === ".imd-responses.json" ||
  p === "web/.gitignore" ||
  (/^(web|dist|docs)\//.test(p) &&
    !p.split("/").some((part) => part.startsWith(".")));
const disallowed = changed.filter((p) => !allowed(p));
const forbidden = changed.filter((p) =>
  /(^|\/)(node_modules|\.cache|playwright-report|test-results)(\/|$)|\.tgz$|\.tsbuildinfo$|\.map$/.test(
    p,
  ),
);
const symlinks = [];
let changedBytes = 0;
const deleted = [];
for (const p of changed) {
  const info = await lstat(resolve(root, p)).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    deleted.push(p);
    return null;
  });
  if (!info) continue;
  if (info.isSymbolicLink()) symlinks.push(p);
  else if (info.isFile()) changedBytes += info.size;
}
const tracked = parse(run(["ls-files", "-z"]));
const tree = [...new Set([...tracked, ...changed])].filter(
  (p) => !deleted.includes(p),
);
let treeBytes = 0;
for (const p of tree) {
  const info = await stat(resolve(root, p));
  if (info.isFile()) treeBytes += info.size;
}
const manifest = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
async function walk(dir) {
  const files = [];
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name);
    if ((await stat(path)).isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
const exported = await walk(resolve(root, "dist"));
const actual = exported
  .map((p) => relative(resolve(root, "dist"), p))
  .filter((p) => p !== "imd-deployment.json")
  .sort();
const declared = manifest.assets.map((a) => a.path).sort();
const hashesValid = (
  await Promise.all(
    manifest.assets.map(
      async (a) =>
        createHash("sha256")
          .update(await readFile(resolve(root, "dist", a.path)))
          .digest("hex") === a.sha256,
    ),
  )
).every(Boolean);
const inventoryExact = JSON.stringify(actual) === JSON.stringify(declared);
const protectedTrackedChanges = parse(
  run(["diff", "--name-only", "-z", "HEAD"]),
).filter((p) => !allowed(p));
const submodules = run(["ls-files", "--stage"])
  .split("\n")
  .filter((line) => line.startsWith("160000 "));
const report = {
  checkedAt: new Date().toISOString(),
  changedFiles: changed.length,
  changedBytes,
  deletedFiles: deleted,
  completeWorkingTreeBytes: treeBytes,
  exportAssetCount: actual.length,
  exportBytes: (await Promise.all(exported.map((p) => stat(p)))).reduce(
    (n, s) => n + s.size,
    0,
  ),
  manifestSha256: createHash("sha256")
    .update(await readFile(resolve(root, "dist/imd-deployment.json")))
    .digest("hex"),
  assetInventoryExact: inventoryExact,
  assetHashesValid: hashesValid,
  disallowedPaths: disallowed,
  unnecessaryArtifacts: forbidden,
  symlinks,
  protectedTrackedChanges,
  gitSubmodules: submodules,
  sourceCommitPreserved:
    run(["cat-file", "-t", manifest.sourceCommit]).trim() === "commit" &&
    run([
      "diff",
      manifest.sourceCommit,
      "--",
      "src",
      "docs/abi",
      "foundry.toml",
      "remappings.txt",
      "lib",
      ".github",
    ]).trim() === "",
  ignoreFileBudget: ["web/.gitignore"],
};
await writeFile(
  resolve(root, "docs/evidence/integrity.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (
  disallowed.length ||
  forbidden.length ||
  symlinks.length ||
  protectedTrackedChanges.length ||
  submodules.length ||
  !hashesValid ||
  !inventoryExact ||
  treeBytes > 8388608
)
  process.exitCode = 1;
