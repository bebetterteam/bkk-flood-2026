/**
 * แปลง OSM ดิบ → ไฟล์ที่โหลดเร็วใน public/data/study-area/
 *   buildings.bin + buildings.json (footprint quantized 0.25 ม., ความสูง, แหล่งที่มาของความสูง)
 *   river.json, canals.json (lat/lon ตัดทศนิยม 6 หลัก)
 * © OpenStreetMap contributors (ODbL)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { OUT, RAW, loadConfig } from './lib/config.ts';
import {
  assembleRings,
  clipRing,
  projector,
  ringArea,
  simplifyRing,
  type Pt,
  type Ring,
} from './lib/geom.ts';

const cfg = loadConfig();
const P = projector(cfg);
const W = (cfg.bbox.east - cfg.bbox.west) * P.kx,
  H = (cfg.bbox.north - cfg.bbox.south) * P.ky;

type OsmGeom = { lat: number; lon: number }[];
interface OsmEl {
  type: 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmGeom;
  members?: { type: string; role: string; geometry?: OsmGeom }[];
}
const load = (f: string): OsmEl[] => JSON.parse(readFileSync(RAW + 'osm/' + f, 'utf8')).elements;
const toXY = (g: OsmGeom): Pt[] => g.map((p) => P.toXY(p.lat, p.lon));
const openRing = (r: Pt[]): Ring => {
  const a = r[0],
    b = r[r.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
};
function pointInRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i],
      [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
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

// ---------------- ตึก ----------------
const parseHeight = (v?: string): number | null => {
  if (!v) return null;
  const m = /^\s*([\d.]+)\s*(m|meters?)?\s*$/i.exec(v);
  const h = m ? parseFloat(m[1]) : NaN;
  return h > 0 && h < 400 ? h : null;
};
const SRC_NAMES = [
  'height',
  'building:levels × ' + cfg.buildings.metersPerLevel + ' ม.',
  'ค่าเริ่มต้นตามประเภท',
];

interface B {
  rings: Ring[];
  h: number;
  src: number;
  type: string;
}
const seen = new Set<string>();
const buildings: B[] = [];
let droppedSmall = 0,
  droppedOutside = 0,
  levelsRejected = 0;
for (let k = 0; k < 4; k++)
  for (const el of load(`buildings-${k}.json`)) {
    const key = el.type + el.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = el.tags ?? {};
    const type = t.building === 'yes' ? 'yes' : (t.building ?? 'yes');
    let h = parseHeight(t.height),
      src = 0;
    if (h === null) {
      const lv = parseFloat(t['building:levels'] ?? '');
      if (lv > 0 && lv < 120) {
        h = lv * cfg.buildings.metersPerLevel;
        src = 1;
      } else if (t['building:levels']) levelsRejected++;
    }
    if (h === null) {
      h = cfg.buildings.defaultHeightByType[type] ?? cfg.buildings.defaultHeight;
      src = 2;
    }
    for (const poly of polygonsOf(el)) {
      const outer = clipSimplify(poly.outer, cfg.buildings.simplifyMeters);
      if (outer.length < 3) {
        droppedOutside++;
        continue;
      }
      if (Math.abs(ringArea(outer)) < 4) {
        droppedSmall++;
        continue;
      }
      const holes = poly.holes
        .map((r) => clipSimplify(r, cfg.buildings.simplifyMeters))
        .filter((r) => r.length >= 3);
      buildings.push({ rings: [outer, ...holes], h, src, type });
    }
  }

// เขียนไบนารี: อาร์เรย์ Uint32 ก่อน แล้ว Uint16 แล้ว Uint8 (จัด alignment)
const Q = 0.25; // เมตรต่อหน่วย
const typeCount = new Map<string, number>();
for (const b of buildings) typeCount.set(b.type, (typeCount.get(b.type) ?? 0) + 1);
const typeNames = [...typeCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 255)
  .map(([t]) => t);
const typeIdx = new Map(typeNames.map((t, i) => [t, i]));
const nB = buildings.length,
  nR = buildings.reduce((s, b) => s + b.rings.length, 0),
  nV = buildings.reduce((s, b) => s + b.rings.reduce((t, r) => t + r.length, 0), 0);
const ringStart = new Uint32Array(nB),
  ringVertStart = new Uint32Array(nR),
  heightDm = new Uint16Array(nB),
  ringVertCount = new Uint16Array(nR),
  verts = new Uint16Array(nV * 2),
  src = new Uint8Array(nB),
  type = new Uint8Array(nB),
  ringCount = new Uint8Array(nB);
{
  let r = 0,
    v = 0;
  buildings.forEach((b, i) => {
    ringStart[i] = r;
    ringCount[i] = Math.min(255, b.rings.length);
    heightDm[i] = Math.round(b.h * 10);
    src[i] = b.src;
    type[i] = typeIdx.get(b.type) ?? 255;
    for (const ring of b.rings.slice(0, 255)) {
      ringVertStart[r] = v;
      ringVertCount[r] = ring.length;
      for (const [x, y] of ring) {
        verts[v * 2] = Math.round(Math.min(Math.max(x, 0), W) / Q);
        verts[v * 2 + 1] = Math.round(Math.min(Math.max(y, 0), H) / Q);
        v++;
      }
      r++;
    }
  });
}
const parts = { ringStart, ringVertStart, heightDm, ringVertCount, verts, src, type, ringCount };
const offsets: Record<string, [number, number]> = {};
let off = 0;
const chunks: Buffer[] = [];
for (const [name, arr] of Object.entries(parts)) {
  offsets[name] = [off, arr.length];
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  chunks.push(buf);
  off += buf.length;
  const pad = (4 - (off % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    off += pad;
  }
}
writeFileSync(OUT + 'buildings.bin', Buffer.concat(chunks));
const srcCount = [0, 0, 0];
for (const s of src) srcCount[s]++;
writeFileSync(
  OUT + 'buildings.json',
  JSON.stringify(
    {
      count: nB,
      rings: nR,
      vertices: nV,
      coords: `Uint16 คู่ (x,y) หน่วย ${Q} ม. จากมุมตะวันตกเฉียงใต้ของ bbox; x=ตะวันออก y=เหนือ; ring แรก = outer ที่เหลือ = hole`,
      quantMeters: Q,
      extentMeters: [+W.toFixed(2), +H.toFixed(2)],
      metersPerDegree: [P.kx, P.ky],
      bbox: cfg.bbox,
      offsets,
      heightUnit: 'dm',
      heightSources: SRC_NAMES,
      heightSourceCount: srcCount,
      typeNames,
      attribution: '© OpenStreetMap contributors (ODbL)',
      generated: new Date().toISOString().slice(0, 10),
      dropped: { tooSmall: droppedSmall, outsideBbox: droppedOutside, levelsRejected },
    },
    null,
    1,
  ) + '\n',
);
console.log(
  `ตึก ${nB} หลัง, ${nR} ring, ${nV} จุด; ความสูงจาก height/levels/ค่าเริ่มต้น = ${srcCount.join('/')}`,
);

// ---------------- แม่น้ำและคลอง ----------------
const ll = (r: Ring) => r.map(([x, y]) => P.toLatLon(x, y).map((v) => +v.toFixed(6)));
const water = (els: OsmEl[], tol: number) =>
  els
    .filter(
      (e) =>
        e.type === 'relation' ||
        (e.geometry &&
          e.geometry.length >= 4 &&
          e.geometry[0].lat === e.geometry.at(-1)!.lat &&
          e.geometry[0].lon === e.geometry.at(-1)!.lon),
    )
    .flatMap((e) =>
      polygonsOf(e).map((p) => ({
        id: `${e.type}/${e.id}`,
        name: e.tags?.name ?? null,
        tags: Object.fromEntries(
          Object.entries(e.tags ?? {}).filter(([k]) => /^(water|waterway|natural|tidal|name:en)$/.test(k)),
        ),
        outer: clipSimplify(p.outer, tol),
        holes: p.holes.map((h) => clipSimplify(h, tol)).filter((h) => h.length >= 3),
      })),
    )
    .filter((p) => p.outer.length >= 3)
    .map((p) => ({
      ...p,
      areaKm2: +(Math.abs(ringArea(p.outer)) / 1e6).toFixed(4),
      outer: ll(p.outer),
      holes: p.holes.map(ll),
    }));

const riverEls = load('river.json');
const river = water(riverEls, 1);
writeFileSync(
  OUT + 'river.json',
  JSON.stringify({ attribution: '© OpenStreetMap contributors (ODbL)', polygons: river }) + '\n',
);
console.log(`แม่น้ำ: ${river.length} polygon, ${river.reduce((s, p) => s + p.areaKm2, 0).toFixed(2)} ตร.กม.`);

const canalEls = load('canals.json');
const canalPolys = water(canalEls, 1);
// เส้นคลอง: ตัดเป็นช่วงที่อยู่ใน bbox
const lines: { name: string | null; width: number | null; pts: number[][] }[] = [];
for (const e of canalEls) {
  if (e.type !== 'way' || e.tags?.waterway !== 'canal' || !e.geometry) continue;
  let run: Pt[] = [];
  const flush = () => {
    if (run.length >= 2)
      lines.push({
        name: e.tags?.name ?? null,
        width: parseHeight(e.tags?.width),
        pts: ll(run),
      });
    run = [];
  };
  for (const p of toXY(e.geometry)) {
    if (p[0] >= -30 && p[1] >= -30 && p[0] <= W + 30 && p[1] <= H + 30) run.push(p);
    else flush();
  }
  flush();
}
writeFileSync(
  OUT + 'canals.json',
  JSON.stringify({ attribution: '© OpenStreetMap contributors (ODbL)', lines, polygons: canalPolys }) + '\n',
);
console.log(`คลอง: ${lines.length} เส้น, ${canalPolys.length} polygon`);
