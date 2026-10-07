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
export const OVERLAYS = ['#panel', '#topbar', '#legend', '#clock', '#attrib', '#locmsg', '#place'];

export async function measure(page: Page, overlays = OVERLAYS): Promise<LayoutReport> {
  return page.evaluate((sels) => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        !(el as HTMLElement).hidden &&
        r.width > 0 &&
        r.height > 0
      );
    };
    const boxes = sels.flatMap((sel) => {
      const el = document.querySelector(sel);
      if (!el || !vis(el)) return [];
      const r = el.getBoundingClientRect();
      return [
        { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      ];
    });
    const overlaps: [string, string, number][] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1 && oy > 1) overlaps.push([a.sel, b.sel, Math.round(ox * oy)]);
      }
    const W = innerWidth,
      H = innerHeight;
    const offscreen = boxes
      .filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1)
      .map((b) => b.sel);
    const hScroll = document.documentElement.scrollWidth > W || document.body.scrollWidth > W;
    const smallTargets = [...document.querySelectorAll('button, select, input, summary, [role=tab]')]
      .filter((el) => vis(el))
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
