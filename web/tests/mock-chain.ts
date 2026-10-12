import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  getAddress,
  keccak256,
  parseAbiParameters,
  stringToHex,
  toHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import type { Page } from "@playwright/test";
import {
  erc20Abi,
  permitAbi,
  quoterAbi,
  routerAbi,
  stateAbi,
  poolTuple,
} from "../src/config";
import manifest from "../config/imd-deployment.json" with { type: "json" };
// These addresses and wall contents exist only inside the mock transport. No live transactions are sent.
export const visitor = getAddress(
  `0x${keccak256(stringToHex("comb-test-only-visitor")).slice(-40)}`,
);
export const other = getAddress(
  `0x${keccak256(stringToHex("comb-test-only-other")).slice(-40)}`,
);
export const recipient = getAddress(
  `0x${keccak256(stringToHex("comb-test-only-recipient")).slice(-40)}`,
);
const wall = manifest.contracts.find((c) => c.name === "CombWall")!;
const token = manifest.contracts.find((c) => c.name === "LaunchToken")!;
const wallAbi = JSON.parse(
  readFileSync(
    new URL("../../docs/abi/CombWall.json", import.meta.url),
    "utf8",
  ),
) as Abi;
const tokenAbi = JSON.parse(
  readFileSync(
    new URL("../../docs/abi/LaunchToken.json", import.meta.url),
    "utf8",
  ),
) as Abi;
const uni = manifest.network.uniswapV4;
const hash = keccak256(stringToHex("mock-block"));
type Rpc = { method: string; params?: any[]; id?: number };
type Cell = { owner: Address; message: string; next: number };
export class MockChain {
  chainId = 1;
  account: Address = visitor;
  unknownChain = false;
  rejectConnect = false;
  rejectTransaction = false;
  rejectSwitch = false;
  rpcFail = false;
  codeMissing = false;
  revertSimulation = false;
  holdReceipts = false;
  liquidity = 1000000000000n;
  sqrtPrice = 2n ** 96n;
  now = Math.floor(Date.now() / 1000);
  block = 27000000n;
  comb = 250n * 10n ** 18n;
  pair = 1000n * 10n ** 18n;
  tokenAllowance = 0n;
  routerAllowance = 0n;
  expiration = 0;
  cells = new Map<number, Cell>();
  requests: Rpc[] = [];
  transactions: Record<string, any>[] = [];
  pending = new Map<Hex, Record<string, any>>();
  applied = new Set<Hex>();
  walletCalls: Rpc[] = [];
  constructor() {
    for (let i = 1; i < 1024; i++) {
      if (i % 7 === 0 || i % 19 === 0)
        this.cells.set(i, {
          owner: other,
          message: [
            "A small place in a big universe.",
            "The future has room for us.",
            "Leave the world a little kinder.",
            "Hello, fellow human.",
            "Still curious. Still here.",
          ][i % 5],
          next: this.now + 86400,
        });
    }
  }
  held(account = this.account) {
    return (
      [...this.cells.entries()].find(
        ([, c]) => c.owner.toLowerCase() === account.toLowerCase(),
      )?.[0] ?? 65535
    );
  }
  blockResult() {
    return {
      number: toHex(this.block),
      hash,
      parentHash: hash,
      nonce: "0x0000000000000000",
      sha3Uncles: hash,
      logsBloom: `0x${"0".repeat(512)}`,
      transactionsRoot: hash,
      stateRoot: hash,
      receiptsRoot: hash,
      miner: other,
      difficulty: "0x0",
      totalDifficulty: "0x0",
      extraData: "0x",
      size: "0x100",
      gasLimit: "0x1c9c380",
      gasUsed: "0x5208",
      timestamp: toHex(this.now),
      transactions: [],
      uncles: [],
      baseFeePerGas: "0x3b9aca00",
      mixHash: hash,
    };
  }
  decode(call: Record<string, any>) {
    const addr = call.to.toLowerCase();
    const abi =
      addr === wall.address
        ? wallAbi
        : addr === token.address
          ? tokenAbi
          : addr === manifest.network.pairToken.address
            ? erc20Abi
            : addr === uni.permit2
              ? permitAbi
              : addr === uni.quoter
                ? quoterAbi
                : addr === uni.universalRouter
                  ? routerAbi
                  : stateAbi;
    return { abi, ...decodeFunctionData({ abi, data: call.data }) };
  }
  revert(name: string, args: readonly unknown[] = []) {
    return {
      code: 3,
      message: `execution reverted: ${name}`,
      data: encodeErrorResult({ abi: wallAbi, errorName: name, args }),
    };
  }
  validate(call: Record<string, any>) {
    const { functionName, args } = this.decode(call);
    const a = args as any[] | undefined;
    const account = (call.from ?? this.account) as Address;
    if (
      this.revertSimulation &&
      ["claim", "carve", "release", "execute"].includes(functionName)
    )
      return {
        code: 3,
        message: "execution reverted: test simulation failure",
        data: "0x",
      };
    if (functionName === "claim") {
      if (this.held(account) !== 65535)
        return this.revert("AlreadyHoldsCell", [account, this.held(account)]);
      if (this.cells.has(Number(a![0])))
        return this.revert("CellTaken", [
          a![0],
          this.cells.get(Number(a![0]))!.owner,
        ]);
      const bytes = new TextEncoder().encode(a![1]).length;
      if (bytes === 0) return this.revert("EmptyMessage");
      if (bytes > 64)
        return this.revert("MessageTooLong", [BigInt(bytes), 64n]);
    }
    if (functionName === "carve" || functionName === "release") {
      const id = this.held(account);
      if (id === 65535) return this.revert("NoCellHeld", [account]);
      if (functionName === "carve" && this.cells.get(id)!.next > this.now)
        return this.revert("CarveCooldown", [BigInt(this.cells.get(id)!.next)]);
    }
    if (functionName === "execute") {
      if (!this.liquidity)
        return {
          code: 3,
          message: "execution reverted: no liquidity",
          data: "0x",
        };
    }
  }
  apply(call: Record<string, any>) {
    const { functionName, args } = this.decode(call);
    const a = args as any[] | undefined;
    const account = (call.from ?? this.account) as Address;
    if (functionName === "claim")
      this.cells.set(Number(a![0]), {
        owner: account,
        message: a![1],
        next: this.now + 86400,
      });
    if (functionName === "carve") {
      const id = this.held(account);
      this.cells.set(id, {
        owner: account,
        message: a![0],
        next: this.now + 86400,
      });
    }
    if (functionName === "release") this.cells.delete(this.held(account));
    if (functionName === "approve") {
      if (call.to.toLowerCase() === uni.permit2) {
        this.routerAllowance = a![2];
        this.expiration = Number(a![3]);
      } else this.tokenAllowance = a![1];
    }
    if (functionName === "execute") {
      const [, params] = decodeAbiParameters(
        parseAbiParameters("bytes,bytes[]"),
        a![1][0],
      );
      const [rawSwap] = decodeAbiParameters(
        parseAbiParameters(
          `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
        ),
        params[0],
      );
      const swap = rawSwap as { zeroForOne: boolean; amountIn: bigint };
      if (swap.zeroForOne) {
        this.comb -= swap.amountIn;
        this.pair += swap.amountIn * 2n;
      } else {
        this.pair -= swap.amountIn;
        this.comb += swap.amountIn * 2n;
      }
      this.tokenAllowance -= swap.amountIn;
      this.routerAllowance -= swap.amountIn;
    }
    if (functionName === "transfer" || functionName === "transferFrom")
      this.comb -= BigInt(a![functionName === "transfer" ? 1 : 2]);
    this.block++;
  }
  async wallet(r: Rpc) {
    this.walletCalls.push(r);
    if (r.method === "eth_requestAccounts") {
      if (this.rejectConnect)
        return { error: { code: 4001, message: "User rejected connection" } };
      return { result: [this.account] };
    }
    if (r.method === "eth_accounts") return { result: [this.account] };
    if (r.method === "eth_chainId") return { result: toHex(this.chainId) };
    if (r.method === "wallet_switchEthereumChain") {
      if (this.rejectSwitch)
        return {
          error: { code: 4001, message: "User rejected network switch" },
        };
      if (this.unknownChain)
        return { error: { code: 4902, message: "Unknown chain" } };
      this.chainId = Number(r.params![0].chainId);
      return { result: null };
    }
    if (r.method === "wallet_addEthereumChain") {
      this.unknownChain = false;
      return { result: null };
    }
    if (r.method === "eth_sendTransaction") {
      if (this.rejectTransaction)
        return { error: { code: 4001, message: "User rejected transaction" } };
      const tx = r.params![0];
      this.transactions.push(tx);
      const h = keccak256(stringToHex(`mock-tx-${this.transactions.length}`));
      this.pending.set(h, tx);
      return { result: h };
    }
    return this.rpc(r);
  }
  async rpc(r: Rpc): Promise<{ result?: any; error?: any }> {
    this.requests.push(r);
    if (this.rpcFail)
      return { error: { code: -32000, message: "RPC unavailable" } };
    switch (r.method) {
      case "eth_chainId":
        return { result: "0x1" };
      case "eth_getCode":
        return { result: this.codeMissing ? "0x" : "0x6001600055" };
      case "eth_blockNumber":
        return { result: toHex(this.block) };
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return { result: this.blockResult() };
      case "eth_getBalance":
        return { result: toHex(10n ** 18n) };
      case "eth_gasPrice":
        return { result: "0x3b9aca00" };
      case "eth_estimateGas":
        return { result: "0x186a0" };
      case "eth_call": {
        const call = r.params![0];
        const invalid = this.validate(call);
        if (invalid) return { error: invalid };
        const { abi, functionName, args } = this.decode(call);
        const a = args as any[] | undefined;
        let result: any;
        switch (functionName) {
          case "cells": {
            const from = Number(a![0]),
              count = Number(a![1]);
            const ids = Array.from(
              { length: Math.min(count, 1024 - from) },
              (_, i) => i + from,
            );
            result = [
              ids.map((i) => this.cells.get(i)?.owner ?? zeroAddress),
              ids.map((i) => this.cells.get(i)?.message ?? ""),
            ];
            break;
          }
          case "claimedCount":
            result = BigInt(this.cells.size);
            break;
          case "cellOf":
            result = this.held(a![0]);
            break;
          case "nextCarveAt":
            result = BigInt(this.cells.get(Number(a![0]))?.next ?? 0);
            break;
          case "ownerOf":
            result = this.cells.get(Number(a![0]))?.owner ?? zeroAddress;
            break;
          case "messageOf":
            result = this.cells.get(Number(a![0]))?.message ?? "";
            break;
          case "symbol":
            result = call.to.toLowerCase() === token.address ? "COMB" : "IMD";
            break;
          case "decimals":
            result = 18;
            break;
          case "totalSupply":
            result = 10n ** 27n;
            break;
          case "balanceOf":
            result =
              call.to.toLowerCase() === token.address ? this.comb : this.pair;
            break;
          case "allowance":
            result =
              call.to.toLowerCase() === uni.permit2
                ? [this.routerAllowance, this.expiration, 0]
                : this.tokenAllowance;
            break;
          case "getSlot0":
            result = [this.sqrtPrice, 0, 0, 12500];
            break;
          case "getLiquidity":
            result = this.liquidity;
            break;
          case "quoteExactInputSingle":
            result = [a![0].exactAmount * 2n, 140000n];
            break;
          case "approve":
          case "transfer":
          case "transferFrom":
            result = call.to.toLowerCase() === uni.permit2 ? undefined : true;
            break;
          default:
            result = undefined;
        }
        return { result: encodeFunctionResult({ abi, functionName, result }) };
      }
      case "eth_getTransactionReceipt": {
        const h = r.params![0] as Hex;
        const tx = this.pending.get(h);
        if (!tx || this.holdReceipts) return { result: null };
        if (!this.applied.has(h)) {
          this.apply(tx);
          this.applied.add(h);
        }
        return {
          result: {
            transactionHash: h,
            transactionIndex: "0x0",
            blockHash: hash,
            blockNumber: toHex(this.block),
            from: tx.from,
            to: tx.to,
            cumulativeGasUsed: "0x186a0",
            gasUsed: "0x186a0",
            effectiveGasPrice: "0x3b9aca00",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"0".repeat(512)}`,
            type: "0x2",
            status: "0x1",
          },
        };
      }
      case "eth_getTransactionByHash": {
        const tx = this.pending.get(r.params![0]);
        return {
          result: tx
            ? {
                ...tx,
                hash: r.params![0],
                blockHash: hash,
                blockNumber: toHex(this.block),
                transactionIndex: "0x0",
                nonce: "0x0",
                gas: "0x186a0",
                gasPrice: "0x3b9aca00",
                value: tx.value ?? "0x0",
                input: tx.data,
                r: hash,
                s: hash,
                v: "0x1",
                type: "0x2",
                chainId: "0x1",
              }
            : null,
        };
      }
      default:
        return {
          error: { code: -32601, message: `Unmocked method ${r.method}` },
        };
    }
  }
  async install(page: Page, options: { wallet?: boolean } = {}) {
    await page.route("https://**/*", async (route) => {
      if (
        !manifest.network.rpcUrls.some(
          (url) => new URL(url).href === route.request().url(),
        )
      ) {
        await route.abort();
        return;
      }
      const body = route.request().postDataJSON();
      const handle = async (r: Rpc) => ({
        jsonrpc: "2.0",
        id: r.id,
        ...(await this.rpc(r)),
      });
      try {
        const response = Array.isArray(body)
          ? await Promise.all(body.map(handle))
          : await handle(body);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(response),
        });
      } catch (e) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32000, message: String(e) },
          }),
        });
      }
    });
    if (options.wallet !== false) {
      await page.exposeFunction("__testWallet", async (r: Rpc) =>
        this.wallet(r),
      );
      await page.addInitScript(() => {
        const listeners = new Map<string, Set<(data: unknown) => void>>();
        const w = window as any;
        w.ethereum = {
          request: async (r: any) => {
            const answer = await w.__testWallet(r);
            if (answer.error)
              throw Object.assign(
                new Error(answer.error.message),
                answer.error,
              );
            return answer.result;
          },
          on: (event: string, fn: (data: unknown) => void) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(fn);
          },
          removeListener: (event: string, fn: (data: unknown) => void) =>
            listeners.get(event)?.delete(fn),
        };
        w.__emitWallet = (event: string, value: unknown) =>
          listeners.get(event)?.forEach((fn) => fn(value));
      });
    }
  }
}
export async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
export { manifest, wallAbi, tokenAbi, wall, token };
