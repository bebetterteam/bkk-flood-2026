/** แปลง polygon/เส้น (lat/lon) เป็น mask บนกริดพื้นที่ศึกษา (ทดสอบที่กึ่งกลางช่อง) */
export interface GridMeta {
  bbox: { south: number; west: number; north: number; east: number };
  nx: number;
  nz: number;
  dlat: number;
  dlon: number;
}
type LL = number[];

/** even-odd fill: ทุก ring (outer + holes) ร่วมกัน */
export function rasterizePolygons(
  g: GridMeta,
  polys: { outer: LL[]; holes: LL[][] }[],
  mask = new Uint8Array(g.nx * g.nz),
) {
  for (const p of polys) {
    const rings = [p.outer, ...p.holes];
    for (let j = 0; j < g.nz; j++) {
      const lat = g.bbox.north - (j + 0.5) * g.dlat;
      const xs: number[] = [];
      for (const r of rings)
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [la1, lo1] = r[a],
            [la2, lo2] = r[b];
          if (la1 > lat !== la2 > lat) xs.push(lo1 + ((lat - la1) * (lo2 - lo1)) / (la2 - la1));
        }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.ceil((xs[k] - g.bbox.west) / g.dlon - 0.5),
          i1 = Math.floor((xs[k + 1] - g.bbox.west) / g.dlon - 0.5);
        for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) mask[j * g.nx + i] = 1;
      }
    }
  }
  return mask;
}

/** วาดเส้น (เช่นแนวคลอง) ลงกริด ทุกช่องที่เส้นผ่าน */
export function rasterizeLines(g: GridMeta, lines: LL[][], mask = new Uint8Array(g.nx * g.nz)) {
  for (const pts of lines)
    for (let k = 0; k + 1 < pts.length; k++) {
      const [la1, lo1] = pts[k],
        [la2, lo2] = pts[k + 1];
      const steps = Math.ceil(Math.max(Math.abs(la2 - la1) / g.dlat, Math.abs(lo2 - lo1) / g.dlon) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const la = la1 + ((la2 - la1) * s) / steps,
          lo = lo1 + ((lo2 - lo1) * s) / steps;
        const i = Math.floor((lo - g.bbox.west) / g.dlon),
          j = Math.floor((g.bbox.north - la) / g.dlat);
        if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) mask[j * g.nx + i] = 1;
      }
    }
  return mask;
}
