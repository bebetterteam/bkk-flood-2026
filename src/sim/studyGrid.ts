/**
 * กริดของ "พื้นที่ศึกษา" จากข้อมูลจริง (DEM + OSM) — pure function ไม่พึ่ง three.js/DOM
 *
 * กติกาเดียวกับภาพรวม: แม่น้ำเป็นแหล่งน้ำ (ระดับตาม riverLevel), คลองไม่ใช่แหล่งน้ำ (มีประตูน้ำ)
 * และไม่กั้นการไหล (เป็นพื้นดินตาม DEM, เก็บ mask ไว้วาดเท่านั้น), เขื่อนตามขอบแม่น้ำ
 * ค่าที่ผูกกับจำนวนช่อง (loss, รัศมี pond, เวลาแอนิเมชัน) แปลงตามขนาดช่องจริง
 */
import { PAK_KHLONG_TALAT, RIVER } from '../data/geo';
import {
  OVERVIEW_ARRIVAL_SCALE,
  OVERVIEW_CELL_M,
  OVERVIEW_LOSS,
  OVERVIEW_POND_RADIUS,
  RIVER_CELL,
  WALL_RIVER,
  pondFactor,
  subWeightAt,
  urbanAt,
  type Grid,
} from './grid';
import { distPoly } from './math';
import { rasterizeLines, rasterizePolygons } from './raster';

export interface StudyMeta {
  name: string;
  bbox: { south: number; west: number; north: number; east: number };
  nx: number;
  nz: number;
  dlat: number;
  dlon: number;
  cellMeters: [number, number];
  source: { id: string; license: string; citation: string };
}
export interface WaterPolygon {
  id: string;
  name: string | null;
  outer: number[][];
  holes: number[][][];
  areaKm2: number;
}
export interface StudyInputs {
  meta: StudyMeta;
  /** ความสูง DEM ดิบ (EGM2008) */
  dem: Float32Array;
  river: { polygons: WaterPolygon[] };
  canals: {
    lines: { name: string | null; width: number | null; pts: number[][] }[];
    polygons: WaterPolygon[];
  };
  /** ม. — ความสูง ม.รทก. = DEM + verticalOffset */
  verticalOffset: number;
  /** สันเขื่อนริมแม่น้ำ (ม.รทก.) */
  riverWallTop: number;
}

export interface StudyGrid extends Grid {
  /** 1 = คลอง/แหล่งน้ำอื่นที่ไม่ใช่แหล่งน้ำของแบบจำลอง (ใช้วาดเท่านั้น) */
  canal: Uint8Array;
  /** ความสูงพื้นจาก DEM + offset (ก่อนทรุด) ของทุกช่อง รวมช่องแม่น้ำ (ใช้แสดงผล) */
  demMsl: Float32Array;
  meta: StudyMeta;
  /** ขนาดช่องเฉลี่ย (ม.) */
  cellM: number;
}

/** polygon เป็นแม่น้ำเจ้าพระยาหรือไม่: ไม่ใช่ชื่อคลอง และจุดส่วนใหญ่อยู่ใกล้แนวแม่น้ำโดยประมาณ */
export function isMainRiver(p: WaterPolygon): boolean {
  if (p.name && p.name.includes('คลอง')) return false;
  const near = p.outer.filter(([la, lo]) => distPoly(la, lo, RIVER).d < 0.008).length;
  return near / p.outer.length >= 0.3;
}

/** ขอบกริด (ช่องที่อยู่ติดขอบ) เรียงรอบ */
export function edgeCells(nx: number, nz: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < nx; i++) out.push(i, (nz - 1) * nx + i);
  for (let j = 1; j < nz - 1; j++) out.push(j * nx, j * nx + nx - 1);
  return out;
}

export function buildStudyGrid(inp: StudyInputs): StudyGrid {
  const { meta, dem } = inp;
  const { nx, nz, bbox } = meta;
  const N = nx * nz;
  const cellM = Math.sqrt(meta.cellMeters[0] * meta.cellMeters[1]);
  const ratio = cellM / OVERVIEW_CELL_M;

  const main = inp.river.polygons.filter(isMainRiver);
  const other = inp.river.polygons.filter((p) => !isMainRiver(p));
  const riverMask = rasterizePolygons(meta, main);
  const canal = rasterizePolygons(meta, [...other, ...inp.canals.polygons]);
  rasterizeLines(
    meta,
    inp.canals.lines.map((l) => l.pts),
    canal,
  );

  const kind = new Uint8Array(N),
    h0 = new Float32Array(N),
    demMsl = new Float32Array(N),
    subW = new Float32Array(N),
    riverS = new Float32Array(N),
    wallType = new Uint8Array(N),
    wallBase = new Float32Array(N),
    urban = new Float32Array(N),
    intertidal = new Uint8Array(N);
  const latAt = (j: number) => bbox.north - (j + 0.5) * meta.dlat,
    lonAt = (i: number) => bbox.west + (i + 0.5) * meta.dlon;

  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i,
        lat = latAt(j),
        lon = lonAt(i);
      demMsl[c] = dem[c] + inp.verticalOffset;
      urban[c] = urbanAt(lat, lon);
      subW[c] = subWeightAt(lat, lon);
      if (riverMask[c]) {
        kind[c] = RIVER_CELL;
        h0[c] = -1.5; // ท้องน้ำ (เหมือนภาพรวม)
        riverS[c] = 1 - distPoly(lat, lon, RIVER).t;
        canal[c] = 0;
      } else h0[c] = demMsl[c];
    }
  // เขื่อนริมแม่น้ำ: ช่องพื้นดินที่ติดแม่น้ำ (8 ทิศ)
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (kind[c]) continue;
      let bank = false;
      for (let dj = -1; dj <= 1 && !bank; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di,
            jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && kind[jj * nx + ii] === RIVER_CELL) bank = true;
        }
      if (bank) {
        wallType[c] = WALL_RIVER;
        wallBase[c] = inp.riverWallTop;
      }
    }
  const pond = pondFactor(nx, nz, kind, h0, urban, Math.round(OVERVIEW_POND_RADIUS / ratio));
  const pktS = 1 - distPoly(PAK_KHLONG_TALAT[0], PAK_KHLONG_TALAT[1], RIVER).t;
  const [pi, pj] = [
    Math.floor((PAK_KHLONG_TALAT[1] - bbox.west) / meta.dlon),
    Math.floor((bbox.north - PAK_KHLONG_TALAT[0]) / meta.dlat),
  ];

  return {
    kind,
    h0,
    subW,
    riverS,
    wallType,
    wallBase,
    urban,
    intertidal,
    pond,
    pktS,
    nx,
    nz,
    cellKm2: (meta.cellMeters[0] * meta.cellMeters[1]) / 1e6,
    loss: OVERVIEW_LOSS * ratio,
    arrivalScale: OVERVIEW_ARRIVAL_SCALE * ratio,
    northInflow: false,
    coreWallBase: inp.riverWallTop,
    // ค่าทรุดที่จุดอ้างอิงปากคลองตลาด (ใช้ร่วมทั้งเมือง) — คิดจากกึ่งกลางช่องที่จุดนั้นตกอยู่ แม้อยู่นอกแผ่นนี้
    coreSubW: subWeightAt(latAt(pj), lonAt(pi)),
    canal,
    demMsl,
    meta,
    cellM,
  };
}
