/**
 * สร้าง geometry ถนน/รางจาก roads.bin (pure — ใช้ได้ใน Node สำหรับเทสต์)
 * - แบ่งจุดใหม่ทุก ~15 ม. ให้ถนนพื้นราบเกาะตาม DEM
 * - ทางยกระดับ: พื้นใต้ทางถูกเฉลี่ย ±60 ม. ให้พื้นทางเรียบ, มีผนังข้างหนา 1.2 ม. และเสาทุก ~30 ม.
 * - attribute `roadInfo` = (ตำแหน่งตามขวาง ม. 0..กว้าง, ระยะตามยาว ม., ความกว้าง ม., เลน×16 + รหัสเส้นจราจร) ใช้วาดเส้นใน shader
 */
import type { RoadsMeta } from '../../data/realisticData';

/** รหัสเส้นจราจร (bit) */
export const MARK_CENTER = 1,
  MARK_LANES = 2,
  MARK_EDGE = 4,
  MARK_RAIL = 8;

export interface RoadMeshData {
  position: Float32Array;
  uv: Float32Array;
  roadInfo: Float32Array;
  index: Uint32Array;
  /** จำนวน index ของผิวถนน (ที่เหลือคือผนังข้างทางยกระดับ) */
  surfaceCount: number;
  /** เสา: [x, yล่าง, z, ความสูง(หน่วยโลก)] ต่อเสา */
  pillars: Float32Array;
}

export function readRoads(meta: RoadsMeta, bin: ArrayBuffer) {
  const v = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(bin, meta.offsets[k][0], meta.offsets[k][1]);
  return {
    lineStart: v(Uint32Array, 'lineStart'),
    lineCount: v(Uint16Array, 'lineCount'),
    widthDm: v(Uint16Array, 'widthDm'),
    verts: v(Uint16Array, 'verts'),
    liftDm: v(Uint16Array, 'liftDm'),
    cls: v(Uint8Array, 'cls'),
    lanes: v(Uint8Array, 'lanes'),
    flags: v(Uint8Array, 'flags'),
  };
}

export function buildRoadGeometry(
  meta: RoadsMeta,
  bin: ArrayBuffer,
  /** เมตรท้องถิ่น → [x, z] โลก */
  toWorld: (xm: number, ym: number) => [number, number],
  /** y โลกของพื้นที่ตำแหน่งเมตรท้องถิ่น */
  groundY: (xm: number, ym: number) => number,
  /** เมตร → หน่วยโลก (มาตราส่วนจริง ใช้กับความกว้าง/ความสูงยก) */
  unit: number,
  step = 15,
): RoadMeshData {
  const R = readRoads(meta, bin);
  const Q = meta.quantMeters;
  const cls = meta.classes;
  const pos: number[] = [],
    uv: number[] = [],
    info: number[] = [],
    surf: number[] = [],
    side: number[] = [],
    pillars: number[] = [];
  const major = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link']);
  const twoWayMarked = new Set(['primary', 'secondary', 'tertiary', 'trunk', 'unclassified']);

  for (let l = 0; l < meta.count; l++) {
    const c = cls[R.cls[l]];
    const isRail = (R.flags[l] & 4) !== 0;
    const oneway = (R.flags[l] & 1) !== 0;
    const lanes = R.lanes[l];
    const w = R.widthDm[l] / 10;
    let mark = 0;
    if (isRail) mark = MARK_RAIL;
    else {
      if (!oneway && twoWayMarked.has(c)) mark |= MARK_CENTER;
      if (lanes >= 2 || (oneway && major.has(c))) mark |= MARK_LANES;
      if (major.has(c)) mark |= MARK_EDGE;
    }
    // แบ่งจุดใหม่
    const pts: { x: number; y: number; lift: number }[] = [];
    const s0 = R.lineStart[l],
      n = R.lineCount[l];
    for (let k = 0; k < n; k++) {
      const x = R.verts[(s0 + k) * 2] * Q,
        y = R.verts[(s0 + k) * 2 + 1] * Q,
        lift = R.liftDm[s0 + k] / 10;
      if (k) {
        const p = pts[pts.length - 1];
        const d = Math.hypot(x - p.x, y - p.y);
        const m = Math.floor(d / step);
        for (let t = 1; t <= m; t++) {
          const f = t / (m + 1);
          pts.push({ x: p.x + (x - p.x) * f, y: p.y + (y - p.y) * f, lift: p.lift + (lift - p.lift) * f });
        }
      }
      pts.push({ x, y, lift });
    }
    // ทิ้งจุดซ้ำ
    const P = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.05);
    if (P.length < 2) continue;
    const lifted = P.some((p) => p.lift > 2);
    // ระยะสะสม
    const along = [0];
    for (let i = 1; i < P.length; i++)
      along.push(along[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    // พื้นใต้จุด (ทางยกระดับ: เฉลี่ย ±60 ม.)
    const g0 = P.map((p) => groundY(p.x, p.y));
    const ground = lifted
      ? g0.map((_, i) => {
          let s = 0,
            k = 0;
          for (let j = i; j >= 0 && along[i] - along[j] <= 60; j--) {
            s += g0[j];
            k++;
          }
          for (let j = i + 1; j < P.length && along[j] - along[i] <= 60; j++) {
            s += g0[j];
            k++;
          }
          return s / k;
        })
      : g0;
    // ถนนหลักวางสูงกว่าเล็กน้อยลดการซ้อนทับกับซอย (z-fighting)
    const bias = (0.25 + (isRail ? 0.05 : major.has(c) ? 0.12 : 0)) * unit;
    const base = pos.length / 3;
    const nPts = P.length;
    for (let i = 0; i < nPts; i++) {
      const a = P[Math.max(0, i - 1)],
        b = P[Math.min(nPts - 1, i + 1)];
      let tx = b.x - a.x,
        ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // miter: ขยายตาม 1/cos ของครึ่งมุมเลี้ยว (จำกัด 2 เท่า)
      let scale = 1;
      if (i > 0 && i < nPts - 1) {
        const ux = P[i].x - a.x,
          uy = P[i].y - a.y,
          ul = Math.hypot(ux, uy) || 1;
        const cos = (ux / ul) * tx + (uy / ul) * ty;
        scale = Math.min(2, 1 / Math.max(0.5, cos));
      }
      const nx = -ty * (w / 2) * scale,
        ny = tx * (w / 2) * scale;
      const y = P[i].lift > 0 ? ground[i] + P[i].lift * unit : g0[i] + bias;
      for (const s of [-1, 1]) {
        const [X, Z] = toWorld(P[i].x + nx * s, P[i].y + ny * s);
        pos.push(X, y, Z);
        uv.push(((s + 1) / 2) * (w / 4), along[i] / 4);
        info.push(((s + 1) / 2) * w, along[i], w, (lanes || 2) * 16 + mark);
      }
      if (i) {
        const q = base + (i - 1) * 2;
        surf.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    if (lifted) {
      // ผนังข้าง: ขอบล่างต่ำกว่าพื้นทาง 1.2 ม.
      const sb = pos.length / 3;
      for (let i = 0; i < nPts; i++) {
        for (const e of [0, 1]) {
          const v = base + i * 2 + e;
          const X = pos[v * 3],
            Y = pos[v * 3 + 1],
            Z = pos[v * 3 + 2];
          const drop = P[i].lift > 0 ? 1.2 * unit : 0;
          pos.push(X, Y - drop, Z);
          uv.push(along[i] / 4, 0);
          info.push(0, along[i], 0, 0);
        }
        if (i) {
          for (const e of [0, 1]) {
            const t0 = base + (i - 1) * 2 + e,
              t1 = base + i * 2 + e,
              b0 = sb + (i - 1) * 2 + e,
              b1 = sb + i * 2 + e;
            side.push(t0, b0, t1, t1, b0, b1);
          }
        }
      }
      // เสาทุก ~30 ม. ที่ยกสูงกว่า 5 ม.
      let next = 15;
      for (let i = 0; i < nPts; i++)
        if (along[i] >= next) {
          next = along[i] + 30;
          if (P[i].lift > 5) {
            const [X, Z] = toWorld(P[i].x, P[i].y);
            pillars.push(X, ground[i], Z, (P[i].lift - 1.2) * unit);
          }
        }
    }
  }
  return {
    position: new Float32Array(pos),
    uv: new Float32Array(uv),
    roadInfo: new Float32Array(info),
    index: new Uint32Array([...surf, ...side]),
    surfaceCount: surf.length,
    pillars: new Float32Array(pillars),
  };
}
