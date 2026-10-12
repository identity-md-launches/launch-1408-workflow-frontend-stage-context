# The Comb — implemented design

## Overview

The Comb is a wall of 1,024 cells for people leaving short public messages on Ethereum. The implemented page is deliberately dark, with warm cream text, amber honeycomb states and a quiet editorial hierarchy. The required headline leads directly to the live wall and editor; statistics and the optional token trade follow the wall. The visual character and hero wording come from the approved brief. The compact seal, typography and spacing are implementation choices.

`web/src/styles.css` is the design source of truth. `web/src/App.tsx` composes the page. There is no UI kit, theme switch, external image service or animation library. The honeycomb, mark and icons are native SVG/CSS. All text and imagery are local apart from runtime chain reads.

This document is under `docs/` because the assignment's overriding path restrictions prohibit a root-level `DESIGN.md`.

## Colors

The palette is stored as hex primitives and semantic roles in `styles.css:33`.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#10110e` | Page and input background; text on primary buttons |
| `--surface` | `#161813` | Wall, editor, trading card, dialog |
| `--surface-raised` | `#1d2019` | Amount fields, status notices, selected segmented control |
| `--border-subtle` | `#26291f` | Structural dividers |
| `--border` | `#3e4436` | Cards, secondary controls and fields |
| `--text` | `#f0eee4` | Primary text and hex keyboard-focus stroke |
| `--muted` | `#a7ae9b` | Supporting copy and secondary labels |
| `--accent` | `#efbd58` | Primary actions, branded display text, claimed-cell dot |
| `--accent-hover`, `--focus` | `#ffda8b` | Hover fill and focus outline |
| `--accent-soft` | `#3b2d13` | Selected cell, warnings, decorative honeycomb |
| `--error` | `#f5a89c` | Errors and release confirmation |
| `--success` | `#afc997` | Live/read/confirmation states |

The grid adds actual cell-specific colors: empty outline `#727b66`; claimed fill `#453416` and outline `#b98937`; Keeper fill `#6b4d1b` with the brighter accent outline. Claimed cells also have a dot; selection has a plus and `aria-pressed`. Status and eligibility are always explained in text.

Rendered opaque pairs were measured in Chromium: body text/page **16.29:1**, primary text/surface **15.38:1**, dark text/amber primary button **10.91:1**, muted text/surface **7.81:1**. Full measurements are in `docs/evidence/rendered-review.json`. These figures are not a blanket claim about every gradient, translucent decoration, disabled control or platform rendering.

## Typography

Four local WOFF2 files ship with the export:

- **Space Grotesk 400 and 500**: display headings, brand, prominent counts and token amounts. Fallback: sans-serif.
- **DM Sans 400 and 600**: body, controls, labels and confirmations. Fallback: sans-serif.
- System `ui-monospace, SFMono-Regular, Consolas, monospace`: addresses, byte counters and cell IDs.

The real font weights are loaded via `@font-face`; `font-display: swap` avoids invisible text and `font-synthesis: none` avoids fabricated weights. Browser checks confirm both intended families load. Latin assets are bundled; other writing systems use the browser fallback.

`--text-xs`, `--text-sm`, `--text-body`, `--text-lg` are 0.75, 0.875, 1 and 1.125 rem. Functional captions have a 0.75 rem floor; smaller lettering is confined to the decorative, assistive-technology-hidden seal. Section headings have no eyebrow labels. Body line-height is 1.6; prose uses 1.7–1.8 where specified. Headings generally use 1.15 and negative tracking. The hero uses `clamp(2.5rem,4.7vw,4.1rem)` on large screens and `clamp(2rem,8.2vw,3.2rem)` below 43rem, retaining its amber second sentence. Mobile wall and trade headings share 1.6rem, below the 2rem headline floor. Headings balance their wrapping; paragraphs use pretty wrapping and a 68ch default measure.

Inputs use 16px type on mobile, including the message editor and slippage field. Dynamic counters use tabular numerals. Full messages wrap, preserve line breaks, and isolate their own writing direction. Addresses use `<bdi>`, checksummed display and accessible full values.

## Layout

The `.shell` caps content at 1280px with 96px total horizontal space, reducing to 64px and then 36px. The spacing tokens cover 4, 8, 12, 16, 24, 32, 48 and 64px. Grouping relies on space; thin dividers mark major page sections and the wall's working areas.

The desktop wall is a flexible map plus a 330px editor (310px at the first breakpoint). At **58rem**, the editor moves below the map in DOM reading order. The map deliberately scrolls independently in both axes; page-level horizontal scrolling is not part of the design. At default zoom, hexagons are 26×30px, spaced in a staggered 32×32 layout. The 100–200% zoom control increases targets up to 52×60px. At **43rem**, the page becomes a single column, navigation gets a second row, stats use two columns, trade/story stack, and the rules become a vertical list.

The mobile header uses 8px vertical padding, and the hero uses 16px. The map viewport is 112px tall on phones, retaining all 1,024 scrollable cells, zoom and the finder in normal DOM order. The editor has 12px padding and a resizable 68px message field. This puts the map, message, wallet/claim control, public-message notice and fee disclosure within the initial 390×844 screen after live reads. At 320×700 the map is visible initially; the editor remains reachable by scrolling. Text enlargement and long/error states are allowed to grow rather than being clipped to a screen-height target. Desktop map sizing stays unchanged; its editor uses a three-row field with a 96px minimum.

Breakpoints: **72rem**, **58rem**, **43rem**. The trade section uses two columns until the mobile breakpoint. The story follows the same shared margins. Dialogs use `min(480px,100% - 32px)` and a scrollable maximum height of 85dvh.

Observed in Chromium: no page overflow at widths 320, 390, 768, 1024 and 1440px; the wall remains independently scrollable. A separate 200% root-text enlargement check at 1024px and an RTL layout check at 390px also passed. These checks do not certify native browser zoom, physical phones or translated copy.

## Elevation & Depth

The system is mostly flat. Surface tones and structural borders define the map/editor and trade card. The native dialog has a dark translucent backdrop, a 4px backdrop blur and a deep `0 20px 80px #0008` shadow. The selected trade segment has a small shadow. Amber glow is reserved for Keeper cells and their decorative explanatory mark; there is no pulsing or autoplay animation.

Decorative layers do not capture pointer input. The SVG mark, seal and icons are hidden from assistive technology when their meaning is already in text.

## Shapes

`--radius` is 12px and `--radius-sm` is 6px. Cards use 12px, controls 6px, amount fields 8px, badges 4px and dialogs 16px. The mobile wall reduces to 10px.

Hexagonal paths are specific to the product. The button's polygon clipping follows the visible hexagon so neighboring rectangular hit regions do not overlap. Keyboard focus uses a 2px light SVG stroke inside the clipped shape; selection uses amber. Ordinary controls use a 2px focus outline with 4px offset. Forced-colors CSS uses system colors.

## Components

| Component or pattern | Source | Behavior |
| --- | --- | --- |
| `Icon`, `.button`, `.icon-button` | `web/src/ui.tsx`, `styles.css` | Shared 1.5px line icons; primary, secondary and destructive actions; visible disabled, hover, press and focus states |
| `Address` | `web/src/ui.tsx:61` | Checksummed short/full display, explorer link, copy button, persistent accessible copy result |
| `Dialog` | `web/src/ui.tsx:112` | Native modal; unique label ID; Escape dismissal, focus containment and restoration; no custom focus trap |
| `ConnectGate`, `WalletDialog` | `web/src/ui.tsx` | Connect action, browser-wallet selection, missing-wallet recovery; one shared wrong-network switch banner |
| `Honeycomb` | `web/src/Honeycomb.tsx` | 1,024 native buttons; one tab stop with arrows/Home/End; jump finder; empty/claimed/Keeper/unknown/selected/focus states; hover or selected-cell details |
| `WallPanel` | `web/src/WallPanel.tsx` | UTF-8 counter, claim/carve eligibility, cooldown, owner message, release confirmation, transaction status |
| `Trade` | `web/src/Trade.tsx` | Buy/sell segments, labelled token amount, quote, minimum output, expiry, slippage, separate conditional approvals, explicit swap confirmation and expandable route addresses |
| `TokenTools` | `web/src/TokenTools.tsx` | Collapsed disclosure for transfers and allowances, live reads and full-address confirmation |
| `TxStatus` | `web/src/ui.tsx:268` | Stable polite status region with simulation/signing/pending/confirmed/error copy, explorer transaction link and delayed-confirmation recovery |

Forms disable transactional actions whenever verification, chain, ownership, cooldown, amounts or allowance prerequisites fail. Disabled controls have adjacent explanations. Errors persist near the relevant action. Unknown or failed live reads never become fabricated empty cells or balances.

The connect control has `type="button"` and cannot submit its enclosing form. An anonymous draft survives the first account connection; changing cells, replacing a connected account or disconnecting clears it. Approval and swap review text displays every token decimal, including the guaranteed minimum, and wraps naturally.

`web/share-card.html` reuses the local fonts, palette and hexagon geometry for the 1200×630 social artwork. `web/scripts/share-card.mjs` renders the committed `web/public/share-card.png`; Vite copies it to `dist/`. Its honeycomb is decorative, not claimed-cell data. Metadata uses relative image paths until the publisher supplies a real public origin.

Motion is limited to hover/press feedback. Under `prefers-reduced-motion: no-preference`, controls use 150ms transitions on named properties, `cubic-bezier(.2,0,0,1)` for press scaling, and scale 0.96 on press; hex color/stroke transitions are 120ms. Motion is absent when reduced motion is requested.

## Do's and Don'ts

- Start another surface inside `.shell`, with a real heading and the existing semantic color and text tokens.
- Use the amber filled action for the current primary step; use neutral secondary controls for navigation or less prominent actions. Keep red for destructive actions and errors.
- Keep the map's two-dimensional coordinates in LTR while allowing prose and surrounding layout to adapt to text direction.
- Use `Address`, native inputs and `Dialog`; retain keyboard names, live status text and the full-address review before transfers.
- Read deployment values from the runtime manifest and show verified live eligibility before offering a signature. Never make sample wall data, prices or hard-coded allowances look live.
- Keep meaningful content readable and selectable. Do not hide messages in tooltips alone, lower functional labels below the implemented caption floor, or add decorative entrance animations.

For a new section, reuse the shared heading pattern and spacing, one existing surface treatment, `.button` states and native form controls. Add mobile layout changes only where the content stops fitting, and repeat the export/subpath, keyboard, contrast and overflow checks.
