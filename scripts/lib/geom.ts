/** เรขาคณิตพื้นฐานสำหรับ pipeline (พิกัดเมตรท้องถิ่น x=ตะวันออก, y=เหนือ) */
import { M_PER_DEG_LAT, mPerDegLon, type StudyConfig } from './config.ts';

export type Pt = [number, number];
export type Ring = Pt[];

/** lat/lon ↔ เมตรจากมุมตะวันตกเฉียงใต้ของ bbox (equirectangular ที่ lat กลาง) */
export function projector(cfg: StudyConfig) {
  const { south, west, north } = cfg.bbox;
  const kx = mPerDegLon((south + north) / 2),
    ky = M_PER_DEG_LAT;
  return {
    kx,
    ky,
    toXY: (lat: number, lon: number): Pt => [(lon - west) * kx, (lat - south) * ky],
    toLatLon: (x: number, y: number): [number, number] => [south + y / ky, west + x / kx],
  };
}

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2; // บวก = ทวนเข็ม (ในระบบ y ขึ้นเหนือ) … ใช้ค่าสัมบูรณ์เมื่อสนใจแค่ขนาด
}

/** Douglas–Peucker สำหรับ ring ปิด (ไม่ซ้ำจุดแรกท้าย) */
export function simplifyRing(r: Ring, tol: number): Ring {
  if (r.length <= 4) return r;
  const keep = new Uint8Array(r.length);
  // แบ่งที่จุดไกลสุดจากจุดแรก เพื่อให้ ring ปิดทำงานได้
  let far = 0,
    fd = -1;
  for (let i = 1; i < r.length; i++) {
    const d = (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const dp = (a: number, b: number) => {
    const [ax, ay] = r[a],
      [bx, by] = r[b % r.length];
    const dx = bx - ax,
      dy = by - ay,
      L = Math.hypot(dx, dy) || 1e-9;
    let m = -1,
      md = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((r[i][0] - ax) * dy - (r[i][1] - ay) * dx) / L;
      if (d > md) {
        md = d;
        m = i;
      }
    }
    if (m >= 0 && md > tol) {
      keep[m] = 1;
      dp(a, m);
      dp(m, b);
    }
  };
  keep[0] = keep[far] = 1;
  dp(0, far);
  dp(far, r.length);
  return r.filter((_, i) => keep[i]);
}

/** ตัด polygon ด้วยสี่เหลี่ยม [x0,y0,x1,y1] (Sutherland–Hodgman) */
export function clipRing(r: Ring, x0: number, y0: number, x1: number, y1: number): Ring {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = r;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i],
        prev = src[(i + src.length - 1) % src.length];
      const ci = inside(cur),
        pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

/** ประกอบ way หลายเส้นเป็น ring ปิด (สำหรับ multipolygon) */
export function assembleRings(ways: Pt[][], eps = 1e-7): { rings: Ring[]; open: number } {
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
  const rings: Ring[] = [];
  let open = 0;
  while (pool.length) {
    let cur = pool.shift()!;
    for (let grew = true; grew && !same(cur[0], cur[cur.length - 1]);) {
      grew = false;
      for (let k = 0; k < pool.length; k++) {
        const w = pool[k],
          end = cur[cur.length - 1];
        if (same(end, w[0])) cur = cur.concat(w.slice(1));
        else if (same(end, w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else if (same(cur[0], w[w.length - 1])) cur = w.concat(cur.slice(1));
        else if (same(cur[0], w[0])) cur = w.slice().reverse().concat(cur.slice(1));
        else continue;
        pool.splice(k, 1);
        grew = true;
        break;
      }
    }
    if (same(cur[0], cur[cur.length - 1]) && cur.length >= 4) rings.push(cur.slice(0, -1));
    else open++;
  }
  return { rings, open };
}
