import { readFileSync } from 'node:fs';

export interface StudyConfig {
  name: string;
  bbox: { south: number; west: number; north: number; east: number };
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
export const RAW = ROOT + 'data/raw/';
export const OUT = ROOT + 'public/data/study-area/';
export const REPORTS = ROOT + 'reports/';

export const loadConfig = (): StudyConfig =>
  JSON.parse(readFileSync(ROOT + 'config/study-area.json', 'utf8'));

/** เมตรต่อองศา ที่ละติจูด lat (ทรงกลมประมาณ — พอสำหรับพื้นที่ ~10 กม.) */
export const M_PER_DEG_LAT = 110_600;
export const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export const UA = 'bkk-flood-lab/0.2 (educational flood model; github none)';
