import { describe, expect, it } from 'vitest';
import { DRY_DROP, WET, flowField, waterLevel } from '../src/scene/realistic/flood/fields';
import { loadStudyGrid } from './loadStudy';

describe('ระดับผิวน้ำ (dilation)', () => {
  // กริด 5×1: [เปียก, แห้ง, แห้ง, แห้ง, แห้ง]
  const nx = 5,
    nz = 1;
  const kind = new Uint8Array(5);
  const h = new Float32Array([1, 1.2, 1.4, 1.6, 1.8]);
  const d = new Float32Array([0.5, 0, 0, 0, 0]);
  it('ช่องเปียกได้ระดับ = พื้น + ความลึก ไม่เปลี่ยนจาก dilation', () => {
    const L = waterLevel(nx, nz, kind, h, d);
    expect(L[0]).toBeCloseTo(1.5, 6);
  });
  it('ช่องแห้งติดน้ำได้ระดับข้างเคียง (2 ชั้น) ที่เหลือต่ำกว่าพื้น', () => {
    const L = waterLevel(nx, nz, kind, h, d, undefined, 2);
    expect(L[1]).toBeCloseTo(1.5, 6);
    expect(L[2]).toBeCloseTo(1.5, 6);
    expect(L[3]).toBeCloseTo(1.6 - DRY_DROP, 6);
  });
  it('ความลึกต่ำกว่าเกณฑ์ถือว่าแห้ง; แม่น้ำเปียกเสมอ', () => {
    const L = waterLevel(
      1,
      1,
      new Uint8Array([0]),
      new Float32Array([2]),
      new Float32Array([WET / 2]),
      undefined,
      0,
    );
    expect(L[0]).toBeCloseTo(2 - DRY_DROP, 6);
    const R = waterLevel(
      1,
      1,
      new Uint8Array([1]),
      new Float32Array([-1.5]),
      new Float32Array([3]),
      undefined,
      0,
    );
    expect(R[0]).toBeCloseTo(1.5, 6);
  });
});

describe('ทิศการไหล', () => {
  const sg = loadStudyGrid();
  const { nx, nz, bbox, dlat, dlon } = sg.meta;
  const f = flowField(
    nx,
    nz,
    sg.kind,
    sg.h0,
    (i, j) => [bbox.north - (j + 0.5) * dlat, bbox.west + (i + 0.5) * dlon],
    1,
  );
  it('ช่องแม่น้ำไหลไปทางปากแม่น้ำ (ใต้) โดยรวม', () => {
    let sz = 0,
      n = 0;
    for (let c = 0; c < nx * nz; c++)
      if (sg.kind[c] === 1) {
        sz += f[c * 2 + 1];
        n++;
      }
    expect(n).toBeGreaterThan(1000);
    expect(sz / n).toBeGreaterThan(0.1); // z บวก = ใต้
  });
  it('ไม่มี NaN และขนาดไม่เกิน 1', () => {
    let bad = 0;
    for (let c = 0; c < nx * nz; c++) {
      const m = Math.hypot(f[c * 2], f[c * 2 + 1]);
      if (!Number.isFinite(m) || m > 1.0001) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('รถจอดริมถนน', () => {
  it('อยู่ใน bbox ไม่เกินจำนวนสูงสุด และไม่มี NaN', async () => {
    const { readFileSync } = await import('node:fs');
    const { placeCars } = await import('../src/scene/realistic/flood/props');
    const DIR = new URL('../public/data/study-area/r3c2/', import.meta.url).pathname;
    const meta = JSON.parse(readFileSync(DIR + 'roads.json', 'utf8'));
    const b = readFileSync(DIR + 'roads.bin');
    const cars = placeCars(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 7000);
    const n = cars.length / 4;
    expect(n).toBeGreaterThan(3000);
    expect(n).toBeLessThanOrEqual(7000);
    const [W, H] = meta.extentMeters;
    let bad = 0;
    for (let k = 0; k < n; k++) {
      const x = cars[k * 4],
        y = cars[k * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -5 || y < -5 || x > W + 5 || y > H + 5) bad++;
    }
    expect(bad).toBe(0);
  });
});
