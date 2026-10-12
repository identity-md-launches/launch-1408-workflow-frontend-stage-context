# The Comb frontend

React, TypeScript, Vite and viem. The production site is a single static page in `../dist/`, including its fonts, implementation ABIs and runtime deployment manifest. It needs no application server, account service, private key, RPC credential or WalletConnect project ID.

## Install, build and preview

Use Node.js 22 and npm 10 or newer, from this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run validate:export
npm run preview
```

Open the preview URL printed by Vite. `npm run dev` prepares the same deployment and ABI files in `public/` before starting the development server; those generated development copies are ignored. The build writes directly to repository-root `dist/`, with `base: './'`. All in-page navigation uses anchors. It works at a gateway subpath without rewrites.

A restricted worker can place npm's cache outside the repository with `npm ci --cache /tmp/comb-npm-cache`. Dependencies and caches must never be included in the submission. The explicit ignore-file budget is **only `web/.gitignore`**; its recursive rules exclude dependency/cache/test output directories at every depth under `web/`.

## Runtime configuration and reproducible export

`config/imd-deployment.json` is the sole build input for deployment identifiers, contract bindings, the exact pool key, public network configuration and wallet add-chain parameters. It was copied from the supplied handoff and network record. Its empty asset list is filled during export. React does **not** import this source seed: `src/config.ts` fetches `./imd-deployment.json` from the hosted export, loads the referenced ABI JSON files, verifies their canonical Keccak hashes, and constructs the clients from that manifest.

The pinned implementation commit is `2758b8e2759167be65de4cd13a6cd516b03484f2`. Keep that Git object in your checkout. `scripts/export.mjs` reads each ABI using `git show <sourceCommit>:docs/abi/<name>.json`, checks the working ABI against those exact bytes, verifies the canonical Keccak binding, and exports the raw ABI array. Canonicalization recursively sorts object keys, preserves array order, serializes compact JSON, and hashes the UTF-8 bytes with Ethereum Keccak-256. It is not SHA3-256.

After Vite finishes, the exporter inventories **every** file under `dist/` except the manifest itself. Paths are relative; SHA-256 is over final file bytes. The script checks the exact handoff/network bindings whenever the worker inputs exist, and rejects mismatched ABIs, extra top-level manifest keys, unsafe paths, oversized assets, missing HTML or stale asset inventories. `npm run validate:export` repeats these checks without rebuilding. Rebuild after any source or exported asset change. Do not edit `dist/` by hand.

The original `docs/abi/` files and deployed Solidity remain unchanged. The optional `extendedSwapParams` flag is read from the supplied network configuration; there is no secondary router or chain-address map.

## Wall and wallet behavior

- All 1,024 cells are native button controls. Scroll the grid in both directions; zoom from 100% to 200%; use arrow keys, Home/End or the numbered cell finder. Hover/focus previews the message, and selecting shows it in the inspector. Unknown cells are dashed until RPC reads succeed. Messages render as text, never HTML.
- Claim, carve and release use the implementation ABI. The editor counts UTF-8 bytes with `TextEncoder`; the first carve is available 24 hours after the claim. Release requires explicit confirmation and clears the current message; historical events remain onchain.
- Connecting from the editor does not submit it. An anonymous draft survives the first connection; selecting another cell, replacing a connected account or disconnecting clears the draft.
- COMB is not required for any wall action. Only the connected wallet's own cell receives a Keeper glow when its live COMB balance is positive. Ownership and balances are invalidated across account/network changes.
- Browser wallets use EIP-6963 discovery with an injected `window.ethereum` fallback. Missing wallets, connection rejection, account changes, disconnects and wrong networks have explicit states. Unknown-chain error 4902 (including nested/unknown-chain messages) triggers `wallet_addEthereumChain` with the supplied parameters, followed by another switch attempt.
- Public reads try the supplied RPCs in order, then the connected wallet provider only on the correct chain. App code and the RPC chain ID must be verified before signing is enabled. Pool contract code, pair-token metadata and initialization are checked separately, so unavailable trading does not block the independent wall.
- `cells(from,128)` loads the wall in eight calls at one block. Ownership, balances, token metadata and cooldown use that block too. Reads refresh every 30 seconds while the page is visible, and immediately after a confirmed transaction. The displayed block identifies the snapshot. There is no event indexer or event-history UI. Pool liquidity is read for diagnostics; zero liquidity at the current tick does not block quotes, since a swap may cross into a funded range.
- Transactions simulate before signing, recheck the wallet account and chain, and remain locked until a receipt and data refresh complete. If receipt tracking times out, the transaction link and a confirmation-retry control remain available and duplicate signing stays disabled. Failed simulations never ask for a signature.

## COMB/IMD swaps and token tools

Buy spends **IMD**, not ETH. Sell spends COMB. Quotes call the configured v4 quoter with `simulateContract`, the exact attested pool key and empty hook data. Quotes expire in 60 seconds and clear on amount, slippage, direction, account or chain changes. Slippage accepts 0.1%–5%; minimum output is rounded down in base units.

The sequence is explicit and allowance-dependent:

1. ERC-20 `approve(permit2, exactAmount)` when the current allowance is insufficient.
2. Permit2 `approve(inputToken, universalRouter, exactAmount, expiration)` when insufficient or expiring. The new permission expires in one hour.
3. Simulated Universal Router `execute` with command `0x10`, actions `0x060c0f`, exact-input/settle-all/take-all parameters and a 15-minute deadline. IMD and COMB swaps send no ETH value; ETH pays the wallet's network fee only.

Each approval is its own confirmed transaction. The visitor requests a fresh quote/allowance read afterward. Minimum output, rate, quote expiry, pool fee, route contracts and approval scope appear before signing. No USD price feed was supplied; the UI uses token units and explicitly says USD prices are unavailable.

The permission/swap review and guaranteed minimum show full token precision. Estimated balances, rates and output summaries retain their compact display; the transaction payload and routing use the original base-unit amounts.

## Share artwork and publication metadata

`public/share-card.png` is the committed 1200×630 Open Graph/Twitter artwork, generated from `share-card.html` with the same local fonts, colors and hexagon geometry as the app. The honeycomb in the artwork is decorative, not a live occupancy snapshot. `index.html` includes image dimensions, descriptive alt text and a large Twitter card. Normal builds copy the PNG and include it in the deployment asset inventory.

After editing the artwork, run `node scripts/share-card.mjs` from `web/` with Playwright Chromium installed (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` as below), then `npm run build` and `npm run validate:export`. No image-generation service or external font request is used.

No publication origin is supplied at this stage. The image paths are deliberately relative and resolve under the static hosting subpath. Once the publisher has the real public origin, replace the `og:image` and `twitter:image` values in `web/index.html` with that asset's absolute public URL, then rebuild and revalidate the manifest before publishing. External crawler/card rendering remains unverified until then; no guessed site URL is embedded.

The collapsed token tools expose `transfer`, `approve` (including a zero-allowance revoke), and `transferFrom`. They validate checksummed/nonzero hex addresses, read balances and allowances, and show full addresses in a confirmation dialog. ENS resolution and WalletConnect are not implemented; a WalletConnect integration would require a requester-supplied public project ID. There are no owner settings: these deployed application contracts have no owner or setup functions. LP management and distributor actions are not part of these contracts or this assignment.

## Read-only network diagnostics

After building, `npm run probe:rpc` checks the supplied endpoints for chain ID and nonempty application code. `node scripts/live-read.mjs` reads token/wall/pool state and simulates a one-IMD quote. `node scripts/inspect-live.mjs` also opens the production export in an unmocked Chromium browser and saves the live screenshot/read results. These scripts write evidence under `docs/evidence/`; none can sign or broadcast. These point-in-time results are not a guarantee of future RPC availability or swap execution.

## Browser validation

```sh
npm run test:browser
```

Playwright owns a bounded preview process at `/preview/` and closes it after the run. It tests the production export, never the Vite development app. The test config uses the worker's installed Chromium when available, otherwise Playwright's usual browser installation. On another machine run `npx playwright install chromium` first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed compatible Chromium binary.

All wallet/RPC interaction tests intercept network requests. They do not broadcast Ethereum transactions. Test accounts and sample messages are confined to `tests/mock-chain.ts`; there is no demo mode, fixture state or mock provider in the production build.

See [validation](../docs/VALIDATION.md), [design](../docs/DESIGN.md), [screenshots and raw results](../docs/evidence/), and [attribution](../docs/ATTRIBUTION.md). The root `DESIGN.md` request conflicts with the overriding allowed-path list, so the actual implemented-design document is delivered at `docs/DESIGN.md`.

The bounded revision's reproductions, fixes and seven added browser regressions are documented in [the revision record](../docs/REVISION.md). Run `npm run test:browser -- revision.spec.ts` for that subset, or the full command above for all 26 tests. The revision was also checked on Node.js 24.21.0 / npm 11.19.0.

Publishing, an IPFS CID, a site name, explorer verification and live transaction execution are outside this worker stage. No website was published and no contracts were redeployed. The control plane's later HTTP/RPC publication checks do not replace these browser tests.
