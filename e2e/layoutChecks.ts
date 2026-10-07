/** ตรวจ layout ด้วย bounding box (ใช้ทั้ง audit ใน Phase A และเทสต์ใน Phase C) */
import type { Page } from '@playwright/test';

export interface Box {
  sel: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LayoutReport {
  boxes: Box[];
  overlaps: [string, string, number][];
  offscreen: string[];
  hScroll: boolean;
  smallTargets: { sel: string; w: number; h: number; text: string }[];
}

/** overlay ที่ต้องไม่ซ้อนกัน (ยกเว้น #tip/#labels ซึ่งลอยตามเมาส์/ฉาก) */
export const OVERLAYS = ['#panel', '#topbar', '#legend', '#clock', '#attrib', '#locmsg', '#place', '#mini'];

export async function measure(page: Page, overlays = OVERLAYS): Promise<LayoutReport> {
  return page.evaluate((sels) => {
    const W = innerWidth,
      H = innerHeight;
    const vis = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        !(el as HTMLElement).hidden &&
        !el.closest('[inert]') &&
        r.width > 0 &&
        r.height > 0
      );
    };
    const phone = document.documentElement.dataset.layout === 'phone';
    const els = new Map<string, Element>();
    const boxes = sels.flatMap((sel) => {
      const el = document.querySelector(sel);
      if (!el || !vis(el)) return [];
      els.set(sel, el);
      const r = el.getBoundingClientRect();
      // bottom sheet ยาวเลยขอบล่างโดยตั้งใจ (ส่วนที่เลื่อนลงไป) — ใช้เฉพาะส่วนที่อยู่ในจอ
      const h = sel === '#panel' && phone ? Math.min(r.bottom, H) - r.y : r.height;
      return [{ sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(h) }];
    });
    const overlaps: [string, string, number][] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const ea = els.get(a.sel)!,
          eb = els.get(b.sel)!;
        if (ea.contains(eb) || eb.contains(ea)) continue; // การ์ดหมุดอยู่ในแผง (แท็บ "ที่นี่")
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1 && oy > 1) overlaps.push([a.sel, b.sel, Math.round(ox * oy)]);
      }
    const offscreen = boxes
      // ส่วนที่อยู่ในแผง (การ์ดหมุดในแท็บ "ที่นี่") เลื่อนดูในแผงได้ ไม่นับ
      .filter((b) => b.sel === '#panel' || !els.get(b.sel)!.closest('#panel'))
      .filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1)
      .map((b) => b.sel);
    const hScroll = document.documentElement.scrollWidth > W || document.body.scrollWidth > W;
    const smallTargets = [...document.querySelectorAll('button, select, input, summary, [role=tab]')]
      // ป้ายบนแผนที่ (#labels) ขยายพื้นที่กดด้วย ::after จึงไม่นับจากกล่องของตัวป้าย
      .filter((el) => vis(el) && !el.closest('#labels'))
      .filter((el) => {
        // เฉพาะที่อยู่ในจอจริง (ส่วนของ sheet ที่อยู่ใต้ขอบจอไม่นับ)
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        // ช่องติ๊ก/แถบเลื่อนนับพื้นที่กดของ label ที่ครอบอยู่
        const lab = el.closest('label');
        const rr = lab ? lab.getBoundingClientRect() : r;
        return {
          sel: el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.'),
          w: Math.round(Math.max(r.width, rr.width)),
          h: Math.round(Math.max(r.height, rr.height)),
          text: (el.textContent || (el as HTMLInputElement).type || '').trim().slice(0, 24),
        };
      })
      .filter((t) => t.w < 44 || t.h < 44);
    return { boxes, overlaps, offscreen, hScroll, smallTargets };
  }, overlays);
}
