import type { ViewMode } from '../scene/terrain';
import { ELEV } from '../scene/terrain';
import { $ } from './dom';
import { INFRA, LEGEND, STUDY } from './strings';
import type { InfraKind } from '../scene/highlight';
import { STUDY_ELEV } from '../scene/study/studyScene';

const esc = (s: string) => s.replace(/</g, '&lt;');
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** แถบสี: stops = [ค่า, สี] เรียงจากน้อยไปมาก, ticks = [ข้อความ, ค่า] วางตรงตำแหน่งค่าจริงบนแถบ */
function ramp(title: string, stops: [number, number][], ticks: [string, number][]): string {
  const lo = stops[0][0],
    hi = stops[stops.length - 1][0];
  const pct = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const grad = stops.map(([v, c]) => `${hex(c)} ${pct(v).toFixed(1)}%`).join(',');
  const tk = ticks.map(([t, v]) => `<span style="left:${pct(v).toFixed(1)}%">${esc(t)}</span>`).join('');
  return `<div class="lg-title">${title}</div>
    <div class="ramp" style="background:linear-gradient(90deg,${grad})"></div>
    <div class="ticks">${tk}</div>`;
}

/** ไอคอนเล็กให้หน้าตาตรงกับโมเดล 3 มิติ (สีเดียวกับ scene/wallLines.ts, infra.ts, districts.ts) */
const ICON: Record<'wall' | 'dike' | 'pump' | 'tunnel' | 'district', string> = {
  wall: `<rect x="8" y="3" width="6" height="11" fill="#b3bac1" stroke="#6b737a" stroke-width=".8"/><rect x="8" y="11" width="6" height="3" fill="#7b838a"/><rect x="7" y="1.5" width="8" height="2" rx=".5" fill="#e4e7ea"/>`,
  dike: `<path d="M1 14 L8 4 H14 L21 14 Z" fill="#7a9a52"/><path d="M8 4 H14" stroke="#bfae8c" stroke-width="2"/>`,
  pump: `<rect x="6.5" y="3.5" width="9" height="9" fill="#d94b2b"/><ellipse cx="11" cy="12.5" rx="4.5" ry="1.6" fill="#b83b20"/><ellipse cx="11" cy="3.5" rx="4.5" ry="1.6" fill="#f08a6e"/>`,
  tunnel: `<path d="M2 11 C7 4, 15 14, 20 6" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>`,
  district: `<path d="M1 8 H21" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="4 3"/>`,
};
const icon = (k: keyof typeof ICON) =>
  `<svg viewBox="0 0 22 16" width="22" height="16" aria-hidden="true">${ICON[k]}</svg>`;
/** รายการระบบป้องกันเป็นปุ่ม (กดเลือก/ยกเลิก) ส่วนเส้นเขตเป็นแค่คำอธิบาย */
const item = (k: keyof typeof ICON, label: string) =>
  k === 'district'
    ? `<div class="lg-item">${icon(k)}<span>${label}</span></div>`
    : `<button type="button" class="lg-item lg-btn${sel === k ? ' on' : ''}" data-kind="${k}" aria-pressed="${sel === k}">${icon(k)}<span>${label}</span></button>`;

// ---- สถานะการเลือก (legend เก็บเอง เพื่อวาดซ้ำตอนสลับโหมด/มุมมองได้) ----
let sel: InfraKind | null = null;
let info: { title: string; html: string } | null = null;
let last: [ViewMode, boolean] = ['real', false];
let onPick: (k: InfraKind | null) => void = () => {};
let bound = false;

/** กดรายการ (k) หรือปิดการ์ด (null) */
export function onLegendPick(cb: (k: InfraKind | null) => void): void {
  onPick = cb;
}

/** ไฮไลท์รายการ + แสดงการ์ดข้อมูล (null = ไม่ได้เลือก) */
export function setLegendSelection(k: InfraKind | null, card: { title: string; html: string } | null): void {
  sel = k;
  info = k ? card : null;
  renderLegend(...last);
}

function bind(): void {
  if (bound) return;
  bound = true;
  $('legend').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.ii-close')) return onPick(null);
    const b = t.closest<HTMLElement>('[data-kind]');
    if (b) onPick(sel === b.dataset.kind ? null : (b.dataset.kind as InfraKind));
  });
}

export function renderLegend(viewMode: ViewMode, study = false): void {
  last = [viewMode, study];
  bind();
  let top: string;
  if (viewMode === 'elev' && study)
    top = ramp(
      STUDY.legendElevTitle,
      STUDY_ELEV,
      STUDY.legendElevTicks.map((t, k) => [t, STUDY_ELEV_TICKS[k]]),
    );
  else if (viewMode === 'elev')
    top = ramp(
      LEGEND.elevTitle,
      ELEV.map(([h, c]) => [h, c.getHex()]),
      LEGEND.elevTicks.map((t, k) => [t, ELEV_TICKS[k]]),
    );
  else
    top = ramp(
      LEGEND.depthTitle,
      DEPTH_STOPS,
      LEGEND.depthTicks.map((t, k) => [t, DEPTH_TICKS[k]]),
    );
  const items = [
    item('wall', LEGEND.wall),
    study ? '' : item('dike', LEGEND.dike),
    item('pump', LEGEND.pump),
    item('tunnel', LEGEND.tunnel),
    item('district', LEGEND.district),
  ].join('');
  const card =
    sel && info
      ? `<div class="lg-info"><div class="ii-head">${icon(sel)}<b>${info.title}</b><button type="button" class="ii-close" aria-label="${INFRA.close}">×</button></div>${info.html}</div>`
      : '';
  $('legend').innerHTML =
    `${card}${top}<div class="lg-title lg-sub">${LEGEND.protection}</div><div class="lg-items">${items}</div>` +
    (sel ? '' : `<div class="lg-hint">${INFRA.hint}</div>`);
}

/** สีน้ำตามความลึก (ม.) — ตรงกับ scene/water.ts */
const DEPTH_STOPS: [number, number][] = [
  [0, 0x9fd3e0],
  [0.3, 0x3f8fd0],
  [1, 0x1c3f8f],
];
/** ค่าของป้ายแต่ละอันบนแถบ (ลำดับเดียวกับข้อความใน strings.ts) */
const DEPTH_TICKS = [0, 0.3, 1];
const ELEV_TICKS = [-0.5, 0.75, 1.75, 3];
const STUDY_ELEV_TICKS = [0, 3, 5, 7, 10];
