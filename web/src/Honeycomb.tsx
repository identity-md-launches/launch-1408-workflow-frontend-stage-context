import {
  memo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { zeroAddress, type Address } from "viem";
import { CELL_COUNT, sameAddress, shortAddress } from "./domain";
import type { Snapshot } from "./data";
import { Icon } from "./ui";
const ids = Array.from({ length: CELL_COUNT }, (_, i) => i);
export const Honeycomb = memo(function Honeycomb({
  snapshot,
  account,
  selected,
  onSelect,
  loading,
}: {
  snapshot?: Snapshot;
  account?: Address;
  selected: number;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<number>();
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState("");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const surface = useRef<HTMLDivElement>(null);
  function focus(id: number) {
    onSelect(id);
    buttons.current[id]?.focus({ preventScroll: true });
    buttons.current[id]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }
  function keydown(e: KeyboardEvent, id: number) {
    const delta: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 32,
      ArrowUp: -32,
    };
    let next = id;
    if (e.key in delta) next = Math.max(0, Math.min(1023, id + delta[e.key]));
    else if (e.key === "Home") next = e.ctrlKey ? 0 : Math.floor(id / 32) * 32;
    else if (e.key === "End")
      next = e.ctrlKey ? 1023 : Math.floor(id / 32) * 32 + 31;
    else return;
    e.preventDefault();
    focus(next);
  }
  const preview = hover === undefined ? undefined : snapshot?.cells[hover];
  const firstEmpty = snapshot?.cells.find((c) =>
    sameAddress(c.owner, zeroAddress),
  )?.id;
  return (
    <div className="wall-map">
      <div className="map-tools">
        <div className="legend">
          <span>
            <i className="legend-empty" />
            Empty
          </span>
          <span>
            <i className="legend-claimed" />
            Claimed
          </span>
          <span>
            <i className="legend-keeper" />
            Your Keeper cell
          </span>
        </div>
        <div className="zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
          >
            <Icon name="minus" />
          </button>
          <output aria-label="Grid zoom">{Math.round(zoom * 100)}%</output>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
      <div
        className="map-scroll"
        ref={surface}
        aria-busy={loading}
        aria-label="Scrollable honeycomb wall"
      >
        <div
          className="honeycomb"
          role="group"
          aria-label="1,024 cells. Use arrow keys to explore; Enter to select."
          style={
            {
              width: 922 * zoom,
              height: 800 * zoom,
              "--zoom": zoom,
            } as CSSProperties
          }
          onMouseLeave={() => setHover(undefined)}
        >
          {ids.map((id) => {
            const cell = snapshot?.cells[id];
            const claimed = cell && !sameAddress(cell.owner, zeroAddress);
            const keeper =
              claimed &&
              sameAddress(cell.owner, account) &&
              snapshot?.account === account &&
              !!snapshot?.comb;
            return (
              <button
                key={id}
                type="button"
                ref={(el) => {
                  buttons.current[id] = el;
                }}
                data-cell={id}
                className={`hex-cell ${cell ? "" : "unknown"} ${claimed ? "claimed" : ""} ${keeper ? "keeper" : ""} ${selected === id ? "selected" : ""}`}
                style={{
                  left:
                    (12 + (id % 32) * 28 + (Math.floor(id / 32) % 2) * 14) *
                    zoom,
                  top: (12 + Math.floor(id / 32) * 24) * zoom,
                  width: 26 * zoom,
                  height: 30 * zoom,
                }}
                tabIndex={id === selected ? 0 : -1}
                aria-label={`Cell ${id}, ${cell ? (claimed ? `${keeper ? "your Keeper cell, " : ""}claimed by ${shortAddress(cell.owner)}: ${cell.message}` : "empty") : "not loaded"}`}
                aria-pressed={id === selected}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(undefined)}
                onMouseEnter={() => setHover(id)}
                onClick={() => onSelect(id)}
                onKeyDown={(e) => keydown(e, id)}
              >
                <svg viewBox="0 0 26 30" aria-hidden="true">
                  <path d="M13 1 25 8v14l-12 7L1 22V8Z" />
                  {claimed && <circle cx="13" cy="15" r={keeper ? 3 : 1.8} />}
                </svg>
                {selected === id && <span className="cell-marker">+</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="map-caption">
        <span>
          {preview ? (
            <>
              {sameAddress(preview.owner, zeroAddress)
                ? `Cell #${preview.id} · An empty place for your words`
                : `#${preview.id} · ${shortAddress(preview.owner)} · “${preview.message}”`}
            </>
          ) : (
            <>Scroll to explore · Use + to zoom · Select any cell</>
          )}
        </span>
        <span className="mono">32 × 32</span>
      </div>
      <div className="map-bottom">
        <form
          className="jump-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(jump);
            if (jump === "" || !Number.isInteger(n) || n < 0 || n > 1023) {
              setJumpError("Choose 0–1023.");
              return;
            }
            setJumpError("");
            focus(n);
          }}
        >
          <label htmlFor="cell-jump">Find a cell</label>
          <input
            id="cell-jump"
            type="text"
            inputMode="numeric"
            placeholder="0–1023"
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            aria-describedby="jump-error"
            aria-invalid={!!jumpError}
          />
          <button className="icon-button" aria-label="Go to cell">
            <Icon name="arrow" />
          </button>
          <span id="jump-error" className="error">
            {jumpError}
          </span>
        </form>
        <button
          className="text-button"
          disabled={firstEmpty === undefined}
          onClick={() => {
            if (firstEmpty !== undefined) focus(firstEmpty);
          }}
        >
          Find an empty cell <Icon name="arrow" size={15} />
        </button>
      </div>
    </div>
  );
});
