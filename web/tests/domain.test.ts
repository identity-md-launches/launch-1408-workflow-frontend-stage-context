import { describe, it, expect } from "vitest";
import {
  decodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
  zeroAddress,
  type Address,
} from "viem";
import { readFileSync } from "node:fs";
import {
  byteLength,
  encodeSwap,
  minimumOut,
  parseAmount,
  slippageBps,
  friendlyError,
  amountText,
} from "../src/domain";
import { canonical, poolTuple, type PoolKey } from "../src/config";
import manifest from "../config/imd-deployment.json" with { type: "json" };
const key = manifest.poolKey as PoolKey;
describe("Attested configuration", () => {
  for (const contract of manifest.contracts)
    it(`${contract.name} ABI is bound by canonical Keccak`, () => {
      const abi = JSON.parse(
        readFileSync(
          new URL(`../../docs/abi/${contract.name}.json`, import.meta.url),
          "utf8",
        ),
      );
      expect(keccak256(stringToHex(canonical(abi))).slice(2)).toBe(
        contract.abiHash,
      );
    });
  it("canonical ordering is deterministic and retains array order", () =>
    expect(canonical({ z: 1, a: [{ Y: 2, x: 3 }, 4] })).toBe(
      '{"a":[{"Y":2,"x":3},4],"z":1}',
    ));
});
describe("Message and token validation", () => {
  it("counts UTF-8 bytes including emoji and combining marks", () => {
    expect(byteLength("🐝".repeat(16))).toBe(64);
    expect(byteLength("🐝".repeat(16) + "a")).toBe(65);
    expect(byteLength("e\u0301")).toBe(3);
  });
  it("validates amounts exactly, without floating point or silent rounding", () => {
    expect(parseAmount("1.123456", 6)).toBe(1123456n);
    for (const x of ["0", "-1", "1e3", "1,000", "1.0000001", "NaN", ""])
      expect(() => parseAmount(x, 6)).toThrow();
    expect(() => parseAmount((2n ** 128n).toString(), 0)).toThrow();
  });
  it("floors minimum received and bounds slippage", () => {
    expect(slippageBps("0.5")).toBe(50);
    expect(minimumOut(999n, 50)).toBe(994n);
    for (const x of ["0", "5.01", "-2", "abc", "1.001"])
      expect(() => slippageBps(x)).toThrow();
  });
  it("formats token decimals without inventing a zero balance", () => {
    expect(amountText(1n, 18)).toBe("<0.00001");
    expect(amountText(123450000n, 6)).toBe("123.45");
  });
  it("translates rejection, balance, cooldown and RPC failures", () => {
    expect(friendlyError({ code: 4001 })).toContain("declined");
    expect(friendlyError(new Error("CarveCooldown"))).toContain("next carve");
    expect(friendlyError(new Error("insufficient funds"))).toContain(
      "ETH balance",
    );
    expect(friendlyError(new Error("HTTP 403"))).toContain("network could not");
  });
});
describe("Universal Router encoding", () => {
  for (const extended of [false, true])
    for (const input of [key.currency0, key.currency1])
      it(`preserves the exact pool in ${extended ? "extended" : "standard"} ${input === key.currency0 ? "sell" : "buy"} encoding`, () => {
        const swap = encodeSwap(key, input, 1234n, 1000n, extended);
        expect(swap.commands).toBe("0x10");
        expect(swap.value).toBe(0n);
        const [actions, params] = decodeAbiParameters(
          parseAbiParameters("bytes,bytes[]"),
          swap.inputs[0],
        );
        expect(actions).toBe("0x060c0f");
        expect(params).toHaveLength(3);
        const [raw] = decodeAbiParameters(
          parseAbiParameters(
            `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 extra," : ""}bytes hookData)`,
          ),
          params[0],
        );
        const decoded = raw as {
          poolKey: PoolKey;
          zeroForOne: boolean;
          amountIn: bigint;
          amountOutMinimum: bigint;
          hookData: string;
        };
        expect(
          canonical({
            ...decoded.poolKey,
            currency0: decoded.poolKey.currency0.toLowerCase(),
            currency1: decoded.poolKey.currency1.toLowerCase(),
            hooks: decoded.poolKey.hooks.toLowerCase(),
          }),
        ).toBe(canonical(key));
        expect(decoded.zeroForOne).toBe(input === key.currency0);
        expect(decoded.amountIn).toBe(1234n);
        expect(decoded.amountOutMinimum).toBe(1000n);
        expect(decoded.hookData).toBe("0x");
        if (extended)
          expect((decoded as unknown as { extra: bigint }).extra).toBe(0n);
        const settle = decodeAbiParameters(
          parseAbiParameters("address,uint256"),
          params[1],
        );
        expect(settle[0].toLowerCase()).toBe(input);
        expect(settle[1]).toBe(1234n);
        const take = decodeAbiParameters(
          parseAbiParameters("address,uint256"),
          params[2],
        );
        expect(take[0].toLowerCase()).toBe(
          input === key.currency0 ? key.currency1 : key.currency0,
        );
        expect(take[1]).toBe(1000n);
      });
  it("only sets transaction value when native currency is the input", () => {
    const native = { ...key, currency0: zeroAddress };
    expect(encodeSwap(native, zeroAddress, 100n, 50n).value).toBe(100n);
    expect(encodeSwap(native, native.currency1, 100n, 50n).value).toBe(0n);
  });
  it("rejects inputs outside the pool", () =>
    expect(() => encodeSwap(key, zeroAddress as Address, 1n, 1n)).toThrow());
});
