/**
 * แถบปุ่มด้านบน + แถบสถานะ (pill) ด้านล่าง
 * ปุ่มหลัก (.tb-main: โหมด, ตำแหน่งของฉัน, เพิ่มเติม) อยู่บนแถบเสมอ ที่เหลืออยู่ใน #tb-menu:
 * เดสก์ท็อปแสดงเรียงในแถบ (display: contents), จอเล็กเป็นเมนูลอยเมื่อกด "เพิ่มเติม" (layout ตาม data-layout ใน CSS)
 */
import type { ViewMode } from '../scene/terrain';
import { icon } from './icons';
import { STUDY, T, TOPBAR, UI } from './strings';

export type AppMode = 'overview' | 'study';

export interface TopbarCallbacks {
  onView: (v: ViewMode) => void;
  onLabels: (show: boolean) => void;
  onCam: (v: string) => void;
  onMode: (m: AppMode) => void;
  onQuality: (q: string) => void;
  /** เลือกแผ่นพื้นที่ศึกษา (จาก dropdown หรือปุ่มทิศ) */
  onTile: (id: string) => void;
}
export type TileDir = 'n' | 's' | 'e' | 'w';
const DIR_ICON = { n: 'up', s: 'down', w: 'left', e: 'right' } as const;

/** ปุ่มแบบเลือก/ไม่เลือก: class .on + aria-pressed */
export const setOn = (b: HTMLElement, on: boolean) => {
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
};
const group = (g: string, title: string, inner: string, hidden = false) =>
  `<div class="tb-g" data-g="${g}"${hidden ? ' hidden' : ''} role="group" aria-label="${title}"><span class="tb-h" aria-hidden="true">${title}</span>${inner}</div>`;

export function createTopbar(
  bar: HTMLElement,
  clock: HTMLElement,
  cb: TopbarCallbacks & { onReplay: () => void },
) {
  bar.setAttribute('role', 'toolbar');
  bar.innerHTML =
    `<div class="tb-main">` +
    `<span class="seg tb-mode" role="group" aria-label="${UI.modeLabel}">` +
    `<button type="button" data-mode="overview" class="on" aria-pressed="true"><span class="t-long">${STUDY.modeOverview}</span><span class="t-short">${UI.modeOverviewShort}</span></button>` +
    `<button type="button" data-mode="study" aria-pressed="false"><span class="t-long">${STUDY.modeStudy}</span><span class="t-short">${UI.modeStudyShort}</span></button></span>` +
    `<span class="tb-slot" data-slot="locate"></span>` +
    `<button type="button" class="icon-btn tb-more" aria-label="${UI.more}" aria-haspopup="dialog" aria-expanded="false" aria-controls="tb-menu">${icon('more')}</button>` +
    `</div>` +
    `<div id="tb-menu" role="dialog" aria-label="${UI.menuLabel}">` +
    group(
      'quality',
      UI.gQuality,
      `<span class="seg" id="quality" title="${STUDY.qualityTitle}">` +
        STUDY.quality
          .map(
            ([k, n], i) =>
              `<button type="button" data-q="${k}"${i ? ' aria-pressed="false"' : ' class="on" aria-pressed="true"'}>${n}</button>`,
          )
          .join('') +
        `</span>`,
      true,
    ) +
    group(
      'tile',
      UI.gTile,
      `<select id="tile-sel" title="${STUDY.tileTitle}" aria-label="${STUDY.tileTitle}" hidden></select>` +
        `<span class="seg" id="tile-nav">` +
        STUDY.tileNav
          .map(
            ([d, t]) =>
              `<button type="button" class="icon-btn" data-dir="${d}" aria-label="${t}">${icon(DIR_ICON[d])}</button>`,
          )
          .join('') +
        `</span>`,
      true,
    ) +
    group(
      'view',
      UI.gView,
      `<span class="seg"><button type="button" data-view="real" class="on" aria-pressed="true">${TOPBAR.viewReal}</button>` +
        `<button type="button" data-view="elev" aria-pressed="false">${TOPBAR.viewElev}</button></span>` +
        `<button type="button" id="btn-labels" class="on" aria-pressed="true">${icon('tag')}<span>${TOPBAR.labels}</span></button>`,
    ) +
    group('cams', UI.gCam, `<span id="cams" class="seg"></span>`) +
    group('pin', UI.gOther, `<span class="tb-slot" data-slot="pin"></span>`) +
    `</div>`;

  const q = <T extends HTMLElement>(s: string) => bar.querySelector<T>(s)!;
  const modes = bar.querySelectorAll<HTMLButtonElement>('[data-mode]');
  modes.forEach(
    (b) =>
      (b.onclick = () => {
        if (b.classList.contains('on') || b.disabled) return;
        cb.onMode(b.dataset.mode as AppMode);
      }),
  );

  // ---- เมนู "เพิ่มเติม" (จอเล็ก) ----
  const menu = q<HTMLElement>('#tb-menu'),
    moreBtn = q<HTMLButtonElement>('.tb-more');
  let menuOpen = false;
  function setMenu(open: boolean, refocus = true): void {
    if (open === menuOpen) return;
    menuOpen = open;
    bar.classList.toggle('menu-open', open);
    moreBtn.setAttribute('aria-expanded', String(open));
    setOn(moreBtn, open);
    if (open) menu.querySelector<HTMLElement>('button:not([disabled]), select')?.focus();
    else if (refocus && menu.contains(document.activeElement)) moreBtn.focus();
  }
  moreBtn.onclick = () => setMenu(!menuOpen);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if (menuOpen && !bar.contains(e.target as Node)) setMenu(false, false);
  });
  /** ปิดเมนูหลังเลือกสิ่งที่เปลี่ยนฉาก (มุมกล้อง/แผ่น/ปักหมุด) ให้เห็นผล */
  const closeAfter = () => setMenu(false, false);

  const qBox = q<HTMLElement>('[data-g="quality"]');
  const tileBox = q<HTMLElement>('[data-g="tile"]');
  const tileSel = q<HTMLSelectElement>('#tile-sel');
  tileSel.onchange = () => {
    closeAfter();
    cb.onTile(tileSel.value);
  };
  const navBtns = bar.querySelectorAll<HTMLButtonElement>('[data-dir]');
  let navTargets: Partial<Record<TileDir, string>> = {};
  navBtns.forEach(
    (b) =>
      (b.onclick = () => {
        const id = navTargets[b.dataset.dir as TileDir];
        if (id) cb.onTile(id);
      }),
  );
  const qBtns = bar.querySelectorAll<HTMLButtonElement>('[data-q]');
  qBtns.forEach(
    (b) =>
      (b.onclick = () => {
        if (b.classList.contains('on') || b.disabled) return;
        cb.onQuality(b.dataset.q!);
      }),
  );
  const camsBox = q<HTMLElement>('#cams');
  function setCams(list: readonly (readonly [string, string])[]) {
    camsBox.innerHTML = list
      .map(
        ([k, n]) =>
          `<button type="button" data-cam="${k}">${icon('camera', 'm-only')}<span>${n}</span></button>`,
      )
      .join('');
    camsBox.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach(
      (b) =>
        (b.onclick = () => {
          closeAfter();
          cb.onCam(b.dataset.cam!);
        }),
    );
  }
  setCams(TOPBAR.cams);
  const views = bar.querySelectorAll<HTMLButtonElement>('[data-view]');
  views.forEach(
    (b) =>
      (b.onclick = () => {
        views.forEach((x) => setOn(x, x === b));
        cb.onView(b.dataset.view as ViewMode);
      }),
  );
  let show = true;
  const lb = q<HTMLButtonElement>('#btn-labels');
  lb.onclick = () => {
    show = !show;
    setOn(lb, show);
    cb.onLabels(show);
  };

  clock.innerHTML =
    `<span class="live" aria-hidden="true"></span><span id="clock-t" role="status">${T.clockInit}</span>` +
    `<button type="button" id="replay" aria-label="${T.replay}">${icon('replay')}<span class="t-long">${T.replay}</span></button>`;
  const ct = clock.querySelector<HTMLElement>('#clock-t')!;
  clock.querySelector<HTMLButtonElement>('#replay')!.onclick = cb.onReplay;
  /** ตั้งข้อความเฉพาะเมื่อเปลี่ยน (เรียกทุกเฟรม — กัน screen reader อ่านซ้ำ) */
  const setText = (t: string) => {
    if (ct.textContent !== t) ct.textContent = t;
    clock.classList.toggle('moving', t === T.clockMoving || t === T.clockInit);
  };
  return {
    /** ช่องสำหรับปุ่มตำแหน่ง (แถบหลัก) และปักหมุด (ในเมนู) */
    slot: (name: 'locate' | 'pin') => q<HTMLElement>(`[data-slot="${name}"]`),
    closeMenu: closeAfter,
    setMoving(moving: boolean) {
      setText(moving ? T.clockMoving : T.clockSteady);
    },
    setText,
    setQuality(qq: string) {
      qBtns.forEach((x) => setOn(x, x.dataset.q === qq));
    },
    setQualityBusy(busy: boolean) {
      qBtns.forEach((x) => (x.disabled = busy));
    },
    setMode(m: AppMode, studyCams: readonly (readonly [string, string])[] = STUDY.cams) {
      qBox.hidden = m !== 'study';
      tileBox.hidden = m !== 'study';
      modes.forEach((x) => setOn(x, x.dataset.mode === m));
      setCams(m === 'overview' ? TOPBAR.cams : studyCams);
    },
    setModeBusy(busy: boolean) {
      modes.forEach((x) => (x.disabled = busy));
      tileSel.disabled = busy;
      navBtns.forEach((x) => (x.disabled = busy || !navTargets[x.dataset.dir as TileDir]));
    },
    /** รายการแผ่นที่มีข้อมูล [id, ชื่อ] */
    setTiles(list: [string, string][]) {
      tileSel.innerHTML = list
        .map(([id, name]) => `<option value="${id}">${STUDY.tileOption(name)}</option>`)
        .join('');
      tileSel.hidden = list.length < 2;
    },
    /** แผ่นปัจจุบัน + แผ่นข้าง ๆ ที่มีข้อมูล */
    setTile(id: string, neighbors: Partial<Record<TileDir, string>>, names: Record<string, string>) {
      tileSel.value = id;
      navTargets = neighbors;
      navBtns.forEach((b) => {
        const t = neighbors[b.dataset.dir as TileDir];
        b.disabled = !t;
        const tip = STUDY.tileNav.find(([d]) => d === b.dataset.dir)![1];
        b.title = t ? `${tip}: ${names[t]}` : STUDY.tileNavNone;
        b.setAttribute('aria-label', b.title);
      });
    },
  };
}
