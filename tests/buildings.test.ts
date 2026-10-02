import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildBuildingTiles } from '../src/scene/study/buildingGeometry';

const DIR = new URL('../public/data/study-area/', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(DIR + 'buildings.json', 'utf8'));
const buf = readFileSync(DIR + 'buildings.bin');
const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

it('สร้าง geometry ตึกได้ครบ ไม่มีค่าผิดปกติ และไม่ช้าผิดปกติ', () => {
  const t = performance.now();
  const { tiles } = buildBuildingTiles(
    meta,
    bin,
    (x, y) => [x / 10, -y / 10],
    () => 0,
    0.1,
  );
  const ms = performance.now() - t;
  // ปกติ ~0.1–0.5 วิ; เกณฑ์หลวมไว้ 10 วิ เพราะรันพร้อมเทสต์อื่นแล้ว CPU แย่งกัน — กันแค่กรณีช้าผิดปกติจริง
  expect(ms).toBeLessThan(10_000);
  const seen = new Set<number>();
  let tris = 0,
    badIndex = 0,
    badPos = 0;
  for (const T of tiles) {
    const nv = T.position.length / 3;
    for (const i of T.index) if (i >= nv) badIndex++;
    for (const v of T.position) if (!Number.isFinite(v)) badPos++;
    for (const b of T.faceBuilding) seen.add(b);
    tris += T.faceBuilding.length;
  }
  expect(badIndex).toBe(0);
  expect(badPos).toBe(0);
  expect(seen.size).toBe(meta.count);
  expect(tris).toBeLessThan(3_000_000);
  console.info(`buildings: ${meta.count} ตึก, ${tris} สามเหลี่ยม, ${ms.toFixed(0)} ms`);
});
