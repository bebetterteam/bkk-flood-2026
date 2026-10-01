/** โหลดข้อมูลพื้นที่ศึกษาจาก public/ ใน Node (สำหรับเทสต์) */
import { readFileSync } from 'node:fs';
import cfg from '../config/study-area.json';
import { buildStudyGrid, type StudyInputs } from '../src/sim/studyGrid';

const DIR = new URL('../public/data/study-area/', import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));

export function loadStudyInputs(verticalOffset = cfg.verticalOffset.value): StudyInputs {
  return {
    meta: json('meta.json'),
    dem: new Float32Array(readFileSync(DIR + 'dem.f32').buffer.slice(0)),
    river: json('river.json'),
    canals: json('canals.json'),
    verticalOffset,
    riverWallTop: cfg.riverWallTop,
  };
}
export const loadStudyGrid = (verticalOffset?: number) => buildStudyGrid(loadStudyInputs(verticalOffset));
