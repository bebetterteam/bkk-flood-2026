/** ฟังก์ชันคณิตศาสตร์พื้นฐานที่ใช้ร่วมกัน (ไม่มี dependency) */
import type { Polyline } from '../data/geo';

export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const sstep = (t: number): number => t * t * (3 - 2 * t);

/** ระยะใกล้สุดจากจุดถึงเส้น (หน่วยองศา) และตำแหน่งตามความยาวเส้น t ∈ [0,1] */
export function distPoly(lat: number, lon: number, poly: Polyline): { d: number; t: number } {
  let best = 1e9,
    bt = 0,
    acc = 0,
    total = 0;
  const segs: number[] = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k],
      b = poly[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(L);
    total += L;
  }
  for (let k = 0; k < poly.length - 1; k++) {
    const a = poly[k],
      b = poly[k + 1],
      dy = b[0] - a[0],
      dx = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    let t = ((lon - a[1]) * dx + (lat - a[0]) * dy) / L2;
    t = clamp(t, 0, 1);
    const d = Math.hypot(lon - (a[1] + t * dx), lat - (a[0] + t * dy));
    if (d < best) {
      best = d;
      bt = (acc + t * segs[k]) / total;
    }
    acc += segs[k];
  }
  return { d: best, t: bt };
}

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi;
  const u = sstep(xf),
    v = sstep(yf);
  const a = hash(xi, yi),
    b = hash(xi + 1, yi),
    c = hash(xi, yi + 1),
    d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** value noise 2 ชั้น ใช้ทำความขรุขระของพื้นและสี */
export const fbm = (lat: number, lon: number): number =>
  0.6 * vnoise(lon * 60, lat * 60) + 0.4 * vnoise(lon * 160, lat * 160);

export const gauss = (lat: number, lon: number, la: number, lo: number, s: number): number =>
  Math.exp(-(((lat - la) / s) ** 2 + ((lon - lo) / s) ** 2));

/** PRNG แบบกำหนด seed ได้ (mulberry32) */
export function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
