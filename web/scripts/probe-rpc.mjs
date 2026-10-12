import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const deployment = JSON.parse(
  await readFile(`${root}/dist/imd-deployment.json`, "utf8"),
);
const evidence = {
  checkedAt: new Date().toISOString(),
  readOnly: true,
  expectedChainId: deployment.chainId,
  endpoints: [],
};
for (const url of deployment.network.rpcUrls) {
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    ...deployment.contracts.map((c, i) => ({
      jsonrpc: "2.0",
      id: i + 2,
      method: "eth_getCode",
      params: [c.address, "latest"],
    })),
  ];
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    const results = await r.json();
    const actual = results.find((x) => x.id === 1)?.result;
    const contracts = deployment.contracts.map((c, i) => {
      const reply = results.find((x) => x.id === i + 2);
      return {
        name: c.name,
        address: c.address,
        hasCode: !!reply?.result && reply.result !== "0x",
        codeBytes: reply?.result ? (reply.result.length - 2) / 2 : 0,
        error: reply?.error?.message,
      };
    });
    evidence.endpoints.push({
      url,
      chainId: actual ? Number(actual) : null,
      contracts,
      verified:
        Number(actual) === deployment.chainId &&
        contracts.every((c) => c.hasCode),
    });
  } catch (e) {
    evidence.endpoints.push({ url, verified: false, error: e.message });
  }
}
await writeFile(
  `${root}/docs/evidence/rpc-probe.json`,
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.endpoints.some((x) => x.verified)) process.exitCode = 1;
