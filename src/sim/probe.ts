/**
 * อ่านผลการจำลองที่ "จุดเดียว" (ตำแหน่งของผู้ใช้หรือหมุดที่ปัก) — pure, ไม่พึ่ง three.js/DOM
 * ใช้กริดพื้นที่ศึกษาถ้าจุดอยู่ใน bbox และโหลดกริดแล้ว ไม่งั้นใช้กริดภาพรวม
 */
import { LAT0, LAT1, LON0, LON1, cellAt } from './coords';
import type { Grid } from './grid';
import { nestBoundary } from './nest';
import { PRESETS, presetParams } from './presets';
import { SRC_RAIN, simulate, type SimResult } from './simulate';
import type { StudyGrid } from './studyGrid';

/** ความลึกที่ถือว่า "ท่วม" (ม.) — เท่ากับเกณฑ์นับพื้นที่ท่วมของแบบจำลอง */
export const FLOOD_DEPTH = 0.1;

export type GridKind = 'overview' | 'study';

/** index ช่องของจุด lat/lon ในกริด หรือ -1 ถ้าอยู่นอกกริด */
export function cellOf(g: Grid | StudyGrid, lat: number, lon: number): number {
  if ('meta' in g) {
    const { bbox, nx, nz, dlat, dlon } = g.meta;
    if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) return -1;
    const i = Math.min(nx - 1, Math.floor((lon - bbox.west) / dlon)),
      j = Math.min(nz - 1, Math.floor((bbox.north - lat) / dlat));
    return j * nx + i;
  }
  if (lat < LAT0 || lat > LAT1 || lon < LON0 || lon > LON1) return -1;
  return cellAt(lat, lon);
}

export interface CellReading {
  /** ความลึกรวม (ม.) = น้ำจากภายนอก + น้ำฝนขัง */
  depth: number;
  ext: number;
  rain: number;
  /** สาเหตุ (SRC_*) หรือ -1 ถ้าไม่ท่วม */
  cause: number;
  /** ความสูงพื้นหลังทรุด (ม.รทก. / DEM + offset) */
  ground: number;
}

/** อ่านค่าช่องเดียวจากผลการจำลอง (ใช้ได้ทั้งผลจาก worker และผลบน main thread) */
export function readCell(g: Grid, r: SimResult, c: number): CellReading {
  const ext = Math.max(0, r.tExt[c]),
    rain = Math.max(0, r.tRain[c]),
    depth = ext + rain;
  const cause = depth <= 0.02 ? -1 : ext > 0 ? r.src[c] : SRC_RAIN;
  return { depth, ext, rain, cause, ground: g.kind[c] ? g.h0[c] : r.hEff[c] };
}

export interface ProbeRow extends CellReading {
  presetId: string;
  /** ระดับน้ำเจ้าพระยาที่ปากคลองตลาด (ม.) */
  riverMid: number;
}

export interface ProbeResult {
  lat: number;
  lon: number;
  grid: GridKind;
  cell: number;
  /** 0 พื้นดิน, 1 แม่น้ำ, 2 ทะเล */
  kind: number;
  /** ชนิดแนวป้องกันที่ช่องนี้ (0 = ไม่มี) */
  wall: number;
  /** อยู่บนคลอง (เฉพาะกริดศึกษา) */
  canal: boolean;
  rows: ProbeRow[];
  /** จำนวน preset ที่ท่วมเกิน FLOOD_DEPTH แยกตามสาเหตุ [ฝน, แม่น้ำ, ทะเล, น้ำเหนือ] */
  causeCount: number[];
  /** สาเหตุที่ทำให้ท่วมบ่อยที่สุด หรือ -1 ถ้าไม่ท่วมเลย */
  mainCause: number;
}

/** ผลที่จุดเดียวสำหรับทุกสถานการณ์ตัวอย่าง หรือ null ถ้าอยู่นอกแบบจำลอง */
export function probeLocation(
  overview: Grid,
  study: StudyGrid | null,
  lat: number,
  lon: number,
): ProbeResult | null {
  const sc = study ? cellOf(study, lat, lon) : -1;
  const useStudy = sc >= 0;
  const g: Grid = useStudy ? study! : overview;
  const c = useStudy ? sc : cellOf(overview, lat, lon);
  if (c < 0) return null;
  const causeCount = [0, 0, 0, 0];
  const rows = PRESETS.map((pr) => {
    const P = presetParams(pr);
    const ov = simulate(overview, P);
    const r = useStudy ? simulate(study!, P, nestBoundary(overview, ov, study!)) : ov;
    const read = readCell(g, r, c);
    if (!g.kind[c] && read.depth > FLOOD_DEPTH && read.cause >= 0) causeCount[read.cause]++;
    return { presetId: pr.id, riverMid: r.riverMid, ...read };
  });
  const max = Math.max(...causeCount);
  return {
    lat,
    lon,
    grid: useStudy ? 'study' : 'overview',
    cell: c,
    kind: g.kind[c],
    wall: g.wallType[c],
    canal: useStudy ? study!.canal[c] === 1 : false,
    rows,
    causeCount,
    mainCause: max > 0 ? causeCount.indexOf(max) : -1,
  };
}
