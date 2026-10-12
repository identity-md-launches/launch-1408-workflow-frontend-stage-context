import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { keccak256, stringToHex } from "viem";

const root = fileURLToPath(new URL("../../", import.meta.url));
const seed = JSON.parse(
  await readFile(resolve(root, "web/config/imd-deployment.json"), "utf8"),
);
const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (p) =>
  typeof p === "string" &&
  !p.startsWith("/") &&
  !p.includes("..") &&
  !p.includes(":") &&
  !p.includes("\\");
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
const allowed = [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "contracts",
  "assets",
  "poolKey",
  "network",
  "walletAddChain",
];
assert(
  Object.keys(seed).every((k) => allowed.includes(k)),
  "Unexpected deployment key",
);
assert(
  seed.version === 1 && seed.chainId === seed.network.chainId,
  "Chain/version mismatch",
);
assert(
  /^[a-f0-9]{40}$/.test(seed.sourceCommit) &&
    /^[a-f0-9]{64}$/.test(seed.attestationHash),
  "Invalid attestation",
);
assert(
  seed.contracts.length === 2 &&
    new Set(seed.contracts.map((c) => c.name)).size === 2,
  "Contract set invalid",
);
for (const c of seed.contracts)
  assert(
    safePath(c.abiPath) && /^[a-f0-9]{64}$/.test(c.abiHash),
    "Invalid ABI reference",
  );
// If pinned worker inputs are available, require exact binding. They are not needed after publication.
try {
  const d = JSON.parse(
    await readFile(resolve(root, ".imd/reads/deployment.json"), "utf8"),
  );
  const n = JSON.parse(
    await readFile(resolve(root, ".imd/reads/network.json"), "utf8"),
  );
  for (const key of [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "poolKey",
  ])
    assert(
      canonical(seed[key]) === canonical(d[key]),
      `Handoff mismatch: ${key}`,
    );
  assert(
    canonical(
      seed.contracts.map(({ name, address, abiHash }) => ({
        name,
        address,
        abiHash,
      })),
    ) ===
      canonical(
        d.contracts.map(({ name, address, abiHash }) => ({
          name,
          address,
          abiHash,
        })),
      ),
    "Handoff contract mismatch",
  );
  for (const key of ["network", "walletAddChain"])
    assert(
      canonical(seed[key]) === canonical(n[key]),
      `Network mismatch: ${key}`,
    );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const isCheck = process.argv.includes("--check");
const target = resolve(
  root,
  process.argv.includes("--prepare") ? "web/public" : "dist",
);
await mkdir(resolve(target, "abi"), { recursive: true });
for (const contract of seed.contracts) {
  const bytes = execFileSync(
    "git",
    ["show", `${seed.sourceCommit}:docs/abi/${contract.name}.json`],
    { cwd: root },
  );
  const abi = JSON.parse(bytes);
  assert(Array.isArray(abi), "ABI must be a raw array");
  assert(
    keccak256(stringToHex(canonical(abi))).slice(2) === contract.abiHash,
    `Canonical ABI hash mismatch: ${contract.name}`,
  );
  // Never regenerate an ABI from a different source checkout.
  assert(
    Buffer.compare(
      bytes,
      await readFile(resolve(root, `docs/abi/${contract.name}.json`)),
    ) === 0,
    `Working ABI differs from pinned source: ${contract.name}`,
  );
  if (!isCheck) await writeFile(resolve(target, contract.abiPath), bytes);
  else
    assert(
      Buffer.compare(
        bytes,
        await readFile(resolve(target, contract.abiPath)),
      ) === 0,
      `Export ABI differs: ${contract.name}`,
    );
}
async function files(dir) {
  const result = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = resolve(dir, name),
      info = await stat(path);
    if (info.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const assets = [];
let total = 0;
for (const file of await files(target)) {
  const path = relative(target, file).replaceAll("\\", "/");
  if (path === "imd-deployment.json") continue;
  assert(
    safePath(path) && !/(node_modules|\.tgz$|\.map$|\.cache)/.test(path),
    `Unnecessary export: ${path}`,
  );
  const bytes = await readFile(file);
  total += bytes.length;
  assert(bytes.length <= 8388608, `Asset too large: ${path}`);
  assets.push({ path, sha256: sha(bytes) });
}
assert(
  assets.length <= 128 && total < 32 * 1024 * 1024,
  "Export exceeds limits",
);
if (!process.argv.includes("--prepare"))
  assert(
    assets.some((a) => a.path === "index.html"),
    "Missing index.html",
  );
const manifest = { ...seed, assets };
if (isCheck)
  assert(
    canonical(
      JSON.parse(
        await readFile(resolve(target, "imd-deployment.json"), "utf8"),
      ),
    ) === canonical(manifest),
    "Export manifest or asset inventory mismatch",
  );
else
  await writeFile(
    resolve(target, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${isCheck ? "Verified" : "Exported"} ${assets.length} assets, ${total.toLocaleString()} bytes; pinned ABIs and handoff match.`,
);
