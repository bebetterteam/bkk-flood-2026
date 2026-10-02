/**
 * พื้นที่สีเขียวและต้นไม้ (pure — ใช้ได้ใน Node)
 * - groundMask: RGBA ความละเอียด ~6 ม./px ครอบ bbox: R = หญ้า/สนาม, G = ป่า, B = คลอง, A = ลานวัด
 * - placeTrees: ต้นไม้จาก OSM + กระจายในสวน/ป่า (seed คงที่)
 */
import type { GreenPolygon, RealisticData } from '../../data/realisticData';
import { mulberry } from '../../sim/math';
import { rasterizeLines, rasterizePolygons, type GridMeta } from '../../sim/raster';

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function maskMeta(bbox: Bbox, metersPerDegree: [number, number], mPerPx = 6): GridMeta {
  const nx = Math.round(((bbox.east - bbox.west) * metersPerDegree[0]) / mPerPx),
    nz = Math.round(((bbox.north - bbox.south) * metersPerDegree[1]) / mPerPx);
  return { bbox, nx, nz, dlon: (bbox.east - bbox.west) / nx, dlat: (bbox.north - bbox.south) / nz };
}

export function groundMask(
  g: GridMeta,
  green: GreenPolygon[],
  canals: { lines: { pts: number[][] }[]; polygons: { outer: number[][]; holes: number[][][] }[] },
): Uint8Array<ArrayBuffer> {
  const N = g.nx * g.nz;
  const ch = (pred: (p: GreenPolygon) => boolean) =>
    rasterizePolygons(
      g,
      green.filter(pred).map((p) => ({ outer: p.outer, holes: p.holes })),
      new Uint8Array(N),
      255,
    );
  const grass = ch((p) => p.kind === 'grass' || p.kind === 'pitch' || p.kind === 'cemetery');
  const wood = ch((p) => p.kind === 'wood');
  const temple = ch((p) => p.kind === 'temple');
  const canal = rasterizePolygons(g, canals.polygons, new Uint8Array(N), 255);
  rasterizeLines(
    g,
    canals.lines.map((l) => l.pts),
    canal,
    255,
  );
  const out = new Uint8Array(N * 4);
  for (let c = 0; c < N; c++) {
    out[c * 4] = grass[c];
    out[c * 4 + 1] = wood[c];
    out[c * 4 + 2] = canal[c];
    out[c * 4 + 3] = temple[c];
  }
  return out;
}

/** ต้นไม้: [xm, ym, ขนาด 0..1, สี 0..1] ต่อต้น (เมตรท้องถิ่นจากมุม SW) */
export function placeTrees(
  data: RealisticData,
  bbox: Bbox,
  metersPerDegree: [number, number],
  maxTrees = 40000,
): Float32Array {
  const rnd = mulberry(1234);
  const out: number[] = [];
  const { xy, count, quantMeters: Q } = data.trees;
  for (let i = 0; i < count; i++) out.push(xy[i * 2] * Q, xy[i * 2 + 1] * Q, rnd(), rnd());
  const scatter: number[] = [];
  const [kx, ky] = metersPerDegree;
  const toM = (lat: number, lon: number): [number, number] => [
    (lon - bbox.west) * kx,
    (lat - bbox.south) * ky,
  ];
  const inside = (x: number, y: number, r: [number, number][]) => {
    let s = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (
        r[a][1] > y !== r[b][1] > y &&
        x < ((r[b][0] - r[a][0]) * (y - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0]
      )
        s = !s;
    return s;
  };
  for (const p of data.green) {
    if (p.kind === 'pitch') continue;
    const ring = p.outer.map(([la, lo]) => toM(la, lo));
    const holes = p.holes.map((h) => h.map(([la, lo]) => toM(la, lo)));
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    // ความหนาแน่น (ตร.ม. ต่อต้น)
    const per = p.kind === 'wood' ? 70 : p.kind === 'temple' ? 400 : p.kind === 'cemetery' ? 150 : 250;
    const n = Math.floor(((x1 - x0) * (y1 - y0)) / per);
    for (let k = 0; k < n; k++) {
      const x = x0 + rnd() * (x1 - x0),
        y = y0 + rnd() * (y1 - y0);
      if (inside(x, y, ring) && !holes.some((h) => inside(x, y, h))) scatter.push(x, y, rnd(), rnd());
    }
  }
  // ต้นไม้ที่กระจายเพิ่ม: สุ่มเก็บแบบสม่ำเสมอให้รวมไม่เกิน maxTrees (ต้นไม้จาก OSM เก็บทั้งหมด)
  const room = Math.max(0, maxTrees - out.length / 4);
  const keep = Math.min(1, room / Math.max(1, scatter.length / 4));
  for (let k = 0; k < scatter.length && out.length / 4 < maxTrees; k += 4)
    if (rnd() < keep) out.push(scatter[k], scatter[k + 1], scatter[k + 2], scatter[k + 3]);
  return new Float32Array(out);
}
