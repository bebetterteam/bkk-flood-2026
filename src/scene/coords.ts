/**
 * แปลงพิกัดภูมิศาสตร์ → พิกัดโลก three.js
 * S = 100 หน่วยโลกต่อ 1 องศา (1 หน่วยโลก ≈ 1.08 กม. แนวตะวันออก-ตะวันตก, ≈ 1.11 กม. แนวเหนือ-ใต้)
 * VEX = ตัวขยายแนวตั้ง: y = ความสูง (ม.) × VEX
 */
import { LATC, LONC, LAT0, LAT1, LON0, LON1, NX } from '../sim/coords';

export const S = 100,
  VEX = 0.6;
export const wx = (lon: number): number => (lon - LONC) * S;
export const wz = (lat: number): number => (LATC - lat) * S;
/** ขนาดเซลล์ในหน่วยโลก */
export const CELL = ((LON1 - LON0) / (NX - 1)) * S;
/** พิกัดโลก (x, z) → lat/lon */
export const lonOfX = (x: number): number => x / S + LONC;
export const latOfZ = (z: number): number => LATC - z / S;
export const inBounds = (lat: number, lon: number): boolean =>
  !(lat < LAT0 || lat > LAT1 || lon < LON0 || lon > LON1);
