/** งบประมาณต่อแผ่น: ทุกแผ่นที่มีข้อมูลต้องอยู่ในเพดานเดียวกับแผ่นเดิม (ฉากโหลดทีละแผ่น) */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cfg from '../config/study-area.json';
import { buildBuildingTiles } from '../src/scene/study/buildingGeometry';
import { buildRealBuildingTiles } from '../src/scene/realistic/buildingGeometryReal';
import { buildRoadGeometry } from '../src/scene/realistic/roadGeometry';
import { placeTrees } from '../src/scene/realistic/landscape';

const report: string[] = [];

describe.each(cfg.built)('แผ่น %s', (tile) => {
  const DIR = new URL(`../public/data/study-area/${tile}/`, import.meta.url).pathname;
  const json = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));
  const ab = (f: string) => {
    const b = readFileSync(DIR + f);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const toWorld = (x: number, y: number): [number, number] => [x / 10, -y / 10];

  it('สามเหลี่ยมตึก/ถนน < 3 ล้าน, ต้นไม้ ≤ 40,000, ไม่มี NaN', () => {
    const bm = json('buildings.json'),
      rm = json('roads.json');
    const simple = buildBuildingTiles(bm, ab('buildings.bin'), toWorld, () => 0, 0.1).tiles;
    const real = buildRealBuildingTiles(bm, ab('buildings.bin'), toWorld, () => 0, 0.1);
    const roads = buildRoadGeometry(rm, ab('roads.bin'), toWorld, () => 0, 0.1);
    const trees = placeTrees(
      {
        roads: { meta: rm, bin: new ArrayBuffer(0) },
        green: json('green.json').polygons,
        trees: { ...json('trees.json'), xy: new Uint16Array(ab('trees.bin')) },
      },
      rm.bbox,
      rm.metersPerDegree,
    );
    const sTris = simple.reduce((s, T) => s + T.faceBuilding.length, 0),
      rTris = real.reduce((s, T) => s + T.index.length / 3, 0),
      roadTris = roads.index.length / 3;
    report.push(
      `${tile}: ตึก ${bm.count} หลัง (${sTris}/${rTris} สามเหลี่ยม), ถนน ${roadTris}, ต้นไม้ ${trees.length / 4}`,
    );
    expect(sTris).toBeLessThan(3_000_000);
    expect(rTris).toBeLessThan(3_000_000);
    expect(roadTris).toBeLessThan(3_000_000);
    expect(trees.length / 4).toBeLessThanOrEqual(40000);
    expect(real.every((T) => T.position.every(Number.isFinite))).toBe(true);
    if (tile === cfg.built[cfg.built.length - 1]) console.info(report.join('\n'));
  });
});
