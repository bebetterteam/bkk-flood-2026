/**
 * สร้าง config/forecast.json — จุดพยากรณ์คงที่ + ค่าปกติของน้ำเหนือ (GloFAS) ไว้แปลงพยากรณ์เป็น `flow` ของแบบจำลอง
 *
 * GloFAS ที่บางไทร (14.00, 100.53) อ่านสูงกว่าสถานีวัดจริงราว 2 เท่า จึงไม่ใช้ค่าตรง ๆ แต่ใช้ "ส่วนต่างจากค่าปกติของวันเดียวกัน":
 *   flow = base + (Q − qNormal[วันของปี]) × k   โดย k ตั้งให้ยอดปี 2554 ของ GloFAS = 3,800 (ค่าปี 2554 ของแบบจำลอง)
 * ค่าปกติ = มัธยฐานของทุกปีในหน้าต่าง ±15 วัน (GloFAS ที่จุดนี้มีข้อมูลตั้งแต่ปี 2540)
 */
import { writeFileSync } from 'node:fs';
import { ROOT } from './lib/config.ts';

const RIVER: [number, number] = [14.0, 100.53];
const YEARS: [number, number] = [1997, 2024];
const BASE = 1000,
  FLOW_2011 = 3800,
  HALF_WINDOW = 15;

const url =
  `https://flood-api.open-meteo.com/v1/flood?latitude=${RIVER[0]}&longitude=${RIVER[1]}` +
  `&daily=river_discharge&start_date=${YEARS[0]}-01-01&end_date=${YEARS[1]}-12-31`;
const res = await fetch(url);
if (!res.ok) throw new Error(`GloFAS HTTP ${res.status}`);
const { daily } = (await res.json()) as { daily: { time: string[]; river_discharge: (number | null)[] } };

/** วันของปีแบบปฏิทินอธิกสุรทิน (0–365) — 29 ก.พ. มีช่องของตัวเอง ใช้ร่วมกับ src/sim/forecast.ts */
const doy = (date: string) =>
  Math.round((Date.UTC(2000, +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 864e5);

const byDoy: number[][] = Array.from({ length: 366 }, () => []);
let peak = { date: '', q: 0 };
daily.time.forEach((t, i) => {
  const q = daily.river_discharge[i];
  if (q == null) return;
  const d = doy(t);
  for (let o = -HALF_WINDOW; o <= HALF_WINDOW; o++) byDoy[(d + o + 366) % 366].push(q);
  if (t.startsWith('2011') && q > peak.q) peak = { date: t, q };
});
const median = (a: number[]) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const qNormal = byDoy.map((a) => Math.round(median(a)));
const peakNormal = qNormal[doy(peak.date)];
const k = (FLOW_2011 - BASE) / (peak.q - peakNormal);

/** จุดกริดทุก `step` องศาในช่วง lat × lon (แถวละ lat) */
const grid = ([la0, la1]: number[], [lo0, lo1]: number[], step: number) => {
  const pts: number[][] = [];
  for (let a = la0; a <= la1 + 1e-9; a += step)
    for (let o = lo0; o <= lo1 + 1e-9; o += step) pts.push([+a.toFixed(2), +o.toFixed(2)]);
  return pts;
};

const out = {
  note: 'สร้างโดย scripts/build-forecast-normals.ts — ห้ามแก้ด้วยมือ',
  attribution:
    'Open-Meteo (CC BY 4.0) · ECMWF IFS ENS + IFS 9 km · GloFAS (Copernicus Emergency Management Service)',
  ensembleModel: 'ecmwf_ifs025',
  // จุดคงที่ครอบขอบเขตแบบจำลอง (lat 13.46–13.96, lon 100.32–100.92) — เลือกจุดใกล้หมุดในเครื่อง ไม่ส่งตำแหน่ง
  rainPoints: grid([13.5, 14.0], [100.25, 101.0], 0.25), // ช่อง ENS 0.25°
  detModel: 'ecmwf_ifs',
  detPoints: grid([13.45, 13.95], [100.3, 100.9], 0.1), // ช่อง IFS ~9 กม.
  seaPoint: [13.45, 100.6],
  riverPoint: RIVER,
  flow: {
    base: BASE,
    min: 500,
    max: 5000,
    k: +k.toFixed(5),
    years: YEARS,
    peak2011: { date: peak.date, q: Math.round(peak.q), qNormal: peakNormal },
    qNormal,
  },
};
writeFileSync(ROOT + 'config/forecast.json', JSON.stringify(out, null, 2) + '\n');
console.log(`ยอดปี 2554 ${peak.q.toFixed(0)} ม³/ว (${peak.date}) ปกติ ${peakNormal} → k = ${k.toFixed(4)}`);
console.log(`ค่าปกติ ม.ค. ${qNormal[15]}, ต.ค. ${qNormal[288]}`);
