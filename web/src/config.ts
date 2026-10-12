import {
  createPublicClient,
  custom,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  parseAbi,
  stringToHex,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Token {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}
export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: unknown[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: Token;
    otherPairTokens?: Token[];
  };
  walletAddChain?: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export interface Runtime {
  deployment: Deployment;
  wall: { address: Address; abi: Abi };
  token: { address: Address; abi: Abi };
  chain: ReturnType<typeof defineChain>;
}
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
export const poolTuple =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const quoterAbi = parseAbi([
  `function quoteExactInputSingle((${poolTuple} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
  "error ExecutionFailed(uint256 commandIndex,bytes message)",
  "error TransactionDeadlinePassed()",
]);
export const permitAbi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const stateAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}
export function relativeAsset(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("..") ||
    /[:\\]/.test(path)
  )
    throw new Error("Invalid deployment asset path.");
  return new URL(path, new URL("./", window.location.href));
}
export async function loadRuntime(): Promise<Runtime> {
  const response = await fetch(relativeAsset("imd-deployment.json"), {
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error(
      "Deployment configuration could not be loaded. Reload to try again.",
    );
  const d = (await response.json()) as Deployment;
  if (
    d.version !== 1 ||
    d.chainId !== d.network?.chainId ||
    !d.network.rpcUrls?.length ||
    d.contracts?.length !== 2 ||
    !d.poolKey
  )
    throw new Error(
      "Deployment configuration is incomplete. Transactions are unavailable.",
    );
  if (
    Object.keys(d).some(
      (k) =>
        ![
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
        ].includes(k),
    )
  )
    throw new Error("Unexpected deployment configuration.");
  for (const url of d.network.rpcUrls)
    if (new URL(url).protocol !== "https:")
      throw new Error("Public RPC must use HTTPS.");
  const loaded = await Promise.all(
    d.contracts.map(async (c) => {
      if (!isAddress(c.address) || !/^[a-f0-9]{64}$/.test(c.abiHash))
        throw new Error("Invalid contract binding.");
      const r = await fetch(relativeAsset(c.abiPath));
      if (!r.ok) throw new Error(`Unable to load ${c.name} ABI.`);
      const abi: Abi = await r.json();
      if (
        !Array.isArray(abi) ||
        keccak256(stringToHex(canonical(abi))).slice(2) !== c.abiHash
      )
        throw new Error(
          `${c.name} ABI verification failed. Transactions are unavailable.`,
        );
      return { name: c.name, address: c.address, abi };
    }),
  );
  const wall = loaded.find((c) => c.name === "CombWall"),
    token = loaded.find((c) => c.name === "LaunchToken");
  if (!wall || !token)
    throw new Error("Required deployed contracts are missing.");
  const key = d.poolKey;
  if (
    BigInt(key.currency0) >= BigInt(key.currency1) ||
    ![key.currency0, key.currency1].some(
      (a) => a.toLowerCase() === token.address.toLowerCase(),
    ) ||
    ![key.currency0, key.currency1].some(
      (a) => a.toLowerCase() === d.network.pairToken.address.toLowerCase(),
    )
  )
    throw new Error(
      "The attested pool currencies do not match the configured tokens.",
    );
  const chain = defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: d.network.explorer } },
    testnet: d.network.testnet,
  });
  return { deployment: d, wall, token, chain };
}
export function makeClient(runtime: Runtime, provider?: EIP1193Provider) {
  const transports = runtime.deployment.network.rpcUrls.map((url) =>
    http(url, {
      timeout: 8000,
      retryCount: 0,
      batch: { wait: 20, batchSize: 20 },
    }),
  );
  return createPublicClient({
    chain: runtime.chain,
    transport: fallback(
      [
        ...transports,
        ...(provider ? [custom(provider, { retryCount: 0 })] : []),
      ],
      { retryCount: 0 },
    ),
    pollingInterval: 12000,
  });
}
export type ReadClient = ReturnType<typeof makeClient>;
