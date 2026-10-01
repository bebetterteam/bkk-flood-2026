import type { ViewMode } from '../scene/terrain';
import { $ } from './dom';
import { LEGEND, STUDY } from './strings';
import { STUDY_ELEV } from '../scene/study/studyScene';

const esc = (s: string) => s.replace(/</g, '&lt;');

export function renderLegend(viewMode: ViewMode, study = false): void {
  const ticks = (t: string[]) =>
    `<div class="ticks">${t.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`;
  if (study && viewMode === 'elev') {
    const max = STUDY_ELEV[STUDY_ELEV.length - 1][0];
    const stops = STUDY_ELEV.map(
      ([h, c]) => `#${c.toString(16).padStart(6, '0')} ${((h / max) * 100).toFixed(0)}%`,
    );
    $('legend').innerHTML =
      `<b>${STUDY.legendElevTitle}</b><div class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></div>${ticks(STUDY.legendElevTicks)}`;
    return;
  }
  $('legend').innerHTML =
    viewMode === 'elev'
      ? `<b>${LEGEND.elevTitle}</b><div class="ramp" style="background:linear-gradient(90deg,#5b2a86,#6b46c1,#2f80ed,#22a39f,#7cc36b,#e9c46a,#e07a3f)"></div>${ticks(LEGEND.elevTicks)}`
      : `<b>${LEGEND.depthTitle}</b><div class="ramp" style="background:linear-gradient(90deg,#9fd3e0,#3f8fd0 30%,#1c3f8f)"></div>${ticks(LEGEND.depthTicks)}
     <div style="margin-top:6px;color:var(--muted)">▮ <span style="color:#9aa3ab">${LEGEND.wall}</span> ▮ <span style="color:#8a6a44">${LEGEND.dike}</span> ● <span style="color:#d94b2b">${LEGEND.pump}</span></div>`;
}
