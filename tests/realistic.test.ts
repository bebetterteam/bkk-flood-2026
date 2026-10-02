import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildRoadGeometry, MARK_RAIL } from '../src/scene/realistic/roadGeometry';
import { buildRealBuildingTiles } from '../src/scene/realistic/buildingGeometryReal';
import { groundMask, maskMeta, placeTrees } from '../src/scene/realistic/landscape';

const DIR = new URL('../public/data/study-area/', import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));
const ab = (f: string) => {
  const b = readFileSync(DIR + f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const roadsMeta = json('roads.json');
const toWorld = (x: number, y: number): [number, number] => [x / 10, -y / 10];
const finite = (a: Float32Array) => a.every((v) => Number.isFinite(v));
const timings: string[] = [];

describe('geometry โหมดสมจริง', () => {
  it('ถนน: index ถูกต้อง, ไม่มี NaN, ทางยกระดับสูงกว่าพื้นและมีเสา', () => {
    const t = performance.now();
    const g = buildRoadGeometry(roadsMeta, ab('roads.bin'), toWorld, () => 0, 0.1);
    timings.push(
      `roads ${(performance.now() - t).toFixed(0)} ms, ${g.index.length / 3} tris, ${g.pillars.length / 4} pillars`,
    );
    const nv = g.position.length / 3;
    expect(g.index.every((i) => i < nv)).toBe(true);
    expect(finite(g.position) && finite(g.uv) && finite(g.roadInfo)).toBe(true);
    let maxY = 0;
    for (let i = 1; i < g.position.length; i += 3) maxY = Math.max(maxY, g.position[i]);
    expect(maxY).toBeGreaterThan(1.3); // ≥ 13 ม. (ทางด่วน)
    expect(g.pillars.length / 4).toBeGreaterThan(100);
    let rail = 0;
    for (let i = 3; i < g.roadInfo.length; i += 4) if ((g.roadInfo[i] % 16) & MARK_RAIL) rail++;
    expect(rail).toBeGreaterThan(0);
  });
  it('ตึกสมจริง: index/กลุ่มถูกต้อง, ไม่มี NaN, มีหลังคากระเบื้อง (วัด/บ้าน)', () => {
    const t = performance.now();
    const tiles = buildRealBuildingTiles(json('buildings.json'), ab('buildings.bin'), toWorld, () => 0, 0.1);
    let tris = 0,
      tileRoof = 0;
    for (const T of tiles) {
      const nv = T.position.length / 3;
      expect(T.index.every((i) => i < nv)).toBe(true);
      expect(finite(T.position) && finite(T.uv) && finite(T.color)).toBe(true);
      expect(T.groups.reduce((s, [, c]) => s + c, 0)).toBe(T.index.length);
      tris += T.index.length / 3;
      tileRoof += T.groups[2][1] / 3;
    }
    timings.push(
      `buildings ${(performance.now() - t).toFixed(0)} ms, ${tris} tris (หลังคากระเบื้อง ${tileRoof})`,
    );
    expect(tileRoof).toBeGreaterThan(10000);
    expect(tris).toBeLessThan(3_000_000);
  });
  it('mask พื้นและต้นไม้', () => {
    const t = performance.now();
    const meta = maskMeta(roadsMeta.bbox, roadsMeta.metersPerDegree);
    const m = groundMask(meta, json('green.json').polygons, json('canals.json'));
    expect(m.length).toBe(meta.nx * meta.nz * 4);
    let grass = 0;
    for (let i = 0; i < m.length; i += 4) if (m[i]) grass++;
    expect(grass / (m.length / 4)).toBeGreaterThan(0.02);
    const trees = placeTrees(
      {
        roads: { meta: roadsMeta, bin: new ArrayBuffer(0) },
        green: json('green.json').polygons,
        trees: { ...json('trees.json'), xy: new Uint16Array(ab('trees.bin')) },
      },
      roadsMeta.bbox,
      roadsMeta.metersPerDegree,
    );
    timings.push(`mask+trees ${(performance.now() - t).toFixed(0)} ms, ${trees.length / 4} trees`);
    expect(trees.length / 4).toBeGreaterThan(13000);
    expect(trees.length / 4).toBeLessThanOrEqual(40000);
    expect(finite(trees)).toBe(true);
    console.info(timings.join('\n'));
  });
});
