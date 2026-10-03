import type { ViewMode } from '../scene/terrain';
import { STUDY, T, TOPBAR } from './strings';

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

/** ปุ่มด้านบนขวา (โหมดแสดงผล ป้ายชื่อ มุมกล้อง) + นาฬิกาจำลองด้านล่าง */
export function createTopbar(
  bar: HTMLElement,
  clock: HTMLElement,
  cb: TopbarCallbacks & { onReplay: () => void },
) {
  bar.innerHTML =
    `<span class="seg"><button data-mode="overview" class="on">${STUDY.modeOverview}</button>` +
    `<button data-mode="study">${STUDY.modeStudy}</button></span>` +
    `<button data-view="real" class="on">${TOPBAR.viewReal}</button>` +
    `<button data-view="elev">${TOPBAR.viewElev}</button>` +
    `<button id="btn-labels" class="on">${TOPBAR.labels}</button>` +
    `<span id="cams" class="seg"></span>`;
  const modes = bar.querySelectorAll<HTMLButtonElement>('[data-mode]');
  modes.forEach(
    (b) =>
      (b.onclick = () => {
        if (b.classList.contains('on') || b.disabled) return;
        cb.onMode(b.dataset.mode as AppMode);
      }),
  );
  const qBox = document.createElement('span');
  qBox.className = 'seg';
  qBox.id = 'quality';
  qBox.title = STUDY.qualityTitle;
  qBox.style.display = 'none';
  qBox.innerHTML = STUDY.quality
    .map(([k, n], i) => `<button data-q="${k}"${i ? '' : ' class="on"'}>${n}</button>`)
    .join('');
  bar.querySelector('.seg')!.after(qBox);
  // เลือกแผ่นพื้นที่ศึกษา + ปุ่มไปแผ่นข้าง ๆ (แสดงเมื่อโหลดรายการแผ่นแล้ว)
  const tileSel = document.createElement('select');
  tileSel.id = 'tile-sel';
  tileSel.title = STUDY.tileTitle;
  tileSel.hidden = true;
  tileSel.onchange = () => cb.onTile(tileSel.value);
  const navBox = document.createElement('span');
  navBox.className = 'seg';
  navBox.id = 'tile-nav';
  navBox.style.display = 'none';
  navBox.innerHTML = STUDY.tileNav.map(([d, arrow]) => `<button data-dir="${d}">${arrow}</button>`).join('');
  const navBtns = navBox.querySelectorAll<HTMLButtonElement>('[data-dir]');
  let navTargets: Partial<Record<TileDir, string>> = {};
  navBtns.forEach(
    (b) =>
      (b.onclick = () => {
        const id = navTargets[b.dataset.dir as TileDir];
        if (id) cb.onTile(id);
      }),
  );
  qBox.after(tileSel, navBox);
  const qBtns = qBox.querySelectorAll<HTMLButtonElement>('[data-q]');
  qBtns.forEach(
    (b) =>
      (b.onclick = () => {
        if (b.classList.contains('on') || b.disabled) return;
        cb.onQuality(b.dataset.q!);
      }),
  );
  const camsBox = bar.querySelector<HTMLElement>('#cams')!;
  function setCams(list: readonly (readonly [string, string])[]) {
    camsBox.innerHTML = list.map(([k, n]) => `<button data-cam="${k}">${n}</button>`).join('');
    camsBox
      .querySelectorAll<HTMLButtonElement>('[data-cam]')
      .forEach((b) => (b.onclick = () => cb.onCam(b.dataset.cam!)));
  }
  setCams(TOPBAR.cams);
  const views = bar.querySelectorAll<HTMLButtonElement>('[data-view]');
  views.forEach(
    (b) =>
      (b.onclick = () => {
        views.forEach((x) => x.classList.toggle('on', x === b));
        cb.onView(b.dataset.view as ViewMode);
      }),
  );
  let show = true;
  const lb = bar.querySelector<HTMLButtonElement>('#btn-labels')!;
  lb.onclick = () => {
    show = !show;
    lb.classList.toggle('on', show);
    cb.onLabels(show);
  };

  clock.innerHTML = `<span id="clock-t">${T.clockInit}</span><button id="replay">${T.replay}</button>`;
  const ct = clock.querySelector<HTMLElement>('#clock-t')!;
  clock.querySelector<HTMLButtonElement>('#replay')!.onclick = cb.onReplay;
  return {
    setMoving(moving: boolean) {
      ct.textContent = moving ? T.clockMoving : T.clockSteady;
    },
    setText(t: string) {
      ct.textContent = t;
    },
    setQuality(q: string) {
      qBtns.forEach((x) => x.classList.toggle('on', x.dataset.q === q));
    },
    setQualityBusy(busy: boolean) {
      qBtns.forEach((x) => (x.disabled = busy));
    },
    setMode(m: AppMode, studyCams: readonly (readonly [string, string])[] = STUDY.cams) {
      qBox.style.display = m === 'study' ? '' : 'none';
      navBox.style.display = m === 'study' ? '' : 'none';
      modes.forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
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
        const tip = STUDY.tileNav.find(([d]) => d === b.dataset.dir)![2];
        b.title = t ? `${tip}: ${names[t]}` : STUDY.tileNavNone;
      });
    },
  };
}
