import { useCallback, useEffect, useRef, useState } from "react";
import {
  createWalletClient,
  custom,
  getAddress,
  toHex,
  type Address,
  type EIP1193Provider,
} from "viem";
import type { Runtime } from "./config";
import { friendlyError, sameAddress } from "./domain";
export type BrowserProvider = EIP1193Provider & {
  on?: (event: string, fn: (data: unknown) => void) => void;
  removeListener?: (event: string, fn: (data: unknown) => void) => void;
};
export interface WalletOption {
  id: string;
  name: string;
  provider: BrowserProvider;
}
declare global {
  interface Window {
    ethereum?: BrowserProvider;
  }
}
export function useWallet(runtime: Runtime) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [provider, setProvider] = useState<BrowserProvider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const current = useRef({ provider, account, chainId });
  current.current = { provider, account, chainId };
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: BrowserProvider;
        }>
      ).detail;
      if (detail?.provider && detail.info?.uuid)
        setOptions((old) =>
          old.some((x) => x.provider === detail.provider)
            ? old
            : [
                ...old,
                {
                  id: detail.info.uuid,
                  name: detail.info.name,
                  provider: detail.provider,
                },
              ],
        );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    if (window.ethereum)
      setOptions((old) =>
        old.some((x) => x.provider === window.ethereum)
          ? old
          : [
              ...old,
              {
                id: "injected",
                name: "Browser wallet",
                provider: window.ethereum!,
              },
            ],
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (v: unknown) => {
      generation.current++;
      setAccount(
        (v as string[])[0] ? getAddress((v as string[])[0]) : undefined,
      );
      setError("");
    };
    const chain = (v: unknown) => {
      generation.current++;
      setChainId(Number(v));
      setError("");
    };
    const disconnect = () => {
      generation.current++;
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chain);
    provider.on?.("disconnect", disconnect);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chain);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);
  const connect = useCallback(
    async (option: WalletOption) => {
      if (pending) return;
      setPending(true);
      setError("");
      try {
        const accounts = await option.provider.request({
          method: "eth_requestAccounts",
        });
        const id = await option.provider.request({ method: "eth_chainId" });
        if (!accounts[0])
          throw new Error(
            "No wallet account was shared. Unlock your wallet and try again.",
          );
        generation.current++;
        setProvider(option.provider);
        setAccount(getAddress(accounts[0]));
        setChainId(Number(id));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setPending(false);
      }
    },
    [pending],
  );
  const switchChain = useCallback(async () => {
    if (!provider || pending) return;
    setPending(true);
    setError("");
    const request = {
      method: "wallet_switchEthereumChain" as const,
      params: [{ chainId: toHex(runtime.deployment.chainId) }] as [
        { chainId: `0x${string}` },
      ],
    };
    try {
      try {
        await provider.request(request);
      } catch (e) {
        const x = e as {
          code?: number;
          message?: string;
          data?: { originalError?: { code?: number } };
        };
        if (
          x.code !== 4902 &&
          x.data?.originalError?.code !== 4902 &&
          !/unknown chain|unrecognized chain|not added/i.test(x.message ?? "")
        )
          throw e;
        if (!runtime.deployment.walletAddChain)
          throw new Error(
            "Add this network in your wallet, then try switching again.",
          );
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [runtime.deployment.walletAddChain],
        });
        await provider.request(request);
      }
      const id = await provider.request({ method: "eth_chainId" });
      generation.current++;
      setChainId(Number(id));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setPending(false);
    }
  }, [provider, pending, runtime]);
  const disconnect = () => {
    generation.current++;
    setAccount(undefined);
    setProvider(undefined);
    setChainId(undefined);
    setError("");
  };
  async function signer(expected: Address, expectedGeneration: number) {
    const currentProvider = current.current.provider;
    if (!currentProvider || generation.current !== expectedGeneration)
      throw new Error("Your wallet changed. Review the action again.");
    const [accounts, chain] = await Promise.all([
      currentProvider.request({ method: "eth_accounts" }),
      currentProvider.request({ method: "eth_chainId" }),
    ]);
    if (
      !sameAddress(accounts[0], expected) ||
      Number(chain) !== runtime.deployment.chainId ||
      generation.current !== expectedGeneration
    )
      throw new Error(
        "Your wallet account or network changed. Review the action again.",
      );
    return createWalletClient({
      account: expected,
      chain: runtime.chain,
      transport: custom(currentProvider),
    });
  }
  return {
    options,
    provider,
    account,
    chainId,
    pending,
    error,
    connect,
    switchChain,
    disconnect,
    signer,
    generation,
    correctChain: chainId === runtime.deployment.chainId,
  };
}
export type Wallet = ReturnType<typeof useWallet>;
