import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";

// Run manually after editing the artwork; normal builds use the committed PNG.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(new URL("../share-card.html", import.meta.url).href);
  await page.evaluate(() => document.fonts.ready);
  if (
    !(await page.evaluate(
      () =>
        document.fonts.check('400 60px "Space Grotesk"') &&
        document.fonts.check('400 21px "DM Sans"'),
    ))
  )
    throw new Error("Share-card fonts failed to load");
  await page.screenshot({
    path: fileURLToPath(new URL("../public/share-card.png", import.meta.url)),
  });
  console.log("Rendered local 1200 × 630 share-card.png");
} finally {
  await browser.close();
}
