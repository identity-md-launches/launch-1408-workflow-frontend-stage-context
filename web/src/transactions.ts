import { useRef, useState } from "react";
import type { Abi, Address, Hash } from "viem";
import type { Runtime } from "./config";
import type { ChainData } from "./data";
import { friendlyError } from "./domain";
import type { Wallet } from "./wallet";
export interface ContractAction {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}
export interface TransactionState {
  key: string;
  label: string;
  phase: "simulating" | "signing" | "pending" | "success" | "error";
  message: string;
  hash?: Hash;
}
export function useTransactions(
  runtime: Runtime,
  wallet: Wallet,
  data: ChainData,
) {
  const latestData = useRef(data);
  latestData.current = data;
  const [state, setState] = useState<TransactionState>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<TransactionState | undefined>(undefined);
  const finish = async (hash: Hash, key: string, label: string) => {
    try {
      const receipt = await data.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120000,
      });
      if (receipt.status !== "success")
        throw new Error(
          "The transaction reverted on chain. Refresh the data before trying again.",
        );
      await latestData.current.refresh();
      await latestData.current.refreshPool();
      setState({
        key,
        label,
        phase: "success",
        hash,
        message: `${label} confirmed on Ethereum.`,
      });
      pending.current = undefined;
      lock.current = false;
      setBusy(false);
      return true;
    } catch (e) {
      if (/reverted on chain/.test((e as Error).message)) {
        setState({
          key,
          label,
          phase: "error",
          hash,
          message: (e as Error).message,
        });
        pending.current = undefined;
        lock.current = false;
        setBusy(false);
      } else {
        const s: TransactionState = {
          key,
          label,
          phase: "pending",
          hash,
          message:
            "Transaction submitted. Confirmation is taking longer than expected. Check the explorer or retry confirmation.",
        };
        pending.current = s;
        setState(s);
      }
      return false;
    }
  };
  async function run(
    key: string,
    label: string,
    action: ContractAction | (() => Promise<ContractAction>),
  ) {
    if (lock.current) return false;
    if (
      !wallet.account ||
      !wallet.correctChain ||
      !data.ready ||
      !data.snapshot ||
      Date.now() - data.snapshot.updated >= 90000
    ) {
      setState({
        key,
        label,
        phase: "error",
        message:
          "Connect to the correct network and refresh verified data before continuing.",
      });
      return false;
    }
    lock.current = true;
    setBusy(true);
    setState({
      key,
      label,
      phase: "simulating",
      message: "Checking this transaction before requesting your signature…",
    });
    const account = wallet.account;
    const generation = wallet.generation.current;
    try {
      if ((await data.client.getChainId()) !== runtime.deployment.chainId)
        throw new Error("RPC chain mismatch. Nothing was sent.");
      const request = typeof action === "function" ? await action() : action;
      const simulation = await data.client.simulateContract({
        ...request,
        account,
      });
      if (simulation.result === false)
        throw new Error(
          "The token did not accept this action. Nothing was sent.",
        );
      const signer = await wallet.signer(account, generation);
      setState({
        key,
        label,
        phase: "signing",
        message: "Review the action and network fee in your wallet.",
      });
      const hash = await signer.writeContract(simulation.request);
      const status: TransactionState = {
        key,
        label,
        phase: "pending",
        hash,
        message: "Transaction sent. Waiting for onchain confirmation…",
      };
      pending.current = status;
      setState(status);
      return await finish(hash, key, label);
    } catch (e) {
      setState({ key, label, phase: "error", message: friendlyError(e) });
      lock.current = false;
      setBusy(false);
      return false;
    }
  }
  async function retry() {
    const p = pending.current;
    if (p?.hash) {
      setState({ ...p, message: "Checking transaction confirmation…" });
      await finish(p.hash, p.key, p.label);
    }
  }
  return { state, busy, run, retry };
}
export type Transactions = ReturnType<typeof useTransactions>;
