/** อ่านและแปลง element ของ OSM (Overpass `out geom`) เป็นพิกัดเมตรท้องถิ่น */
import { readFileSync } from 'node:fs';
import { RAW_OSM, type StudyConfig } from './config.ts';
import { assembleRings, clipRing, projector, simplifyRing, type Pt, type Ring } from './geom.ts';

export type OsmGeom = { lat: number; lon: number }[];
export interface OsmEl {
  type: 'way' | 'relation' | 'node';
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmGeom;
  nodes?: number[];
  lat?: number;
  lon?: number;
  members?: { type: string; role: string; geometry?: OsmGeom }[];
}

export const loadOsm = (f: string): OsmEl[] => JSON.parse(readFileSync(RAW_OSM + f, 'utf8')).elements;

export function pointInRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function osmTools(cfg: StudyConfig) {
  const P = projector(cfg);
  const W = (cfg.bbox.east - cfg.bbox.west) * P.kx,
    H = (cfg.bbox.north - cfg.bbox.south) * P.ky;
  const toXY = (g: OsmGeom): Pt[] => g.map((p) => P.toXY(p.lat, p.lon));
  const openRing = (r: Pt[]): Ring => {
    const a = r[0],
      b = r[r.length - 1];
    return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
  };
  /** แยก outer/inner ของ relation แล้วจับ hole เข้ากับ outer ที่ครอบ */
  function polygonsOf(el: OsmEl): { outer: Ring; holes: Ring[] }[] {
    if (el.type === 'way') return el.geometry ? [{ outer: openRing(toXY(el.geometry)), holes: [] }] : [];
    const ways = (role: string) =>
      (el.members ?? [])
        .filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role)
        .map((m) => toXY(m.geometry!));
    const outers = assembleRings(ways('outer')).rings;
    const inners = assembleRings(ways('inner')).rings;
    const polys = outers.map((outer) => ({ outer, holes: [] as Ring[] }));
    for (const h of inners) polys.find((p) => pointInRing(h[0][0], h[0][1], p.outer))?.holes.push(h);
    return polys;
  }
  const clipSimplify = (r: Ring, tol: number, margin = 0) => {
    const c = clipRing(r, -margin, -margin, W + margin, H + margin);
    return c.length >= 3 ? simplifyRing(c, tol) : [];
  };
  /** ring เมตร → [lat, lon] ทศนิยม 6 หลัก */
  const ll = (r: Ring) => r.map(([x, y]) => P.toLatLon(x, y).map((v) => +v.toFixed(6)));
  return { P, W, H, toXY, openRing, polygonsOf, clipSimplify, ll };
}
