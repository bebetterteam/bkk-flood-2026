/** ตรวจไฟล์ข้อมูลพื้นที่ศึกษาที่ประมวลผลแล้ว (public/data/study-area/) */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUT, loadConfig } from './lib/config.ts';

const cfg = loadConfig();
const meta = JSON.parse(readFileSync(OUT + 'meta.json', 'utf8'));
const dem = new Float32Array(readFileSync(OUT + 'dem.f32').buffer.slice(0));
const { south, west, north, east } = cfg.bbox;
const EPS = 1e-6;
const inBbox = ([lat, lon]: number[]) =>
  lat >= south - EPS && lat <= north + EPS && lon >= west - EPS && lon <= east + EPS;

describe('DEM', () => {
  it('meta ตรงกับ config และขนาดไฟล์', () => {
    expect(meta.bbox).toEqual(cfg.bbox);
    expect(dem.length).toBe(meta.nx * meta.nz);
    expect(meta.nx * meta.dlon).toBeCloseTo(east - west, 9);
    expect(meta.nz * meta.dlat).toBeCloseTo(north - south, 9);
  });
  it('ไม่มี NaN และความสูงอยู่ในช่วงที่สมเหตุสมผล (−5…30 ม.)', () => {
    for (const v of dem) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThanOrEqual(30);
    }
  });
  it('มีการระบุ datum และสถานะ verticalOffset', () => {
    expect(meta.verticalDatum).toBe('EGM2008');
    expect(meta.verticalOffset.status).toBeTruthy();
  });
});

describe('ตึก', () => {
  const bm = JSON.parse(readFileSync(OUT + 'buildings.json', 'utf8'));
  const bin = readFileSync(OUT + 'buildings.bin');
  const view = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(bin.buffer as ArrayBuffer, bin.byteOffset + bm.offsets[k][0], bm.offsets[k][1]);
  const verts = view(Uint16Array, 'verts'),
    heightDm = view(Uint16Array, 'heightDm'),
    src = view(Uint8Array, 'src'),
    ringStart = view(Uint32Array, 'ringStart'),
    ringCount = view(Uint8Array, 'ringCount'),
    rvs = view(Uint32Array, 'ringVertStart'),
    rvc = view(Uint16Array, 'ringVertCount');
  it('จำนวนตรงกับ header และ offsets อยู่ในไฟล์', () => {
    expect(heightDm.length).toBe(bm.count);
    expect(verts.length).toBe(bm.vertices * 2);
    for (const [o, n] of Object.values(bm.offsets) as [number, number][])
      expect(o + n).toBeLessThanOrEqual(bin.length);
  });
  it('ทุกจุดอยู่ใน bbox', () => {
    const [W, H] = bm.extentMeters;
    for (let k = 0; k < verts.length; k += 2) {
      expect(verts[k] * bm.quantMeters).toBeLessThanOrEqual(W + bm.quantMeters);
      expect(verts[k + 1] * bm.quantMeters).toBeLessThanOrEqual(H + bm.quantMeters);
    }
  });
  it('ความสูง > 0 และแหล่งที่มาถูกต้อง; ring อ้างอิงไม่เกินขอบ', () => {
    for (let i = 0; i < bm.count; i++) {
      expect(heightDm[i]).toBeGreaterThan(0);
      expect(src[i]).toBeLessThan(3);
      const last = ringStart[i] + ringCount[i] - 1;
      expect(last).toBeLessThan(bm.rings);
      expect(rvs[last] + rvc[last]).toBeLessThanOrEqual(bm.vertices);
      expect(rvc[ringStart[i]]).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('แม่น้ำและคลอง', () => {
  const river = JSON.parse(readFileSync(OUT + 'river.json', 'utf8'));
  const canals = JSON.parse(readFileSync(OUT + 'canals.json', 'utf8'));
  it('polygon แม่น้ำอยู่ใน bbox', () => {
    expect(river.polygons.length).toBeGreaterThan(0);
    for (const p of river.polygons)
      for (const pt of [p.outer, ...p.holes].flat()) expect(inBbox(pt)).toBe(true);
  });
  it('คลอง polygon อยู่ใน bbox และเส้นคลองอยู่ใกล้ bbox (ขอบ 30 ม.)', () => {
    for (const p of canals.polygons) for (const pt of p.outer) expect(inBbox(pt)).toBe(true);
    const m = 0.0003;
    for (const l of canals.lines)
      for (const [lat, lon] of l.pts) {
        expect(lat).toBeGreaterThan(south - m);
        expect(lat).toBeLessThan(north + m);
        expect(lon).toBeGreaterThan(west - m);
        expect(lon).toBeLessThan(east + m);
      }
  });
});
