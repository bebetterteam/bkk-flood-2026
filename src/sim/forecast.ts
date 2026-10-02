/**
 * พยากรณ์ "พรุ่งนี้ + 7 วัน" ที่จุดเดียว — แปลงพยากรณ์อากาศ (Open-Meteo) เป็นพารามิเตอร์ของแบบจำลองรายวัน — pure
 *   ฝน      : ECMWF ENS 51 สมาชิก, ช่วง 3 ชม. ที่ฝนมากที่สุดของวัน → rain = รวม/3 มม./ชม., dur = 3
 *   ทะเลหนุน : ระดับน้ำทะเลสูงสุดของวันที่ปากแม่น้ำ → tide
 *   น้ำเหนือ : GloFAS ที่บางไทร แปลงด้วยส่วนต่างจากค่าปกติ (config/forecast.json) → flow
 * ฝนไม่เปลี่ยนน้ำจากภายนอก (reach) จึงจำลองวันละครั้งแบบไม่มีฝน แล้วบวกน้ำฝนขังของแต่ละสมาชิกด้วย `pondedRain` (ผลเท่ากันทุกหลัก)
 * ตำแหน่งของผู้ใช้ใช้เลือกจุดฝนที่ใกล้ที่สุด "ในเครื่อง" เท่านั้น — คำขอ network ใช้จุดคงที่ใน config
 */
import cfg from '../../config/forecast.json';
import { clamp } from './math';
import type { Grid } from './grid';
import { nestBoundary } from './nest';
import { DEFAULT_PARAMS, DEFENSES_ON } from './presets';
import { FLOOD_DEPTH, cellOf, type GridKind } from './probe';
import { SRC_RAIN, drainCap, pondedRain, simulate, type SimParams } from './simulate';
import type { StudyGrid } from './studyGrid';

export const FORECAST_CONFIG = cfg;
/** ความยาวช่วงฝนที่ใช้ (ชม.) */
export const RAIN_WINDOW = 3;
/** จำนวนวันที่แสดง: พรุ่งนี้ + 7 วัน */
export const FORECAST_DAYS = 8;

export interface ForecastDayInput {
  /** YYYY-MM-DD (เวลาไทย) */
  date: string;
  /** ระดับน้ำทะเลสูงสุดของวัน (ม. เหนือ MSL) */
  tide: number;
  /** ปริมาณน้ำ GloFAS (ลบ.ม./วินาที) หรือ null ถ้าไม่มีข้อมูล */
  q: number | null;
  /** [จุดฝน][สมาชิก] ความแรงฝนช่วง 3 ชม. ที่มากที่สุดของวัน (มม./ชม.) */
  rain: number[][];
}
export interface ForecastInput {
  /** เวลาที่ดึงข้อมูล (ISO) */
  fetched: string;
  days: ForecastDayInput[];
}

/** วันของปีแบบปฏิทินอธิกสุรทิน (0–365) — ตรงกับ scripts/build-forecast-normals.ts */
export const dayOfYear = (date: string): number =>
  Math.round((Date.UTC(2000, +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(2000, 0, 1)) / 864e5);

/** GloFAS → flow ของแบบจำลอง: ค่าฐาน + ส่วนต่างจากค่าปกติของวันเดียวกัน × k (ยอดปี 2554 = 3,800) */
export function flowFromDischarge(q: number | null, date: string): number {
  const f = cfg.flow;
  if (q == null) return f.base;
  return clamp(f.base + (q - f.qNormal[dayOfYear(date)]) * f.k, f.min, f.max);
}

/** ความแรงเฉลี่ยของช่วง `w` ชม. ติดกันที่ฝนมากที่สุด (มม./ชม.) — ค่า null นับเป็น 0 */
export function peakRainRate(hourly: ArrayLike<number | null>, w = RAIN_WINDOW): number {
  let best = 0;
  for (let i = 0; i + w <= hourly.length; i++) {
    let s = 0;
    for (let k = 0; k < w; k++) s += hourly[i + k] ?? 0;
    best = Math.max(best, s);
  }
  return best / w;
}

/** จุดฝนใน config ที่ใกล้ที่สุด (คิดในเครื่อง) */
export function nearestRainPoint(lat: number, lon: number): number {
  let best = 0,
    bd = Infinity;
  cfg.rainPoints.forEach(([a, o], k) => {
    const d = (a - lat) ** 2 + ((o - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bd) [bd, best] = [d, k];
  });
  return best;
}

/** พารามิเตอร์ของวันหนึ่ง (ไม่มีฝน — ฝนบวกทีหลังรายสมาชิก) ทุกระบบป้องกันเปิด ไม่มีทรุดเพิ่ม เหมือน preset */
export const dayParams = (d: ForecastDayInput): SimParams => ({
  ...DEFAULT_PARAMS,
  rain: 0,
  dur: RAIN_WINDOW,
  flow: flowFromDischarge(d.q, d.date),
  tide: d.tide,
  subs: 0,
  ...DEFENSES_ON,
});

export interface ForecastDay {
  date: string;
  /** สัดส่วนสมาชิกที่ท่วมเกิน FLOOD_DEPTH (0–1) */
  chance: number;
  /** ความลึกมัธยฐาน / เปอร์เซ็นไทล์ 90 ของสมาชิก (ม.) */
  depthMed: number;
  depthP90: number;
  /** สาเหตุที่พบมากที่สุดในสมาชิกที่ท่วม หรือ -1 */
  cause: number;
  /** ความแรงฝนช่วง 3 ชม. (มม./ชม.): มัธยฐาน / สูงสุดของสมาชิก */
  rainMed: number;
  rainMax: number;
  /** ขีดระบายน้ำวันนั้น (มม./ชม.) — ฝนเกินค่านี้จึงขัง */
  cap: number;
  /** ฝนต้องแรงเท่าไร (มม./ชม. นาน 3 ชม.) จุดนี้จึงท่วมเกิน FLOOD_DEPTH — 0 = ท่วมจากน้ำภายนอกอยู่แล้ว, null = ฝนอย่างเดียวไม่ถึง */
  rainNeeded: number | null;
  tide: number;
  flow: number;
  q: number | null;
  members: number;
}
export interface ForecastResult {
  grid: GridKind;
  fetched: string;
  rainPoint: number;
  days: ForecastDay[];
}

/** ความแรงฝนต่ำสุดที่ทำให้ความลึกเกิน FLOOD_DEPTH (แก้สมการ ext + pondedRain = FLOOD_DEPTH) */
export function rainNeeded(ext: number, pond: number, cap: number, dur: number): number | null {
  if (ext > FLOOD_DEPTH) return 0;
  const perMm = pondedRain(1, pond, ext); // ม. ต่อฝนส่วนเกิน 1 มม. (เป็นเชิงเส้น)
  if (!(perMm > 0)) return null;
  return cap + (FLOOD_DEPTH - ext) / perMm / dur;
}

const quantile = (s: number[], p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];

/** ผลพยากรณ์ที่จุดเดียว หรือ null ถ้าอยู่นอกแบบจำลอง / จุดเป็นแม่น้ำหรือทะเล */
export function forecastLocation(
  overview: Grid,
  study: StudyGrid | null,
  lat: number,
  lon: number,
  input: ForecastInput,
): ForecastResult | null {
  const sc = study ? cellOf(study, lat, lon) : -1;
  const useStudy = sc >= 0;
  const g: Grid = useStudy ? study! : overview;
  const c = useStudy ? sc : cellOf(overview, lat, lon);
  if (c < 0 || g.kind[c]) return null;
  const rp = nearestRainPoint(lat, lon);
  const days = input.days.map((d): ForecastDay => {
    const P = dayParams(d);
    const ov = simulate(overview, P);
    const r = useStudy ? simulate(study!, P, nestBoundary(overview, ov, study!)) : ov;
    const ext = Math.max(0, r.tExt[c]);
    const cap = drainCap(P, r.riverMid);
    const rates = d.rain[rp] ?? [];
    const depths: number[] = [],
      causes = [0, 0, 0, 0];
    let wet = 0;
    for (const rate of rates) {
      const depth = ext + pondedRain(Math.max(0, rate - cap) * P.dur, g.pond[c], r.tExt[c]);
      depths.push(depth);
      if (depth > FLOOD_DEPTH) {
        wet++;
        causes[ext > 0 ? r.src[c] : SRC_RAIN]++;
      }
    }
    depths.sort((a, b) => a - b);
    const sortedRates = rates.slice().sort((a, b) => a - b);
    const most = Math.max(...causes);
    return {
      date: d.date,
      chance: rates.length ? wet / rates.length : 0,
      depthMed: rates.length ? quantile(depths, 0.5) : ext,
      depthP90: rates.length ? quantile(depths, 0.9) : ext,
      cause: most > 0 ? causes.indexOf(most) : -1,
      rainMed: rates.length ? quantile(sortedRates, 0.5) : 0,
      rainMax: rates.length ? sortedRates[sortedRates.length - 1] : 0,
      cap,
      rainNeeded: rainNeeded(ext, g.pond[c], cap, P.dur),
      tide: d.tide,
      flow: P.flow,
      q: d.q,
      members: rates.length,
    };
  });
  return { grid: useStudy ? 'study' : 'overview', fetched: input.fetched, rainPoint: rp, days };
}

// ---------- แปลงคำตอบของ Open-Meteo (ใช้บน main thread; pure จึงเทสต์ใน Node ได้) ----------

interface Hourly {
  hourly: { time: string[] } & Record<string, (number | null)[] | string[]>;
}
export interface RawForecast {
  /** Ensemble API — อาร์เรย์ตามลำดับ cfg.rainPoints */
  ensemble: Hourly[];
  marine: Hourly;
  flood: { daily: { time: string[]; river_discharge: (number | null)[] } };
}

/** วันที่ (YYYY-MM-DD) ของ "วันนี้" ตามเวลาไทย */
export const bangkokToday = (now: Date): string =>
  new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);

/** คำตอบดิบ → ForecastInput ของพรุ่งนี้ + 7 วัน (เวลาในคำตอบต้องเป็นเวลาไทย `timezone=Asia/Bangkok`) */
export function parseForecast(raw: RawForecast, now: Date): ForecastInput {
  const today = bangkokToday(now);
  const dates = Array.from({ length: FORECAST_DAYS }, (_, k) => addDays(today, k + 1));
  const hoursOf = (h: Hourly, key: string, date: string) => {
    const vals = h.hourly[key] as (number | null)[];
    return h.hourly.time.flatMap((t, i) => (t.startsWith(date) ? [vals[i]] : []));
  };
  const days = dates.flatMap((date): ForecastDayInput[] => {
    const sea = hoursOf(raw.marine, 'sea_level_height_msl', date).filter((v): v is number => v != null);
    if (!sea.length) return []; // ไม่มีพยากรณ์ระดับทะเลวันนั้น — ข้ามวัน
    const qi = raw.flood.daily.time.indexOf(date);
    const rain = raw.ensemble.map((h) =>
      Object.keys(h.hourly)
        .filter((k) => k.startsWith('precipitation'))
        .map((k) => hoursOf(h, k, date))
        .filter((hrs) => hrs.some((v) => v != null))
        .map((hrs) => peakRainRate(hrs)),
    );
    return [{ date, tide: Math.max(...sea), q: qi >= 0 ? raw.flood.daily.river_discharge[qi] : null, rain }];
  });
  return { fetched: now.toISOString(), days };
}
