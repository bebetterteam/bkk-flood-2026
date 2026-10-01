import type { CamView } from '../scene/cameraViews';
import type { ViewMode } from '../scene/terrain';
import { T, TOPBAR } from './strings';

export interface TopbarCallbacks {
  onView: (v: ViewMode) => void;
  onLabels: (show: boolean) => void;
  onCam: (v: CamView) => void;
}

/** ปุ่มด้านบนขวา (โหมดแสดงผล ป้ายชื่อ มุมกล้อง) + นาฬิกาจำลองด้านล่าง */
export function createTopbar(
  bar: HTMLElement,
  clock: HTMLElement,
  cb: TopbarCallbacks & { onReplay: () => void },
) {
  bar.innerHTML =
    `<button data-view="real" class="on">${TOPBAR.viewReal}</button>` +
    `<button data-view="elev">${TOPBAR.viewElev}</button>` +
    `<button id="btn-labels" class="on">${TOPBAR.labels}</button>` +
    TOPBAR.cams.map(([k, n]) => `<button data-cam="${k}">${n}</button>`).join('');
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
  bar
    .querySelectorAll<HTMLButtonElement>('[data-cam]')
    .forEach((b) => (b.onclick = () => cb.onCam(b.dataset.cam as CamView)));

  clock.innerHTML = `<span id="clock-t">${T.clockInit}</span><button id="replay">${T.replay}</button>`;
  const ct = clock.querySelector<HTMLElement>('#clock-t')!;
  clock.querySelector<HTMLButtonElement>('#replay')!.onclick = cb.onReplay;
  return {
    setMoving(moving: boolean) {
      ct.textContent = moving ? T.clockMoving : T.clockSteady;
    },
  };
}
