/**
 * Phase A: วัด layout ปัจจุบัน (bounding box, ซ้อนทับ, หลุดขอบ, ขนาดปุ่ม) → JSON
 *   AUDIT=reports/mvp7-audit.json npx playwright test e2e/audit.spec.ts
 */
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { measure as measureNow } from './layoutChecks';
import type { Page } from '@playwright/test';

/** layout.ts วัดใหม่ในเฟรมถัดไป — รอให้นิ่งก่อนวัด */
const measure = async (page: Page) => (await page.waitForTimeout(500), measureNow(page));
import { PIN, VIEWPORTS } from './viewports';

const OUT = process.env.AUDIT;
test('audit layout', async ({ browser }) => {
  test.skip(!OUT, 'ตั้ง AUDIT=<ไฟล์ json>');
  test.setTimeout(900_000);
  const all: Record<string, unknown> = {};
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.touch && vp.width < 1000,
      hasTouch: vp.touch,
      geolocation: PIN,
      permissions: ['geolocation'],
    });
    const page = await ctx.newPage();
    await page.goto('/?adaptive=0');
    await page.waitForFunction(() => !!window.__SIM?.(), null, { timeout: 120_000 });
    const overview = await measure(page);
    await page.evaluate(() => window.__mode!('study'));
    await page.waitForFunction(() => !!window.__SIM?.(), null, { timeout: 120_000 });
    const prompt = await measure(page);
    await page.evaluate(() => (document.querySelector('#place .later') as HTMLButtonElement | null)?.click());
    await page.evaluate(() => (document.getElementById('btn-locate') as HTMLButtonElement).click());
    await page.waitForFunction(() => !!document.querySelector('#place table'), null, { timeout: 120_000 });
    const pin = await measure(page);
    all[vp.name] = { overview, prompt, pin };
    await ctx.close();
  }
  writeFileSync(OUT!, JSON.stringify(all, null, 1));
});
