/**
 * Nesting: เอาผลโมเดลภาพรวม (ทั้งเมือง) มาเป็นเงื่อนไขขอบของพื้นที่ศึกษา
 * ช่องที่ขอบพื้นที่ศึกษาซึ่งโมเดลภาพรวมบอกว่า "มีน้ำจากภายนอกท่วม" จะได้ระดับน้ำ (reach) และแหล่งที่มาเดียวกัน
 */
import { cellAt } from './coords';
import type { Boundary, SimResult } from './simulate';
import type { Grid } from './grid';
import { edgeCells, type StudyGrid } from './studyGrid';

export function nestBoundary(overview: Grid, ov: SimResult, study: StudyGrid): Boundary {
  const { nx, nz, bbox, dlat, dlon } = study.meta;
  const cells: number[] = [],
    level: number[] = [],
    src: number[] = [];
  for (const c of edgeCells(nx, nz)) {
    if (study.kind[c]) continue;
    const i = c % nx,
      j = (c / nx) | 0;
    const oc = cellAt(bbox.north - (j + 0.5) * dlat, bbox.west + (i + 0.5) * dlon);
    if (overview.kind[oc] || !(ov.tExt[oc] > 0)) continue;
    cells.push(c);
    level.push(ov.reach[oc]);
    src.push(ov.src[oc]);
  }
  return { cells, level, src };
}
