/**
 * MVP 7: เทสต์ layout ทุก viewport (npm run test:e2e)
 * - overlay ไม่ซ้อนทับ, ไม่หลุดขอบจอ, ไม่มี horizontal scroll, ปุ่มบนจอสัมผัส ≥ 44 px
 * - bottom sheet 3 ระดับ, หมุนจอ, เปิด/ปิดการ์ดหมุด, สลับโหมด, แตะดูข้อมูลจุด, ลาก sheet แล้วแผนที่ไม่หมุน
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { measure, type LayoutReport } from './layoutChecks';
import { PIN, VIEWPORTS, type Viewport } from './viewports';

async function open(browser: Browser, vp: Viewport, scheme: 'light' | 'dark' = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.touch && vp.width < 1000,
    hasTouch: vp.touch,
    colorScheme: scheme,
    geolocation: PIN,
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?adaptive=0');
  await waitSim(page);
  return { ctx, page, errors };
}
const waitSim = async (page: Page) => {
  await page.waitForFunction(() => !!window.__SIM?.() && !!document.documentElement.dataset.layout, null, {
    timeout: 120_000,
  });
  await settle(page);
};
const layoutOf = (page: Page) => page.evaluate(() => document.documentElement.dataset.layout);
/** รอให้ transition ของ sheet/แผง และแอนิเมชันเปิดเมนู/popover จบ แล้ววัด (ข้ามแอนิเมชันวนซ้ำไม่รู้จบ) */
const settle = async (page: Page) => {
  await page.waitForTimeout(400);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
};

function expectClean(r: LayoutReport, label: string, touch: boolean) {
  expect(r.overlaps, `${label}: overlay ซ้อนกัน`).toEqual([]);
  expect(r.offscreen, `${label}: หลุดขอบจอ`).toEqual([]);
  expect(r.hScroll, `${label}: มี horizontal scroll`).toBe(false);
  if (touch) expect(r.smallTargets, `${label}: ปุ่มเล็กกว่า 44 px`).toEqual([]);
}
const EXPECTED: Record<string, string> = {
  'phone-375x667': 'phone',
  'phone-393x852': 'phone',
  'phone-land-852x393': 'land',
  'tablet-820x1180': 'tablet',
  'laptop-1280x800': 'desktop',
  'desktop-1920x1080': 'desktop',
};

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test('layout: ภาพรวม, เมนู, legend, พื้นที่ศึกษา + การ์ดหมุด', async ({ browser }) => {
      const { ctx, page, errors } = await open(browser, vp);
      expect(await layoutOf(page)).toBe(EXPECTED[vp.name]);
      await settle(page);
      expectClean(await measure(page), 'ภาพรวม', vp.touch);
      // คำเตือนสั้นมองเห็นในจอเสมอ
      const disc = page.locator('.disc-s:visible').first();
      await expect(disc).toBeInViewport();

      const kind = await layoutOf(page);
      if (kind !== 'desktop') {
        await page.click('.tb-more');
        await expect(page.locator('#tb-menu')).toBeVisible();
        await settle(page);
        const m = await measure(page, ['#tb-menu']);
        expect(m.offscreen, 'เมนูหลุดขอบ').toEqual([]);
        if (vp.touch) expect(m.smallTargets).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.locator('#tb-menu')).toBeHidden();
        await page.click('.lg-toggle');
        await expect(page.locator('.lg-body')).toBeVisible();
        await settle(page);
        expect((await measure(page, ['#legend'])).offscreen, 'legend หลุดขอบ').toEqual([]);
        await page.click('.lg-toggle');
      }

      // พื้นที่ศึกษา → การ์ดชวน → ใช้ตำแหน่งของฉัน → การ์ดหมุด
      await page.evaluate(() => window.__mode!('study'));
      await waitSim(page);
      await expect(page.locator('#place .gps')).toBeVisible();
      await settle(page);
      expectClean(await measure(page), 'การ์ดชวน', vp.touch);
      await page.click('#place .gps');
      await page.waitForFunction(() => !!document.querySelector('#place table'), null, { timeout: 120_000 });
      await settle(page);
      if (kind !== 'desktop') {
        // การ์ดอยู่ในแท็บ "ที่นี่" ของแผง และเปิดให้อัตโนมัติ
        await expect(page.locator('#tab-here')).toHaveAttribute('aria-selected', 'true');
        expect(await page.evaluate(() => !!document.querySelector('#tp-here #place'))).toBe(true);
      }
      expectClean(await measure(page), 'การ์ดหมุด', vp.touch);
      // ปิดการ์ด → แท็บ "ที่นี่" หาย
      await page.click('#place .x');
      await expect(page.locator('#place')).toBeHidden();
      if (kind !== 'desktop') await expect(page.locator('#tab-here')).toBeHidden();
      // กลับภาพรวม
      await page.evaluate(() => window.__mode!('overview'));
      await waitSim(page);
      await settle(page);
      expectClean(await measure(page), 'กลับภาพรวม', vp.touch);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  });
}

test.describe('bottom sheet (มือถือแนวตั้ง)', () => {
  const vp = VIEWPORTS[1];
  test('3 ระดับด้วยปุ่ม + pill อยู่เหนือ sheet', async ({ browser }) => {
    const { ctx, page } = await open(browser, vp);
    const sheet = () => page.evaluate(() => document.documentElement.dataset.sheet);
    const tops = () =>
      page.evaluate(() => {
        const p = document.getElementById('panel')!.getBoundingClientRect();
        const c = document.getElementById('clock')!.getBoundingClientRect();
        return { panel: p.top, clock: c.bottom };
      });
    expect(await sheet()).toBe('peek');
    let peekTop = 0;
    for (const lvl of ['peek', 'half', 'full'] as const) {
      if (lvl !== 'peek') await page.click('.p-up');
      await settle(page);
      expect(await sheet()).toBe(lvl);
      const t = await tops();
      if (lvl === 'peek') peekTop = t.panel;
      else expect(t.panel).toBeLessThan(peekTop);
      if (lvl !== 'full') expect(t.clock, `pill อยู่เหนือ sheet (${lvl})`).toBeLessThanOrEqual(t.panel);
      expectClean(await measure(page), `sheet ${lvl}`, true);
    }
    await expect(page.locator('.p-up')).toBeDisabled();
    await page.click('.p-down');
    await page.click('.p-down');
    await settle(page);
    expect(await sheet()).toBe('peek');
    await ctx.close();
  });

  test('ลาก sheet แล้ว snap และแผนที่ไม่หมุนตาม', async ({ browser }) => {
    const { ctx, page } = await open(browser, vp);
    await page.waitForTimeout(1500); // ให้กล้องหยุดนิ่ง (damping)
    const cam = () =>
      page.evaluate(() => {
        const c = (
          window as unknown as { __three: { camera: { position: { x: number; y: number; z: number } } } }
        ).__three.camera.position;
        return [c.x, c.y, c.z];
      });
    const before = await cam();
    const grip = await page.locator('.p-head').boundingBox();
    const x = grip!.x + grip!.width / 2,
      y = grip!.y + 20;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(x, y - k * 30);
    await page.mouse.up();
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.dataset.sheet)).not.toBe('peek');
    const after = await cam();
    for (let k = 0; k < 3; k++) expect(Math.abs(after[k] - before[k])).toBeLessThan(1e-3);
    await ctx.close();
  });

  test('แตะแผนที่ 1 ครั้ง = ดูข้อมูลจุด, แตะใหม่/ลาก = ปิด', async ({ browser }) => {
    const { ctx, page } = await open(browser, vp);
    await page.touchscreen.tap(vp.width / 2, 300);
    await expect(page.locator('#tip')).toBeVisible();
    const box = await page.locator('#tip').boundingBox();
    const top = await page.evaluate(() => document.getElementById('panel')!.getBoundingClientRect().top);
    expect(box!.y + box!.height).toBeLessThanOrEqual(top); // ไม่อยู่ใต้ sheet
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    await ctx.close();
  });

  test('หมุนจอ: แนวตั้ง ↔ แนวนอน', async ({ browser }) => {
    const { ctx, page } = await open(browser, vp);
    await page.click('.p-up');
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await settle(page);
    expect(await layoutOf(page)).toBe('land');
    expectClean(await measure(page), 'แนวนอน', true);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await settle(page);
    expect(await layoutOf(page)).toBe('phone');
    expectClean(await measure(page), 'กลับแนวตั้ง', true);
    await ctx.close();
  });
});

test.describe('แผงข้าง', () => {
  for (const vp of [VIEWPORTS[2], VIEWPORTS[3], VIEWPORTS[4]])
    test(`พับ/เปิดแผง ${vp.name}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, vp);
      await page.click('.p-collapse');
      await settle(page);
      await expect(page.locator('#mini')).toBeVisible();
      await expect(page.locator('#mini .disc-s')).toBeInViewport();
      expectClean(await measure(page), 'พับแผง', vp.touch);
      await page.click('.p-expand');
      await settle(page);
      await expect(page.locator('#mini')).toBeHidden();
      await expect(page.locator('#panel')).toBeInViewport();
      await ctx.close();
    });
});

test('เดสก์ท็อป: Space ค้าง = เลื่อนแผนที่ (เฉพาะเมาส์)', async ({ browser }) => {
  const { ctx, page } = await open(browser, VIEWPORTS[4]);
  await page.mouse.move(800, 400);
  await page.keyboard.down('Space');
  await expect(page.locator('#stage canvas')).toHaveCSS('cursor', 'grab');
  await page.keyboard.up('Space');
  await ctx.close();
});

test('ตัวอักษรไทยไม่มี letter-spacing และ input ≥ 16 px', async ({ browser }) => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[5]]) {
    const { ctx, page } = await open(browser, vp);
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => /[฀-๿]/.test(el.textContent ?? ''))
        .filter((el) => !['normal', '0px'].includes(getComputedStyle(el).letterSpacing))
        .map((el) => el.tagName + '.' + el.className),
    );
    expect(bad).toEqual([]);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('input, select')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => el.id),
    );
    expect(small).toEqual([]);
    await ctx.close();
  }
});
