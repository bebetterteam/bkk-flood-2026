import type { ViewMode } from '../scene/terrain';
import { STUDY, T, TOPBAR } from './strings';

export type AppMode = 'overview' | 'study';

export interface TopbarCallbacks {
  onView: (v: ViewMode) => void;
  onLabels: (show: boolean) => void;
  onCam: (v: string) => void;
  onMode: (m: AppMode) => void;
  onQuality: (q: string) => void;
}

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
    setMode(m: AppMode) {
      qBox.style.display = m === 'study' ? '' : 'none';
      modes.forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
      setCams(m === 'overview' ? TOPBAR.cams : STUDY.cams);
    },
    setModeBusy(busy: boolean) {
      modes.forEach((x) => (x.disabled = busy));
    },
  };
}
