import { useEffect, useState } from "react";
import { zeroAddress } from "viem";
import type { Runtime } from "./config";
import type { ChainData } from "./data";
import { byteLength, NO_CELL, sameAddress } from "./domain";
import type { Transactions } from "./transactions";
import type { Wallet } from "./wallet";
import { Address, ConnectGate, Dialog, Icon, TxStatus } from "./ui";
export function WallPanel({
  runtime,
  data,
  wallet,
  tx,
  selected,
  onSelect,
  onConnect,
}: {
  runtime: Runtime;
  data: ChainData;
  wallet: Wallet;
  tx: Transactions;
  selected: number;
  onSelect: (n: number) => void;
  onConnect: () => void;
}) {
  const [message, setMessage] = useState("");
  const [release, setRelease] = useState(false);
  const [now, setNow] = useState(Date.now());
  const snap = data.snapshot;
  const cell = snap?.cells[selected];
  const empty = cell && sameAddress(cell.owner, zeroAddress);
  const owned = cell && sameAddress(cell.owner, wallet.account);
  const hasCell =
    snap?.account === wallet.account &&
    snap?.held !== NO_CELL &&
    snap?.held !== undefined;
  useEffect(() => {
    setMessage("");
    setRelease(false);
  }, [selected, wallet.account]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const bytes = byteLength(message);
  const valid = bytes > 0 && bytes <= 64;
  const chainNow = snap
    ? snap.timestamp + Math.floor((now - snap.updated) / 1000)
    : 0;
  const remaining = Math.max(0, (snap?.nextCarveAt ?? 0) - chainNow);
  const cooldown = hasCell && remaining > 0;
  const timeRemaining = `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m ${remaining % 60}s`;
  async function write() {
    const fn = owned ? "carve" : "claim";
    if (
      !valid ||
      !data.ready ||
      !cell ||
      (fn === "claim" && (!empty || hasCell)) ||
      (fn === "carve" && cooldown)
    )
      return;
    const ok = await tx.run(
      fn,
      fn === "claim" ? "Claim cell" : "Carve message",
      {
        ...runtime.wall,
        functionName: fn,
        args: fn === "claim" ? [selected, message] : [message],
      },
    );
    if (ok) setMessage("");
  }
  return (
    <aside className="cell-panel" aria-labelledby="cell-heading">
      <div className="cell-eyebrow">
        <span className="eyebrow">Your place in the hive</span>
        <Icon name="hex" />
      </div>
      <div className="cell-title">
        <h3 id="cell-heading">
          Cell{" "}
          <span className="mono">#{String(selected).padStart(4, "0")}</span>
        </h3>
        <span className={`badge ${empty ? "available" : ""}`}>
          {!cell
            ? "Not loaded"
            : empty
              ? "Empty"
              : owned
                ? "Your cell"
                : "Claimed"}
        </span>
      </div>
      {!cell ? (
        <p>
          Waiting for live wall data. You can explore the grid while it loads.
        </p>
      ) : empty ? (
        <p>
          Every cell starts with a little silence.
          <br />
          What will you leave here?
        </p>
      ) : (
        <>
          <blockquote dir="auto">“{cell.message}”</blockquote>
          <div className="owner-label">
            Carved by{" "}
            <Address
              value={cell.owner}
              explorer={runtime.deployment.network.explorer}
              label="Cell owner"
            />
          </div>
          {owned && snap!.comb > 0n && (
            <div className="keeper-note">
              <Icon name="hex" />
              Keeper · You hold COMB
            </div>
          )}
        </>
      )}
      {hasCell && !owned ? (
        <div className="notice">
          <p>
            You already hold cell #{snap!.held}. Each wallet can hold one cell
            at a time.
          </p>
          <button
            className="button secondary wide"
            onClick={() => onSelect(snap!.held)}
          >
            Open your cell <Icon name="arrow" />
          </button>
        </div>
      ) : (
        <>
          {(empty || owned || !cell) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void write();
              }}
            >
              <div className="field-heading">
                <label htmlFor="message">
                  {owned ? "Write a new message" : "Leave your message"}
                </label>
                <span
                  id="byte-count"
                  className={`byte-counter ${bytes > 64 ? "error" : ""}`}
                >
                  {bytes} / 64 bytes
                </span>
              </div>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="I was here. And so were you."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby="message-hint byte-count"
                aria-invalid={bytes > 64}
                disabled={tx.busy}
              />
              <p id="message-hint" className="helper">
                Public on Ethereum. Emoji may use more than one byte.
              </p>
              {owned && (
                <p className="cooldown">
                  {cooldown ? (
                    <>
                      Next carve in{" "}
                      <strong className="mono">{timeRemaining}</strong>
                      <br />
                      <span className="helper">
                        {new Date(snap!.nextCarveAt * 1000).toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <>You can carve a new message now.</>
                  )}
                </p>
              )}
              <ConnectGate
                wallet={wallet}
                runtime={runtime}
                onConnect={onConnect}
              >
                <button
                  className="button primary wide"
                  type="submit"
                  disabled={
                    !data.ready ||
                    !valid ||
                    tx.busy ||
                    !cell ||
                    (!owned && !empty) ||
                    !!cooldown
                  }
                >
                  <span>
                    {tx.busy && tx.state?.key === (owned ? "carve" : "claim")
                      ? `${owned ? "Carving" : "Claiming"}…`
                      : owned
                        ? "Carve new message"
                        : `Claim cell #${selected}`}
                  </span>
                  <Icon name="arrow" />
                </button>
              </ConnectGate>
              {!data.ready && wallet.account && (
                <p className="helper">
                  Verified live data is required before you can sign.
                </p>
              )}
              <p className="fee-note">
                No COMB needed. You only pay the Ethereum network fee.
              </p>
            </form>
          )}
        </>
      )}
      {owned && (
        <button
          className="text-button danger"
          disabled={!data.ready || tx.busy || !wallet.correctChain}
          onClick={() => setRelease(true)}
        >
          Release this cell
        </button>
      )}
      <TxStatus
        tx={tx}
        runtime={runtime}
        keys={["claim", "carve", "release"]}
      />
      <div className="cell-rules">
        <div>
          <span>01</span>
          <p>One wallet. One cell.</p>
        </div>
        <div>
          <span>02</span>
          <p>Carve again every 24 hours.</p>
        </div>
        <div>
          <span>03</span>
          <p>Your words stay until you change them or release your cell.</p>
        </div>
      </div>
      <Dialog
        open={release}
        onClose={() => setRelease(false)}
        title={`Release cell #${selected}?`}
      >
        <p>
          Your current message will be cleared from the wall. Anyone can claim
          this cell once the transaction confirms. Its history remains on
          Ethereum.
        </p>
        <button
          className="button destructive wide"
          disabled={tx.busy || !owned || !data.ready || !wallet.correctChain}
          onClick={() => {
            setRelease(false);
            void tx.run("release", "Release cell", {
              ...runtime.wall,
              functionName: "release",
            });
          }}
        >
          Release cell
        </button>
        <button
          className="button secondary wide"
          onClick={() => setRelease(false)}
        >
          Keep my cell
        </button>
      </Dialog>
    </aside>
  );
}
