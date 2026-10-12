import { useEffect, useRef, useState } from "react";
import type { Runtime } from "./config";
import { erc20Abi, permitAbi, quoterAbi, routerAbi } from "./config";
import type { ChainData } from "./data";
import {
  amountText,
  encodeSwap,
  friendlyError,
  minimumOut,
  parseAmount,
  sameAddress,
  slippageBps,
} from "./domain";
import type { Transactions } from "./transactions";
import type { Wallet } from "./wallet";
import { Address, ConnectGate, Icon, TxStatus } from "./ui";
interface Quote {
  out: bigint;
  minimum: bigint;
  amount: bigint;
  created: number;
  tokenAllowance: bigint;
  routerAllowance: bigint;
  expiration: number;
  chainTime: number;
}
export function Trade({
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
  const [buy, setBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const sequence = useRef(0);
  const network = runtime.deployment.network;
  const uni = network.uniswapV4;
  const snap = data.snapshot;
  const comb = {
    address: runtime.token.address,
    symbol: snap?.symbol ?? "COMB",
    decimals: snap?.decimals ?? 18,
  };
  const input = buy ? network.pairToken : comb;
  const output = buy ? comb : network.pairToken;
  const balance = buy ? snap?.pair : snap?.comb;
  // Zero liquidity at the current tick can still quote across a funded range.
  // The quoter and router simulations determine whether this amount can trade.
  const allowed =
    data.ready && !!data.pool?.verified && data.pool.sqrtPrice > 0n;
  const expired = !!quote && now - quote.created >= 60000;
  const tokenNeeded = !!quote && quote.tokenAllowance < quote.amount;
  const routerNeeded =
    !!quote &&
    (quote.routerAllowance < quote.amount ||
      quote.expiration <=
        quote.chainTime + Math.ceil((now - quote.created) / 1000) + 120);
  useEffect(() => {
    sequence.current++;
    setQuote(undefined);
    setError("");
    setQuoting(false);
  }, [amount, slippage, buy, wallet.account, wallet.chainId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function allowances() {
    if (!wallet.account)
      throw new Error("Connect your wallet to check allowances.");
    const [tokenAllowance, router, block] = await Promise.all([
      data.client.readContract({
        address: input.address,
        abi: buy ? erc20Abi : runtime.token.abi,
        functionName: "allowance",
        args: [wallet.account, uni.permit2],
      }) as Promise<bigint>,
      data.client.readContract({
        address: uni.permit2,
        abi: permitAbi,
        functionName: "allowance",
        args: [wallet.account, input.address, uni.universalRouter],
      }),
      data.client.getBlock(),
    ]);
    return {
      tokenAllowance,
      routerAllowance: router[0],
      expiration: router[1],
      chainTime: Number(block.timestamp),
    };
  }
  async function getQuote() {
    if (
      !allowed ||
      quoting ||
      tx.busy ||
      !wallet.account ||
      !wallet.correctChain
    )
      return;
    const request = ++sequence.current;
    setError("");
    setQuote(undefined);
    setQuoting(true);
    try {
      const amountIn = parseAmount(amount, input.decimals),
        bps = slippageBps(slippage);
      if (balance === undefined || amountIn > balance)
        throw new Error(
          `Your ${input.symbol} balance is too low. Reduce the amount.`,
        );
      const [simulation, approval] = await Promise.all([
        data.client.simulateContract({
          address: uni.quoter,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: runtime.deployment.poolKey,
              zeroForOne: sameAddress(
                input.address,
                runtime.deployment.poolKey.currency0,
              ),
              exactAmount: amountIn,
              hookData: "0x",
            },
          ],
          account: wallet.account,
        }),
        allowances(),
      ]);
      const out = simulation.result[0],
        minimum = minimumOut(out, bps);
      if (out === 0n || minimum === 0n)
        throw new Error(
          "This amount produces no usable output. Try a larger amount.",
        );
      if (out >= 2n ** 128n)
        throw new Error(
          "The quoted output exceeds this pool’s swap limit. Reduce the amount.",
        );
      if (sequence.current === request)
        setQuote({
          out,
          minimum,
          amount: amountIn,
          created: Date.now(),
          ...approval,
        });
    } catch (e) {
      if (sequence.current === request) setError(friendlyError(e));
    } finally {
      if (sequence.current === request) setQuoting(false);
    }
  }
  async function act() {
    if (!quote || expired || !allowed || tx.busy) return;
    const reviewed = quote;
    const key = tokenNeeded
      ? "approveToken"
      : routerNeeded
        ? "approveRouter"
        : "swap";
    const label = tokenNeeded
      ? `Approve ${input.symbol} for Permit2`
      : routerNeeded
        ? `Allow router to spend ${input.symbol}`
        : `Swap ${input.symbol} for ${output.symbol}`;
    const ok = await tx.run(key, label, async () => {
      if (Date.now() - reviewed.created >= 60000)
        throw new Error(
          "This quote expired. Get a fresh quote before continuing.",
        );
      const fresh = await allowances();
      if (key === "approveToken") {
        if (fresh.tokenAllowance >= reviewed.amount)
          throw new Error(
            "This token is already approved. Refresh the quote to continue.",
          );
        return {
          address: input.address,
          abi: buy ? erc20Abi : runtime.token.abi,
          functionName: "approve",
          args: [uni.permit2, reviewed.amount],
        };
      }
      if (key === "approveRouter") {
        if (fresh.tokenAllowance < reviewed.amount)
          throw new Error(
            "The token allowance changed. Refresh the quote to approve it first.",
          );
        return {
          address: uni.permit2,
          abi: permitAbi,
          functionName: "approve",
          args: [
            input.address,
            uni.universalRouter,
            reviewed.amount,
            fresh.chainTime + 3600,
          ],
        };
      }
      if (
        fresh.tokenAllowance < reviewed.amount ||
        fresh.routerAllowance < reviewed.amount ||
        fresh.expiration < fresh.chainTime + 120
      )
        throw new Error(
          "The allowance changed or expired. Refresh the quote and complete approvals.",
        );
      const swap = encodeSwap(
        runtime.deployment.poolKey,
        input.address,
        reviewed.amount,
        reviewed.minimum,
        uni.extendedSwapParams === true,
      );
      return {
        address: uni.universalRouter,
        abi: routerAbi,
        functionName: "execute",
        args: [swap.commands, swap.inputs, BigInt(fresh.chainTime + 900)],
        value: swap.value,
      };
    });
    if (ok) {
      setQuote(undefined);
      setError(
        key === "swap"
          ? ""
          : "Approval confirmed. Get a fresh quote to continue.",
      );
      if (key === "swap") setAmount("");
    }
  }
  const step = tokenNeeded ? 1 : routerNeeded ? 2 : 3;
  return (
    <section
      id="trade"
      className="trade-section"
      aria-labelledby="trade-heading"
    >
      <div className="trade-story">
        <span className="eyebrow">A little more glow</span>
        <h2 id="trade-heading">Become a Keeper.</h2>
        <p>
          Holding COMB gives your cell a brighter glow. A small signal that
          you’re part of the hive.
        </p>
        <p className="muted">
          The wall is open to everyone. COMB is never required to claim, carve
          or release a cell.
        </p>
        <div className="keeper-demo" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <path d="m60 10 43 25v50l-43 25-43-25V35Z" />
            <path d="m60 30 26 15v30L60 90 34 75V45Z" />
            <circle cx="60" cy="60" r="5" />
          </svg>
          <div>
            <strong>The Keeper glow</strong>
            <span>One cell. A brighter presence.</span>
          </div>
        </div>
        <div className="supply-note">
          <span>Fixed supply</span>
          <strong>
            {snap ? amountText(snap.supply, snap.decimals, 0) : "—"} COMB
          </strong>
          <p>No tax. No minting. Plain transfers.</p>
        </div>
      </div>
      <div className="trade-card">
        <div className="section-heading">
          <h3>Trade COMB</h3>
          <span className="badge">Uniswap v4</span>
        </div>
        <div className="direction-switch" aria-label="Trade direction">
          <button
            aria-pressed={buy}
            disabled={tx.busy}
            onClick={() => setBuy(true)}
          >
            Buy COMB
          </button>
          <button
            aria-pressed={!buy}
            disabled={tx.busy}
            onClick={() => setBuy(false)}
          >
            Sell COMB
          </button>
        </div>
        <div className="amount-field">
          <div className="field-heading">
            <label htmlFor="swap-amount">You pay</label>
            <span>
              Balance:{" "}
              {snap && wallet.account && snap.account === wallet.account
                ? amountText(balance ?? 0n, input.decimals)
                : "—"}
            </span>
          </div>
          <div className="amount-row">
            <input
              id="swap-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={tx.busy}
              aria-describedby="swap-unit"
            />
            <span className="token-tag" id="swap-unit">
              <Icon name={buy ? "hex" : "hex"} />
              {input.symbol}
            </span>
          </div>
        </div>
        <div className="swap-divider">
          <button
            className="icon-button"
            aria-label="Reverse trade direction"
            disabled={tx.busy}
            onClick={() => setBuy(!buy)}
          >
            <Icon name="swap" />
          </button>
        </div>
        <div className="amount-field receive">
          <div className="field-heading">
            <span>You receive · estimated</span>
          </div>
          <div className="amount-row">
            <output>
              {quote ? amountText(quote.out, output.decimals) : "—"}
            </output>
            <span className="token-tag">
              <Icon name="hex" />
              {output.symbol}
            </span>
          </div>
        </div>
        <div className="slippage-row">
          <label htmlFor="slippage">Slippage tolerance</label>
          <span>
            <input
              id="slippage"
              inputMode="decimal"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              disabled={tx.busy}
            />{" "}
            %
          </span>
        </div>
        {quote && (
          <div className="quote-details">
            <dl>
              <div>
                <dt>Minimum received</dt>
                <dd>
                  {amountText(quote.minimum, output.decimals)} {output.symbol}
                </dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>
                  1 {input.symbol} ≈{" "}
                  {amountText(
                    (quote.out * 10n ** BigInt(input.decimals)) / quote.amount,
                    output.decimals,
                  )}{" "}
                  {output.symbol}
                </dd>
              </div>
              <div>
                <dt>Quote valid for</dt>
                <dd>
                  {expired
                    ? "Expired"
                    : `${Math.max(0, Math.ceil((60000 - (now - quote.created)) / 1000))}s`}
                </dd>
              </div>
            </dl>
            <ol className="swap-steps">
              <li className={step === 1 ? "active" : ""}>1. Approve token</li>
              <li className={step === 2 ? "active" : ""}>2. Allow router</li>
              <li className={step === 3 ? "active" : ""}>3. Swap</li>
            </ol>
            {!expired && (
              <p className="helper">
                {step === 1
                  ? `Approve exactly ${amountText(quote.amount, input.decimals)} ${input.symbol} for Permit2.`
                  : step === 2
                    ? `Allow the router to spend exactly ${amountText(quote.amount, input.decimals)} ${input.symbol}. Permission expires in one hour.`
                    : `Swap exactly ${amountText(quote.amount, input.decimals)} ${input.symbol} for at least ${amountText(quote.minimum, output.decimals)} ${output.symbol}.`}
              </p>
            )}
          </div>
        )}
        <ConnectGate wallet={wallet} runtime={runtime} onConnect={onConnect}>
          {quote && !expired ? (
            <>
              <button
                className="button primary wide"
                disabled={!allowed || tx.busy}
                onClick={() => void act()}
              >
                {tx.busy &&
                ["approveToken", "approveRouter", "swap"].includes(
                  tx.state?.key ?? "",
                )
                  ? "Waiting for confirmation…"
                  : step === 1
                    ? `Approve ${input.symbol}`
                    : step === 2
                      ? "Allow router spending"
                      : "Confirm swap"}
                <Icon name="arrow" />
              </button>
              <button
                className="text-button"
                disabled={tx.busy}
                onClick={() => void getQuote()}
              >
                Refresh quote
              </button>
            </>
          ) : (
            <button
              className="button primary wide"
              disabled={!allowed || quoting || tx.busy || !amount}
              onClick={() => void getQuote()}
            >
              {quoting
                ? "Getting quote…"
                : expired
                  ? "Refresh expired quote"
                  : "Get a quote"}
              <Icon name="arrow" />
            </button>
          )}
        </ConnectGate>
        {error && (
          <p
            className={
              error.startsWith("Approval confirmed") ? "notice" : "error"
            }
            role="status"
          >
            {error}
          </p>
        )}
        {data.pool?.error && (
          <p className="helper">
            {data.pool.error}{" "}
            <button
              className="text-button inline"
              onClick={() => void data.refreshPool()}
            >
              Retry pool read
            </button>
          </p>
        )}
        <TxStatus
          tx={tx}
          runtime={runtime}
          keys={["approveToken", "approveRouter", "swap"]}
        />
        <p className="fee-note">
          Pool fee {(runtime.deployment.poolKey.fee / 10000).toFixed(2)}% ·
          Network fees paid in ETH
          <br />
          USD prices are unavailable. Values are shown in token units.
        </p>
        <details className="route-details">
          <summary>View pool &amp; spending contracts</summary>
          <p>
            Quotes and swaps use the attested COMB/{network.pairToken.symbol}{" "}
            pool.
          </p>
          {(
            [
              ["Permit2", uni.permit2],
              ["Universal Router", uni.universalRouter],
              ["Quoter", uni.quoter],
              ["Pool Manager", uni.poolManager],
              ["State View", uni.stateView],
              ["Pool hook", runtime.deployment.poolKey.hooks],
              ["Paired token", network.pairToken.address],
            ] as const
          ).map(([label, address]) => (
            <div className="route-row" key={label}>
              <span>{label}</span>
              <Address
                value={address}
                explorer={network.explorer}
                label={label}
              />
            </div>
          ))}
          <p className="helper">
            Tick spacing {runtime.deployment.poolKey.tickSpacing}. Approvals and
            the swap are separate transactions.
          </p>
        </details>
      </div>
    </section>
  );
}
