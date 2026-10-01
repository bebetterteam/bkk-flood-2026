/** โหลดข้อมูลพื้นที่ศึกษาที่ประมวลผลแล้วจาก public/data/study-area/ (สร้างด้วย npm run data) */
import cfg from '../../config/study-area.json';
import type { StudyInputs, StudyMeta } from '../sim/studyGrid';

export interface BuildingsMeta {
  count: number;
  rings: number;
  vertices: number;
  quantMeters: number;
  extentMeters: [number, number];
  metersPerDegree: [number, number];
  bbox: StudyMeta['bbox'];
  offsets: Record<string, [number, number]>;
  heightSources: string[];
  heightSourceCount: number[];
  typeNames: string[];
  attribution: string;
}
export interface StudyData {
  inputs: StudyInputs;
  buildings: { meta: BuildingsMeta; bin: ArrayBuffer };
}

export const STUDY_CONFIG = cfg;

export async function loadStudyData(
  base = import.meta.env.BASE_URL + 'data/study-area/',
): Promise<StudyData> {
  const get = async (f: string) => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`โหลด ${f} ไม่สำเร็จ (HTTP ${r.status})`);
    return r;
  };
  const [meta, dem, river, canals, bmeta, bin] = await Promise.all([
    get('meta.json').then((r) => r.json()),
    get('dem.f32').then((r) => r.arrayBuffer()),
    get('river.json').then((r) => r.json()),
    get('canals.json').then((r) => r.json()),
    get('buildings.json').then((r) => r.json()),
    get('buildings.bin').then((r) => r.arrayBuffer()),
  ]);
  return {
    inputs: {
      meta,
      dem: new Float32Array(dem),
      river,
      canals,
      verticalOffset: cfg.verticalOffset.value,
      riverWallTop: cfg.riverWallTop,
    },
    buildings: { meta: bmeta, bin },
  };
}
