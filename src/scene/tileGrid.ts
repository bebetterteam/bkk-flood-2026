/** กรอบแผ่นพื้นที่ศึกษาบนแผนที่ภาพรวม: เส้นกรอบ + ป้ายชื่อที่คลิกเพื่อเปิดแผ่นนั้น */
import * as THREE from 'three';
import type { TileInfo } from '../data/studyArea';
import { STUDY } from '../ui/strings';
import type { Frame } from './frame';

export function createTileGrid(
  parent: THREE.Object3D,
  labelBox: HTMLElement,
  f: Frame,
  tiles: TileInfo[],
  /** ความสูงพื้นที่จุด lat/lon (หน่วยโลก) */
  groundY: (lat: number, lon: number) => number,
  onPick: (id: string) => void,
) {
  const built = tiles.filter((t) => t.built);
  const STEPS = 24;
  /** ความกว้างเส้นกรอบ (หน่วยโลก ≈ 1 กม.) */
  const BORDER = 0.1;
  const lift = 0.25;
  const mat = (opacity: number) =>
    new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

  const tilesOut = built.map((t) => {
    const { south: s, west: w, north: n, east: e } = t.bbox;
    // พื้นระบายจาง ๆ (ชัดขึ้นเมื่อชี้ป้าย) — กริดตามพื้นให้ไม่จมใต้ภูมิประเทศ
    const fillPos: number[] = [],
      fillIdx: number[] = [];
    for (let j = 0; j <= STEPS; j++)
      for (let i = 0; i <= STEPS; i++) {
        const la = n + ((s - n) * j) / STEPS,
          lo = w + ((e - w) * i) / STEPS;
        fillPos.push(f.wx(lo), groundY(la, lo) + lift, f.wz(la));
        if (i < STEPS && j < STEPS) {
          const a = j * (STEPS + 1) + i,
            b = a + STEPS + 1;
          fillIdx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
    fillGeo.setIndex(fillIdx);
    const fill = new THREE.Mesh(fillGeo, mat(0.1));
    fill.renderOrder = 4;

    // เส้นกรอบเป็นแถบกว้าง BORDER (เส้น WebGL หนาได้แค่ 1 px) — ขอบตามแกน x/z จึงเลื่อนด้านข้างตรง ๆ ได้
    const bPos: number[] = [];
    const corners: [number, number][] = [
      [s, w],
      [s, e],
      [n, e],
      [n, w],
      [s, w],
    ];
    for (let k = 0; k < 4; k++)
      for (let q = 0; q < STEPS; q++) {
        const [la0, lo0] = corners[k],
          [la1, lo1] = corners[k + 1];
        const p = [q / STEPS, (q + 1) / STEPS].map((u) => {
          const la = la0 + (la1 - la0) * u,
            lo = lo0 + (lo1 - lo0) * u;
          return [f.wx(lo), groundY(la, lo) + lift, f.wz(la)];
        });
        const dx = p[1][0] - p[0][0],
          dz = p[1][2] - p[0][2],
          L = Math.hypot(dx, dz) || 1;
        const ox = (-dz / L) * (BORDER / 2),
          oz = (dx / L) * (BORDER / 2);
        const a = [p[0][0] - ox, p[0][1], p[0][2] - oz],
          b = [p[0][0] + ox, p[0][1], p[0][2] + oz],
          c = [p[1][0] - ox, p[1][1], p[1][2] - oz],
          d = [p[1][0] + ox, p[1][1], p[1][2] + oz];
        bPos.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    const border = new THREE.Mesh(bGeo, mat(0.85));
    border.renderOrder = 5;
    parent.add(fill, border);

    // ป้ายปุ่มที่มุมตะวันตกเฉียงเหนือของกรอบ (ไม่ทับป้ายชื่อในเมือง และบอกว่าเป็นของกรอบนี้)
    const el = document.createElement('button');
    el.className = 'tile-lbl';
    el.textContent = STUDY.tileMapLabel(t.name);
    el.title = STUDY.tileMapHint;
    el.onclick = () => onPick(t.id);
    const hover = (on: boolean) => {
      (fill.material as THREE.MeshBasicMaterial).opacity = on ? 0.32 : 0.1;
      (border.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.85;
    };
    el.onpointerenter = () => hover(true);
    el.onpointerleave = () => hover(false);
    el.onfocus = () => hover(true);
    el.onblur = () => hover(false);
    labelBox.appendChild(el);
    return { e: el, objs: [fill, border], p: new THREE.Vector3(f.wx(w), groundY(n, w) + lift, f.wz(n)) };
  });
  const els = tilesOut;
  const v = new THREE.Vector3();
  let visible = true;

  return {
    setVisible(on: boolean) {
      visible = on;
      for (const t of tilesOut) for (const o of t.objs) o.visible = on;
      labelBox.style.display = on ? '' : 'none';
    },
    update(camera: THREE.Camera) {
      if (!visible) return;
      for (const L of els) {
        v.copy(L.p).project(camera);
        const show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        L.e.style.display = show ? '' : 'none';
        if (!show) continue;
        L.e.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
        L.e.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
      }
    },
  };
}
