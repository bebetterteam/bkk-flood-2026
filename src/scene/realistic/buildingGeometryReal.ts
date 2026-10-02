/**
 * geometry ตึกแบบสมจริง (pure — ใช้ได้ใน Node)
 * - ผนัง: UV = (ระยะตามเส้นรอบรูป ม., ความสูง ม.) ใช้วาดหน้าต่างใน shader, attribute `facade` = ชนิดหน้าต่าง
 * - หลังคา: บ้าน/วัด/ที่ OSM ระบุทรงจั่ว-ปั้นหยา และไม่มีรูกลาง → หลังคาทรงพีระมิดจากจุดศูนย์กลาง (ประมาณทรงปั้นหยา)
 *   นอกนั้นหลังคาแบน (earcut)
 * - สี: จาก building:colour ถ้ามี ไม่งั้นสุ่มแบบกำหนดได้ (hash index) จาก palette ตามการใช้งาน
 * - แบ่ง tile 4×4 แต่ละ tile มี 3 กลุ่ม index: ผนัง / หลังคาแบน / หลังคากระเบื้อง
 */
import { ShapeUtils, Vector2 } from 'three';
import type { BuildingsMeta } from '../../data/studyArea';

/** ชนิดหน้าต่าง (ค่าใน attribute facade) */
export const WIN_NONE = 0,
  WIN_HOUSE = 1,
  WIN_RES = 2,
  WIN_GLASS = 3;

export interface RealBuildingTile {
  position: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  facade: Float32Array;
  index: Uint32Array;
  /** [start, count] ของแต่ละกลุ่ม: ผนัง, หลังคาแบน, หลังคากระเบื้อง */
  groups: [number, number][];
}

// palette (sRGB hex) ตามการใช้งาน: 0 ไม่ระบุ 1 บ้าน 2 ที่อยู่รวม 3 พาณิชย์ 4 ศาสนสถาน 5 สาธารณะ 6 อุตสาหกรรม 7 เพิง
const WALL: number[][] = [
  [0xe8e2d6, 0xd9d2c3, 0xf0ece4, 0xcfc7b8, 0xe6d9c2, 0xdcdcdc, 0xe9dccb],
  [0xf1e6cf, 0xe8d3b0, 0xf3efe6, 0xdfc9a8, 0xe9d2c2, 0xd8e0d0],
  [0xece7df, 0xdad5cc, 0xf2ede4, 0xd6cbbd, 0xe4e0d8],
  [0xd5d9de, 0xc8ced6, 0xe6e6e6, 0xbfc6cf, 0xdedad2],
  [0xf6f1e7, 0xf3ead6],
  [0xe9e1cf, 0xdedcd3, 0xefe7d6],
  [0xbdbdb8, 0xc9c6bd, 0xadb1b4],
  [0xa9a49a, 0xb8b2a6],
];
/** หลังคากระเบื้อง: ค่าคูณกับ texture ดินเผา (สีขาว = สีดินเผาเดิม) */
const ROOF_TILE = [0xffffff, 0xffe2cc, 0xe6d6cc, 0xa9a9b4, 0xbcb4ac];
/** หลังคาวัด: ส้ม-แดงสด และกระเบื้องเคลือบสีน้ำเงิน-เขียว (คูณกับ texture ดินเผา) */
const TEMPLE_ROOF = [0xffc890, 0xffb07a, 0xffd28c, 0x6fa2ff, 0x7fd0a0];
/** หลังคาแบน: คอนกรีตสีอ่อน + หลังคาเหล็กแผ่นเทา/ฟ้า (คูณกับ texture ปูน) */
const ROOF_FLAT = [0xdedbd4, 0xd2cec6, 0xe8e5de, 0xc6c2ba, 0xb9c3cc, 0xa7b7c7, 0xcfc6b6];

const hash = (i: number) => {
  let x = (i + 1) * 0x9e3779b1;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};
const pick = (arr: number[], i: number) => arr[Math.floor(hash(i) * arr.length) % arr.length];
/** sRGB hex → linear [r,g,b] (three ใช้ linear ใน vertex color) */
const lin = (hex: number) =>
  [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });

/** เพิ่มสามเหลี่ยมหลังคาโดยให้ด้านหน้าหันขึ้นฟ้า (สลับลำดับถ้าคว่ำ) */
function pushUp(
  T: { pos: number[]; idx: [number[], number[], number[]] },
  g: 1 | 2,
  a: number,
  b: number,
  c: number,
) {
  const p = T.pos;
  const ux = p[b * 3] - p[a * 3],
    uz = p[b * 3 + 2] - p[a * 3 + 2],
    vx = p[c * 3] - p[a * 3],
    vz = p[c * 3 + 2] - p[a * 3 + 2];
  if (uz * vx - ux * vz < 0) T.idx[g].push(a, c, b);
  else T.idx[g].push(a, b, c);
}

export function buildRealBuildingTiles(
  meta: BuildingsMeta & { style?: { palette?: string[] } },
  bin: ArrayBuffer,
  toWorld: (xm: number, ym: number) => [number, number],
  baseY: (xm: number, ym: number) => number,
  unit: number,
  tiles = 4,
): RealBuildingTile[] {
  const v = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(bin, meta.offsets[k][0], meta.offsets[k][1]);
  const ringStart = v(Uint32Array, 'ringStart'),
    ringCount = v(Uint8Array, 'ringCount'),
    rvs = v(Uint32Array, 'ringVertStart'),
    rvc = v(Uint16Array, 'ringVertCount'),
    verts = v(Uint16Array, 'verts'),
    heightDm = v(Uint16Array, 'heightDm'),
    use = v(Uint8Array, 'use'),
    roofShape = v(Uint8Array, 'roofShape'),
    colour = v(Uint8Array, 'colour'),
    roofColour = v(Uint8Array, 'roofColour'),
    levels = v(Uint8Array, 'levels');
  const palette = (meta.style?.palette ?? []).map((h) => parseInt(h.slice(1), 16));
  const Q = meta.quantMeters;
  const [W, H] = meta.extentMeters;

  type Acc = {
    pos: number[];
    uv: number[];
    col: number[];
    fac: number[];
    idx: [number[], number[], number[]];
  };
  const acc: Acc[] = Array.from({ length: tiles * tiles }, () => ({
    pos: [],
    uv: [],
    col: [],
    fac: [],
    idx: [[], [], []],
  }));

  for (let b = 0; b < meta.count; b++) {
    const r0 = ringStart[b],
      nr = ringCount[b];
    const rings: [number, number][][] = [];
    for (let r = r0; r < r0 + nr; r++) {
      const ring: [number, number][] = [];
      for (let k = 0; k < rvc[r]; k++)
        ring.push([verts[(rvs[r] + k) * 2] * Q, verts[(rvs[r] + k) * 2 + 1] * Q]);
      rings.push(ring);
    }
    // ทิศการวนให้สม่ำเสมอ: outer ทวนเข็ม (มองจากด้านบน), hole ตามเข็ม → ผนังหันออกนอกเสมอ ใช้ FrontSide ได้
    // (FrontSide ทำให้ shadow pass วาดด้านหลังแทน จึงไม่เกิด shadow acne บนผนังที่โดนแดด)
    const signed = (r: [number, number][]) => {
      let a2 = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) a2 += r[j][0] * r[i][1] - r[i][0] * r[j][1];
      return a2;
    };
    rings.forEach((r, k) => {
      if ((k === 0) !== signed(r) > 0) r.reverse();
    });
    const outer = rings[0];
    // พื้นที่และจุดศูนย์กลาง (shoelace)
    let A = 0,
      cx = 0,
      cy = 0;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const f = outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1];
      A += f;
      cx += (outer[j][0] + outer[i][0]) * f;
      cy += (outer[j][1] + outer[i][1]) * f;
    }
    A /= 2;
    if (Math.abs(A) < 1e-6) continue;
    cx /= 6 * A;
    cy /= 6 * A;
    const area = Math.abs(A);
    const t =
      Math.min(tiles - 1, Math.floor((cy / H) * tiles)) * tiles +
      Math.min(tiles - 1, Math.floor((cx / W) * tiles));
    const T = acc[t];

    const u = use[b];
    const h = heightDm[b] / 10;
    const bases = outer.map(([x, y]) => baseY(x, y)).sort((p, q) => p - q);
    const y0 = bases[(bases.length / 2) | 0];
    const y1 = y0 + h * unit;
    const wallHex =
      colour[b] && palette[colour[b] - 1] !== undefined
        ? palette[colour[b] - 1]
        : pick(WALL[u] ?? WALL[0], b);
    const wallC = lin(wallHex);
    const win =
      u === 4 || u === 6 || u === 7
        ? WIN_NONE
        : u === 3 || h >= 40
          ? WIN_GLASS
          : u === 1 || levels[b] <= 2
            ? WIN_HOUSE
            : WIN_RES;
    // ผนัง (จุดแรกซ้ำท้าย ring เพื่อให้ UV ต่อเนื่อง)
    for (const ring of rings) {
      const first = T.pos.length / 3;
      let per = 0;
      for (let k = 0; k <= ring.length; k++) {
        const [x, y] = ring[k % ring.length];
        if (k) {
          const [px, py] = ring[k - 1];
          per += Math.hypot(x - px, y - py);
        }
        const [X, Z] = toWorld(x, y);
        T.pos.push(X, y0, Z, X, y1, Z);
        T.uv.push(per, 0, per, h);
        T.col.push(...wallC, ...wallC);
        T.fac.push(win, win);
        if (k) {
          const a = first + (k - 1) * 2;
          T.idx[0].push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    // หลังคา
    const pitched =
      rings.length === 1 &&
      area < 4000 &&
      (u === 4 ||
        roofShape[b] === 2 ||
        roofShape[b] === 3 ||
        roofShape[b] === 4 ||
        (u === 1 && area < 300 && h <= 12));
    if (pitched) {
      const rh = Math.min(u === 4 ? 14 : 5, Math.max(1.5, (u === 4 ? 0.45 : 0.3) * Math.sqrt(area)));
      const roofHex =
        roofColour[b] && palette[roofColour[b] - 1] !== undefined
          ? palette[roofColour[b] - 1]
          : pick(u === 4 ? TEMPLE_ROOF : ROOF_TILE, b * 7 + 3);
      const rc = lin(roofHex);
      const [AX, AZ] = toWorld(cx, cy);
      const apex = T.pos.length / 3;
      T.pos.push(AX, y1 + rh * unit, AZ);
      T.uv.push(cx / 3, cy / 3);
      T.col.push(...rc);
      T.fac.push(-1);
      const eave = T.pos.length / 3;
      for (const [x, y] of outer) {
        const [X, Z] = toWorld(x, y);
        T.pos.push(X, y1, Z);
        T.uv.push(x / 3, y / 3);
        T.col.push(...rc);
        T.fac.push(-1);
      }
      for (let k = 0; k < outer.length; k++) pushUp(T, 2, apex, eave + k, eave + ((k + 1) % outer.length));
    } else {
      const rc = lin(
        roofColour[b] && palette[roofColour[b] - 1] !== undefined
          ? palette[roofColour[b] - 1]
          : pick(ROOF_FLAT, b),
      );
      const contour = outer.map(([x, y]) => new Vector2(x, y));
      const holes = rings.slice(1).map((r) => r.map(([x, y]) => new Vector2(x, y)));
      const faces = ShapeUtils.triangulateShape(contour, holes);
      const start = T.pos.length / 3;
      for (const ring of rings)
        for (const [x, y] of ring) {
          const [X, Z] = toWorld(x, y);
          T.pos.push(X, y1, Z);
          T.uv.push(x / 4, y / 4);
          T.col.push(...rc);
          T.fac.push(-1);
        }
      for (const f of faces) pushUp(T, 1, start + f[0], start + f[1], start + f[2]);
    }
  }
  return acc.map((T) => {
    const idx = [...T.idx[0], ...T.idx[1], ...T.idx[2]];
    return {
      position: new Float32Array(T.pos),
      uv: new Float32Array(T.uv),
      color: new Float32Array(T.col),
      facade: new Float32Array(T.fac),
      index: new Uint32Array(idx),
      groups: [
        [0, T.idx[0].length],
        [T.idx[0].length, T.idx[1].length],
        [T.idx[0].length + T.idx[1].length, T.idx[2].length],
      ],
    };
  });
}
