import { describe, expect, it } from 'vitest';
import { buildGrid } from './grid';
import { cellOf, readCell } from './probe';
import {
  FORECAST_CONFIG as cfg,
  dayOfYear,
  dayParams,
  flowFromDischarge,
  forecastLocation,
  nearestRainPoint,
  parseForecast,
  peakRainRate,
  rainNeeded,
  type ForecastDayInput,
  type ForecastInput,
} from './forecast';
import { simulate } from './simulate';

const grid = buildGrid();
const BANGNA = [13.67, 100.62] as const;

const day = (rates: number[], extra: Partial<ForecastDayInput> = {}): ForecastDayInput => ({
  date: '2026-10-03',
  tide: 1.2,
  q: null,
  rain: cfg.rainPoints.map(() => rates),
  ...extra,
});
const input = (...days: ForecastDayInput[]): ForecastInput => ({ fetched: '2026-10-02T12:00:00Z', days });

describe('แปลงพยากรณ์เป็นพารามิเตอร์', () => {
  it('dayOfYear ใช้ปฏิทินอธิกสุรทิน', () => {
    expect(dayOfYear('2026-01-01')).toBe(0);
    expect(dayOfYear('2026-03-01')).toBe(60); // ข้าม 29 ก.พ.
    expect(dayOfYear('2024-12-31')).toBe(365);
  });
  it('flow: ค่าปกติของวัน = base, ยอดปี 2554 = 3,800, มีขอบบน/ล่าง', () => {
    const f = cfg.flow;
    expect(flowFromDischarge(f.qNormal[dayOfYear('2026-10-03')], '2026-10-03')).toBeCloseTo(f.base, 6);
    expect(flowFromDischarge(f.peak2011.q, f.peak2011.date)).toBeCloseTo(3800, -1);
    expect(flowFromDischarge(1e6, '2026-10-03')).toBe(f.max);
    expect(flowFromDischarge(0, '2026-10-03')).toBe(f.min);
    expect(flowFromDischarge(null, '2026-10-03')).toBe(f.base);
  });
  it('peakRainRate = ค่าเฉลี่ยช่วง 3 ชม. ที่มากที่สุด', () => {
    expect(peakRainRate([0, 0, 10, 20, 30, 0, 50])).toBeCloseTo(80 / 3, 9); // [30, 0, 50]
    expect(peakRainRate([null, 3, 3, 3])).toBeCloseTo(3, 9);
    expect(peakRainRate([5, 5])).toBe(0);
  });
  it('nearestRainPoint เลือกจุดที่ใกล้ที่สุด', () => {
    cfg.rainPoints.forEach(([la, lo], k) => expect(nearestRainPoint(la + 0.01, lo - 0.01)).toBe(k));
  });
});

describe('forecastLocation (กริดภาพรวม)', () => {
  it('ความลึกต่อสมาชิกเท่ากับการจำลองเต็มที่ใส่ฝนนั้นจริง', () => {
    const rates = [0, 30, 70, 90, 120, 200];
    const d = day(rates, { q: 6000, tide: 1.8 });
    const r = forecastLocation(grid, null, BANGNA[0], BANGNA[1], input(d))!;
    const c = cellOf(grid, BANGNA[0], BANGNA[1]);
    const depths = rates.map((rain) => readCell(grid, simulate(grid, { ...dayParams(d), rain }), c).depth);
    const wet = depths.filter((x) => x > 0.1).length;
    expect(r.days[0].chance).toBeCloseTo(wet / rates.length, 9);
    const sorted = depths.slice().sort((a, b) => a - b);
    expect(r.days[0].depthMed).toBeCloseTo(sorted[3], 6);
    expect(r.days[0].members).toBe(rates.length);
  });
  it('rainNeeded คือเกณฑ์ที่ทำให้ท่วมเกิน 10 ซม. พอดี', () => {
    const d = day([0]);
    const r = forecastLocation(grid, null, BANGNA[0], BANGNA[1], input(d))!.days[0];
    expect(r.rainNeeded).toBeGreaterThan(r.cap);
    const c = cellOf(grid, BANGNA[0], BANGNA[1]);
    const at = (rain: number) => readCell(grid, simulate(grid, { ...dayParams(d), rain }), c).depth;
    expect(at(r.rainNeeded! - 0.5)).toBeLessThan(0.1);
    expect(at(r.rainNeeded! + 0.5)).toBeGreaterThan(0.1);
    expect(rainNeeded(0.2, 1, 50, 3)).toBe(0);
    expect(rainNeeded(0, 0, 50, 3)).toBeNull();
  });
  it('โอกาสอยู่ใน 0–1 และไม่ลดลงเมื่อฝนแรงขึ้น', () => {
    let prev = 0;
    for (const k of [0, 20, 40, 60, 80, 100, 150]) {
      const rates = Array.from({ length: 51 }, (_, i) => (i * k) / 25);
      const ch = forecastLocation(grid, null, BANGNA[0], BANGNA[1], input(day(rates)))!.days[0].chance;
      expect(ch).toBeGreaterThanOrEqual(prev);
      expect(ch).toBeLessThanOrEqual(1);
      prev = ch;
    }
    expect(prev).toBeGreaterThan(0);
  });
  it('นอกแบบจำลองหรือในแม่น้ำ = null', () => {
    expect(forecastLocation(grid, null, 18.79, 98.98, input(day([0])))).toBeNull();
    const river = Array.from(grid.kind).indexOf(1);
    const lat = 13.96 - ((Math.floor(river / grid.nx) + 0.5) * 0.5) / grid.nz;
    const lon = 100.32 + (((river % grid.nx) + 0.5) * 0.6) / grid.nx;
    expect(forecastLocation(grid, null, lat, lon, input(day([0])))).toBeNull();
  });
});

describe('parseForecast', () => {
  const hours = (date: string) =>
    Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  const time = ['2026-10-02', '2026-10-03', '2026-10-04'].flatMap(hours);
  const ens = (scale: number) => ({
    hourly: {
      time,
      precipitation: time.map((_, i) => (i === 30 ? 9 * scale : 0)),
      precipitation_member01: time.map((_, i) => (i >= 50 && i < 53 ? 6 * scale : 0)),
    },
  });
  const raw = {
    ensemble: cfg.rainPoints.map((_, k) => ens(k + 1)),
    marine: {
      hourly: { time, sea_level_height_msl: time.map((_, i) => (i === 40 ? 1.9 : i === 60 ? null : 0.5)) },
    },
    flood: { daily: { time: ['2026-10-02', '2026-10-03'], river_discharge: [5000, 5100] } },
  };
  it('เริ่มที่พรุ่งนี้ตามเวลาไทย ข้ามวันที่ไม่มีระดับทะเล', () => {
    const f = parseForecast(raw, new Date('2026-10-02T03:00:00Z')); // 10:00 เวลาไทย
    expect(f.days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-04']);
    const [d3, d4] = f.days;
    expect(d3.tide).toBe(1.9);
    expect(d3.q).toBe(5100);
    expect(d4.q).toBeNull();
    expect(d3.rain[0]).toEqual([3, 0]); // ควบคุม 9 มม. ใน 1 ชม. → 3 มม./ชม.; สมาชิก 1 ฝนวันถัดไป
    expect(d4.rain[1]).toEqual([0, 12]);
  });
  it('หลัง 17:00 UTC (เที่ยงคืนไทย) "พรุ่งนี้" เลื่อนไปหนึ่งวัน', () => {
    const f = parseForecast(raw, new Date('2026-10-02T17:30:00Z'));
    expect(f.days[0].date).toBe('2026-10-04');
  });
});
