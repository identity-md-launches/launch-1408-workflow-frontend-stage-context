import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
} from "viem";
import {
  erc20Abi,
  makeClient,
  poolTuple,
  stateAbi,
  type Runtime,
} from "./config";
import { CELL_COUNT, NO_CELL, friendlyError } from "./domain";
import type { Wallet } from "./wallet";
export interface Cell {
  id: number;
  owner: Address;
  message: string;
}
export interface Snapshot {
  cells: Cell[];
  claimed: number;
  block: bigint;
  timestamp: number;
  updated: number;
  account?: Address;
  held: number;
  nextCarveAt: number;
  comb: bigint;
  pair: bigint;
  native: bigint;
  symbol: string;
  decimals: number;
  supply: bigint;
}
export interface PoolState {
  liquidity: bigint;
  sqrtPrice: bigint;
  fee: number;
  error: string;
  verified: boolean;
}
export function useChainData(runtime: Runtime, wallet: Wallet) {
  const client = useMemo(
    () =>
      makeClient(runtime, wallet.correctChain ? wallet.provider : undefined),
    [runtime, wallet.provider, wallet.correctChain],
  );
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [pool, setPool] = useState<PoolState>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const version = epoch.current;
    const work = (async () => {
      setLoading(true);
      try {
        if ((await client.getChainId()) !== runtime.deployment.chainId)
          throw new Error(
            "The RPC returned the wrong chain. Transactions are disabled.",
          );
        const codes = await Promise.all(
          [runtime.wall, runtime.token].map((c) =>
            client.getCode({ address: c.address }),
          ),
        );
        if (codes.some((code) => !code || code === "0x"))
          throw new Error(
            "Deployed contract code could not be verified. Transactions are disabled. Retry when the network is available.",
          );
        const block = await client.getBlock();
        const blockNumber = block.number;
        const readWall = (functionName: string, args?: readonly unknown[]) =>
          client.readContract({
            ...runtime.wall,
            functionName,
            args,
            blockNumber,
          });
        const readToken = (functionName: string, args?: readonly unknown[]) =>
          client.readContract({
            ...runtime.token,
            functionName,
            args,
            blockNumber,
          });
        const chunks = await Promise.all(
          Array.from(
            { length: 8 },
            (_, i) =>
              readWall("cells", [i * 128, 128]) as Promise<
                readonly [Address[], string[]]
              >,
          ),
        );
        const [claimed, symbol, decimals, supply, held, comb, pair, native] =
          await Promise.all([
            readWall("claimedCount") as Promise<bigint>,
            readToken("symbol") as Promise<string>,
            readToken("decimals") as Promise<number>,
            readToken("totalSupply") as Promise<bigint>,
            wallet.account
              ? (readWall("cellOf", [wallet.account]) as Promise<number>)
              : NO_CELL,
            wallet.account
              ? (readToken("balanceOf", [wallet.account]) as Promise<bigint>)
              : 0n,
            wallet.account
              ? client.readContract({
                  address: runtime.deployment.network.pairToken.address,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [wallet.account],
                  blockNumber,
                })
              : 0n,
            wallet.account
              ? client.getBalance({ address: wallet.account, blockNumber })
              : 0n,
          ]);
        const nextCarveAt =
          held === NO_CELL ? 0 : Number(await readWall("nextCarveAt", [held]));
        const cells = chunks.flatMap(([owners, messages], chunk) =>
          owners.map((owner, i) => ({
            id: chunk * 128 + i,
            owner,
            message: messages[i],
          })),
        );
        if (cells.length !== CELL_COUNT)
          throw new Error("The wall response was incomplete. Retry the read.");
        if (epoch.current === version) {
          setSnapshot({
            cells,
            claimed: Number(claimed),
            block: blockNumber,
            timestamp: Number(block.timestamp),
            updated: Date.now(),
            account: wallet.account,
            held: Number(held),
            nextCarveAt,
            comb,
            pair,
            native,
            symbol,
            decimals: Number(decimals),
            supply,
          });
          setVerified(true);
          setError("");
        }
      } catch (e) {
        if (epoch.current === version) {
          setError(friendlyError(e));
          setVerified(false);
        }
      } finally {
        if (epoch.current === version) setLoading(false);
      }
    })();
    inFlight.current = work;
    await work;
    if (inFlight.current === work) inFlight.current = null;
  }, [runtime, client, wallet.account]);
  const refreshPool = useCallback(async () => {
    const version = epoch.current;
    try {
      const addresses = runtime.deployment.network.uniswapV4;
      const required = [
        addresses.poolManager,
        addresses.universalRouter,
        addresses.quoter,
        addresses.stateView,
        addresses.permit2,
        runtime.deployment.network.pairToken.address,
        runtime.deployment.poolKey.hooks,
      ].filter((a) => a !== zeroAddress);
      if ((await client.getChainId()) !== runtime.deployment.chainId)
        throw new Error("The RPC returned the wrong chain.");
      const codes = await Promise.all(
        required.map((address) => client.getCode({ address })),
      );
      if (codes.some((c) => !c || c === "0x"))
        throw new Error(
          "Pool contracts could not be verified. Trading is unavailable.",
        );
      const id = keccak256(
        encodeAbiParameters(parseAbiParameters(poolTuple), [
          runtime.deployment.poolKey,
        ]),
      );
      const [slot, liquidity, pairDecimals, pairSymbol] = await Promise.all([
        client.readContract({
          address: addresses.stateView,
          abi: stateAbi,
          functionName: "getSlot0",
          args: [id],
        }),
        client.readContract({
          address: addresses.stateView,
          abi: stateAbi,
          functionName: "getLiquidity",
          args: [id],
        }),
        client.readContract({
          address: runtime.deployment.network.pairToken.address,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        client.readContract({
          address: runtime.deployment.network.pairToken.address,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ]);
      if (
        pairDecimals !== runtime.deployment.network.pairToken.decimals ||
        pairSymbol !== runtime.deployment.network.pairToken.symbol
      )
        throw new Error(
          "Paired token metadata does not match the supplied network. Trading is disabled.",
        );
      if (epoch.current === version)
        setPool({
          sqrtPrice: slot[0],
          fee: slot[3],
          liquidity,
          verified: true,
          error:
            slot[0] === 0n
              ? "This pool is not initialized. Trading is unavailable."
              : "",
        });
    } catch (e) {
      if (epoch.current === version)
        setPool({
          sqrtPrice: 0n,
          fee: 0,
          liquidity: 0n,
          verified: false,
          error: friendlyError(e),
        });
    }
  }, [runtime, client]);
  useEffect(() => {
    epoch.current++;
    inFlight.current = null;
    setVerified(false);
    setError("");
    setPool(undefined);
    void refresh();
    void refreshPool();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setVerified(false);
        void refresh();
        void refreshPool();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
        void refreshPool();
      }
    }, 30000);
    return () => {
      epoch.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, refreshPool]);
  const ready =
    verified &&
    !error &&
    snapshot?.account === wallet.account &&
    !!snapshot &&
    Date.now() - snapshot.updated < 90000;
  return {
    client,
    snapshot,
    pool,
    error,
    loading,
    verified,
    ready,
    refresh,
    refreshPool,
  };
}
export type ChainData = ReturnType<typeof useChainData>;
