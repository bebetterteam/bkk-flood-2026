/**
 * สนามข้อมูลของผิวน้ำ (pure — ใช้ได้ใน Node สำหรับเทสต์)
 * - level: ระดับผิวน้ำต่อช่อง (ม.) — ช่องแห้งที่ติดน้ำได้ระดับเฉลี่ยของช่องเปียกข้างเคียง (dilation)
 *   ผิวน้ำจึงแบนต่อเนื่องข้ามแนวฝั่ง แล้ว shader ตัดขอบน้ำต่อพิกเซลด้วย "ระดับน้ำ − พื้น" ได้เส้นฝั่งโค้งเรียบ
 * - flow: ทิศและความแรงการไหลต่อช่อง (แม่น้ำ: ตามแนวแม่น้ำไปปากอ่าว, น้ำท่วม: ไหลลงตามความลาดของพื้น)
 */
import { RIVER } from '../../../data/geo';
import { distPoly } from '../../../sim/math';

/** ความลึกขั้นต่ำที่ถือว่าเปียก (ม.) — ตรงกับเกณฑ์วาดน้ำของโหมดเรียบง่าย */
export const WET = 0.02;
/** ระดับของช่องที่ไม่มีน้ำเลย: ต่ำกว่าพื้นมากพอให้ shader ตัดทิ้ง */
export const DRY_DROP = 1.5;

/**
 * ระดับผิวน้ำต่อช่อง
 * @param kind 0 พื้นดิน, อื่น ๆ = แหล่งน้ำ (เปียกเสมอ)
 * @param hEff ความสูงพื้นหลังทรุด (ม.)
 * @param depth ความลึกที่กำลังแสดง (ม.)
 */
export function waterLevel(
  nx: number,
  nz: number,
  kind: Uint8Array,
  hEff: Float32Array,
  depth: Float32Array,
  out: Float32Array = new Float32Array(nx * nz),
  iters = 2,
): Float32Array {
  const N = nx * nz;
  const wet = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    const w = kind[c] !== 0 || depth[c] > WET;
    wet[c] = w ? 1 : 0;
    out[c] = w ? hEff[c] + Math.max(0, depth[c]) : NaN;
  }
  // dilation: ช่องแห้งรับค่าเฉลี่ยของช่องที่มีระดับแล้ว (8 ทิศ) ทีละชั้น
  const next = new Float32Array(N);
  for (let it = 0; it < iters; it++) {
    next.set(out);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (!Number.isNaN(out[c])) continue;
        let s = 0,
          n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di,
              jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            const v = out[jj * nx + ii];
            if (!Number.isNaN(v)) {
              s += v;
              n++;
            }
          }
        if (n) next[c] = s / n;
      }
    out.set(next);
  }
  for (let c = 0; c < N; c++) if (Number.isNaN(out[c])) out[c] = hEff[c] - DRY_DROP;
  return out;
}

/**
 * ทิศการไหลต่อช่อง (x = ตะวันออก, z = ใต้ ตามพิกัดโลก) ขนาด 0..1
 * @param riverS ช่องแม่น้ำ: ตำแหน่งตามแนวแม่น้ำ (ไม่ใช้ค่า แต่ใช้รู้ว่าเป็นแม่น้ำผ่าน kind)
 * @param latLon พิกัดกึ่งกลางช่อง (ใช้หาทิศของแม่น้ำ)
 * @param riverSpeed 0..1 ความแรงของแม่น้ำ (ตามน้ำเหนือ)
 */
export function flowField(
  nx: number,
  nz: number,
  kind: Uint8Array,
  hEff: Float32Array,
  latLon: (i: number, j: number) => [number, number],
  riverSpeed: number,
  out: Float32Array = new Float32Array(nx * nz * 2),
): Float32Array {
  // ทิศของแต่ละช่วงของแม่น้ำ (RIVER เรียงจากเหนือไปปากแม่น้ำ) ในพิกัดโลก: x = lon, z = −lat
  const segDir = RIVER.slice(0, -1).map((a, k) => {
    const b = RIVER[k + 1];
    const dx = b[1] - a[1],
      dz = -(b[0] - a[0]);
    const L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  });
  const segLen = RIVER.slice(0, -1).map((a, k) => Math.hypot(RIVER[k + 1][0] - a[0], RIVER[k + 1][1] - a[1]));
  const total = segLen.reduce((s, v) => s + v, 0);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (kind[c] === 1) {
        // หา segment จากตำแหน่งตามความยาว t ของจุดที่ใกล้ที่สุด
        const [lat, lon] = latLon(i, j);
        const t = distPoly(lat, lon, RIVER).t * total;
        let k = 0,
          acc = 0;
        while (k < segLen.length - 1 && acc + segLen[k] < t) acc += segLen[k++];
        out[c * 2] = segDir[k][0] * riverSpeed;
        out[c * 2 + 1] = segDir[k][1] * riverSpeed;
        continue;
      }
      // ไหลลงตามความลาดของพื้น (central difference) ความแรงจำกัด 0..0.35
      const h = (ii: number, jj: number) =>
        hEff[Math.min(nz - 1, Math.max(0, jj)) * nx + Math.min(nx - 1, Math.max(0, ii))];
      const gx = (h(i + 1, j) - h(i - 1, j)) / 2,
        gz = (h(i, j + 1) - h(i, j - 1)) / 2;
      const g = Math.hypot(gx, gz);
      const s = Math.min(0.35, g * 0.5);
      out[c * 2] = g > 1e-6 ? (-gx / g) * s : 0;
      out[c * 2 + 1] = g > 1e-6 ? (-gz / g) * s : 0;
    }
  return out;
}
