/**
 * ข้อมูลสำหรับโหมดสมจริง (MVP 3) → public/data/study-area/
 *   roads.bin + roads.json  ถนน/ราง: polyline (Uint16 0.25 ม.), ความกว้าง, ประเภท, ความสูงยก (ทางยกระดับ/สะพาน) ต่อจุด
 *   green.json              สวน/หญ้า/ป่า/ลานวัด (polygon lat/lon)
 *   trees.bin + trees.json  ต้นไม้ (natural=tree)
 * © OpenStreetMap contributors (ODbL)
 */
import { writeFileSync } from 'node:fs';
import { OUT, loadConfig } from './lib/config.ts';
import { type Pt } from './lib/geom.ts';
import { loadOsm, osmTools, type OsmEl } from './lib/osm.ts';

const cfg = loadConfig();
const { P, W, H, toXY, polygonsOf, clipSimplify, ll } = osmTools(cfg);
const Q = 0.25;

// ---------------- ถนน ----------------
/** ประเภท (index = รหัสในไฟล์) และความกว้างเริ่มต้น (ม.) */
export const ROAD_CLASSES: [string, number][] = [
  ['motorway', 11],
  ['motorway_link', 6.5],
  ['trunk', 14],
  ['trunk_link', 6.5],
  ['primary', 14],
  ['primary_link', 6.5],
  ['secondary', 10],
  ['secondary_link', 6],
  ['tertiary', 8],
  ['tertiary_link', 6],
  ['unclassified', 6],
  ['residential', 5.5],
  ['living_street', 4.5],
  ['service', 4],
  ['pedestrian', 5],
  ['busway', 4],
  ['road', 5],
  ['rail', 4],
  ['subway', 4],
  ['light_rail', 4],
  ['monorail', 3],
];
const CLS = new Map(ROAD_CLASSES.map(([c], i) => [c, i]));
const EXPRESS = /^(motorway|motorway_link|trunk|trunk_link)$/;

const parseNum = (v?: string) => {
  const m = v && /^\s*([\d.]+)/.exec(v);
  return m ? parseFloat(m[1]) : NaN;
};
const len = (pts: Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

const seen = new Set<number>();
const ways: OsmEl[] = [];
for (let k = 0; k < 4; k++)
  for (const e of loadOsm(`roads-${k}.json`)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    ways.push(e);
  }
for (const e of loadOsm('rail.json')) ways.push(e);

const isBridge = (t: Record<string, string>) => !!t.bridge && t.bridge !== 'no';
const isTunnel = (t: Record<string, string>) => !!t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'culvert';
/** node ที่อยู่บนถนนพื้นราบ — ปลายทางยกระดับที่แตะ node เหล่านี้ต้องค่อย ๆ ลาดลงถึงพื้น */
const groundNodes = new Set<number>();
for (const e of ways)
  if (e.nodes && !isBridge(e.tags ?? {}) && !isTunnel(e.tags ?? {}))
    for (const n of e.nodes) groundNodes.add(n);

interface Line {
  pts: Pt[];
  lift: number[];
  cls: number;
  width: number;
  lanes: number;
  flags: number;
}
const lines: Line[] = [];
const stat = {
  kept: 0,
  skippedClass: 0,
  tunnel: 0,
  elevated: 0,
  flyover: 0,
  smallBridge: 0,
  withLanes: 0,
  withWidth: 0,
};
for (const e of ways) {
  const t = e.tags ?? {};
  const kind = t.highway ?? t.railway;
  const cls = CLS.get(kind ?? '');
  if (cls === undefined || !e.geometry) {
    stat.skippedClass++;
    continue;
  }
  if (isTunnel(t)) {
    stat.tunnel++;
    continue;
  }
  const pts = toXY(e.geometry);
  const L = len(pts);
  const layer = Number.isFinite(parseNum(t.layer)) ? Math.max(1, parseNum(t.layer)) : 1;
  // ความสูงยก (ม.) ส่วนกลางของเส้น — ค่าประมาณเพื่อการแสดงผล
  let top = 0;
  if (isBridge(t)) {
    if (EXPRESS.test(kind!) || (t.railway && kind !== 'subway')) top = 14 + 6 * (layer - 1);
    else if (L > 120) top = 7 * layer;
    else top = 1.5;
    if (top >= 14) stat.elevated++;
    else if (top >= 7) stat.flyover++;
    else stat.smallBridge++;
  }
  // ลาดขึ้น/ลงที่ปลายที่แตะถนนพื้นราบ
  const ramp = Math.min(150, L / 2);
  const startGround = top > 0 && e.nodes && groundNodes.has(e.nodes[0]);
  const endGround = top > 0 && e.nodes && groundNodes.has(e.nodes[e.nodes.length - 1]);
  let acc = 0;
  const lift = pts.map((p, i) => {
    if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    let h = top;
    if (startGround) h = Math.min(h, (top * acc) / ramp);
    if (endGround) h = Math.min(h, (top * (L - acc)) / ramp);
    return Math.max(0, h);
  });
  const lanes = Math.round(parseNum(t.lanes));
  const wTag = parseNum(t.width);
  if (lanes > 0) stat.withLanes++;
  if (wTag > 0) stat.withWidth++;
  const width = wTag > 1 && wTag < 60 ? wTag : lanes > 0 ? lanes * 3.2 : ROAD_CLASSES[cls][1];
  const flags = (t.oneway === 'yes' ? 1 : 0) | (top > 0 ? 2 : 0) | (t.railway ? 4 : 0);
  // ตัดเฉพาะช่วงที่อยู่ใน bbox (เผื่อขอบ 20 ม.)
  let run: Pt[] = [],
    runLift: number[] = [];
  const flush = () => {
    if (run.length >= 2)
      lines.push({ pts: run, lift: runLift, cls, width, lanes: Math.max(0, lanes) || 0, flags });
    run = [];
    runLift = [];
  };
  pts.forEach((p, i) => {
    if (p[0] >= -20 && p[1] >= -20 && p[0] <= W + 20 && p[1] <= H + 20) {
      run.push(p);
      runLift.push(lift[i]);
    } else flush();
  });
  flush();
  stat.kept++;
}

const nL = lines.length,
  nV = lines.reduce((s, l) => s + l.pts.length, 0);
const lineStart = new Uint32Array(nL),
  lineCount = new Uint16Array(nL),
  widthDm = new Uint16Array(nL),
  verts = new Uint16Array(nV * 2),
  liftDm = new Uint16Array(nV),
  cls = new Uint8Array(nL),
  lanes = new Uint8Array(nL),
  flags = new Uint8Array(nL);
{
  let v = 0;
  lines.forEach((l, i) => {
    lineStart[i] = v;
    lineCount[i] = l.pts.length;
    widthDm[i] = Math.round(l.width * 10);
    cls[i] = l.cls;
    lanes[i] = l.lanes;
    flags[i] = l.flags;
    l.pts.forEach(([x, y], k) => {
      verts[v * 2] = Math.round(Math.min(Math.max(x, 0), W) / Q);
      verts[v * 2 + 1] = Math.round(Math.min(Math.max(y, 0), H) / Q);
      liftDm[v] = Math.round(l.lift[k] * 10);
      v++;
    });
  });
}
function writeBin(name: string, parts: Record<string, ArrayBufferView & { length: number }>) {
  const offsets: Record<string, [number, number]> = {};
  const chunks: Buffer[] = [];
  let off = 0;
  for (const [k, arr] of Object.entries(parts)) {
    offsets[k] = [off, arr.length];
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(buf);
    off += buf.length;
    const pad = (4 - (off % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      off += pad;
    }
  }
  writeFileSync(OUT + name, Buffer.concat(chunks));
  return offsets;
}
const roadOffsets = writeBin('roads.bin', {
  lineStart,
  widthDm,
  lineCount,
  verts,
  liftDm,
  cls,
  lanes,
  flags,
});
const byClass = ROAD_CLASSES.map(([c], i) => [c, Array.from(cls).filter((x) => x === i).length]);
writeFileSync(
  OUT + 'roads.json',
  JSON.stringify(
    {
      count: nL,
      vertices: nV,
      coords: `Uint16 คู่ (x,y) หน่วย ${Q} ม. จากมุมตะวันตกเฉียงใต้ของ bbox`,
      quantMeters: Q,
      extentMeters: [+W.toFixed(2), +H.toFixed(2)],
      metersPerDegree: [P.kx, P.ky],
      bbox: cfg.bbox,
      offsets: roadOffsets,
      classes: ROAD_CLASSES.map(([c]) => c),
      flags: { oneway: 1, bridge: 2, rail: 4 },
      units: { widthDm: 'เดซิเมตร', liftDm: 'ความสูงยกจากพื้น (เดซิเมตร, ค่าประมาณเพื่อแสดงผล)' },
      liftRule:
        'สะพานทางด่วน/รางยกระดับ 14 ม. + 6 ม. ต่อ layer ที่เกิน 1; สะพานอื่นยาว > 120 ม. 7 ม. × layer; สะพานสั้น 1.5 ม.; ลาดที่ปลายที่ต่อกับถนนพื้นราบ (≤ 150 ม.)',
      byClass: Object.fromEntries(byClass.filter(([, n]) => n)),
      stats: stat,
      attribution: '© OpenStreetMap contributors (ODbL)',
      generated: new Date().toISOString().slice(0, 10),
    },
    null,
    1,
  ) + '\n',
);
console.log(`ถนน/ราง ${nL} เส้น ${nV} จุด`, stat);

// ---------------- พื้นที่สีเขียว ----------------
const greenKind = (t: Record<string, string>) => {
  const v = t.leisure ?? t.landuse ?? t.natural ?? t.amenity ?? '';
  if (/^(wood|forest|scrub)$/.test(v)) return 'wood';
  if (/^(place_of_worship|religious)$/.test(v)) return 'temple';
  if (/^(pitch|golf_course)$/.test(v)) return 'pitch';
  if (v === 'cemetery') return 'cemetery';
  return 'grass';
};
const green = loadOsm('green.json')
  .filter((e) => e.type !== 'node')
  .flatMap((e) =>
    polygonsOf(e).map((p) => ({
      kind: greenKind(e.tags ?? {}),
      outer: clipSimplify(p.outer, 1),
      holes: p.holes.map((h) => clipSimplify(h, 1)).filter((h) => h.length >= 3),
    })),
  )
  .filter((p) => p.outer.length >= 3)
  .map((p) => ({ kind: p.kind, outer: ll(p.outer), holes: p.holes.map(ll) }));
writeFileSync(
  OUT + 'green.json',
  JSON.stringify({ attribution: '© OpenStreetMap contributors (ODbL)', polygons: green }) + '\n',
);
const gk: Record<string, number> = {};
for (const g of green) gk[g.kind] = (gk[g.kind] ?? 0) + 1;
console.log('พื้นที่สีเขียว', green.length, gk);

// ---------------- ต้นไม้ ----------------
const trees = loadOsm('trees.json')
  .filter((e) => e.type === 'node' && e.lat !== undefined)
  .map((e) => P.toXY(e.lat!, e.lon!))
  .filter(([x, y]) => x >= 0 && y >= 0 && x <= W && y <= H);
const tv = new Uint16Array(trees.length * 2);
trees.forEach(([x, y], i) => {
  tv[i * 2] = Math.round(x / Q);
  tv[i * 2 + 1] = Math.round(y / Q);
});
writeFileSync(OUT + 'trees.bin', Buffer.from(tv.buffer));
writeFileSync(
  OUT + 'trees.json',
  JSON.stringify({
    count: trees.length,
    coords: `Uint16 คู่ (x,y) หน่วย ${Q} ม. จากมุม SW`,
    quantMeters: Q,
    attribution: '© OpenStreetMap contributors (ODbL)',
  }) + '\n',
);
console.log('ต้นไม้', trees.length);
