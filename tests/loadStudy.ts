/** โหลดข้อมูลพื้นที่ศึกษาจาก public/ ใน Node (สำหรับเทสต์) */
import { readFileSync } from 'node:fs';
import cfg from '../config/study-area.json';
import { buildStudyGrid, type StudyInputs } from '../src/sim/studyGrid';

const ROOT = new URL('../public/data/study-area/', import.meta.url).pathname;

/** tile: แผ่นที่โหลด (ค่าเริ่มต้น = แผ่นเดิมของ MVP 2 ที่เทสต์ส่วนใหญ่อ้างตัวเลข) */
export function loadStudyInputs(verticalOffset = cfg.verticalOffset.value, tile = 'r3c2'): StudyInputs {
  const DIR = ROOT + tile + '/';
  const json = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));
  return {
    meta: json('meta.json'),
    dem: new Float32Array(readFileSync(DIR + 'dem.f32').buffer.slice(0)),
    river: json('river.json'),
    canals: json('canals.json'),
    verticalOffset,
    riverWallTop: cfg.riverWallTop,
  };
}
export const loadStudyGrid = (verticalOffset?: number, tile?: string) =>
  buildStudyGrid(loadStudyInputs(verticalOffset, tile));
