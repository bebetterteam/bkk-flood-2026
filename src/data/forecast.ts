/**
 * ดึงพยากรณ์จาก Open-Meteo (ฟรี ไม่ต้องใช้ key) — ขอเฉพาะ "จุดคงที่" ใน config/forecast.json
 * ห้ามส่งตำแหน่งของผู้ใช้ไปกับคำขอ (ดู CLAUDE.md: ความเป็นส่วนตัว) — เลือกจุดใกล้สุดทำใน worker
 * เก็บผลไว้ในหน่วยความจำ 1 ชม. (ทุกหมุดใช้ชุดเดียวกัน)
 */
import { FORECAST_CONFIG as cfg, parseForecast, type ForecastInput, type RawForecast } from '../sim/forecast';

const TTL = 3600e3;
const DAYS = 9; // วันนี้ + 8 วัน (ใช้พรุ่งนี้ + 7 วัน)
const TZ = 'timezone=Asia%2FBangkok';

const list = (pts: number[][], k: 0 | 1) => pts.map((p) => p[k]).join(',');
const URLS = {
  ensemble:
    `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${list(cfg.rainPoints, 0)}` +
    `&longitude=${list(cfg.rainPoints, 1)}&hourly=precipitation&models=${cfg.ensembleModel}` +
    `&cell_selection=nearest&forecast_days=${DAYS}&${TZ}`,
  deterministic:
    `https://api.open-meteo.com/v1/forecast?latitude=${list(cfg.detPoints, 0)}` +
    `&longitude=${list(cfg.detPoints, 1)}&hourly=precipitation&models=${cfg.detModel}` +
    `&cell_selection=nearest&forecast_days=${DAYS}&${TZ}`,
  marine:
    `https://marine-api.open-meteo.com/v1/marine?latitude=${cfg.seaPoint[0]}&longitude=${cfg.seaPoint[1]}` +
    `&hourly=sea_level_height_msl&forecast_days=${DAYS}&${TZ}`,
  flood:
    `https://flood-api.open-meteo.com/v1/flood?latitude=${cfg.riverPoint[0]}&longitude=${cfg.riverPoint[1]}` +
    `&daily=river_discharge&forecast_days=${DAYS}`,
};

let cache: { at: number; p: Promise<ForecastInput> } | null = null;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function fetchForecast(): Promise<ForecastInput> {
  if (cache && Date.now() - cache.at < TTL) return cache.p;
  const p = Promise.all([
    getJson<RawForecast['ensemble'] | RawForecast['ensemble'][number]>(URLS.ensemble),
    getJson<RawForecast['marine']>(URLS.marine),
    getJson<RawForecast['flood']>(URLS.flood),
    // พยากรณ์ 9 กม. เป็นส่วนเสริม — ถ้าดึงไม่ได้ยังแสดงส่วนอื่นได้
    getJson<NonNullable<RawForecast['deterministic']>>(URLS.deterministic).catch(() => null),
  ]).then(([ens, marine, flood, det]) =>
    parseForecast(
      { ensemble: Array.isArray(ens) ? ens : [ens], deterministic: det, marine, flood },
      new Date(),
    ),
  );
  cache = { at: Date.now(), p };
  p.catch(() => (cache = null)); // ล้มเหลว → ลองใหม่ได้ทันที
  return p;
}
