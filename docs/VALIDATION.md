# Frontend validation — The Comb

**Result: complete for the authorized frontend scope.** The source, lockfile, static export, runtime manifest, design record and worker validation evidence are delivered. No live transaction was signed or broadcast. Publication, a fixed CID, site naming and the control plane's post-publication checks have not run at this stage.

The assignment's overriding write budget permits `web/**`, `dist/**` and `docs/**`, plus the explicit `web/.gitignore` exception. It prohibits a root design file, so the requested implemented-design record is at **`docs/DESIGN.md`**, not repository-root `DESIGN.md`. Solidity, original ABI exports, root configuration, dependencies under `lib/` and `.github/` were preserved.

## Revision status

The six independent-review findings were reproduced against the accepted export and fixed in a bounded revision. The current result is **26 browser tests passed**, with updated build/typecheck/export evidence and unmocked desktop/mobile reads. See [the revision record](REVISION.md) for before/after measurements, all six dispositions, current screenshots and the review across the six Better Interface domains. The machine-readable responses are in `.imd-responses.json`. Existing source and deployment bindings were retained.

## Scope and assumptions

The product is a single dark, amber-accented page. The complete wall and its claim/carve/release actions are primary; COMB ownership only adds a Keeper glow. COMB/IMD trading uses the attested v4 pool. Standard token transfer, allowance and delegated transfer controls are available in a disclosure. Neither deployed application contract has owner setup requirements. No user-specific address, secret, price feed, WalletConnect ID, site URL or IPFS CID was invented.

Read the pinned workflow, handoff, network record, Better Interface workflow/core principles in all six domains, documentation method, Ethereum UX reference and their supplied license records. The design choices were applied during implementation, then reviewed against the rendered production output.

## Commands and outcomes

The original run used Node **22.22.2**, npm **10.9.7**; the revision used Node **24.21.0**, npm **11.19.0**, retaining TypeScript **5.9.3**, Vite **6.4.1**, Vitest **3.2.4**, Playwright **1.58.2**, axe **4.11.1**, and the worker's installed Chromium. Exact frontend versions are locked in `web/package-lock.json`.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm --prefix web run typecheck` | Exit 0 | `evidence/typecheck.log` |
| `npm --prefix web test` | 14 tests passed | `evidence/unit-tests.log`, `web/tests/domain.test.ts` |
| `npm --prefix web run build` | Exit 0; final production export generated | `evidence/build.log` |
| `npm --prefix web run validate:export` | Exit 0; 15 exported assets, 691,595 bytes excluding the manifest | `evidence/export-check.log`, `dist/imd-deployment.json` |
| `npm --prefix web run test:browser` | 26 tests passed, final production export | `evidence/browser-tests.log`, `evidence/browser-results.json` |
| Chromium/axe on production subpath `/preview/` | No reported WCAG A/AA violations in the tested desktop/mobile states; no console or resource failures | `evidence/rendered-review.json` |
| Responsive widths 320, 390, 768, 1024, 1440 | No page overflow; intended fonts loaded | `evidence/rendered-review.json` |
| 200% root-text enlargement at 1024, RTL at 390, reduced-motion and forced-colors interaction | Passed measured reflow/focus interaction checks | `evidence/adaptivity.json` |
| `npm --prefix web run probe:rpc` | Both supplied RPCs report chain 1 and nonempty code for both application contracts | `evidence/rpc-probe.json` |
| `node web/scripts/live-read.mjs` | Live token/wall/pool reads and a non-broadcast quoter simulation succeeded | `evidence/live-reads.json` |
| `node web/scripts/inspect-live.mjs` | Unmocked Chromium load: 1,024 cells, live block/occupancy, 0 failed requests and 0 page errors | `evidence/live-browser.json`, `evidence/live-desktop.jpg` |

During the original run, the browser MCP launcher could not initialize because its browser cache path was read-only (`EROFS`). In this revision the MCP browser worked: the final mobile export was inspected and captured with unmocked live data at block 26,176,702 (`evidence/revision-live-mobile.jpg`, `evidence/revision-live-mobile.txt`). The alternate Playwright checks launched the worker's installed Chromium in a bounded foreground run, owning and closing their preview servers and browser sessions. This is rendered browser evidence, not a source-only substitution. The original Python HTTP probe also returned 403; the subsequent Node/viem and unmocked browser paths used by this frontend succeeded.

## Contract and interaction coverage

Unit tests cover implementation ABI canonical Keccak binding, canonical object/array behavior, UTF-8 boundaries including emoji, token decimal precision, amount bounds, slippage validation/rounding, human error messages, both directions of standard and extended router encoding, native-value handling and rejection of currencies outside the pool.

The 19 original browser tests below were rerun successfully; seven revision tests add viewport, social metadata, exact permission/minimum amounts and draft-lifecycle checks:

- Runtime config and ABI fetches from a hosting subpath, all 1,024 real controls, missing-wallet recovery and safe display of untrusted onchain message text.
- Connection, rejected connection, wrong chain, rejected switching, unknown-chain add/switch fallback with exact supplied parameters, account/network/disconnect events, and rechecking an account even when the wallet fails to emit an event.
- Claim byte limits, successful mock claim and Keeper glow, one-cell eligibility, initial carve cooldown, eligible carve, cancelled/confirmed release, duplicate-submit prevention through receipt confirmation, wallet rejection and raced-cell simulation failures.
- IMD buy flow with exact token-to-Permit2 approval, exact Permit2-to-router approval, confirmed allowance refresh, price/minimum-output display, exact pool/hook binding, zero ETH swap value and simulated router execution. Sell flow, quote invalidation and expiry, expired Permit2 grants, and swap simulation failure without signing.
- Code-verification failure, uninitialized-pool gating, and the zero-current-tick-liquidity case where a quote can still succeed across funded ranges.
- Direct COMB transfers, zero-allowance revocation, delegated transfers, bad-address and insufficient-allowance errors, live pre-review balances, full-address confirmation, and ABI tamper rejection.
- Public RPC failover, wallet-provider read fallback, roving keyboard focus, cell finder/last cell, Escape dismissal, modal focus containment/restoration, narrow layout and local font loading.

Mock wallet/RPC requests are isolated in the test transport. The bundled app contains no mock state or demo switch. The screenshots `desktop.jpg` and `mobile.jpg` intentionally show **mocked** occupancy so claimed/empty styles are reviewable; they are not evidence of live adoption. `live-desktop.jpg` is separately captured without RPC interception or an injected wallet.

## Live-chain evidence and the liquidity repair

At the recorded live read, Ethereum block **26,176,537** returned `COMB`, 18 decimals, fixed supply **1,000,000,000**, and **0 claimed cells**. Both RPCs returned application bytecode (1,335 bytes for LaunchToken and 3,751 bytes for CombWall). The supplied Uniswap contracts had code, and the paired token read `IMD`, 18 decimals. These are point-in-time reads, not bytecode-source equivalence or an independent security audit.

The pool's live `getLiquidity` returned zero at the current tick while a simulated quote for **1 IMD** returned approximately **392,515.1528 COMB**. This is diagnostic evidence, not a promised rate or recommendation. The initial UI incorrectly used zero active liquidity to block quoting. It now gates on verified contracts and pool initialization, then lets the actual quote and router simulation evaluate the requested amount. This follows the distinction between liquidity in the current range and liquidity crossed during a swap; see the [primary pool-state reference](https://developers.uniswap.org/docs/protocols/v4/guides/read-pool-state). A browser regression test covers this repair.

The final revision’s unmocked desktop browser loaded the export at block **26,176,701**, showed **0 / 1,024** claimed cells, and fetched all wall ranges successfully. No wallet was injected or connected for that check. Real signatures, approvals, transfers, releases, claims, carves, funded router simulations and receipt confirmation on Ethereum remain unperformed. Quoter simulation is an `eth_call`, not a transaction.

## Better Interface consolidated review

| Domain | Coverage and evidence | Unperformed or inapplicable checks |
| --- | --- | --- |
| Accessibility | **Checked.** Native landmarks/forms/buttons/dialogs; one wall tab stop with arrow navigation; unique dialog label IDs; live status regions; UTF-8 validation; minimum grid bounds and nonoverlapping hex hit areas; visible focus; keyboard/escape/return-focus tests; axe in desktop/mobile states. | Native screen-reader sessions, physical touch devices, native browser 200% zoom and focus contrast in every OS/forced-colors palette not verified. Text enlargement is separately measured. |
| Layout | **Checked.** Desktop map/editor and mobile stacked editor, two-axis map scrolling, shared margins, five viewport widths, 200% text enlargement and RTL width tests. Full desktop/mobile screenshots inspected. | Full translated/pseudo-localized copy and physical-device layout not verified. Grid coordinates intentionally remain LTR. |
| Writing | **Checked.** Verb-led actions, plain prerequisites and errors, public-message disclosure, optional COMB, irreversible release explanation, token-specific quote/minimum/fee units, explicit USD unavailability, one shared switch control. | Localization is not part of this English-only release. |
| Typography | **Checked.** Real local WOFF2 weights, descending heading roles, 12px functional-caption floor, 16px mobile inputs, tabular counters, message wrapping and bidi address isolation. Browser font checks and screenshot review passed. | Non-Latin glyph quality across OS fallback fonts not verified. Decorative hidden seal lettering is intentionally smaller. |
| Colors | **Checked.** Semantic hex tokens; opaque rendered pairs measured at 16.29:1 body/page, 15.38:1 text/surface, 10.91:1 primary action and 7.81:1 muted/surface; claimed/selected/keeper states have text or shape cues. | Translucent decorative glow/gradient pairs and every disabled/hover combination were not individually contrast-measured. A light theme is not applicable to the requested dark direction. |
| UI details | **Checked.** Consistent SVG line weight, card/control radii, pending/disabled/empty/error/confirmed states, address tools, native disclosure and modal behavior, named 120/150ms transitions and reduced-motion guards. | Browser Animations-panel inspection at 10% speed was not performed. No entrance animation, theme switch, media player or external raster asset exists. |

### Original implementation findings and fixes

The locations below refer to the first accepted source. Current revision locations and rechecks are in [REVISION.md](REVISION.md).

| Severity | Final source location | Finding, correction and recheck |
| --- | --- | --- |
| High | `web/src/data.ts:230`, `web/src/Trade.ts:60` | Live evidence showed zero current-tick liquidity despite a successful quote. Removed the liquidity-as-global-availability gate; initialization and actual simulations remain required. Unit/router tests, live quoter read and browser regression passed. |
| Medium | `web/src/domain.ts:109` | Broad matching of the word “network” hid specific verification/account-change recovery messages. Narrowed transport matching. Missing-code and changed-account browser cases now show their explicit explanations. |
| Medium | `web/src/styles.css:217`, caption/component rules | Source/render review found important functional captions below the intended readable floor. Raised them to 0.75rem and retained smaller type only for editorial/decorative elements. Five-width reflow and axe recheck passed. |
| Medium | `web/src/styles.css:701`, `web/src/Honeycomb.tsx:119` | Rectangular hit regions extended into adjacent staggered hexagons. Added matching polygon clipping and an internal 2px light keyboard-focus stroke. Keyboard/last-cell/zoom tests passed. |
| Medium | `web/src/ui.tsx:112` | Repeated static dialog title IDs would make labels ambiguous. Each dialog now uses React `useId` with native modal semantics. Axe and Escape/focus-restoration checks passed. |
| Medium | `web/src/transactions.ts:26`, `web/src/TokenTools.tsx:90`, `web/src/Honeycomb.tsx:119` | Account changes could leave old personal display/review data briefly visible. Bound personal balances/glow to the current snapshot account, invalidated review state, rechecked generation after async reads, and refresh through the latest data hook after receipts. Wallet-event and signer recheck tests passed. |

No unresolved blocker was found in the authorized implemented frontend. These findings are the worker's review, not an independent network certification.

## Deployment and packaging integrity

The source seed in `web/config/imd-deployment.json` is copied from the actual handoff. The hosted app fetches `dist/imd-deployment.json` as its sole deployment source. The manifest has only the allowed schema keys, exact identifiers/contract set, exact pool key, unchanged network/add-chain blocks, and relative ABI/asset paths. Exported ABIs are the raw arrays at the pinned source commit, with verified canonical hashes. Every other exported file, including both ABIs, HTML, favicon, fonts, licenses, CSS and JavaScript, appears in the SHA-256 inventory. The manifest excludes itself.

`web/.gitignore` has the explicit assigned ignore-file path budget; it excludes dependency/cache directories recursively and generated development-only config/ABI copies. No package cache, vendored registry, `.tgz`, source map, `node_modules`, private credential or git submodule is delivered. Source, required runtime assets and font licenses remain complete. Final path/hash/file verification is recorded in `evidence/integrity.json`. The complete isolated Git snapshot, including baseline history and revised source/export/evidence, is measured in `evidence/bundle-size.json` against the 8,388,608-byte limit. The original repository metadata remains read-only, with its accepted HEAD and pinned source commit preserved; the size-check commit exists only in disposable `test/scratch/`. The publisher captures the delivered working-tree files.

## Remaining limits

- Only Chromium was exercised. Safari, Firefox, physical mobile browsers, native screen readers and native browser zoom remain unverified.
- Wallet behavior is validated through EIP-1193 mocks; an actual extension/hardware wallet was not used to sign. No funds were spent, no contract redeployment occurred, and no live state-changing transaction was submitted.
- Addresses accept checksummed or valid lowercase hex; ENS resolution and WalletConnect are not implemented. The local 1200×630 share image, Open Graph dimensions/alt metadata and Twitter large-card metadata are delivered. A publication-specific absolute image URL and crawler validation remain pending the publisher’s real origin.
- Readouts use the supplied public RPCs and can become unavailable, rate-limited or stale; the UI disables signing on failed verification/read freshness. Quote/slippage protection and a successful simulation cannot guarantee eventual execution.
- The wall proves one cell per address, not one per human. There is no admin, setup panel, history indexer, liquidity-management feature or anti-Sybil mechanism to test.
- GitHub publishing, IPFS pinning, named-entrypoint validation and the control plane's immutable/named HTTP hash checks are subsequent publisher responsibilities. This delivery does not claim those checks passed.
