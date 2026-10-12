import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { getAddress, type Address as EthAddress } from "viem";
import { shortAddress } from "./domain";
import type { Wallet } from "./wallet";
import type { Runtime } from "./config";
import type { Transactions } from "./transactions";
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    external: (
      <>
        <path d="M14 4h6v6M20 4 10 14" />
        <path d="M10 5H5v14h14v-5" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M15 8V4H4v11h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M5 12h14M12 5v14" />,
    minus: <path d="M5 12h14" />,
    refresh: (
      <>
        <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    down: <path d="m7 10 5 5 5-5" />,
    swap: (
      <>
        <path d="M7 3v16m-4-4 4 4 4-4M17 21V5m-4 4 4-4 4 4" />
      </>
    ),
    hex: <path d="m12 2 9 5v10l-9 5-9-5V7Z" />,
    wallet: (
      <>
        <path d="M3 7V5h15v3M3 8h18v12H3Z" />
        <path d="M16 12h5v4h-5Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.hex}
    </svg>
  );
}
export function Address({
  value,
  explorer,
  label,
  full = false,
}: {
  value: EthAddress;
  explorer: string;
  label?: string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const address = getAddress(value);
  return (
    <span className="address-control">
      <a
        href={`${explorer}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        title={address}
        aria-label={`${label ?? "Address"} ${address} on explorer`}
      >
        <bdi>{full ? address : shortAddress(address)}</bdi>
        <Icon name="external" size={13} />
      </a>
      <button
        className="icon-button copy-button"
        type="button"
        aria-label={`Copy ${label ?? "address"}`}
        onClick={() => {
          void navigator.clipboard.writeText(address).then(
            () => {
              setCopied(true);
              setError("");
            },
            () =>
              setError(
                "Copy unavailable. Select the address from its explorer link.",
              ),
          );
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      <span className="sr-only" role="status">
        {copied ? "Address copied." : error}
      </span>
    </span>
  );
}
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby={titleId}
    >
      <div className="section-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function WalletDialog({
  open,
  onClose,
  wallet,
  runtime,
}: {
  open: boolean;
  onClose: () => void;
  wallet: Wallet;
  runtime: Runtime;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={wallet.account ? "Connected wallet" : "Connect your wallet"}
    >
      {wallet.account ? (
        <>
          <Address
            value={wallet.account}
            explorer={runtime.deployment.network.explorer}
            label="Connected wallet"
            full
          />
          <p>
            Connected to{" "}
            {wallet.correctChain
              ? runtime.deployment.network.name
              : `chain ${wallet.chainId}`}
            . Your wallet signs every transaction.
          </p>
          <button
            className="button secondary wide"
            onClick={() => {
              wallet.disconnect();
              onClose();
            }}
          >
            Disconnect wallet
          </button>
        </>
      ) : (
        <>
          <p>
            Choose a browser wallet to leave your mark. Connecting is free and
            does not send a transaction.
          </p>
          {wallet.options.length === 0 ? (
            <div className="notice">
              <strong>No browser wallet found</strong>
              <p>
                Open this site in your wallet’s browser, or install a browser
                wallet extension and reload this page.
              </p>
              <button
                className="button secondary"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
            </div>
          ) : (
            wallet.options.map((option) => (
              <button
                key={option.id}
                disabled={wallet.pending}
                className="button wallet-option"
                onClick={() => {
                  void wallet.connect(option);
                }}
              >
                <Icon name="wallet" />
                {wallet.pending ? "Connecting…" : option.name}
                <Icon name="arrow" />
              </button>
            ))
          )}
        </>
      )}
      {wallet.error && (
        <p className="error" role="alert">
          {wallet.error}
        </p>
      )}
    </Dialog>
  );
}
export function ConnectGate({
  wallet,
  runtime,
  onConnect,
  children,
}: {
  wallet: Wallet;
  runtime: Runtime;
  onConnect: () => void;
  children: ReactNode;
}) {
  if (!wallet.account)
    return (
      <button type="button" className="button primary wide" onClick={onConnect}>
        <Icon name="wallet" />
        Connect wallet
      </button>
    );
  if (!wallet.correctChain)
    return (
      <p className="helper">
        Switch to {runtime.deployment.network.name} using the network control
        above.
      </p>
    );
  return <>{children}</>;
}
export function TxStatus({
  tx,
  runtime,
  keys,
}: {
  tx: Transactions;
  runtime: Runtime;
  keys: string[];
}) {
  const state = tx.state;
  const visible = !!state && keys.includes(state.key);
  return (
    <div
      className={`tx-status ${visible ? state.phase : ""}`}
      role="status"
      aria-live="polite"
    >
      {visible && (
        <>
          <strong>
            {state.phase === "success"
              ? "Confirmed"
              : state.phase === "error"
                ? "Action could not complete"
                : state.label}
          </strong>
          <p>{state.message}</p>
          {state.hash && (
            <a
              href={`${runtime.deployment.network.explorer}/tx/${state.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <Icon name="external" size={14} />
            </a>
          )}
          {state.phase === "pending" && state.message.includes("longer") && (
            <button
              className="button secondary"
              onClick={() => void tx.retry()}
            >
              Retry confirmation
            </button>
          )}
        </>
      )}
    </div>
  );
}
