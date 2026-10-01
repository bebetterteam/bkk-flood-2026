/**
 * Frame = กริด + การฉายพิกัดของแต่ละโหมด ใช้ร่วมกันระหว่าง terrain/water/walls/labels/tooltip
 * - ภาพรวม: S = 100 หน่วยโลกต่อองศา, VEX = 0.6 (ดู scene/coords.ts)
 * - พื้นที่ศึกษา: 1 หน่วยโลก = 10 ม., พื้นขยายแนวดิ่งตาม config, ตึกใช้มาตราส่วนจริง
 */
import { NX, NZ, cellAt as ovCellAt, latAt, lonAt } from '../sim/coords';
import type { StudyMeta } from '../sim/studyGrid';
import { CELL, VEX, inBounds as ovInBounds, latOfZ, lonOfX, wx, wz } from './coords';

export interface Frame {
  nx: number;
  nz: number;
  /** ตำแหน่งโลกของกึ่งกลางช่อง (ภาพรวม: จุดกริด) */
  x(i: number): number;
  z(j: number): number;
  /** ความสูง (ม.) → y โลก */
  vex: number;
  /** ขนาดช่องในหน่วยโลก */
  cell: number;
  wx(lon: number): number;
  wz(lat: number): number;
  lonOfX(x: number): number;
  latOfZ(z: number): number;
  inBounds(lat: number, lon: number): boolean;
  cellAt(lat: number, lon: number): number;
}

export const overviewFrame: Frame = {
  nx: NX,
  nz: NZ,
  x: (i) => wx(lonAt(i)),
  z: (j) => wz(latAt(j)),
  vex: VEX,
  cell: CELL,
  wx,
  wz,
  lonOfX,
  latOfZ,
  inBounds: ovInBounds,
  cellAt: ovCellAt,
};

/** 1 หน่วยโลก = UNIT_M เมตร ในโหมดพื้นที่ศึกษา */
export const STUDY_UNIT_M = 10;

export function studyFrame(meta: StudyMeta, terrainExaggeration: number): Frame {
  const { nx, nz, dlat, dlon, bbox } = meta;
  const [mx, mz] = meta.cellMeters;
  const kx = mx / dlon / STUDY_UNIT_M,
    kz = mz / dlat / STUDY_UNIT_M; // หน่วยโลกต่อองศา
  const lonC = (bbox.west + bbox.east) / 2,
    latC = (bbox.south + bbox.north) / 2;
  const fwx = (lon: number) => (lon - lonC) * kx,
    fwz = (lat: number) => (latC - lat) * kz;
  const lonAtS = (i: number) => bbox.west + (i + 0.5) * dlon,
    latAtS = (j: number) => bbox.north - (j + 0.5) * dlat;
  return {
    nx,
    nz,
    x: (i) => fwx(lonAtS(i)),
    z: (j) => fwz(latAtS(j)),
    vex: terrainExaggeration / STUDY_UNIT_M,
    cell: mx / STUDY_UNIT_M,
    wx: fwx,
    wz: fwz,
    lonOfX: (x) => x / kx + lonC,
    latOfZ: (z) => latC - z / kz,
    inBounds: (lat, lon) => lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east,
    cellAt: (lat, lon) => {
      const i = Math.min(nx - 1, Math.max(0, Math.floor((lon - bbox.west) / dlon))),
        j = Math.min(nz - 1, Math.max(0, Math.floor((bbox.north - lat) / dlat)));
      return j * nx + i;
    },
  };
}
