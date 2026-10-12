import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  formatUnits,
  parseAbiParameters,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { poolTuple, type PoolKey } from "./config";
export const CELL_COUNT = 1024;
export const NO_CELL = 65535;
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
export const shortAddress = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const sameAddress = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function amountText(value: bigint, decimals = 18, digits = 5) {
  const [whole, fraction] = formatUnits(value, decimals).split(".");
  const part = fraction?.slice(0, digits).replace(/0+$/, "");
  if (value > 0n && whole === "0" && !part)
    return `<0.${"0".repeat(digits - 1)}1`;
  return `${BigInt(whole).toLocaleString("en-US")}${part ? "." + part : ""}`;
}
export function parseAmount(text: string, decimals: number): bigint {
  if (
    !/^\d+(\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a positive amount with up to ${decimals} decimal places.`,
    );
  const amount = parseUnits(text, decimals);
  if (amount <= 0n || amount >= 2n ** 128n)
    throw new Error(
      "Enter an amount greater than zero and within the pool limit.",
    );
  return amount;
}
export function slippageBps(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Use a slippage percentage from 0.1 to 5.");
  const bps = Math.round(Number(value) * 100);
  if (bps < 10 || bps > 500)
    throw new Error("Use a slippage percentage from 0.1 to 5.");
  return bps;
}
export const minimumOut = (quote: bigint, bps: number) =>
  (quote * BigInt(10000 - bps)) / 10000n;
export function encodeSwap(
  key: PoolKey,
  input: Address,
  amount: bigint,
  minimum: bigint,
  extended = false,
) {
  if (![key.currency0, key.currency1].some((x) => sameAddress(x, input)))
    throw new Error("Input is not in the attested pool.");
  const zeroForOne = sameAddress(input, key.currency0);
  const output = zeroForOne ? key.currency1 : key.currency0;
  const shape = `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 extra," : ""}bytes hookData)`;
  const params = [
    encodeAbiParameters(parseAbiParameters(shape), [
      {
        poolKey: key,
        zeroForOne,
        amountIn: amount,
        amountOutMinimum: minimum,
        ...(extended ? { extra: 0n } : {}),
        hookData: "0x",
      },
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, amount]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      output,
      minimum,
    ]),
  ];
  return {
    commands: "0x10" as Hex,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
        "0x060c0f",
        params,
      ]),
    ],
    value: sameAddress(input, zeroAddress) ? amount : 0n,
  };
}
const messages: Record<string, string> = {
  CellTaken:
    "Someone claimed this cell first. Refresh the wall and pick an empty cell.",
  AlreadyHoldsCell:
    "This wallet already holds a cell. Open your cell to carve or release it.",
  NoCellHeld:
    "This wallet no longer holds a cell. Refresh the wall to claim another.",
  EmptyMessage: "Write a message before continuing.",
  MessageTooLong: "Keep your message within 64 UTF-8 bytes.",
  CarveCooldown:
    "Your next carve is not available yet. Wait until the time shown, then refresh.",
  InvalidCell: "Choose a cell from 0 to 1023.",
  InsufficientBalance: "Your token balance is too low. Reduce the amount.",
  InsufficientAllowance:
    "The allowance is too low. Refresh the quote and complete the approval step.",
  InvalidAddress: "Enter a valid, nonzero Ethereum address.",
  TransactionDeadlinePassed: "The swap expired. Request a new quote.",
};
export function friendlyError(error: unknown): string {
  const e = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
    cause?: unknown;
  };
  if (e?.code === 4001 || /reject|denied/i.test(e?.message ?? ""))
    return "Request declined in your wallet. Nothing was sent; you can try again.";
  if (error instanceof BaseError) {
    const revert = error.walk(
      (x) => x instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (revert?.data?.errorName)
      return (
        messages[revert.data.errorName] ??
        `The contract rejected this request (${revert.data.errorName}). Refresh and check the amount and pool state.`
      );
  }
  const text = e?.shortMessage || e?.message || "";
  for (const [key, message] of Object.entries(messages))
    if (text.includes(key)) return message;
  if (/insufficient funds/i.test(text))
    return "Your ETH balance is too low for network fees.";
  if (
    /fetch|HTTP|network request|network could not|timeout|timed out|429|403/i.test(
      text,
    )
  )
    return "The network could not be reached. Check your connection, then retry.";
  if (/revert|execution failed/i.test(text))
    return "Simulation failed. The pool may lack liquidity or the price moved. Refresh the quote before trying again.";
  return text && text.length < 220 && !/0x[a-fA-F0-9]{8}/.test(text)
    ? text
    : "This request could not be completed. Refresh the data and try again.";
}
