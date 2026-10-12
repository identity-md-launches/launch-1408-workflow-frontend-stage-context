import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
const web = fileURLToPath(new URL("../", import.meta.url));
const evidencePath = fileURLToPath(
  new URL("../../docs/evidence/", import.meta.url),
);
const url = "http://127.0.0.1:4174/preview/";
const preview = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: web,
  env: { ...process.env, COMB_PREVIEW_PORT: "4174" },
  stdio: "pipe",
});
let browser;
const result = {
  checkedAt: new Date().toISOString(),
  rpcMocked: false,
  walletInjected: false,
  transactionsBroadcast: 0,
  consoleErrors: [],
  failedRequests: [],
  rpcResponses: [],
};
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw new Error("Preview failed to start.");
  const installed =
    "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (existsSync(installed) ? installed : undefined),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.on("pageerror", (e) => result.consoleErrors.push(e.message));
  page.on("requestfailed", (r) =>
    result.failedRequests.push({
      url: r.url(),
      failure: r.failure()?.errorText,
    }),
  );
  page.on("response", (r) => {
    if (r.url().startsWith("https:"))
      result.rpcResponses.push({ url: r.url(), status: r.status() });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const s = document.querySelector(".read-status")?.textContent ?? "";
      return /Read at block|Retry live data/.test(s);
    },
    {},
    { timeout: 45000 },
  );
  await page.evaluate(() => document.fonts.ready);
  result.readStatus = await page.locator(".read-status").innerText();
  result.claimed = await page.locator(".claimed-stat strong").innerText();
  result.cellCount = await page.locator(".hex-cell").count();
  result.firstCell = await page
    .locator('[data-cell="0"]')
    .getAttribute("aria-label");
  result.connectedControl = await page.locator(".connect-button").innerText();
  result.runtimeManifestLoaded = !!(await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .find((x) => x.name.endsWith("/imd-deployment.json")),
  ));
  result.verified =
    result.readStatus.includes("Read at block") &&
    result.cellCount === 1024 &&
    result.consoleErrors.length === 0;
  await page.screenshot({
    path: `${evidencePath}/live-desktop.jpg`,
    fullPage: true,
    type: "jpeg",
    quality: 82,
  });
  if (!result.verified) process.exitCode = 1;
} catch (e) {
  result.error = e.message;
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await writeFile(
    `${evidencePath}/live-browser.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
}
