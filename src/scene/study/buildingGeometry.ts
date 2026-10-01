/**
 * สร้าง geometry ตึกจาก buildings.bin แบบรวมก้อน (tile 4×4) เพื่อลด draw call
 * - ผนัง: แต่ละจุดของ ring มีจุดล่าง/บน, หลังคา: earcut (THREE.ShapeUtils) ใช้จุดบนร่วมกัน
 * - ใช้ flatShading + DoubleSide จึงไม่ต้องสนลำดับการวนของ ring
 * - faceBuilding[t] = index ตึกของสามเหลี่ยม t (ใช้ตอนชี้เมาส์)
 */
import { ShapeUtils, Vector2 } from 'three';
import type { BuildingsMeta } from '../../data/studyArea';

export interface BuildingTile {
  position: Float32Array;
  color: Float32Array;
  index: Uint32Array;
  faceBuilding: Uint32Array;
}
export interface BuildingArrays {
  heightDm: Uint16Array;
  src: Uint8Array;
  type: Uint8Array;
  count: number;
}

export function readBuildings(meta: BuildingsMeta, bin: ArrayBuffer) {
  const view = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
    new C(bin, meta.offsets[k][0], meta.offsets[k][1]);
  return {
    ringStart: view(Uint32Array, 'ringStart'),
    ringCount: view(Uint8Array, 'ringCount'),
    ringVertStart: view(Uint32Array, 'ringVertStart'),
    ringVertCount: view(Uint16Array, 'ringVertCount'),
    verts: view(Uint16Array, 'verts'),
    heightDm: view(Uint16Array, 'heightDm'),
    src: view(Uint8Array, 'src'),
    type: view(Uint8Array, 'type'),
  };
}

/** สีตามแหล่งที่มาของความสูง: height จริง / levels / ค่าเริ่มต้น */
const SRC_COLOR = [
  [0.72, 0.78, 0.86],
  [0.84, 0.83, 0.8],
  [0.9, 0.87, 0.8],
];

export function buildBuildingTiles(
  meta: BuildingsMeta,
  bin: ArrayBuffer,
  /** เมตรท้องถิ่น (x ตะวันออก, y เหนือ จากมุม SW) → พิกัดโลก [x, z] */
  toWorld: (xm: number, ym: number) => [number, number],
  /** y โลกของฐานตึก ที่ตำแหน่งเมตรท้องถิ่น */
  baseY: (xm: number, ym: number) => number,
  /** เมตร → หน่วยโลก แนวดิ่งของตัวตึก (มาตราส่วนจริง) */
  heightScale: number,
  tiles = 4,
): { tiles: BuildingTile[]; arrays: BuildingArrays } {
  const B = readBuildings(meta, bin);
  const Q = meta.quantMeters;
  const [W, H] = meta.extentMeters;
  // นับขนาดต่อ tile ก่อน
  const tileOf = new Uint16Array(meta.count);
  const vCount = new Uint32Array(tiles * tiles),
    tCount = new Uint32Array(tiles * tiles);
  const roofs: number[][] = new Array(meta.count);
  for (let b = 0; b < meta.count; b++) {
    const r0 = B.ringStart[b],
      nr = B.ringCount[b];
    const o = B.ringVertStart[r0],
      n0 = B.ringVertCount[r0];
    let cx = 0,
      cy = 0;
    for (let k = 0; k < n0; k++) {
      cx += B.verts[(o + k) * 2];
      cy += B.verts[(o + k) * 2 + 1];
    }
    cx = (cx / n0) * Q;
    cy = (cy / n0) * Q;
    const t =
      Math.min(tiles - 1, Math.floor((cy / H) * tiles)) * tiles +
      Math.min(tiles - 1, Math.floor((cx / W) * tiles));
    tileOf[b] = t;
    const contour: Vector2[] = [],
      holes: Vector2[][] = [];
    let nv = 0;
    for (let r = r0; r < r0 + nr; r++) {
      const ro = B.ringVertStart[r],
        rn = B.ringVertCount[r];
      const pts: Vector2[] = [];
      for (let k = 0; k < rn; k++) pts.push(new Vector2(B.verts[(ro + k) * 2], B.verts[(ro + k) * 2 + 1]));
      if (r === r0) contour.push(...pts);
      else holes.push(pts);
      nv += rn;
    }
    const faces = ShapeUtils.triangulateShape(contour, holes);
    roofs[b] = faces.flat();
    vCount[t] += nv * 2;
    tCount[t] += nv * 2 + faces.length; // ผนัง 2 สามเหลี่ยมต่อขอบ + หลังคา
  }
  const out: BuildingTile[] = [];
  for (let t = 0; t < tiles * tiles; t++)
    out.push({
      position: new Float32Array(vCount[t] * 3),
      color: new Float32Array(vCount[t] * 3),
      index: new Uint32Array(tCount[t] * 3),
      faceBuilding: new Uint32Array(tCount[t]),
    });
  const vUsed = new Uint32Array(tiles * tiles),
    tUsed = new Uint32Array(tiles * tiles);
  for (let b = 0; b < meta.count; b++) {
    const T = out[tileOf[b]],
      t = tileOf[b];
    const r0 = B.ringStart[b],
      nr = B.ringCount[b];
    // ฐาน = ค่ากลางของพื้นที่จุดยอดของ outer ring (ลดตึกลอย/จม)
    const o0 = B.ringVertStart[r0],
      n0 = B.ringVertCount[r0];
    const bases: number[] = [];
    for (let k = 0; k < n0; k++) bases.push(baseY(B.verts[(o0 + k) * 2] * Q, B.verts[(o0 + k) * 2 + 1] * Q));
    bases.sort((a, c) => a - c);
    const y0 = bases[(bases.length / 2) | 0];
    const y1 = y0 + (B.heightDm[b] / 10) * heightScale;
    const col = SRC_COLOR[B.src[b]] ?? SRC_COLOR[2];
    const vStart = vUsed[t];
    let local = 0;
    // offset ของจุดบนของ ring แรกในการนับรวม (สำหรับหลังคา)
    const topIndexOf: number[] = [];
    for (let r = r0; r < r0 + nr; r++) {
      const ro = B.ringVertStart[r],
        rn = B.ringVertCount[r];
      const first = vStart + local;
      for (let k = 0; k < rn; k++) {
        const [x, z] = toWorld(B.verts[(ro + k) * 2] * Q, B.verts[(ro + k) * 2 + 1] * Q);
        const vb = first + k * 2,
          vt = vb + 1;
        T.position.set([x, y0, z, x, y1, z], vb * 3);
        T.color.set([col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, ...col], vb * 3);
        topIndexOf.push(vt);
        const nb = first + ((k + 1) % rn) * 2,
          nt = nb + 1;
        T.index.set([vb, nb, vt, vt, nb, nt], tUsed[t] * 3);
        T.faceBuilding[tUsed[t]] = b;
        T.faceBuilding[tUsed[t] + 1] = b;
        tUsed[t] += 2;
      }
      local += rn * 2;
    }
    const roof = roofs[b];
    for (let k = 0; k < roof.length; k += 3) {
      T.index.set([topIndexOf[roof[k]], topIndexOf[roof[k + 1]], topIndexOf[roof[k + 2]]], tUsed[t] * 3);
      T.faceBuilding[tUsed[t]++] = b;
    }
    vUsed[t] += local;
  }
  return { tiles: out, arrays: { heightDm: B.heightDm, src: B.src, type: B.type, count: meta.count } };
}
