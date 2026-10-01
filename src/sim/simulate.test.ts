import { describe, expect, it } from 'vitest';
import { buildGrid } from './grid';
import { DEFAULT_PARAMS, PRESETS, presetParams } from './presets';
import { simulate, type SimParams } from './simulate';
import { GOLDEN, GOLDEN_PKT_S } from './golden';

const grid = buildGrid();
const preset = (id: string) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error('no preset ' + id);
  return presetParams(p);
};
const run = (p: Partial<SimParams>) => simulate(grid, { ...DEFAULT_PARAMS, ...p });
const range = (a: number, b: number, s: number) => {
  const o: number[] = [];
  for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(3));
  return o;
};
/** คืนรายการจุดที่พื้นที่ท่วมลดลงเมื่อค่า key เพิ่ม */
function decreases(key: 'rain' | 'flow' | 'tide', values: number[], base: Partial<SimParams>) {
  const bad: [number, number, number][] = [];
  let prev = -Infinity;
  for (const v of values) {
    const a = run({ ...base, [key]: v }).area;
    if (a < prev) bad.push([v, prev, a]);
    prev = a;
  }
  return bad;
}

describe('presets ตามโจทย์', () => {
  it('วันปกติ: พื้นที่ท่วม (ไม่รวมชายเลน) < 20 ตร.กม.', () => {
    expect(simulate(grid, preset('normal')).area).toBeLessThan(20);
  });

  it('3 น้ำพร้อมกัน (2554): ระดับน้ำปากคลองตลาดต่ำกว่าสันเขื่อนกลางเมือง', () => {
    const s = simulate(grid, preset('y2011'));
    expect(s.riverMid).toBeLessThan(s.coreWall);
  });

  it('อนาคต: ระดับน้ำสูงกว่าสันเขื่อนกลางเมืองที่ทรุดแล้ว', () => {
    const s = simulate(grid, preset('future'));
    expect(s.coreWall).toBeLessThan(2.8);
    expect(s.riverMid).toBeGreaterThan(s.coreWall);
  });
});

describe('monotonic: เพิ่มน้ำแล้วพื้นที่ท่วมต้องไม่ลดลง', () => {
  const bases: [string, Partial<SimParams>][] = [
    ['ค่าเริ่มต้น', {}],
    ['3 น้ำ 2554', preset('y2011')],
    ['ฝน 60 มม. 3 ชม.', { rain: 60, dur: 3, flow: 3800, tide: 1.9 }],
  ];
  for (const [name, base] of bases) {
    it(`ฝน (${name})`, () => expect(decreases('rain', range(0, 150, 5), base)).toEqual([]));
    it(`น้ำเหนือ (${name})`, () => expect(decreases('flow', range(500, 5000, 100), base)).toEqual([]));
    it(`น้ำทะเล (${name})`, () => expect(decreases('tide', range(0.5, 2.6, 0.05), base)).toEqual([]));
  }

  // ข้อจำกัดที่รู้แล้ว: เมื่อฝนหนักมาก เซลล์ที่น้ำภายนอกเพิ่งเข้าถึงแบบตื้น ๆ จะนับน้ำฝนแค่ 30%
  // (tRain = e>0 ? r*0.3 : r) ความลึกรวมจึงลดลงได้ ไม่แก้สูตรในรอบ refactor นี้ — ดู CLAUDE.md
  it.fails('น้ำเหนือ เมื่อฝนหนักมาก (100 มม. 6 ชม.) — ข้อจำกัดที่รู้แล้ว', () => {
    expect(decreases('flow', range(500, 5000, 100), { rain: 100, dur: 6, tide: 1.5 })).toEqual([]);
  });
  it.fails('น้ำทะเล เมื่อฝนหนักมาก (100 มม. 6 ชม.) — ข้อจำกัดที่รู้แล้ว', () => {
    expect(decreases('tide', range(0.5, 2.6, 0.05), { rain: 100, dur: 6, flow: 2500 })).toEqual([]);
  });
});

describe('ปิดระบบป้องกันแล้วพื้นที่ท่วมต้องไม่ลดลง', () => {
  for (const pr of PRESETS) {
    it(pr.name, () => {
      const on = simulate(grid, presetParams(pr)).area;
      const wallsOff = simulate(grid, { ...presetParams(pr), walls: false }).area;
      const allOff = simulate(grid, { ...presetParams(pr), walls: false, dikes: false }).area;
      expect(wallsOff).toBeGreaterThanOrEqual(on);
      expect(allOff).toBeGreaterThanOrEqual(on);
    });
  }
});

describe('ผลตรงกับต้นแบบ (golden)', () => {
  it('ตำแหน่งปากคลองตลาดบนแม่น้ำ', () => {
    expect(grid.pktS).toBe(GOLDEN_PKT_S);
  });
  for (const pr of PRESETS) {
    it(pr.name, () => {
      const s = simulate(grid, presetParams(pr));
      const g = GOLDEN[pr.id as keyof typeof GOLDEN];
      expect({
        riverMid: s.riverMid,
        cap: s.cap,
        excess: s.excess,
        area: s.area,
        deep: s.deep,
        by: s.by,
        maxArr: s.maxArr,
      }).toEqual(g);
    });
  }
});
