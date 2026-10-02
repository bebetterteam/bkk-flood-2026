/**
 * แปลง OSM ดิบ → ไฟล์ที่โหลดเร็วใน public/data/study-area/
 *   buildings.bin + buildings.json (footprint quantized 0.25 ม., ความสูง, แหล่งที่มาของความสูง)
 *   river.json, canals.json (lat/lon ตัดทศนิยม 6 หลัก)
 * © OpenStreetMap contributors (ODbL)
 */
import { writeFileSync } from 'node:fs';
import { OUT, loadConfig } from './lib/config.ts';
import { ringArea, type Pt, type Ring } from './lib/geom.ts';
import { loadOsm as load, osmTools, type OsmEl } from './lib/osm.ts';

const cfg = loadConfig();
const { P, W, H, toXY, polygonsOf, clipSimplify, ll } = osmTools(cfg);

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
  /** สี RGB+1 (0 = ไม่มีแท็ก) */
  colour: number;
  roofColour: number;
  roofShape: number;
  use: number;
  levels: number;
}

// ---- สไตล์ตึกสำหรับโหมดสมจริง (MVP 3) ----
const NAMED: Record<string, number> = {
  white: 0xf2f2f2,
  grey: 0x9a9a9a,
  gray: 0x9a9a9a,
  silver: 0xc0c0c0,
  black: 0x333333,
  red: 0xb5483f,
  maroon: 0x7a2e2e,
  brown: 0x8a5a3c,
  orange: 0xd9822b,
  yellow: 0xe8c95c,
  gold: 0xd4af37,
  beige: 0xe3d5b8,
  tan: 0xd2b48c,
  cream: 0xf1e6c8,
  green: 0x5f8f5a,
  blue: 0x4f78b0,
  lightblue: 0x9cc3e6,
  pink: 0xe7a1b0,
  purple: 0x7d5ba6,
};
/** แปลงค่าสีจากแท็ก OSM → RGB+1 (0 = อ่านไม่ได้/ไม่มี) */
function parseColour(v?: string): number {
  if (!v) return 0;
  const c = v.trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(c);
  if (m) return parseInt(m[1], 16) + 1;
  m = /^#?([0-9a-f]{3})$/.exec(c);
  if (m)
    return (
      parseInt(
        m[1].replace(/./g, (x) => x + x),
        16,
      ) + 1
    );
  return NAMED[c] !== undefined ? NAMED[c] + 1 : 0;
}
/** รูปหลังคา: 0 ไม่ระบุ, 1 แบน, 2 จั่ว, 3 ปั้นหยา, 4 ทรงพีระมิด, 5 อื่น ๆ */
const ROOF: Record<string, number> = {
  flat: 1,
  gabled: 2,
  'hipped-and-gabled': 2,
  saltbox: 2,
  hipped: 3,
  mansard: 3,
  pyramidal: 4,
};
/** การใช้งาน: 0 ไม่ระบุ, 1 บ้าน, 2 ที่อยู่อาศัยรวม, 3 พาณิชย์/สำนักงาน, 4 ศาสนสถาน, 5 สาธารณะ, 6 อุตสาหกรรม/โกดัง, 7 หลังคา/เพิง */
function useOf(t: Record<string, string>, type: string): number {
  if (
    t.amenity === 'place_of_worship' ||
    /^(temple|church|mosque|shrine|chapel|cathedral|religious)$/.test(type)
  )
    return 4;
  if (/^(house|detached|semidetached_house|terrace|bungalow|hut)$/.test(type)) return 1;
  if (/^(apartments|residential|dormitory)$/.test(type)) return 2;
  if (/^(commercial|retail|office|hotel|supermarket)$/.test(type) || t.shop || t.office) return 3;
  if (
    /^(school|university|college|hospital|public|civic|government|train_station|transportation|kindergarten)$/.test(
      type,
    ) ||
    t.amenity
  )
    return 5;
  if (/^(industrial|warehouse|factory|manufacture)$/.test(type)) return 6;
  if (/^(roof|shed|garage|garages|carport|kiosk|canopy)$/.test(type)) return 7;
  return 0;
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
    const style = {
      colour: parseColour(t['building:colour']),
      roofColour: parseColour(t['roof:colour']),
      roofShape: t['roof:shape'] ? (ROOF[t['roof:shape']] ?? 5) : 0,
      use: useOf(t, type),
      levels: Math.min(
        255,
        Math.max(1, Math.round(parseFloat(t['building:levels'] ?? '') || h / cfg.buildings.metersPerLevel)),
      ),
    };
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
      buildings.push({ rings: [outer, ...holes], h, src, type, ...style });
    }
  }

// สีที่ติดแท็กมีน้อย → เก็บเป็น index (Uint8) ของ palette ใน buildings.json (0 = ไม่มี)
const palette: number[] = [];
function paletteIndex(rgb1: number): number {
  if (!rgb1) return 0;
  let k = palette.indexOf(rgb1 - 1);
  if (k < 0 && palette.length < 255) k = palette.push(rgb1 - 1) - 1;
  return k < 0 ? 0 : k + 1;
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
  ringCount = new Uint8Array(nB),
  roofShape = new Uint8Array(nB),
  colour = new Uint8Array(nB),
  roofColour = new Uint8Array(nB),
  use = new Uint8Array(nB),
  levels = new Uint8Array(nB);
{
  let r = 0,
    v = 0;
  buildings.forEach((b, i) => {
    ringStart[i] = r;
    ringCount[i] = Math.min(255, b.rings.length);
    heightDm[i] = Math.round(b.h * 10);
    src[i] = b.src;
    type[i] = typeIdx.get(b.type) ?? 255;
    colour[i] = paletteIndex(b.colour);
    roofColour[i] = paletteIndex(b.roofColour);
    roofShape[i] = b.roofShape;
    use[i] = b.use;
    levels[i] = b.levels;
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
const parts = {
  ringStart,
  ringVertStart,
  heightDm,
  ringVertCount,
  verts,
  src,
  type,
  ringCount,
  roofShape,
  colour,
  roofColour,
  use,
  levels,
};
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
      style: {
        colour: 'Uint8 index+1 ของ palette จาก building:colour (0 = ไม่มี)',
        roofColour: 'Uint8 index+1 ของ palette จาก roof:colour (0 = ไม่มี)',
        palette: palette.map((c) => '#' + c.toString(16).padStart(6, '0')),
        roofShape: ['ไม่ระบุ', 'แบน', 'จั่ว', 'ปั้นหยา', 'พีระมิด', 'อื่น ๆ'],
        use: [
          'ไม่ระบุ',
          'บ้าน',
          'ที่อยู่อาศัยรวม',
          'พาณิชย์/สำนักงาน',
          'ศาสนสถาน',
          'สาธารณะ',
          'อุตสาหกรรม/โกดัง',
          'หลังคา/เพิง',
        ],
        levels: 'จำนวนชั้น (จากแท็ก หรือ ความสูง/3.2)',
        counts: {
          colour: buildings.filter((b) => b.colour).length,
          roofColour: buildings.filter((b) => b.roofColour).length,
          roofShape: buildings.filter((b) => b.roofShape).length,
          use: [0, 1, 2, 3, 4, 5, 6, 7].map((u) => buildings.filter((b) => b.use === u).length),
        },
      },
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
