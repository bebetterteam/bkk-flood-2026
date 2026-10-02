/**
 * ตัวคำนวณน้ำท่วม (pure function, ไม่พึ่ง three.js)
 *
 * วิธี: priority-flood จากแหล่งน้ำ (แม่น้ำ ทะเล น้ำเหนือ) ลดระดับ LOSS ม./เซลล์ตามระยะทาง
 * ข้ามสิ่งกีดขวาง (พื้น/เขื่อน/คันกั้นน้ำ) ได้เมื่อสูงกว่า แล้วบวกน้ำฝนส่วนเกินที่ระบายไม่ทัน
 * ตามตัวคูณการขัง (pond) — ไม่ใช่การคำนวณการไหลจริง
 *
 * ⚠️ ค่าคาลิเบรตทั้งหมดในไฟล์นี้ถูกล็อกด้วยเทสต์ ถ้าแก้ต้องอัปเดตเทสต์และบันทึกเหตุผล
 */
import { Heap } from './heap';
import { clamp } from './math';
import { WALL_RIVER, type Grid } from './grid';

export interface SimParams {
  /** ความแรงฝน มม./ชม. */
  rain: number;
  /** ฝนตกนาน ชม. */
  dur: number;
  /** น้ำเหนือ ลบ.ม./วินาที */
  flow: number;
  /** ระดับน้ำทะเลหนุนสูงสุด ม.รทก. */
  tide: number;
  /** แผ่นดินทรุดเพิ่ม ซม. */
  subs: number;
  walls: boolean;
  dikes: boolean;
  drains: boolean;
}

/** แหล่งที่มาของน้ำท่วม (index ใน `by`) */
export const SRC_RAIN = 0,
  SRC_RIVER = 1,
  SRC_SEA = 2,
  SRC_NORTH = 3;

export interface SimResult {
  /** ระดับน้ำเจ้าพระยาที่ปากคลองตลาด ม.รทก. */
  riverMid: number;
  /** ขีดความสามารถระบายน้ำฝน มม./ชม. */
  cap: number;
  /** น้ำฝนส่วนเกิน มม. */
  excess: number;
  /** พื้นที่ท่วม >10 ซม. (ตร.กม., ไม่รวมชายเลน) */
  area: number;
  /** พื้นที่ท่วม >50 ซม. (ตร.กม.) */
  deep: number;
  /** พื้นที่ท่วมแยกตามแหล่ง [ฝน, แม่น้ำ, ทะเล, น้ำเหนือ] ตร.กม. */
  by: number[];
  /** พื้นที่ดินทั้งหมดที่นับ (ตร.กม.) */
  land: number;
  /** สันเขื่อนกลางเมืองหลังทรุด ม.รทก. */
  coreWall: number;
  /** ระดับน้ำเหนือที่ไหลบ่าเข้าขอบบน (-1e9 = ไม่มี) */
  north: number;
  /** ระยะทาง (เซลล์) ที่น้ำภายนอกไปถึงไกลสุด ใช้กำหนดเวลาแอนิเมชัน */
  maxArr: number;

  /** ต่อเซลล์ */
  hEff: Float32Array;
  reach: Float32Array;
  arrival: Float32Array;
  src: Uint8Array;
  /** ความลึกน้ำจากภายนอก (ม.) */
  tExt: Float32Array;
  /** ความลึกน้ำฝนขัง (ม.) */
  tRain: Float32Array;
}

/** ระดับน้ำในแม่น้ำ ณ ตำแหน่ง s (0 ปาก .. 1 เหนือ) */
export const riverLevel = (P: SimParams, s: number): number =>
  P.tide * (1 - 0.3 * s) + Math.pow(P.flow / 1000, 1.2) * 0.28 * (0.2 + s);

/** ขีดความสามารถระบายน้ำฝน (มม./ชม.) — ลดลงเมื่อแม่น้ำ/ทะเลสูง; ฝนที่ไม่เกินค่านี้ไม่ขัง */
export const drainCap = (P: SimParams, riverMid: number): number =>
  (P.drains ? 60 : 25) *
  clamp(1 - Math.max(0, riverMid - 1.6) * 0.5 - Math.max(0, P.tide - 1.4) * 0.4, 0.35, 1);

/**
 * น้ำฝนขังที่ช่องหนึ่ง (ม.) จากฝนส่วนเกิน `excess` (มม.) — ไม่ขึ้นกับน้ำภายนอกนอกจาก `ext` ของช่องนั้น
 * ถ้าน้ำภายนอกเข้าถึงแล้ว นับน้ำฝนเพียง 30% (กรณีขอบ: อาจทำให้ความลึกรวมลดลง ดู CLAUDE.md)
 */
export const pondedRain = (excess: number, pond: number, ext: number): number => {
  const r = (excess / 1000) * pond;
  return ext > 0 ? r * 0.3 : r;
};

/** ความสูงสันเขื่อน/คันกั้นน้ำหลังทรุด */
export const wallTop = (g: Grid, P: SimParams, c: number): number =>
  g.wallBase[c] - (P.subs / 100) * g.subW[c];

/**
 * แหล่งน้ำเพิ่มเติมที่ขอบพื้นที่ (ใช้ทำ nesting: เอาระดับน้ำจากโมเดลภาพรวมมาใส่ขอบพื้นที่ศึกษา)
 * cells[k] ได้ระดับน้ำ level[k] จากแหล่ง src[k] ถ้าสูงกว่าสิ่งกีดขวางของช่องนั้น
 */
export interface Boundary {
  cells: ArrayLike<number>;
  level: ArrayLike<number>;
  src: ArrayLike<number>;
}

export function simulate(g: Grid, P: SimParams, boundary?: Boundary): SimResult {
  const {
    kind,
    h0,
    subW,
    wallType,
    riverS,
    intertidal,
    pond,
    nx: NX,
    nz: NZ,
    loss: LOSS,
    cellKm2: CELL_KM2,
  } = g;
  const N = NX * NZ;
  const idx = (i: number, j: number) => j * NX + i;
  const hEff = new Float32Array(N),
    reach = new Float32Array(N),
    arrival = new Float32Array(N),
    src = new Uint8Array(N),
    tExt = new Float32Array(N),
    tRain = new Float32Array(N),
    obst = new Float32Array(N);
  const sub = P.subs / 100;
  for (let c = 0; c < N; c++) {
    hEff[c] = kind[c] ? h0[c] : h0[c] - sub * subW[c];
    let ob = hEff[c];
    const w = wallType[c];
    if (w === WALL_RIVER && P.walls) ob = Math.max(ob, wallTop(g, P, c));
    if (w >= 2 && P.dikes) ob = Math.max(ob, wallTop(g, P, c));
    obst[c] = ob;
    reach[c] = -1e9;
  }
  const H = new Heap();
  for (let c = 0; c < N; c++) {
    if (kind[c] === 1) {
      reach[c] = riverLevel(P, riverS[c]);
      src[c] = SRC_RIVER;
      H.push(reach[c], c);
    } else if (kind[c] === 2) {
      reach[c] = P.tide;
      src[c] = SRC_SEA;
      H.push(reach[c], c);
    }
  }
  // น้ำเหนือไหลบ่าเข้าขอบบนของกริด (เฉพาะกริดที่ขอบบนคือทุ่งด้านเหนือจริง)
  const north = P.flow > 2800 ? 1.75 + ((P.flow - 2800) / 1000) * 0.6 : -1e9;
  if (g.northInflow)
    for (let i = 0; i < NX; i++) {
      const c = idx(i, 0);
      if (!kind[c] && north > obst[c]) {
        reach[c] = north;
        src[c] = SRC_NORTH;
        H.push(north, c);
      }
    }
  if (boundary)
    for (let k = 0; k < boundary.cells.length; k++) {
      const c = boundary.cells[k],
        lv = boundary.level[k];
      if (!kind[c] && lv > obst[c] && lv > reach[c]) {
        reach[c] = lv;
        src[c] = boundary.src[k];
        H.push(lv, c);
      }
    }
  while (H.n) {
    const c = H.pop();
    const i = c % NX,
      j = (c / NX) | 0,
      rc = reach[c];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di,
          jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const n = idx(ii, jj);
        if (kind[n]) continue;
        const step = di && dj ? 1.414 : 1;
        const cand = rc - LOSS * step;
        if (cand > obst[n] && cand > reach[n]) {
          reach[n] = cand;
          arrival[n] = arrival[c] + step;
          src[n] = src[c];
          H.push(cand, n);
        }
      }
  }
  const riverMid = riverLevel(P, g.pktS);
  const cap = drainCap(P, riverMid);
  const excess = Math.max(0, P.rain - cap) * P.dur; // มม.

  let area = 0,
    deep = 0,
    landCells = 0,
    maxArr = 0;
  const by = [0, 0, 0, 0];
  for (let c = 0; c < N; c++) {
    if (kind[c]) {
      tExt[c] = reach[c] - hEff[c];
      tRain[c] = 0;
      continue;
    }
    const e = reach[c] > hEff[c] ? reach[c] - hEff[c] : 0;
    tExt[c] = e;
    tRain[c] = pondedRain(excess, pond[c], e);
    if (tExt[c] > 0) maxArr = Math.max(maxArr, arrival[c]);
    if (intertidal[c]) continue;
    landCells++;
    const d = tExt[c] + tRain[c];
    if (d > 0.1) {
      area++;
      by[e > 0 ? src[c] : SRC_RAIN]++;
    }
    if (d > 0.5) deep++;
  }
  const coreWall = g.coreWallBase - sub * g.coreSubW;
  return {
    riverMid,
    cap,
    excess,
    area: area * CELL_KM2,
    deep: deep * CELL_KM2,
    by: by.map((x) => x * CELL_KM2),
    land: landCells * CELL_KM2,
    coreWall,
    north,
    maxArr,
    hEff,
    reach,
    arrival,
    src,
    tExt,
    tRain,
  };
}
