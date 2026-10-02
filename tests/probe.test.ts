import { expect, it } from 'vitest';
import { buildGrid } from '../src/sim/grid';
import { cellOf, probeLocation, readCell } from '../src/sim/probe';
import { nestBoundary } from '../src/sim/nest';
import { PRESETS, presetParams } from '../src/sim/presets';
import { simulate } from '../src/sim/simulate';
import { loadStudyGrid } from './loadStudy';

const og = buildGrid();
const sg = loadStudyGrid();

it('จุดในพื้นที่ศึกษาใช้กริดศึกษา และค่าตรงกับการจำลองแบบ nesting', () => {
  const lat = 13.7405,
    lon = 100.509; // เยาวราช
  const p = probeLocation(og, sg, lat, lon)!;
  expect(p.grid).toBe('study');
  expect(p.cell).toBe(cellOf(sg, lat, lon));
  const P = presetParams(PRESETS[4]);
  const r = simulate(sg, P, nestBoundary(og, simulate(og, P), sg));
  expect(p.rows[4].depth).toBeCloseTo(readCell(sg, r, p.cell).depth, 9);
});

it('จุดนอกพื้นที่ศึกษาแต่ในภาพรวม ใช้กริดภาพรวม', () => {
  const p = probeLocation(og, sg, 13.67, 100.62)!;
  expect(p.grid).toBe('overview');
});
