import { expect, test } from "@playwright/test";

// Brief sample 1 (tests/fixtures/samples.ts › json-nested).
const SAMPLE =
  '{"user":{"id":42,"email":"jan.kowalski@gmail.com","full_name":"Jan Kowalski","phone":"+48 601 234 567","address":"ul. Piękna 12/4, 00-001 Warszawa","pesel":"44051401359"}}';

test("scrubs a pasted sample: db id preserved, email faked to .example", async ({ page }) => {
  await page.goto("/");
  await page.locator("textarea").fill(SAMPLE);

  // The scrubbed pane fills in once the worker (and model) return.
  const output = page.locator("section:has-text('Scrubbed')");
  await expect(output).toContainText('"id":42', { timeout: 45_000 });
  await expect(output).toContainText(/@[a-z0-9-]+\.example/);
  await expect(output).not.toContainText("jan.kowalski@gmail.com");
  await expect(output).not.toContainText("44051401359");
});
