import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbiParameters,
  toHex,
} from "viem";
import { routerAbi, poolTuple } from "../src/config";
import {
  MockChain,
  connect,
  manifest,
  visitor,
  other,
  recipient,
  tokenAbi,
  wall,
  token,
} from "./mock-chain";

test("production subpath loads all 1,024 real controls; no wallet has an actionable recovery", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page, { wallet: false });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator(".hex-cell")).toHaveCount(1024);
  await expect(
    page.getByText(`Read at block ${chain.block.toLocaleString("en-US")}`),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(page.getByText("No browser wallet found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
  expect(chain.transactions).toHaveLength(0);
});

test("claim validates UTF-8 bytes, refreshes ownership and adds Keeper glow", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  const claim = page.getByRole("button", {
    name: "Claim cell #0",
    exact: true,
  });
  await expect(claim).toBeDisabled();
  await page.getByLabel("Leave your message").fill("🐝".repeat(17));
  await expect(page.getByText("68 / 64 bytes")).toBeVisible();
  await expect(claim).toBeDisabled();
  await page.getByLabel("Leave your message").fill("Hello, future human.");
  await expect(claim).toBeEnabled();
  await claim.click();
  await expect(
    page.getByText("Claim cell confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.cells.get(0)?.message).toBe("Hello, future human.");
  await expect(page.locator('[data-cell="0"]')).toHaveClass(/keeper/);
  await expect(
    page.getByRole("button", { name: "Carve new message" }),
  ).toBeDisabled();
  await expect(page.getByText("Next carve in")).toBeVisible();
  await page.locator('[data-cell="1"]').click();
  await expect(page.getByText("You already hold cell #0.")).toBeVisible();
  expect(chain.transactions).toHaveLength(1);
});

test("carve after cooldown and release require ownership and explicit confirmation", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.cells.set(0, {
    owner: visitor,
    message: "Earlier words",
    next: chain.now - 1,
  });
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("Write a new message").fill("Words can change.");
  await page.getByRole("button", { name: "Carve new message" }).click();
  await expect(
    page.getByText("Carve message confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.cells.get(0)?.message).toBe("Words can change.");
  await page.getByRole("button", { name: "Release this cell" }).click();
  await expect(
    page.getByRole("dialog", { name: "Release cell #0?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep my cell" }).click();
  expect(chain.transactions).toHaveLength(1);
  await page.getByRole("button", { name: "Release this cell" }).click();
  await page.getByRole("button", { name: "Release cell", exact: true }).click();
  await expect(
    page.getByText("Release cell confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.cells.has(0)).toBe(false);
  await expect(page.getByLabel("Leave your message")).toBeVisible();
});

test("unknown wallet chain uses supplied add-chain parameters and a single switch control", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.chainId = 123;
  chain.unknownChain = true;
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  const control = page.getByRole("button", {
    name: "Switch to Ethereum",
    exact: true,
  });
  await expect(control).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Claim cell #0", exact: true }),
  ).toHaveCount(0);
  await control.click();
  await expect(control).toHaveCount(0);
  const methods = chain.walletCalls.map((r) => r.method);
  expect(
    methods.filter((m) => m === "wallet_switchEthereumChain"),
  ).toHaveLength(2);
  expect(
    chain.walletCalls.find((r) => r.method === "wallet_addEthereumChain")
      ?.params,
  ).toEqual([manifest.walletAddChain]);
  expect(chain.transactions).toHaveLength(0);
});

test("connection and network-switch rejection are recoverable", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.rejectConnect = true;
  chain.chainId = 123;
  await chain.install(page);
  await page.goto("./");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await expect(
    page.getByText("Request declined in your wallet.", { exact: false }),
  ).toBeVisible();
  chain.rejectConnect = false;
  await page
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  chain.rejectSwitch = true;
  await page
    .getByRole("button", { name: "Switch to Ethereum", exact: true })
    .click();
  await expect(page.locator(".network-banner .error")).toContainText(
    "Request declined in your wallet.",
  );
  chain.rejectSwitch = false;
  await page
    .getByRole("button", { name: "Switch to Ethereum", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Switch to Ethereum", exact: true }),
  ).toHaveCount(0);
});

test("transaction rejection unlocks the control; simulation failure never requests a signature", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("Leave your message").fill("A recoverable request");
  chain.rejectTransaction = true;
  const claim = page.getByRole("button", {
    name: "Claim cell #0",
    exact: true,
  });
  await claim.click();
  await expect(
    page.getByText("Request declined in your wallet.", { exact: false }),
  ).toBeVisible();
  await expect(claim).toBeEnabled();
  chain.rejectTransaction = false;
  chain.cells.set(0, {
    owner: other,
    message: "A racing claim",
    next: chain.now + 86400,
  });
  const before = chain.walletCalls.filter(
    (r) => r.method === "eth_sendTransaction",
  ).length;
  await claim.click();
  await expect(
    page.getByText("Someone claimed this cell first.", { exact: false }),
  ).toBeVisible();
  expect(
    chain.walletCalls.filter((r) => r.method === "eth_sendTransaction"),
  ).toHaveLength(before);
  expect(chain.transactions).toHaveLength(0);
});

test("pending transactions block duplicate submission until receipt confirmation", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.holdReceipts = true;
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("Leave your message").fill("Just once");
  await page
    .getByRole("button", { name: "Claim cell #0", exact: true })
    .click();
  await expect(
    page.getByText("Transaction sent. Waiting for onchain confirmation…"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Claiming…", exact: true }),
  ).toBeDisabled();
  expect(chain.transactions).toHaveLength(1);
  chain.holdReceipts = false;
  await expect(page.getByText("Claim cell confirmed on Ethereum.")).toBeVisible(
    { timeout: 30000 },
  );
  expect(chain.transactions).toHaveLength(1);
});

test("buy IMD → COMB performs exact two approvals and simulates attested router payload", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay", { exact: true }).fill("10");
  await page.getByLabel("Slippage tolerance").fill("1");
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await expect(page.getByText("19.8 COMB", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve IMD", exact: true }).click();
  await expect(
    page.getByText("Approval confirmed. Get a fresh quote to continue."),
  ).toBeVisible();
  expect(chain.transactions[0].to.toLowerCase()).toBe(
    manifest.network.pairToken.address,
  );
  let decoded = decodeFunctionData({
    abi: tokenAbi,
    data: chain.transactions[0].data,
  });
  expect(decoded.functionName).toBe("approve");
  expect((decoded.args as any[])[0].toLowerCase()).toBe(
    manifest.network.uniswapV4.permit2,
  );
  expect((decoded.args as any[])[1]).toBe(10n * 10n ** 18n);
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await page.getByRole("button", { name: "Allow router spending" }).click();
  await expect(
    page.getByText("Allow router to spend IMD confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.transactions[1].to.toLowerCase()).toBe(
    manifest.network.uniswapV4.permit2,
  );
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await page.getByRole("button", { name: "Confirm swap", exact: true }).click();
  await expect(
    page.getByText("Swap IMD for COMB confirmed on Ethereum."),
  ).toBeVisible();
  const sent = chain.transactions[2];
  expect(sent.to.toLowerCase()).toBe(
    manifest.network.uniswapV4.universalRouter,
  );
  expect(BigInt(sent.value ?? "0x0")).toBe(0n);
  const exec = decodeFunctionData({ abi: routerAbi, data: sent.data });
  expect(exec.args[0]).toBe("0x10");
  const [actions, params] = decodeAbiParameters(
    parseAbiParameters("bytes,bytes[]"),
    exec.args[1][0],
  );
  expect(actions).toBe("0x060c0f");
  const [swap] = decodeAbiParameters(
    parseAbiParameters(
      `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
    ),
    params[0],
  ) as any;
  expect(swap.zeroForOne).toBe(false);
  expect(swap.poolKey.hooks.toLowerCase()).toBe(manifest.poolKey.hooks);
  expect(swap.amountOutMinimum).toBe(198n * 10n ** 17n);
  expect(swap.amountIn).toBe(10n * 10n ** 18n);
  expect(
    chain.requests.filter(
      (r) =>
        r.method === "eth_call" &&
        r.params?.[0].to.toLowerCase() ===
          manifest.network.uniswapV4.universalRouter,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    chain.transactions.some(
      (t) => t.to.toLowerCase() === manifest.network.uniswapV4.quoter,
    ),
  ).toBe(false);
});

test("sell uses COMB approval, invalidates stale quotes and never sends after a swap simulation revert", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.tokenAllowance = 100n * 10n ** 18n;
  chain.routerAllowance = chain.tokenAllowance;
  chain.expiration = chain.now + 3600;
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByRole("button", { name: "Sell COMB", exact: true }).click();
  await page.getByLabel("You pay", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await expect(page.getByText("3.98 IMD", { exact: true })).toBeVisible();
  await page.getByLabel("You pay", { exact: true }).fill("3");
  await expect(
    page.getByRole("button", { name: "Confirm swap", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  chain.revertSimulation = true;
  await page.getByRole("button", { name: "Confirm swap", exact: true }).click();
  await expect(
    page.getByText("Simulation failed.", { exact: false }),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(0);
  chain.revertSimulation = false;
  await page.getByRole("button", { name: "Confirm swap", exact: true }).click();
  await expect(
    page.getByText("Swap COMB for IMD confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(1);
});

test("code verification and initialization gate swaps; zero current-tick liquidity can still quote", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.codeMissing = true;
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("Leave your message").fill("Cannot sign yet");
  await expect(
    page.getByRole("button", { name: "Claim cell #0", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Deployed contract code could not be verified.", {
      exact: false,
    }),
  ).toBeVisible();
  chain.codeMissing = false;
  chain.liquidity = 0n;
  chain.sqrtPrice = 0n;
  await page.getByRole("button", { name: "Retry live data" }).click();
  await page.getByRole("button", { name: "Retry pool read" }).click();
  await expect(
    page.getByRole("button", { name: "Claim cell #0", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("You pay", { exact: true }).fill("1");
  await expect(
    page.getByRole("button", { name: "Get a quote", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This pool is not initialized.", { exact: false }),
  ).toBeVisible();
  chain.sqrtPrice = 2n ** 96n;
  await page.getByRole("button", { name: "Retry pool read" }).click();
  await expect(
    page.getByRole("button", { name: "Get a quote", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve IMD", exact: true }),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(0);
});

test("keyboard navigation, jump to last cell and safe rendering of onchain strings", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.cells.set(1023, {
    owner: other,
    message: "<img src=x onerror=alert(1)>",
    next: chain.now,
  });
  await chain.install(page);
  await page.goto("./");
  await expect(page.locator(".hex-cell")).toHaveCount(1024);
  await page.locator('[data-cell="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-cell="1"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-cell="33"]')).toBeFocused();
  await page.getByLabel("Find a cell").fill("1023");
  await page.getByRole("button", { name: "Go to cell" }).click();
  await expect(page.locator('[data-cell="1023"]')).toBeFocused();
  await expect(page.locator(".cell-panel blockquote")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  expect(await page.locator(".cell-panel img").count()).toBe(0);
});

test("account and network events invalidate permissions and quoted state", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.cells.set(0, {
    owner: visitor,
    message: "A wallet-bound cell",
    next: chain.now - 1,
  });
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Release this cell" }),
  ).toBeVisible();
  chain.account = recipient;
  await page.evaluate(
    (address) => (window as any).__emitWallet("accountsChanged", [address]),
    recipient,
  );
  await expect(
    page.getByRole("button", { name: "Release this cell" }),
  ).toHaveCount(0);
  chain.chainId = 123;
  await page.evaluate(() =>
    (window as any).__emitWallet("chainChanged", "0x7b"),
  );
  await expect(
    page.getByRole("button", { name: "Switch to Ethereum", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).__emitWallet("accountsChanged", []),
  );
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }).first(),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(0);
});

test("token transfer, allowance and transferFrom have reviewed addresses and live balance checks", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.locator(".token-tools>summary").click();
  await page
    .getByLabel("Recipient address", { exact: true })
    .fill("not-an-address");
  await page.getByLabel("Amount in COMB").fill("1");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await expect(
    page.getByText("Enter a valid, nonzero Ethereum address."),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(0);
  await page.getByLabel("Recipient address", { exact: true }).fill(recipient);
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(recipient);
  await page
    .getByRole("button", { name: "Confirm transfer", exact: true })
    .click();
  await expect(
    page.getByText("Transfer COMB confirmed on Ethereum."),
  ).toBeVisible();
  await page.getByLabel("Action", { exact: true }).selectOption("approve");
  await page.getByLabel("Spender address").fill(recipient);
  await page.getByLabel("Amount in COMB").fill("0");
  await page
    .getByRole("button", { name: "Review allowance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm allowance", exact: true })
    .click();
  await expect(
    page.getByText("Set COMB allowance confirmed on Ethereum."),
  ).toBeVisible();
  await page.getByLabel("Action", { exact: true }).selectOption("transferFrom");
  await page.getByLabel("Source wallet address").fill(other);
  await page.getByLabel("Recipient address", { exact: true }).fill(recipient);
  await page.getByLabel("Amount in COMB").fill("1");
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await expect(
    page.getByText(
      "This wallet is not approved to transfer that much COMB from the source address.",
    ),
  ).toBeVisible();
  chain.tokenAllowance = 10n ** 18n;
  await page
    .getByRole("button", { name: "Review transfer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm transfer", exact: true })
    .click();
  await expect(
    page.getByText("Transfer COMB confirmed on Ethereum."),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(3);
});

test("tampered implementation ABI prevents application startup", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.route("**/abi/CombWall.json", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto("./");
  await expect(
    page.getByText("CombWall ABI verification failed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toHaveCount(0);
});

test("desktop/mobile rendered export: accessibility, fonts, contrast and overflow evidence", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  const errors: string[] = [];
  const resourceFailures: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) resourceFailures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("./");
  await expect(
    page.getByText(`Read at block ${chain.block.toLocaleString("en-US")}`),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await mkdir("../docs/evidence", { recursive: true });
  test.setTimeout(90000);
  const desktopAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const layouts = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const result = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      fonts:
        document.fonts.check('400 16px "DM Sans"') &&
        document.fonts.check('400 16px "Space Grotesk"'),
    }));
    layouts.push(result);
    expect(result.scrollWidth).toBeLessThanOrEqual(width);
    expect(result.fonts).toBe(true);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `../docs/evidence/${width === 1440 ? "desktop" : "mobile"}.jpg`,
        fullPage: true,
        type: "jpeg",
        quality: 82,
      });
  }
  const mobileAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const contrast = await page.evaluate(() => {
    const luminance = (rgb: string) => {
      const c = rgb
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    return [
      "body",
      ".cell-panel",
      ".button.primary",
      ".trade-card",
      ".helper",
    ].map((selector) => {
      const el = document.querySelector(selector)!;
      const fg = getComputedStyle(el).color;
      let parent: Element | null = el;
      let bg = "";
      while (parent) {
        bg = getComputedStyle(parent).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break;
        parent = parent.parentElement;
      }
      const a = luminance(fg),
        b = luminance(bg);
      return {
        selector,
        foreground: fg,
        background: bg,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByLabel("Grid zoom")).toHaveText("125%");
  await writeFile(
    "../docs/evidence/rendered-review.json",
    JSON.stringify(
      {
        layouts,
        contrast,
        errors,
        resourceFailures,
        desktopViolations: desktopAudit.violations,
        mobileViolations: mobileAudit.violations,
        note: "Mocked RPC data; these screenshots do not represent live onchain occupancy.",
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(resourceFailures).toEqual([]);
  expect(desktopAudit.violations).toEqual([]);
  expect(mobileAudit.violations).toEqual([]);
});

test("public RPC failover and connected-wallet fallback both read the live interface", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.route(new URL(manifest.network.rpcUrls[0]).href, (route) =>
    route.abort("failed"),
  );
  await page.goto("./");
  await expect(
    page.getByText(`Read at block ${chain.block.toLocaleString("en-US")}`),
  ).toBeVisible();
  expect(chain.requests.some((r) => r.method === "eth_call")).toBe(true);
  await page.route(new URL(manifest.network.rpcUrls[1]).href, (route) =>
    route.abort("failed"),
  );
  await connect(page);
  await page.getByLabel("Leave your message").fill("Fallback still verifies");
  await expect(
    page.getByRole("button", { name: "Claim cell #0", exact: true }),
  ).toBeEnabled();
  expect(chain.walletCalls.some((r) => r.method === "eth_getCode")).toBe(true);
  expect(chain.transactions).toHaveLength(0);
});

test("expired quotes and expired Permit2 grants require a fresh explicit step", async ({
  page,
}) => {
  const chain = new MockChain();
  chain.tokenAllowance = 100n * 10n ** 18n;
  chain.routerAllowance = 100n * 10n ** 18n;
  chain.expiration = chain.now - 1;
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Get a quote", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Allow router spending" }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date(Date.now() + 61000));
  await expect(
    page.getByRole("button", { name: "Refresh expired quote" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow router spending" }),
  ).toHaveCount(0);
  expect(chain.transactions).toHaveLength(0);
});

test("the signer rechecks the account even if the wallet fails to emit an account event", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("Leave your message").fill("This belongs to my wallet");
  await expect(
    page.getByRole("button", { name: "Claim cell #0", exact: true }),
  ).toBeEnabled();
  chain.account = recipient;
  await page
    .getByRole("button", { name: "Claim cell #0", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your wallet account or network changed. Review the action again.",
    ),
  ).toBeVisible();
  expect(chain.transactions).toHaveLength(0);
});

test("200% text enlargement, RTL layout, keyboard dialog focus and forced colors remain usable", async ({
  page,
}) => {
  const chain = new MockChain();
  await chain.install(page);
  await page.goto("./");
  await expect(page.locator(".hex-cell")).toHaveCount(1024);
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const enlarged = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(enlarged.scrollWidth).toBeLessThanOrEqual(enlarged.width);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.documentElement.dir = "rtl";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const rtl = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(rtl.scrollWidth).toBeLessThanOrEqual(rtl.width);
  await page.evaluate(() => (document.documentElement.dir = "ltr"));
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("dialog[open]")!.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }).first(),
  ).toBeFocused();
  await writeFile(
    "../docs/evidence/adaptivity.json",
    JSON.stringify(
      {
        textEnlargement200Percent: enlarged,
        rtlMobile: rtl,
        dialogFocusContainment: true,
        dialogFocusRestored: true,
        forcedColorsInteraction: true,
        nativeBrowserZoom:
          "Not verified; text enlargement is a separate check.",
      },
      null,
      2,
    ),
  );
});
