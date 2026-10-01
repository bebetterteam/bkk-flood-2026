/**
 * กริดภูมิประเทศ (ความสูงพื้น ชนิดเซลล์ แนวเขื่อน ฯลฯ)
 * ความสูงทั้งหมดเป็น "ค่าประมาณ" ที่สร้างจากสูตร ไม่ใช่ DEM จริง หน่วยเมตร ม.รทก.
 */
import { N, NX, NZ, idx, latAt, lonAt } from './coords';
import { KING_DIKE, PAK_KHLONG_TALAT, RIVER, SUVARNA, coastLat } from '../data/geo';
import { clamp, distPoly, fbm, gauss, sstep } from './math';

/** ชนิดเซลล์ */
export const LAND = 0,
  RIVER_CELL = 1,
  SEA = 2;
/** ชนิดแนวป้องกัน: 1 เขื่อนริมแม่น้ำ, 2 คันกั้นน้ำพระราชดำริ, 3 คันกั้นน้ำชายฝั่ง, 4 คันกั้นน้ำสุวรรณภูมิ */
export const WALL_RIVER = 1,
  WALL_KING = 2,
  WALL_COAST = 3,
  WALL_AIRPORT = 4;

export interface Grid {
  /** 0 พื้นดิน, 1 แม่น้ำ, 2 ทะเล */
  kind: Uint8Array;
  /** ความสูงพื้นตั้งต้น (ม.รทก.) */
  h0: Float32Array;
  /** น้ำหนักการทรุดตัว (คูณกับค่าทรุดเป็นเมตร) */
  subW: Float32Array;
  /** ตำแหน่งตามแม่น้ำ 0 = ปากแม่น้ำ .. 1 = เหนือ */
  riverS: Float32Array;
  wallType: Uint8Array;
  /** ความสูงสันเขื่อน/คันกั้นน้ำก่อนทรุด (ม.รทก.) */
  wallBase: Float32Array;
  /** ความเป็นเมือง 0..1 */
  urban: Float32Array;
  /** พื้นที่ชายเลน (ไม่นับในพื้นที่ท่วม) */
  intertidal: Uint8Array;
  /** ตัวคูณการขังน้ำฝน (จุดต่ำกว่ารอบข้าง + ความเป็นเมือง) */
  pond: Float32Array;
  /** riverS ที่ปากคลองตลาด */
  pktS: number;
}

export function urbanAt(lat: number, lon: number): number {
  if (gauss(lat, lon, 13.675, 100.565, 0.014) > 0.4) return 0.05; // บางกระเจ้า
  return Math.max(
    gauss(lat, lon, 13.745, 100.535, 0.055),
    0.8 * gauss(lat, lon, 13.83, 100.565, 0.05),
    0.7 * gauss(lat, lon, 13.72, 100.475, 0.04),
    0.6 * gauss(lat, lon, 13.675, 100.615, 0.035),
    0.6 * gauss(lat, lon, 13.76, 100.625, 0.035),
    0.5 * gauss(lat, lon, 13.9, 100.6, 0.03),
    0.6 * gauss(lat, lon, 13.86, 100.51, 0.03),
    0.5 * gauss(lat, lon, 13.6, 100.6, 0.03),
  );
}

/** สร้างกริดทั้งหมด (deterministic) */
export function buildGrid(): Grid {
  const kind = new Uint8Array(N);
  const h0 = new Float32Array(N);
  const subW = new Float32Array(N);
  const riverS = new Float32Array(N);
  const wallType = new Uint8Array(N);
  const wallBase = new Float32Array(N);
  const urban = new Float32Array(N);
  const intertidal = new Uint8Array(N);
  const pond = new Float32Array(N);

  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const c = idx(i, j),
        lat = latAt(j),
        lon = lonAt(i);
      const cl = coastLat(lon);
      const r = distPoly(lat, lon, RIVER);
      urban[c] = urbanAt(lat, lon);
      subW[c] = clamp(
        0.5 + 0.9 * clamp((lon - 100.6) / 0.25, 0, 1) + 0.5 * clamp((13.7 - lat) / 0.2, 0, 1),
        0.4,
        1.6,
      );
      if (lat < cl) {
        kind[c] = SEA;
        h0[c] = -1.6;
        continue;
      }
      if (r.d < 0.0042) {
        kind[c] = RIVER_CELL;
        h0[c] = -1.5;
        riverS[c] = 1 - r.t;
        continue;
      }
      let h = 1.25 + 2.4 * Math.max(0, lat - 13.8);
      if (lon > 100.66) h -= (lon - 100.66) * 2.8;
      if (lon < 100.45) h -= (100.45 - lon) * 1.6;
      h += 0.6 * Math.exp(-(((lat - 13.915) / 0.03) ** 2 + ((lon - 100.6) / 0.04) ** 2));
      h += 0.45 * Math.exp(-((r.d / 0.012) ** 2));
      h += 0.25 * gauss(lat, lon, 13.752, 100.5, 0.02);
      h += (fbm(lat, lon) - 0.5) * 0.32;
      const d = lat - cl;
      if (d < 0.07) {
        const t = Math.max(0, d) / 0.07;
        h = 0.25 + (h - 0.25) * sstep(t);
      }
      h0[c] = h;
      if (d < 0.012) intertidal[c] = 1;
    }

  // เขื่อนและคันกั้นน้ำ
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const c = idx(i, j);
      if (kind[c]) continue;
      const lat = latAt(j),
        lon = lonAt(i);
      let bank = false;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di,
            jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
          if (kind[idx(ii, jj)] === RIVER_CELL) bank = true;
        }
      if (bank) {
        wallType[c] = WALL_RIVER;
        wallBase[c] = lat > 13.6 && lat < 13.87 ? 2.8 : 2.4;
        continue;
      }
      if (distPoly(lat, lon, KING_DIKE).d < 0.0022) {
        wallType[c] = WALL_KING;
        wallBase[c] = 3.0;
        continue;
      }
      const cd = lat - coastLat(lon);
      if (cd > 0.0105 && cd < 0.0145 && Math.abs(lon - 100.592) > 0.012) {
        wallType[c] = WALL_COAST;
        wallBase[c] = 1.8;
        continue;
      }
      const ad = Math.hypot(lat - SUVARNA.lat, lon - SUVARNA.lon);
      if (Math.abs(ad - SUVARNA.r) < 0.0018) {
        wallType[c] = WALL_AIRPORT;
        wallBase[c] = 3.5;
      }
    }

  // pond factor: ต่ำกว่าพื้นรอบข้างแค่ไหน (เบลอรัศมี 6 เซลล์)
  {
    const tmp = new Float32Array(N),
      bl = new Float32Array(N),
      R = 6;
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        let s = 0,
          n = 0;
        for (let k = -R; k <= R; k++) {
          const ii = i + k;
          if (ii < 0 || ii >= NX) continue;
          const c = idx(ii, j);
          if (kind[c]) continue;
          s += h0[c];
          n++;
        }
        tmp[idx(i, j)] = n ? s / n : 0;
      }
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++) {
        let s = 0,
          n = 0;
        for (let k = -R; k <= R; k++) {
          const jj = j + k;
          if (jj < 0 || jj >= NZ) continue;
          const c = idx(i, jj);
          if (kind[c]) continue;
          s += tmp[c];
          n++;
        }
        bl[idx(i, j)] = n ? s / n : 0;
      }
    for (let c = 0; c < N; c++)
      pond[c] = kind[c] ? 0 : clamp(1 + (bl[c] - h0[c]) * 4, 0.25, 3.5) * (0.55 + 0.7 * urban[c]);
  }

  const pktS = 1 - distPoly(PAK_KHLONG_TALAT[0], PAK_KHLONG_TALAT[1], RIVER).t;

  return { kind, h0, subW, riverS, wallType, wallBase, urban, intertidal, pond, pktS };
}
