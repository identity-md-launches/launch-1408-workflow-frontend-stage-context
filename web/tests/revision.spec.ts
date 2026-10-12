import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { MockChain, connect, recipient } from "./mock-chain";

// Run against the committed production export. The optional phase only names evidence.
const phase = process.env.COMB_REVISION_PHASE === "before" ? "before" : "after";
async function evidence(name: string, value: unknown) {
  await writeFile(
    `../docs/evidence/revision-${phase}-${name}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
}

test("revision: initial viewport prioritizes cells and claim controls", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page, { wallet: false });
  const results = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 700 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await expect(page.locator(".read-status")).toContainText("Read at block");
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.evaluate(() => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        scrollY,
        scrollWidth: document.documentElement.scrollWidth,
        map: rect(".map-scroll"),
        cell: rect('[data-cell="0"]'),
        panel: rect(".cell-panel"),
        message: rect("#message"),
        action: rect(".cell-panel .button.primary"),
        fee: rect(".cell-panel .fee-note"),
        h1: getComputedStyle(document.querySelector("h1")!).fontSize,
        tradeHeading: getComputedStyle(
          document.querySelector("#trade-heading")!,
        ).fontSize,
        kickers: document.querySelectorAll(".eyebrow").length,
      };
    });
    results.push(measured);
    await page.screenshot({
      path: `../docs/evidence/revision-${phase}-${viewport.width}.jpg`,
      type: "jpeg",
      quality: 82,
    });
    expect.soft(measured.scrollY).toBe(0);
    expect.soft(measured.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect.soft(measured.cell.bottom).toBeLessThanOrEqual(viewport.height);
    if (viewport.width !== 320) {
      expect.soft(measured.message.bottom).toBeLessThanOrEqual(viewport.height);
      expect.soft(measured.action.bottom).toBeLessThanOrEqual(viewport.height);
      expect.soft(measured.fee.bottom).toBeLessThanOrEqual(viewport.height);
    }
    expect.soft(measured.kickers).toBe(0);
    expect
      .soft(parseFloat(measured.tradeHeading))
      .toBeLessThan(parseFloat(measured.h1));
  }
  await evidence("layout", results);
});

test("revision: share image metadata resolves to a real 1200 by 630 image", async ({
  page,
}) => {
  await new MockChain().install(page, { wallet: false });
  await page.goto("./");
  const metadata = await page
    .locator('meta[property^="og:image"], meta[name^="twitter:"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        key: n.getAttribute("property") ?? n.getAttribute("name"),
        value: n.getAttribute("content"),
      })),
    );
  await evidence("share", metadata);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  const path = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  const dimensions = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src!;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, path);
  expect(dimensions).toEqual({ width: 1200, height: 630 });
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    /honeycomb/i,
  );
});

for (const step of [1, 2, 3]) {
  test(`revision: exact permission and swap review at step ${step}`, async ({
    page,
  }) => {
    if (step !== 1) await page.setViewportSize({ width: 390, height: 844 });
    const chain = new MockChain();
    if (step >= 2) chain.tokenAllowance = 10n ** 18n;
    if (step === 3) {
      chain.routerAllowance = 10n ** 18n;
      chain.expiration = chain.now + 3600;
    }
    await chain.install(page);
    await page.goto("./");
    await connect(page);
    await page.locator("#swap-amount").fill("0.000019999999999999");
    await page
      .getByRole("button", { name: "Get a quote", exact: true })
      .click();
    const review = page.locator(".quote-details > .helper");
    await expect(review).toBeVisible();
    await evidence(`amount-step-${step}`, {
      input: await page.locator("#swap-amount").inputValue(),
      review: await review.textContent(),
      transactions: chain.transactions.length,
    });
    await expect(review).toContainText("exactly 0.000019999999999999 IMD");
    if (step === 3)
      await expect(review).toContainText("at least 0.000039799999999998 COMB");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(chain.transactions).toHaveLength(0);
  });
}

test("revision: connecting preserves an anonymous claim draft without submitting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await expect(page.locator(".read-status")).toContainText("Read at block");
  await page.locator("#message").fill("Hello future human");
  await page
    .locator(".cell-panel")
    .getByRole("button", { name: "Connect wallet" })
    .click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".cell-panel")).not.toContainText(
    "Verified live data is required",
  );
  const result = {
    draft: await page.locator("#message").inputValue(),
    counter: await page.locator("#byte-count").textContent(),
    status: await page.locator(".cell-panel .tx-status").textContent(),
    transactions: chain.transactions.length,
  };
  await evidence("draft", result);
  expect.soft(result.draft).toBe("Hello future human");
  expect.soft(result.counter).toBe("18 / 64 bytes");
  expect.soft(result.status).toBe("");
  expect(result.transactions).toBe(0);
  await expect
    .soft(page.getByRole("button", { name: "Claim cell #0", exact: true }))
    .toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  const claimBounds = await page
    .getByRole("button", { name: "Claim cell #0", exact: true })
    .boundingBox();
  expect(claimBounds!.y + claimBounds!.height).toBeLessThanOrEqual(844);
});

test("revision: cell changes and account replacement still clear private drafts", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await expect(page.locator(".read-status")).toContainText("Read at block");
  await page.locator("#message").fill("For cell zero");
  await page.locator('[data-cell="1"]').click();
  await expect(page.locator("#message")).toHaveValue("");
  await connect(page);
  await page.locator("#message").fill("For this account only");
  chain.account = recipient;
  await page.evaluate(
    (account) => (window as any).__emitWallet("accountsChanged", [account]),
    recipient,
  );
  await expect(page.locator("#message")).toHaveValue("");
  expect(chain.transactions).toHaveLength(0);
});
