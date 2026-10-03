import { expect, it } from 'vitest';
import { buildGrid } from '../src/sim/grid';
import { FORECAST_CONFIG, dayParams, forecastLocation, type ForecastDayInput } from '../src/sim/forecast';
import { nestBoundary } from '../src/sim/nest';
import { cellOf, readCell } from '../src/sim/probe';
import { simulate } from '../src/sim/simulate';
import { loadStudyGrid } from './loadStudy';

const og = buildGrid();
const sg = loadStudyGrid(-2.5); // offset สมมติ (ทดสอบกลไก) ให้น้ำจากแม่น้ำเข้าถึงได้

it('พื้นที่ศึกษา: ความลึกต่อสมาชิกเท่ากับการจำลองแบบ nesting ที่ใส่ฝนนั้นจริง', () => {
  const lat = 13.7405,
    lon = 100.509; // เยาวราช
  const rates = [0, 60, 150, 300];
  const d: ForecastDayInput = {
    date: '2026-10-03',
    tide: 1.9,
    q: 9000,
    rain: FORECAST_CONFIG.rainPoints.map(() => rates),
    total: [],
    detRain: [],
    detTotal: [],
  };
  const r = forecastLocation(og, sg, lat, lon, { fetched: '', days: [d] })!;
  expect(r.grid).toBe('study');
  const c = cellOf(sg, lat, lon);
  const depths = rates.map((rain) => {
    const P = { ...dayParams(d), rain };
    return readCell(sg, simulate(sg, P, nestBoundary(og, simulate(og, P), sg)), c).depth;
  });
  expect(r.days[0].chance).toBeCloseTo(depths.filter((x) => x > 0.1).length / rates.length, 9);
  expect(r.days[0].depthP90).toBeCloseTo(Math.max(...depths), 6);
});
