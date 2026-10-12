# Bounded frontend revision

**Complete for the assigned revision.** All six reports reproduced against the accepted production export before source edits. The existing app, deployment configuration, routing and unsigned transaction amounts were retained. No live transaction was requested or broadcast. Responses keyed by the complete finding IDs are in `.imd-responses.json`.

## Reproduction and corrections

The baseline checks used Chromium at `/preview/`, the committed export, loaded local fonts and the existing `MockChain` transport. Six regression cases failed as expected; the cell/account draft-clearing preservation case passed. Raw observations and failure output are `evidence/revision-before-*.json` and `evidence/revision-before-tests.log`. The baseline screenshots show mock occupancy, not live adoption.

| Finding ID prefix | Reproduced behavior | Correction and final evidence |
| --- | --- | --- |
| `a5f864216640` | At 390×844 the map began at y=873.56, the editor at y=1351.53, and the action at y=1756.72. No cells were on the first screen. The desktop map began at y=899.17. | `web/src/App.tsx:54` and `:191` now put the wall before statistics. Removed the redundant hero link, tightened header/hero spacing, and compacted the map/editor in `web/src/styles.css:1491` and `:1615`. The empty-cell filler was removed; its label and badge still identify the action. The required headline, amber second line, header wallet control, fee and public-message disclosures remain. At 390×844: map y=362.69, message y=631.94–699.94, action y=738.13–786.13, fee ends y=811.92. At 1440×900 the message, action and fee are also within the first screen. The connected draft's enabled Claim action is checked at 390×844. |
| `04a1d1c1fdfe` | No `og:image` element or preview asset existed. | `web/index.html:12` declares the local share image, 1200×630 dimensions and image alt text, plus Twitter large-card/image metadata. `web/public/share-card.png` is rendered from local HTML/SVG/fonts by `web/scripts/share-card.mjs`. The final subpath test downloads/decodes it at exactly 1200×630. It is in the regenerated manifest. The real absolute image URL remains a publisher step because no public origin was supplied. |
| `9caf2b9b469c` | All three review steps truncated `0.000019999999999999` to `0.00001` while calling it exact; the swap minimum showed `0.00003`. No transaction was sent. | `web/src/Trade.tsx:377` and `:409` use each currency's full decimals for the permission amount and guaranteed minimum. Final review: “Swap exactly 0.000019999999999999 IMD for at least 0.000039799999999998 COMB.” Each of the three steps is tested independently; router/swap review also runs at 390px with no page overflow. Payloads, allowances and routing were unchanged. |
| `a59edc95edff` | Connecting from a valid 18-byte draft submitted the form, showed “Action could not complete”, and cleared the message when the account connected. | `web/src/ui.tsx:254` makes ConnectGate's control `type="button"`. `web/src/WallPanel.tsx:37` preserves the anonymous draft only across the first connection, while resetting on cell/account replacement and disconnect. Final test keeps “Hello future human”, `18 / 64 bytes`, no transaction error, and an enabled Claim action. Zero transactions were sent. Separate tests retain clearing on cell/account changes. |
| `619ebe806af0` | Five `.eyebrow` nodes appeared above the hero, wall, editor, trade and story headings with uppercase/tracked styling. | Removed those five nodes in `App.tsx`, `WallPanel.tsx` and `Trade.tsx`, the empty editor wrapper, and their unused CSS/margins. Final DOM count is zero at every measured width; meaningful headings, labels and disclosures remain. |
| `394ceab328f2` | The phone trade h2 was 36.8px versus the 32px product h1. | The mobile `.trade-story h2` in `web/src/styles.css` is 1.6rem, matching the wall heading. Measured at 390 and 320px: trade 25.6px, h1 32px. The existing desktop type scale and required hero wording remain. |

`evidence/revision-after-layout.json` contains the full final measurements. Viewport screenshots are `revision-after-390.jpg`, `revision-after-320.jpg` and `revision-after-1440.jpg`. At 320×700 cells are now visible immediately; headline wrapping and stacked tools still place the editor below that shorter screen. No content is clipped, the page has no horizontal overflow, and the wall remains scrollable and zoomable. The explicit 390×844 first-screen target is met without hiding disclosures or shrinking the h1 below 2rem.

## Final validation

Commands ran from `web/` using the existing lockfile, Node 24.21.0, npm 11.19.0 and Playwright 1.58.2. The Chromium executable was selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/root/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome`; this is a local test setting, not app configuration.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm ci --cache /tmp/comb-npm-cache` | Dependencies installed; lockfile unchanged | Existing locked dependency set retained |
| `npm run typecheck` | Exit 0 | `evidence/typecheck.log` |
| `npm test` | 14 tests passed | `evidence/unit-tests.log` |
| `npm run build` | Exit 0; final export and manifest generated | `evidence/build.log` |
| `npm run test:browser` | All 26 tests passed, including seven revision regressions | `evidence/browser-tests.log`, `evidence/browser-results.json` |
| `npm run format:check` | Exit 0 | `evidence/format-check.log` |
| `npm run validate:export` | Exit 0; 15 assets, exact handoff/network/pool key and pinned ABI hashes | `evidence/export-check.log` |
| `node scripts/inspect-live.mjs` | Live desktop export: 1,024 controls, 0 claimed, block 26,176,701; no page errors/failed requests | `evidence/live-browser.json`, `evidence/live-desktop.jpg` |
| Browser MCP, final 390×844 export | Unmocked block 26,176,702; all initial controls/disclosures fit, no console warnings/errors; all loaded static requests returned 200 | `evidence/revision-live-mobile.txt`, `evidence/revision-live-mobile.jpg` |
| `node scripts/audit-submission.mjs` and isolated Git bundle measurement | Exact inventory/hash checks, allowed-path checks and bundle-size check | `evidence/integrity.json`, `evidence/bundle-size.json` |

The final browser suite also repeats existing claims, carve cooldown, release confirmation, two explicit approvals, buy/sell swaps, token tools, failed simulations, wallet rejection, missing/wrong/unknown chains, ABI tampering, public-RPC fallback, keyboard/focus restoration, account/network events and duplicate-submit prevention. These are mock interactions; they spend no funds. The baseline failure log is intentionally retained as reproduction evidence. The standalone `revision-after-tests.log` records the first seven-test repair pass; the full final suite and regenerated after-measurements are authoritative for this worker report.

## Better Interface review of the changed surfaces

All six domains were checked using the pinned guide and the final source/export; the existing visual identity was preserved. This is worker evidence, not an independent certification.

| Domain | Coverage, fixes and verification | Limitations |
| --- | --- | --- |
| Accessibility | Retained labels, 16px phone inputs, native buttons/dialogs, DOM reading order, arrow-key cells and focus states. Corrected the accidental form-submit button. Existing keyboard, enlarged-text, forced-colors and axe checks pass. | No screen-reader session, physical phone or native browser zoom test. Axe is not exhaustive. |
| Layout | Reproduced and fixed the first-screen priority issue; inspected final viewport and full-page screenshots. No page overflow at 320/390/768/1024/1440. The 200% root-text and RTL reflow checks pass. | At 320×700 the editor requires scrolling. Loading/error/long-message states can grow beyond one screen. Text enlargement is not native zoom. |
| Writing | Kept exact headline and transaction/public/fee copy; removed redundant kickers/filler. Exact amounts now mean full precision. Connecting preserves the allowed draft. | English-only content; no pseudo-localization review. |
| Typography | Loaded local font families; mobile h1 32px and trade h2 25.6px; all five tracked heading labels removed. Full-precision review text wraps at phone width. | OS fallback glyphs and all extreme translated strings unverified. Decorative seal remains unchanged. |
| Colors | Reused all existing tokens. Chromium measured 16.29:1 body/page, 15.38:1 text/surface, 10.91:1 primary button and 7.81:1 muted helper/surface. Claimed/selected states retain text/shape cues. | Not every translucent/disabled/hover pair was measured; dark-only direction retained. |
| UI | Retained map zoom/finder, shared buttons, modal behavior and reduced-motion feedback. Shortened the mobile finder placeholder to `0` after the compact field visibly clipped `0–1023`; the full range remains in its title and validation message. Inspected the local share image. | No 10%-speed Animations-panel review or real social crawler validation. |

## Scope, packaging and publication limits

The deployed Solidity, original ABI exports, root configuration, lockfile, network record and attestation bindings are unchanged. `dist/imd-deployment.json` remains the app's runtime configuration; no separate address, chain, ABI or RPC map was introduced. The exporter rechecked ABIs against commit `2758b8e2759167be65de4cd13a6cd516b03484f2`, then hashed every final exported file except the manifest itself, including the new PNG.

No ignore file changed. Dependencies/caches stay excluded at all nested levels by the existing `web/.gitignore`. There is no submodule or vendored registry. The audit script was narrowly adjusted to recognize the explicitly authorized `.imd-responses.json`, deleted obsolete Vite chunks, and a pinned source commit that precedes the accepted frontend commit. The design record remains `docs/DESIGN.md` because the overriding path budget does not authorize root `DESIGN.md`.

The original `.git` is read-only. The working-tree source/export/evidence are ready for publisher capture; a commit for the complete bundle-size measurement exists only in disposable `test/scratch/`. No site was published, no contract was redeployed, and IPFS/CID/name/control-plane publication checks have not run. The share image's absolute URL must be supplied by the publisher and both image metadata URLs updated before publication; then rebuild/revalidate as documented in `web/README.md`.

Only Chromium was exercised in this revision. WebKit/Safari, Firefox, real wallet extensions/hardware signatures, and funded live-chain transaction behavior remain untested. Earlier point-in-time RPC/quote probes are retained and clearly distinguished from the fresh unmocked browser reads above. Package installation reported advisories in the existing locked dependencies; dependency migration was outside these six reproduced findings and no automatic upgrades were applied.
