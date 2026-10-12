import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  encodeAbiParameters,
  fallback,
  formatUnits,
  http,
  keccak256,
  parseAbiParameters,
} from "viem";
import { erc20Abi, poolTuple, quoterAbi, stateAbi } from "../src/config.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const d = JSON.parse(
  await readFile(`${root}/dist/imd-deployment.json`, "utf8"),
);
const client = createPublicClient({
  transport: fallback(
    d.network.rpcUrls.map((url) =>
      http(url, { timeout: 12000, retryCount: 0 }),
    ),
    { retryCount: 0 },
  ),
});
const evidence = {
  checkedAt: new Date().toISOString(),
  readOnly: true,
  transactionsBroadcast: 0,
};
try {
  evidence.chainId = await client.getChainId();
  const block = await client.getBlock();
  evidence.block = block.number.toString();
  evidence.blockTimestamp = Number(block.timestamp);
  const contracts = await Promise.all(
    d.contracts.map(async (c) => ({
      ...c,
      abi: JSON.parse(await readFile(`${root}/dist/${c.abiPath}`, "utf8")),
    })),
  );
  const wall = contracts.find((c) => c.name === "CombWall"),
    token = contracts.find((c) => c.name === "LaunchToken");
  const [symbol, decimals, supply, count, cells] = await Promise.all([
    client.readContract({
      ...token,
      functionName: "symbol",
      blockNumber: block.number,
    }),
    client.readContract({
      ...token,
      functionName: "decimals",
      blockNumber: block.number,
    }),
    client.readContract({
      ...token,
      functionName: "totalSupply",
      blockNumber: block.number,
    }),
    client.readContract({
      ...wall,
      functionName: "claimedCount",
      blockNumber: block.number,
    }),
    client.readContract({
      ...wall,
      functionName: "cells",
      args: [0, 128],
      blockNumber: block.number,
    }),
  ]);
  evidence.token = { symbol, decimals, supply: formatUnits(supply, decimals) };
  evidence.wall = {
    claimedCount: Number(count),
    firstBatchOwners: cells[0].length,
    firstBatchMessages: cells[1].length,
  };
  const uni = d.network.uniswapV4;
  const code = await Promise.all(
    Object.entries(uni)
      .filter(
        ([, address]) =>
          typeof address === "string" && address.startsWith("0x"),
      )
      .map(async ([name, address]) => {
        const bytes = await client.getCode({ address });
        return { name, address, hasCode: !!bytes && bytes !== "0x" };
      }),
  );
  evidence.uniswapContracts = code;
  const poolId = keccak256(
    encodeAbiParameters(parseAbiParameters(poolTuple), [d.poolKey]),
  );
  const [slot, liquidity, pairSymbol, pairDecimals] = await Promise.all([
    client.readContract({
      address: uni.stateView,
      abi: stateAbi,
      functionName: "getSlot0",
      args: [poolId],
      blockNumber: block.number,
    }),
    client.readContract({
      address: uni.stateView,
      abi: stateAbi,
      functionName: "getLiquidity",
      args: [poolId],
      blockNumber: block.number,
    }),
    client.readContract({
      address: d.network.pairToken.address,
      abi: erc20Abi,
      functionName: "symbol",
      blockNumber: block.number,
    }),
    client.readContract({
      address: d.network.pairToken.address,
      abi: erc20Abi,
      functionName: "decimals",
      blockNumber: block.number,
    }),
  ]);
  evidence.pool = {
    poolId,
    poolKey: d.poolKey,
    sqrtPriceX96: slot[0].toString(),
    tick: slot[1],
    protocolFee: slot[2],
    lpFee: slot[3],
    liquidity: liquidity.toString(),
    pairSymbol,
    pairDecimals,
  };
  try {
    const quote = await client.simulateContract({
      address: uni.quoter,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: d.poolKey,
          zeroForOne:
            d.poolKey.currency0.toLowerCase() ===
            d.network.pairToken.address.toLowerCase(),
          exactAmount: 10n ** BigInt(pairDecimals),
          hookData: "0x",
        },
      ],
    });
    evidence.quote = {
      input: `1 ${pairSymbol}`,
      estimatedOutput: `${formatUnits(quote.result[0], decimals)} ${symbol}`,
      gasEstimate: quote.result[1].toString(),
      method: "eth_call / simulateContract",
      broadcast: false,
    };
  } catch (e) {
    evidence.quote = {
      method: "eth_call / simulateContract",
      broadcast: false,
      error: e.shortMessage || e.message,
    };
  }
} catch (e) {
  evidence.error = e.shortMessage || e.message;
  process.exitCode = 1;
}
await writeFile(
  `${root}/docs/evidence/live-reads.json`,
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
