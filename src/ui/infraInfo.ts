/** เนื้อหาการ์ดข้อมูลระบบป้องกันที่เลือก (ค่า "ตอนนี้" มาจากผลจำลองล่าสุด) */
import { LABELS, PUMPS, nearestDistrict } from '../data/places';
import { WALL_AIRPORT, WALL_COAST, WALL_KING, type Grid } from '../sim/grid';
import { wallTop, type SimParams, type SimResult } from '../sim/simulate';
import type { Selection } from '../scene/highlight';
import { INFRA } from './strings';

export interface InfraInfoContext {
  P: SimParams;
  sim: SimResult | null;
  /** กริดภาพรวม (คันกั้นน้ำมีเฉพาะในกริดนี้) */
  overviewGrid: Grid;
}

/** สันต่ำสุดหลังทรุดของคันแต่ละชนิดในกริดภาพรวม */
function minDikeTop(g: Grid, P: SimParams, type: number): number {
  let m = Infinity;
  for (let c = 0; c < g.wallType.length; c++) if (g.wallType[c] === type) m = Math.min(m, wallTop(g, P, c));
  return m;
}

/** ชื่อสถานีสูบ: ป้ายที่มีอยู่ (เช่น พระโขนง) ไม่งั้นบอกเขตใกล้เคียง */
function pumpName(id: number): string {
  const [la, lo] = PUMPS[id];
  const lbl = LABELS.find(
    ([n, a, b, k]) => k === 'infra' && n.startsWith('สถานีสูบ') && Math.hypot(a - la, b - lo) < 0.003,
  );
  return lbl ? lbl[0] : `${INFRA.pump.title} ${INFRA.near(nearestDistrict(la, lo))}`;
}

const row = (label: string, html: string) => `<div class="ii-row"><span>${label}</span><p>${html}</p></div>`;

export function infraInfo(
  sel: NonNullable<Selection>,
  ctx: InfraInfoContext,
): { title: string; html: string } {
  const { P, sim, overviewGrid: g } = ctx;
  const on = sel.kind === 'wall' ? P.walls : sel.kind === 'dike' ? P.dikes : P.drains;
  let title: string, what: string, model: string;
  let now = '';
  switch (sel.kind) {
    case 'wall':
      title = INFRA.wall.title;
      what = INFRA.wall.what;
      model = INFRA.wall.model;
      if (sim) now = INFRA.wall.now(sim.coreWall, sim.riverMid);
      break;
    case 'dike': {
      const types = sel.id !== undefined ? [sel.id] : [WALL_KING, WALL_COAST, WALL_AIRPORT];
      title = sel.id !== undefined ? INFRA.dike.names[sel.id] : INFRA.dike.title;
      what = sel.id !== undefined ? INFRA.dike.whatOne[sel.id] : INFRA.dike.what;
      model =
        sel.id !== undefined
          ? INFRA.dike.modelOne(INFRA.dike.base[sel.id])
          : `${INFRA.dike.modelAll}<br>` +
            types.map((t) => `${INFRA.dike.names[t]} ${INFRA.dike.base[t].toFixed(1)} ม.`).join('<br>');
      now = types
        .map((t) =>
          INFRA.dike.nowRow(
            sel.id !== undefined ? INFRA.dike.title : INFRA.dike.names[t],
            minDikeTop(g, P, t),
          ),
        )
        .join('<br>');
      break;
    }
    case 'pump':
      title = sel.id !== undefined ? pumpName(sel.id) : INFRA.pump.title;
      what = INFRA.pump.what + (sel.id !== undefined ? ` <i>(${INFRA.approx})</i>` : '');
      model = INFRA.pump.model;
      if (sim) now = INFRA.pump.now(sim.cap);
      break;
    case 'tunnel':
      title = INFRA.tunnel.title;
      what = INFRA.tunnel.what;
      model = INFRA.tunnel.model;
      if (sim) now = INFRA.pump.now(sim.cap);
      break;
  }
  const html =
    `<p class="ii-what">${what}</p>` +
    row(INFRA.model, model) +
    (on ? (now ? row(INFRA.now, now) : '') : `<p class="ii-off">${INFRA.off}</p>`);
  return { title, html };
}
