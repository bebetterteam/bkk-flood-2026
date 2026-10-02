import { describe, expect, it } from 'vitest';
import { buildGrid } from './grid';
import { PRESETS, presetParams } from './presets';
import { cellOf, probeLocation, readCell } from './probe';
import { simulate } from './simulate';
import { cellAt } from './coords';

const grid = buildGrid();

describe('probeLocation (กริดภาพรวม)', () => {
  it('นอกขอบเขตแบบจำลอง = null', () => {
    expect(probeLocation(grid, null, 13.3, 100.5)).toBeNull(); // ใต้ขอบล่าง
    expect(probeLocation(grid, null, 18.79, 98.98)).toBeNull(); // เชียงใหม่
  });
  it('ค่าที่จุดเท่ากับผลการจำลองที่ช่องเดียวกัน ทุก preset', () => {
    const lat = 13.67,
      lon = 100.62; // บางนา
    const p = probeLocation(grid, null, lat, lon)!;
    expect(p.grid).toBe('overview');
    expect(p.cell).toBe(cellAt(lat, lon));
    expect(p.rows.map((r) => r.presetId)).toEqual(PRESETS.map((x) => x.id));
    PRESETS.forEach((pr, k) => {
      const r = simulate(grid, presetParams(pr));
      const e = readCell(grid, r, p.cell);
      expect(p.rows[k].depth).toBeCloseTo(e.depth, 9);
      expect(p.rows[k].riverMid).toBeCloseTo(r.riverMid, 9);
      expect(p.rows[k].depth).toBeGreaterThanOrEqual(0);
    });
  });
  it('สรุปสาเหตุนับเฉพาะ preset ที่ท่วมเกิน 10 ซม.', () => {
    const p = probeLocation(grid, null, 13.67, 100.62)!;
    const flooded = p.rows.filter((r) => r.depth > 0.1).length;
    expect(p.causeCount.reduce((a, b) => a + b, 0)).toBe(flooded);
  });
  it('cellOf คืน -1 นอกกริด และ index ในกริด', () => {
    expect(cellOf(grid, 14.5, 100.5)).toBe(-1);
    expect(cellOf(grid, 13.75, 100.5)).toBe(cellAt(13.75, 100.5));
  });
});
