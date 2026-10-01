/**
 * ระบบพิกัดของกริด: NX × NZ เซลล์ ครอบ LAT0..LAT1, LON0..LON1
 * i = แกนตะวันออก (lon), j = แกนใต้ (lat ลดลงเมื่อ j เพิ่ม), index = j*NX + i
 */
import { LAT0, LAT1, LON0, LON1 } from '../data/geo';
import { clamp } from './math';

export { LAT0, LAT1, LON0, LON1 };
export const NX = 200,
  NZ = 168,
  N = NX * NZ;
export const LATC = (LAT0 + LAT1) / 2,
  LONC = (LON0 + LON1) / 2;
export const lonAt = (i: number): number => LON0 + ((LON1 - LON0) * i) / (NX - 1);
export const latAt = (j: number): number => LAT1 - ((LAT1 - LAT0) * j) / (NZ - 1);
export const idx = (i: number, j: number): number => j * NX + i;
/** พื้นที่ต่อเซลล์ (ตร.กม.) */
export const CELL_KM2 = ((LON1 - LON0) / (NX - 1)) * 108.1 * (((LAT1 - LAT0) / (NZ - 1)) * 110.6);
/** index ของเซลล์ที่ใกล้ (lat, lon) ที่สุด */
export function cellAt(lat: number, lon: number): number {
  const i = clamp(Math.round(((lon - LON0) / (LON1 - LON0)) * (NX - 1)), 0, NX - 1),
    j = clamp(Math.round(((LAT1 - lat) / (LAT1 - LAT0)) * (NZ - 1)), 0, NZ - 1);
  return idx(i, j);
}
