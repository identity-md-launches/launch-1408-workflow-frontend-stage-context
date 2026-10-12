import { useEffect, useState } from "react";
import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address as EthAddress,
} from "viem";
import type { Runtime } from "./config";
import type { ChainData } from "./data";
import { amountText, friendlyError, parseAmount } from "./domain";
import type { ContractAction, Transactions } from "./transactions";
import type { Wallet } from "./wallet";
import { Address, ConnectGate, Dialog, TxStatus } from "./ui";
export function TokenTools({
  runtime,
  data,
  wallet,
  tx,
  onConnect,
}: {
  runtime: Runtime;
  data: ChainData;
  wallet: Wallet;
  tx: Transactions;
  onConnect: () => void;
}) {
  const [mode, setMode] = useState("transfer");
  const [target, setTarget] = useState("");
  const [owner, setOwner] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<{
    action: ContractAction;
    amount: bigint;
    target: EthAddress;
    owner?: EthAddress;
    balance: bigint;
    allowance?: bigint;
  }>();
  useEffect(() => {
    setReview(undefined);
    setError("");
  }, [wallet.account, wallet.chainId]);
  const snap = data.snapshot;
  const decimals = snap?.decimals ?? 18;
  function address(s: string) {
    const value = s.trim();
    if (!isAddress(value) || value.toLowerCase() === zeroAddress)
      throw new Error("Enter a valid, nonzero Ethereum address.");
    return getAddress(value);
  }
  async function prepare() {
    if (!wallet.account || !data.ready || tx.busy) return;
    setError("");
    setChecking(true);
    const generation = wallet.generation.current;
    try {
      const destination = address(target);
      const from = mode === "transferFrom" ? address(owner) : wallet.account;
      const value =
        mode === "approve" && amount === "0"
          ? 0n
          : parseAmount(amount, decimals);
      const balance = (await data.client.readContract({
        ...runtime.token,
        functionName: "balanceOf",
        args: [from],
      })) as bigint;
      const allowance =
        mode === "transferFrom" || mode === "approve"
          ? ((await data.client.readContract({
              ...runtime.token,
              functionName: "allowance",
              args: [from, mode === "approve" ? destination : wallet.account],
            })) as bigint)
          : undefined;
      if (mode !== "approve" && balance < value)
        throw new Error(
          "The source wallet has insufficient COMB. Reduce the amount.",
        );
      if (
        mode === "transferFrom" &&
        allowance !== undefined &&
        allowance < value
      )
        throw new Error(
          "This wallet is not approved to transfer that much COMB from the source address.",
        );
      if (wallet.generation.current !== generation)
        throw new Error("Your wallet changed. Review the action again.");
      setReview({
        action: {
          ...runtime.token,
          functionName: mode,
          args:
            mode === "transferFrom"
              ? [from, destination, value]
              : [destination, value],
        },
        amount: value,
        target: destination,
        owner: mode === "transferFrom" ? from : undefined,
        balance,
        allowance,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setChecking(false);
    }
  }
  return (
    <details className="token-tools" id="token-tools">
      <summary>
        COMB token tools <span>Transfer &amp; manage allowances</span>
      </summary>
      <div className="tools-content">
        <p>
          Use the standard COMB contract directly. Only approve a spender you
          trust. Setting an allowance to 0 revokes it.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void prepare();
          }}
        >
          <label htmlFor="token-action">Action</label>
          <select
            id="token-action"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setError("");
            }}
            disabled={tx.busy}
          >
            <option value="transfer">Transfer COMB</option>
            <option value="approve">Set COMB allowance</option>
            <option value="transferFrom">Transfer approved COMB</option>
          </select>
          {mode === "transferFrom" && (
            <>
              <label htmlFor="token-owner">Source wallet address</label>
              <input
                id="token-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                disabled={tx.busy}
              />
            </>
          )}
          <label htmlFor="token-target">
            {mode === "approve" ? "Spender address" : "Recipient address"}
          </label>
          <input
            id="token-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            disabled={tx.busy}
          />
          <label htmlFor="token-amount">Amount in COMB</label>
          <input
            id="token-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            disabled={tx.busy}
          />
          <p className="helper">
            Connected balance:{" "}
            {snap && wallet.account && snap.account === wallet.account
              ? amountText(snap.comb, decimals)
              : "—"}{" "}
            COMB. USD prices are unavailable.
          </p>
          <ConnectGate wallet={wallet} runtime={runtime} onConnect={onConnect}>
            <button
              className="button secondary"
              disabled={!data.ready || tx.busy || checking}
            >
              {checking
                ? "Checking balance & allowance…"
                : mode === "approve"
                  ? "Review allowance"
                  : "Review transfer"}
            </button>
          </ConnectGate>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        <TxStatus
          tx={tx}
          runtime={runtime}
          keys={["transfer", "approve", "transferFrom"]}
        />
      </div>
      <Dialog
        open={!!review}
        onClose={() => setReview(undefined)}
        title={
          mode === "approve" ? "Review COMB allowance" : "Review COMB transfer"
        }
      >
        {review && (
          <>
            <p>
              {mode === "approve" ? "Set an allowance of" : "Send"}{" "}
              <strong>{amountText(review.amount, decimals, 18)} COMB</strong>{" "}
              {mode === "approve" ? "for this spender:" : "to this recipient:"}
            </p>
            <Address
              value={review.target}
              explorer={runtime.deployment.network.explorer}
              label={mode === "approve" ? "Spender" : "Recipient"}
              full
            />
            {review.owner && (
              <p>
                From{" "}
                <Address
                  value={review.owner}
                  explorer={runtime.deployment.network.explorer}
                  label="Source wallet"
                  full
                />
              </p>
            )}
            <p>
              Source balance: {amountText(review.balance, decimals)} COMB
              {review.allowance !== undefined && (
                <>
                  <br />
                  Current allowance: {amountText(
                    review.allowance,
                    decimals,
                  )}{" "}
                  COMB
                </>
              )}
            </p>
            <p className="helper">
              Network fees are paid in ETH. Check the full address before
              signing.
            </p>
            <button
              className="button primary wide"
              disabled={tx.busy || !data.ready || !wallet.correctChain}
              onClick={() => {
                const action = review.action;
                setReview(undefined);
                void tx.run(
                  mode,
                  mode === "approve" ? "Set COMB allowance" : "Transfer COMB",
                  action,
                );
              }}
            >
              Confirm {mode === "approve" ? "allowance" : "transfer"}
            </button>
            <button
              className="button secondary wide"
              onClick={() => setReview(undefined)}
            >
              Cancel
            </button>
          </>
        )}
      </Dialog>
    </details>
  );
}
