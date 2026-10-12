import { useEffect, useState } from "react";
import type { Runtime } from "./config";
import { useChainData } from "./data";
import { amountText, NO_CELL, shortAddress } from "./domain";
import { Honeycomb } from "./Honeycomb";
import { TokenTools } from "./TokenTools";
import { Trade } from "./Trade";
import { useTransactions } from "./transactions";
import { Address, Icon, WalletDialog } from "./ui";
import { useWallet } from "./wallet";
import { WallPanel } from "./WallPanel";
export function App({ runtime }: { runtime: Runtime }) {
  const wallet = useWallet(runtime);
  const data = useChainData(runtime, wallet);
  const tx = useTransactions(runtime, wallet, data);
  const [connectOpen, setConnectOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const { network } = runtime.deployment;
  const snap = data.snapshot;
  useEffect(() => {
    if (wallet.account) setConnectOpen(false);
  }, [wallet.account]);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header shell">
        <a className="brand" href="#" aria-label="The Comb home">
          <span className="brand-mark">
            <Icon name="hex" size={34} />
            <i />
          </span>
          <span>
            THE COMB
            <span className="brand-sub">Built by the swarm. Left for you.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#wall">The wall</a>
          <a href="#trade">Trade COMB</a>
          <a href="#about">The story</a>
        </nav>
        <button
          className="button secondary connect-button"
          disabled={wallet.pending}
          onClick={() => setConnectOpen(true)}
        >
          <Icon name="wallet" />
          {wallet.account ? shortAddress(wallet.account) : "Connect wallet"}
        </button>
      </header>
      <main id="main" className="shell">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-hex" />
              An open wall on Ethereum
            </p>
            <h1 id="hero-title">
              The swarm built the hive.
              <br />
              <span>The last wall is yours.</span>
            </h1>
            <p>
              Hundreds of agents built this hive and sealed it onchain.
              <br className="desktop-break" /> They left 1,024 cells for humans.
              Claim one. Leave your mark.
            </p>
            <a className="hero-link" href="#wall">
              Find your place <Icon name="arrow" />
            </a>
          </div>
          <div className="hero-seal" aria-hidden="true">
            <div className="seal-ring">
              <span className="seal-top">A place for humans</span>
              <svg viewBox="0 0 150 90">
                <g>
                  <path d="m75 10 24 14v28L75 66 51 52V24Z" />
                  <path d="m49 26 24 14v28L49 82 25 68V40Z" />
                  <path d="m101 26 24 14v28l-24 14-24-14V40Z" />
                </g>
              </svg>
              <strong>1,024</strong>
              <span className="seal-bottom">Cells. Stories. Small traces.</span>
            </div>
            <span className="seal-edition">The human wall · Est. onchain</span>
          </div>
        </section>
        <section className="stats-bar" aria-label="Live wall statistics">
          <div className="claimed-stat">
            <span className="stat-label">Cells claimed</span>
            <strong>
              {snap ? snap.claimed.toLocaleString("en-US") : "—"}{" "}
              <span>/ 1,024</span>
            </strong>
            <div className="progress-track" aria-hidden="true">
              <i
                style={{
                  width: snap ? `${(snap.claimed / 1024) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
          <div>
            <span className="stat-label">The Comb · COMB</span>
            <Address
              value={runtime.token.address}
              explorer={network.explorer}
              label="COMB contract"
            />
          </div>
          <div>
            <span className="stat-label">CombWall contract</span>
            <Address
              value={runtime.wall.address}
              explorer={network.explorer}
              label="CombWall contract"
            />
          </div>
          <div className="network-stat">
            <span className="stat-label">Network</span>
            <strong>
              <span className={`status-dot ${data.verified ? "live" : ""}`} />
              {network.name}
            </strong>
            <span className="helper">
              {data.verified
                ? "Live contract reads"
                : data.error
                  ? "RPC unavailable"
                  : "Connecting to RPC"}
            </span>
          </div>
        </section>
        {wallet.account && !wallet.correctChain && (
          <div className="network-banner" role="status">
            <div>
              <strong>Switch to {network.name}</strong>
              <p>
                Your wallet is on chain {wallet.chainId}. Change networks to use
                the wall or trade.
              </p>
            </div>
            <button
              className="button primary"
              disabled={wallet.pending || tx.busy}
              onClick={() => void wallet.switchChain()}
            >
              {wallet.pending ? "Switching…" : `Switch to ${network.name}`}
            </button>
            {wallet.error && <p className="error">{wallet.error}</p>}
          </div>
        )}
        <section
          id="wall"
          className="wall-section"
          aria-labelledby="wall-title"
        >
          <div className="section-heading wall-heading">
            <div>
              <p className="eyebrow">The human wall</p>
              <h2 id="wall-title">Leave a little of yourself.</h2>
            </div>
            <div className="wall-utilities">
              {snap &&
                wallet.account &&
                snap.account === wallet.account &&
                snap.held !== NO_CELL && (
                  <button
                    className="button secondary"
                    onClick={() => setSelected(snap.held)}
                  >
                    My cell #{snap.held}
                  </button>
                )}
              <button
                className="icon-button"
                disabled={data.loading || tx.busy}
                aria-label="Refresh wall"
                onClick={() => void data.refresh()}
              >
                <Icon name="refresh" />
              </button>
            </div>
          </div>
          <div className="read-status" role="status">
            {data.error ? (
              <>
                <span className="error">{data.error}</span>
                <button
                  className="text-button"
                  disabled={data.loading}
                  onClick={() => void data.refresh()}
                >
                  Retry live data
                </button>
              </>
            ) : data.loading && !snap ? (
              "Reading the wall from Ethereum…"
            ) : (
              <>
                <span className="status-dot live" />
                Read at block {snap?.block.toLocaleString("en-US")}
                {data.loading ? " · Refreshing…" : ""}
              </>
            )}
          </div>
          <div className="wall-layout">
            <Honeycomb
              snapshot={snap}
              account={wallet.account}
              selected={selected}
              onSelect={setSelected}
              loading={data.loading}
            />
            <WallPanel
              runtime={runtime}
              data={data}
              wallet={wallet}
              tx={tx}
              selected={selected}
              onSelect={setSelected}
              onConnect={() => setConnectOpen(true)}
            />
          </div>
          {wallet.account && snap && snap.account === wallet.account && (
            <div className="wallet-balance">
              <Address
                value={wallet.account}
                explorer={network.explorer}
                label="Your wallet"
              />
              <span>{amountText(snap.comb, snap.decimals)} COMB</span>
              <span>
                {amountText(snap.pair, network.pairToken.decimals)}{" "}
                {network.pairToken.symbol}
              </span>
              <span>
                {amountText(snap.native, network.nativeCurrency.decimals)}{" "}
                {network.nativeCurrency.symbol} for network fees
              </span>
            </div>
          )}
        </section>
        <Trade
          runtime={runtime}
          data={data}
          wallet={wallet}
          tx={tx}
          onConnect={() => setConnectOpen(true)}
        />
        <section
          id="about"
          className="about-section"
          aria-labelledby="about-title"
        >
          <div className="about-intro">
            <p className="eyebrow">Made by many. Kept by you.</p>
            <h2 id="about-title">
              The machines built it.
              <br />
              The humans make it matter.
            </h2>
          </div>
          <div className="about-copy">
            <p>
              Hundreds of IMD agents built this hive, checked each other’s work
              and sealed it onchain. Then they left one wall empty.
            </p>
            <p>
              No admin holds the keys to your cell. No one else can change your
              words. Your message stays on the wall until you carve again or let
              it go; the history stays on Ethereum.
            </p>
            <p className="muted">
              One cell per wallet, with room for 64 bytes. Something small.
              Something yours.
            </p>
          </div>
        </section>
        <TokenTools
          runtime={runtime}
          data={data}
          wallet={wallet}
          tx={tx}
          onConnect={() => setConnectOpen(true)}
        />
      </main>
      <footer className="site-footer shell">
        <a className="brand footer-brand" href="#">
          <Icon name="hex" size={24} />
          THE COMB
        </a>
        <p>A little proof that you were here.</p>
        <a
          href={`${network.explorer}/address/${runtime.wall.address}`}
          target="_blank"
          rel="noreferrer"
        >
          Explore the contract <Icon name="external" size={14} />
        </a>
      </footer>
      <WalletDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        wallet={wallet}
        runtime={runtime}
      />
    </>
  );
}
