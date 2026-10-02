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
    let bad = 0;
    for (const v of dem) if (!Number.isFinite(v) || v < -5 || v > 30) bad++;
    expect(bad).toBe(0);
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
    // นับจุดที่ผิดแล้ว assert ครั้งเดียว (expect ทีละจุด ~85 หมื่นครั้งช้าจน timeout เมื่อรันพร้อมเทสต์อื่น)
    const [W, H] = bm.extentMeters;
    let bad = 0;
    for (let k = 0; k < verts.length; k += 2)
      if (
        verts[k] * bm.quantMeters > W + bm.quantMeters ||
        verts[k + 1] * bm.quantMeters > H + bm.quantMeters
      )
        bad++;
    expect(bad).toBe(0);
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

describe('ข้อมูลโหมดสมจริง (MVP 3)', () => {
  const rj = JSON.parse(readFileSync(OUT + 'roads.json', 'utf8'));
  const rb = readFileSync(OUT + 'roads.bin');
  const rv = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(rb.buffer as ArrayBuffer, rb.byteOffset + rj.offsets[k][0], rj.offsets[k][1]);
  it('ถนน: ความกว้าง > 0, จุดอยู่ใน bbox, index ไม่เกิน, ความสูงยกสมเหตุสมผล', () => {
    const ls = rv(Uint32Array, 'lineStart'),
      lc = rv(Uint16Array, 'lineCount'),
      wd = rv(Uint16Array, 'widthDm'),
      v = rv(Uint16Array, 'verts'),
      lift = rv(Uint16Array, 'liftDm'),
      cls = rv(Uint8Array, 'cls');
    const [W, H] = rj.extentMeters;
    let bad = 0;
    for (let i = 0; i < rj.count; i++) {
      if (!(wd[i] > 0) || lc[i] < 2 || ls[i] + lc[i] > rj.vertices || cls[i] >= rj.classes.length) bad++;
    }
    for (let k = 0; k < rj.vertices; k++) {
      if (v[k * 2] * rj.quantMeters > W + 0.25 || v[k * 2 + 1] * rj.quantMeters > H + 0.25) bad++;
      if (lift[k] > 400) bad++; // ≤ 40 ม.
    }
    expect(bad).toBe(0);
    expect(lift.some((x) => x >= 140)).toBe(true); // มีทางยกระดับ
  });
  it('พื้นที่สีเขียวอยู่ใน bbox และมีประเภทที่รู้จัก', () => {
    const g = JSON.parse(readFileSync(OUT + 'green.json', 'utf8')).polygons;
    expect(g.length).toBeGreaterThan(0);
    for (const p of g) {
      expect(['grass', 'wood', 'temple', 'pitch', 'cemetery']).toContain(p.kind);
      for (const pt of p.outer) expect(inBbox(pt)).toBe(true);
    }
  });
  it('ต้นไม้: จำนวนตรงกับไฟล์', () => {
    const tj = JSON.parse(readFileSync(OUT + 'trees.json', 'utf8'));
    expect(readFileSync(OUT + 'trees.bin').length).toBe(tj.count * 4);
  });
  it('ตึก: อาร์เรย์สไตล์ครบและค่าอยู่ในช่วง', () => {
    const bm = JSON.parse(readFileSync(OUT + 'buildings.json', 'utf8'));
    for (const k of ['use', 'roofShape', 'colour', 'roofColour', 'levels'])
      expect(bm.offsets[k][1]).toBe(bm.count);
    const bin = readFileSync(OUT + 'buildings.bin');
    const use = new Uint8Array(bin.buffer, bin.byteOffset + bm.offsets.use[0], bm.count);
    const col = new Uint8Array(bin.buffer, bin.byteOffset + bm.offsets.colour[0], bm.count);
    expect(use.every((u) => u < bm.style.use.length)).toBe(true);
    expect(col.every((c) => c <= bm.style.palette.length)).toBe(true);
  });
});
