/**
 * Layout manager (MVP 7): ตัดสิน breakpoint และจัด region ของ overlay ทั้งหมดจากที่เดียว
 * ส่งค่าเป็น CSS variables ให้ทุกส่วนอ้างอิง (ไม่มี offset ตายตัวซ้อนกัน):
 *   --topbar-h   ขอบล่างของแถบบน (px, รวม safe area)
 *   --sheet-h    ความสูงที่มองเห็นของ bottom sheet (มือถือแนวตั้ง; อื่น ๆ = 0)
 *   --sheet-full / --sheet-hidden  ความสูงเต็มของ sheet / ส่วนที่อยู่ใต้ขอบจอ (เผื่อ padding ให้เลื่อนถึงท้าย)
 *   --bar-l      ขอบซ้ายของพื้นที่แผนที่สำหรับแถบบน (แผงข้างเปิด = ขอบขวาของแผง)
 *   --occ-l / --occ-r  ส่วนที่ถูกบังซ้าย/ขวาในแถวล่าง (แผง/การ์ดย่อ, legend) — pill/เครดิตอยู่กึ่งกลางช่องที่เหลือ
 *   --legend-h   ความสูง legend (เดสก์ท็อป: การ์ดหมุดวางเหนือ legend)
 * และ data-layout (phone | land | tablet | desktop), data-sheet (peek | half | full), data-panel (open | closed) บน <html>
 */
import { $ } from './dom';

export type LayoutKind = 'phone' | 'land' | 'tablet' | 'desktop';
export type SheetLevel = 'peek' | 'half' | 'full';
const LEVELS: SheetLevel[] = ['peek', 'half', 'full'];
const GAP = 8;

/** breakpoint จากขนาด viewport (CSS px) */
export function layoutFor(w: number, h: number): LayoutKind {
  if (h < 500 && w > h) return 'land';
  if (w < 600) return 'phone';
  if (w <= 1024) return 'tablet';
  return 'desktop';
}

/** ระดับ sheet ที่ใกล้ความสูง h ที่สุด (h = ความสูงที่จะหยุด หลังคิดความเร็วแล้ว) */
export function nearestLevel(h: number, heights: Record<SheetLevel, number>): SheetLevel {
  let best: SheetLevel = 'peek';
  for (const l of LEVELS) if (Math.abs(heights[l] - h) < Math.abs(heights[best] - h)) best = l;
  return best;
}

export interface LayoutPanelApi {
  setHereTab(show: boolean, select: boolean): void;
}

export function createLayout(panelApi: LayoutPanelApi, onKind?: (k: LayoutKind) => void) {
  const root = document.documentElement;
  const panel = $('panel'),
    topbar = $('topbar'),
    place = $('place'),
    legend = $('legend'),
    attrib = $('attrib'),
    mini = $('mini'),
    menu = $('tb-menu'),
    hereBox = $('tp-here');
  const peekEnd = panel.querySelector<HTMLElement>('.p-disc-peek')!;
  // safe area อ่านจาก element ทดสอบ (env() อ่านตรง ๆ จาก JS ไม่ได้)
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)';
  document.body.append(probe);

  let kind: LayoutKind = layoutFor(innerWidth, innerHeight);
  let level: SheetLevel = 'peek';
  let panelOpen = true;
  /** ความสูงที่มองเห็นระหว่างลาก (null = ไม่ได้ลาก) */
  let dragH: number | null = null;
  let heights: Record<SheetLevel, number> = { peek: 0, half: 0, full: 0 };
  let topbarBottom = 0;
  const setVar = (k: string, v: number) => root.style.setProperty(k, `${Math.round(v)}px`);
  const docked = () => kind !== 'desktop';

  // ---- การ์ดหมุด: เดสก์ท็อปลอยคอลัมน์ขวา, จออื่นอยู่ในแท็บ "ที่นี่" ----
  function placeCard(): void {
    if (docked()) {
      if (place.parentElement !== hereBox) hereBox.append(place);
      panelApi.setHereTab(!place.hidden, false);
    } else {
      if (place.parentElement !== document.body) legend.after(place);
      panelApi.setHereTab(false, false);
    }
  }
  new MutationObserver(() => {
    if (docked()) {
      panelApi.setHereTab(!place.hidden, !place.hidden);
      if (!place.hidden) {
        if (kind === 'phone' && level === 'peek') setLevel('half');
        if (kind !== 'phone' && !panelOpen) setPanelOpen(true);
      }
    }
    schedule();
  }).observe(place, { attributes: true, attributeFilter: ['hidden'] });

  // ---- วัดและตั้งค่า ----
  function measure(): void {
    const W = innerWidth,
      H = innerHeight;
    const k = layoutFor(W, H);
    if (k !== kind) {
      instant();
      kind = k;
      level = 'peek';
      if (k === 'desktop' || k === 'tablet') panelOpen = true;
      applyKind();
      onKind?.(k);
    }
    const cs = getComputedStyle(probe);
    const safeB = parseFloat(cs.paddingBottom) || 0;
    topbarBottom = topbar.getBoundingClientRect().bottom;
    setVar('--topbar-h', topbarBottom);
    if (kind === 'phone') {
      const full = Math.max(200, H - topbarBottom - GAP);
      const peek = Math.min(full, peekEnd.offsetTop + peekEnd.offsetHeight + GAP + safeB);
      heights = { peek, half: Math.min(full, Math.max(peek + 120, Math.round(H * 0.52))), full };
      panel.style.height = `${full}px`;
      applySheet();
    } else {
      panel.style.height = '';
      panel.style.transform = '';
      setVar('--sheet-h', 0);
      setVar('--sheet-hidden', 0);
    }
    const pr = panel.getBoundingClientRect();
    const sideOpen = kind !== 'phone' && panelOpen;
    setVar('--bar-l', sideOpen ? pr.right : 0);
    const mr = mini.getBoundingClientRect();
    setVar('--occ-l', kind === 'phone' ? 0 : sideOpen ? pr.right : mr.width ? mr.right : 0);
    // ด้านขวาของแถวล่าง: legend (เต็มหรือชิป) และปุ่มเครดิต (จอเล็ก)
    let right = W;
    if (kind !== 'phone') {
      const lt = legend.querySelector('.lg-toggle');
      const lr = (kind === 'desktop' || !lt ? legend : lt).getBoundingClientRect();
      if (lr.width) right = Math.min(right, lr.left);
      if (kind !== 'desktop' && attrib.style.display !== 'none') {
        const ar = attrib.querySelector('.at-btn')!.getBoundingClientRect();
        if (ar.width) right = Math.min(right, ar.left);
      }
    }
    setVar('--occ-r', W - right);
    setVar('--legend-h', legend.offsetHeight);
    setVar('--legend-w', legend.querySelector('.lg-toggle')?.getBoundingClientRect().width ?? 0);
    // ด้านขวาของแถวบน: การ์ดหมุดลอย (เดสก์ท็อป) — ข้อความแจ้งเตือนไม่ทับ
    setVar('--occ-rt', kind === 'desktop' && !place.hidden ? W - place.getBoundingClientRect().left : 0);
  }

  function applyKind(): void {
    root.dataset.layout = kind;
    root.dataset.panel = panelOpen ? 'open' : 'closed';
    if (kind === 'desktop') menu.removeAttribute('role');
    else menu.setAttribute('role', 'dialog');
    panel.toggleAttribute('inert', kind !== 'phone' && !panelOpen);
    mini.toggleAttribute('inert', kind === 'phone' || panelOpen);
    placeCard();
  }

  function applySheet(): void {
    const h = dragH ?? heights[level];
    panel.style.transform = `translateY(${heights.full - h}px)`;
    setVar('--sheet-h', h);
    setVar('--sheet-full', heights.full);
    if (dragH == null) setVar('--sheet-hidden', heights.full - h);
    root.dataset.sheet = level;
    const i = LEVELS.indexOf(level);
    panel.querySelector<HTMLButtonElement>('.p-down')!.disabled = i === 0;
    panel.querySelector<HTMLButtonElement>('.p-up')!.disabled = i === LEVELS.length - 1;
  }

  function setLevel(l: SheetLevel): void {
    level = l;
    if (kind === 'phone') applySheet();
  }
  function setPanelOpen(o: boolean): void {
    if (o === panelOpen) return;
    panelOpen = o;
    applyKind();
    schedule();
    // ย้ายโฟกัสไปปุ่มคู่กัน (คีย์บอร์ดไม่หลุดไปอยู่ใน element ที่ซ่อน)
    const f = o
      ? panel.querySelector<HTMLElement>('.p-collapse')
      : mini.querySelector<HTMLElement>('.p-expand');
    requestAnimationFrame(() => f?.focus({ preventScroll: true }));
  }

  /** เปลี่ยน layout (โหลดหน้า/หมุนจอ) ให้วางทันที ไม่เลื่อนเข้ามา — transition เฉพาะการกระทำของผู้ใช้ */
  function instant(): void {
    root.dataset.instant = '';
    requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.instant));
  }
  let raf = 0;
  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      measure();
    });
  }

  // ---- ปุ่ม ----
  panel.querySelector<HTMLButtonElement>('.p-up')!.onclick = () =>
    setLevel(LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(level) + 1)]);
  panel.querySelector<HTMLButtonElement>('.p-down')!.onclick = () =>
    setLevel(LEVELS[Math.max(0, LEVELS.indexOf(level) - 1)]);
  panel.querySelector<HTMLButtonElement>('.p-collapse')!.onclick = () => setPanelOpen(false);
  mini.querySelector<HTMLButtonElement>('.p-expand')!.onclick = () => setPanelOpen(true);

  // ---- ลาก sheet (มือถือ): ส่วนหัว/peek/แท็บ ลากขึ้นลงได้ ปล่อยแล้ว snap ไประดับที่ใกล้ (คิดความเร็วด้วย) ----
  // แผนที่ไม่หมุนตาม: เหตุการณ์อยู่บน sheet ไม่ถึง canvas, touch-action ใน CSS กันเบราว์เซอร์เลื่อนหน้า
  let drag: {
    id: number;
    y0: number;
    h0: number;
    on: boolean;
    lastY: number;
    lastT: number;
    v: number;
  } | null = null;
  panel.addEventListener('pointerdown', (e) => {
    if (kind !== 'phone' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = e.target as HTMLElement;
    if (!t.closest('.p-head, .p-peek, .p-disc-peek, .p-tabs') || t.closest('input, select')) return;
    drag = {
      id: e.pointerId,
      y0: e.clientY,
      h0: heights[level],
      on: false,
      lastY: e.clientY,
      lastT: e.timeStamp,
      v: 0,
    };
  });
  // ติดตามที่ window: นิ้ว/เมาส์อาจออกนอกแผงก่อนถึงระยะเริ่มลาก (ยังไม่ได้ capture)
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.on) {
      if (Math.abs(dy) < 6) return;
      drag.on = true;
      panel.setPointerCapture(e.pointerId);
      root.dataset.dragging = '';
    }
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.v = 0.8 * ((drag.lastY - e.clientY) / dt) + 0.2 * drag.v; // px/ms (ขึ้น = บวก)
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    // เกินขอบ: หน่วงแบบยาง
    let h = drag.h0 - dy;
    if (h > heights.full) h = heights.full + (h - heights.full) * 0.25;
    if (h < heights.peek) h = heights.peek - (heights.peek - h) * 0.25;
    dragH = h;
    applySheet();
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    delete root.dataset.dragging;
    const h = dragH ?? heights[level];
    dragH = null;
    level = nearestLevel(h + d.v * 180, heights);
    applySheet();
    // กันไม่ให้การลากจบด้วยการกดปุ่ม/ชิปที่นิ้วอยู่
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, true), 0);
  };
  const stop = (ev: Event) => ev.stopPropagation();
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // ---- ติดตามขนาด ----
  window.addEventListener('resize', schedule);
  visualViewport?.addEventListener('resize', schedule);
  const ro = new ResizeObserver(schedule);
  for (const el of [topbar, legend, panel, mini, attrib, place, peekEnd]) ro.observe(el);
  new MutationObserver(schedule).observe(attrib, { attributes: true, attributeFilter: ['style'] });

  instant();
  applyKind();
  measure();

  return {
    get kind() {
      return kind;
    },
    get level() {
      return level;
    },
    setLevel,
    setPanelOpen,
    /** ขอให้วัดใหม่ (เนื้อหาเปลี่ยน) */
    refresh: schedule,
    /** ระยะเลื่อนภาพ (px) ให้จุดกึ่งกลางกล้องอยู่กลางพื้นที่ที่มองเห็น: x บวก = ขวา, y บวก = ลง */
    viewOffset(): { x: number; y: number } {
      const W = innerWidth,
        H = innerHeight;
      if (kind === 'phone') {
        const occB = Math.min(dragH ?? heights[level], H * 0.6);
        return { x: 0, y: (topbarBottom - occB) / 2 };
      }
      const occL = panelOpen ? panel.getBoundingClientRect().right : 0;
      const occR = kind === 'desktop' && !place.hidden ? W - place.getBoundingClientRect().left : 0;
      return { x: (Math.min(occL, W * 0.5) - Math.min(occR, W * 0.4)) / 2, y: 0 };
    },
    /** ขอบล่างของพื้นที่แผนที่ที่มองเห็น (tooltip ไม่ไปอยู่ใต้ sheet) */
    mapBottom: () => innerHeight - (kind === 'phone' ? (dragH ?? heights[level]) : 0),
  };
}
export type Layout = ReturnType<typeof createLayout>;
