/**
 * ถ่ายภาพหน้าจอทุก viewport × light/dark × (ภาพรวม / สมจริง / การ์ดหมุด)
 *   SHOTS=reports/mvp7-before npx playwright test e2e/screens.spec.ts
 * ไม่ตั้ง SHOTS = ข้าม (ไม่รันใน test:e2e ปกติ)
 */
import { test, type Page } from '@playwright/test';
import { PIN, VIEWPORTS } from './viewports';

const OUT = process.env.SHOTS;
const ONLY = process.env.SHOTS_ONLY; // เช่น phone-375 (กรองตามชื่อ)

async function waitIdle(page: Page) {
  // รอให้ผลจำลองมาถึงและข้อความโหลดหายไป
  await page.waitForFunction(() => !!window.__SIM?.(), null, { timeout: 120_000 });
  await page.waitForFunction(
    () => !/กำลังโหลด|กำลังสร้าง/.test(document.getElementById('clock')?.textContent ?? ''),
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(2500);
}

for (const vp of VIEWPORTS) {
  if (ONLY && !vp.name.includes(ONLY)) continue;
  for (const scheme of ['light', 'dark'] as const) {
    test(`shots ${vp.name} ${scheme}`, async ({ browser }) => {
      test.skip(!OUT, 'ตั้ง SHOTS=<โฟลเดอร์> เพื่อถ่ายภาพ');
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.touch && vp.width < 1000,
        hasTouch: vp.touch,
        colorScheme: scheme,
        geolocation: PIN,
        permissions: ['geolocation'],
      });
      const page = await ctx.newPage();
      page.on('crash', () => console.log(`[${vp.name} ${scheme}] page crashed`));
      page.on('pageerror', (e) => console.log(`[${vp.name} ${scheme}] ${e.message}`));
      page.on(
        'framenavigated',
        (f) => f === page.mainFrame() && console.log(`[${vp.name} ${scheme}] navigated ${f.url()}`),
      );
      const shot = (s: string) =>
        page.screenshot({ path: `${OUT}/${vp.name}-${scheme}-${s}.jpg`, quality: 72 });
      await page.goto('/?adaptive=0');
      await waitIdle(page);
      await shot('1-overview');
      await page.evaluate(() => window.__mode!('study').then(() => window.__quality!('real')));
      await waitIdle(page);
      // ปิดการ์ดชวนก่อน เพื่อดูสภาพฉากสมจริงเปล่า ๆ แล้วค่อยถ่ายการ์ดชวนแยก
      await shot('2-study-prompt');
      await page.evaluate(() =>
        (document.querySelector('#place .later') as HTMLButtonElement | null)?.click(),
      );
      await shot('3-study-real');
      await page.evaluate(() => (document.getElementById('btn-locate') as HTMLButtonElement).click());
      await page.waitForFunction(() => !!document.querySelector('#place table'), null, { timeout: 120_000 });
      await page.waitForTimeout(4000);
      await shot('4-pin-card');
      await ctx.close();
    });
  }
}
