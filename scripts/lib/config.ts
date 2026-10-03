import { readFileSync } from 'node:fs';
import { tileBbox, type Tiling } from '../../src/sim/tiles.ts';

export interface StudyConfig {
  name: string;
  /** bbox ของแผ่นที่กำลังประมวลผล (จาก tiling + --tile) */
  bbox: { south: number; west: number; north: number; east: number };
  tiling: Tiling;
  defaultTile: string;
  built: string[];
  cellMeters: number;
  dem: { source: 'fabdem' | 'copernicus'; fabdemZipUrl: string; fabdemTile: string; copernicusUrl: string };
  verticalOffset: { value: number; status: string; note: string };
  riverWallTop: number;
  buildings: {
    metersPerLevel: number;
    defaultHeight: number;
    defaultHeightByType: Record<string, number>;
    simplifyMeters: number;
  };
  overpassUrl: string;
}

export const ROOT = new URL('../../', import.meta.url).pathname;
const rawConfig = () => JSON.parse(readFileSync(ROOT + 'config/study-area.json', 'utf8'));

/**
 * แผ่นที่ script นี้ประมวลผล: --tile=r3c2 หรือ env TILE (ตั้งโดย scripts/run-tiles.ts) ไม่ระบุ = defaultTile
 * ทุกไฟล์ต่อแผ่นอยู่ใต้โฟลเดอร์ของแผ่น (raw OSM, ข้อมูลใน public/, รายงาน)
 */
export const TILE: string =
  process.argv.find((a) => a.startsWith('--tile='))?.split('=')[1] ??
  process.env.TILE ??
  rawConfig().defaultTile;

export const RAW = ROOT + 'data/raw/';
/** OSM ดิบของแผ่นนี้ */
export const RAW_OSM = RAW + 'osm/' + TILE + '/';
export const OUT_ROOT = ROOT + 'public/data/study-area/';
export const OUT = OUT_ROOT + TILE + '/';
export const REPORTS = ROOT + 'reports/tiles/' + TILE + '/';

export function loadConfig(tile = TILE): StudyConfig {
  const c = rawConfig();
  return { ...c, name: tile, bbox: tileBbox(c.tiling, tile) };
}

/** เมตรต่อองศา ที่ละติจูด lat (ทรงกลมประมาณ — พอสำหรับพื้นที่ ~10 กม.) */
export const M_PER_DEG_LAT = 110_600;
export const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export const UA = 'bkk-flood-lab/0.2 (educational flood model; github none)';
