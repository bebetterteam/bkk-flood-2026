import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cfg from '../config/study-area.json';
import { allTiles, neighborTile, parseTileId, tileAt, tileBbox } from '../src/sim/tiles';
import { buildStudyGrid } from '../src/sim/studyGrid';
import { loadStudyInputs } from './loadStudy';

const T = cfg.tiling;
const index = JSON.parse(
  readFileSync(new URL('../public/data/study-area/index.json', import.meta.url).pathname, 'utf8'),
);

describe('ตารางแผ่น', () => {
  it('แผ่นเริ่มต้น r3c2 = bbox พื้นที่ศึกษาเดิมพอดี', () => {
    expect(tileBbox(T, 'r3c2')).toEqual({ south: 13.7, west: 100.48, north: 13.78, east: 100.58 });
  });
  it('tileAt กับ tileBbox ไปกลับได้ทุกแผ่น (จุดกลางและมุม SW)', () => {
    for (const id of allTiles(T)) {
      const b = tileBbox(T, id);
      expect(tileAt(T, (b.south + b.north) / 2, (b.west + b.east) / 2)).toBe(id);
      expect(tileAt(T, b.south, b.west)).toBe(id);
    }
  });
  it('แผ่นติดกันพอดี ไม่ทับไม่เว้น', () => {
    for (const id of allTiles(T)) {
      const b = tileBbox(T, id);
      const e = neighborTile(T, id, 'e'),
        s = neighborTile(T, id, 's');
      if (e) expect(tileBbox(T, e).west).toBe(b.east);
      if (s) expect(tileBbox(T, s).north).toBe(b.south);
    }
    expect(neighborTile(T, 'r0c0', 'n')).toBeNull();
    expect(parseTileId('r6c5')).toEqual([6, 5]);
  });
  it('ตารางครอบกรุงเทพฯ ทั้งหมด (lat 13.49–13.96, lon 100.33–100.94)', () => {
    for (const [la, lo] of [
      [13.49, 100.33],
      [13.96, 100.94],
      [13.49, 100.94],
      [13.96, 100.33],
    ])
      expect(tileAt(T, la, lo)).not.toBeNull();
    expect(tileAt(T, 13.3, 100.5)).toBeNull();
  });
});

describe('index.json', () => {
  it('ทุกเขตของ กทม. (50 เขต) อยู่ในอย่างน้อยหนึ่งแผ่น', () => {
    const names = new Set(index.tiles.flatMap((t: { districts: [string][] }) => t.districts.map(([n]) => n)));
    expect(names.size).toBe(50);
  });
  it('แผ่นที่มีข้อมูล = config.built', () => {
    const built = index.tiles.filter((t: { built: boolean }) => t.built).map((t: { id: string }) => t.id);
    expect(built.sort()).toEqual([...cfg.built].sort());
  });
});

describe.each(cfg.built)('กริดแผ่น %s', (tile) => {
  const g = buildStudyGrid(loadStudyInputs(undefined, tile));
  it('ขนาดตาม bbox ของแผ่น และค่าทรุดที่จุดอ้างอิงเท่ากับแผ่นเริ่มต้น', () => {
    expect(g.meta.bbox).toEqual(tileBbox(T, tile));
    expect(g.coreSubW).toBeCloseTo(buildStudyGrid(loadStudyInputs()).coreSubW, 2);
  });
});
