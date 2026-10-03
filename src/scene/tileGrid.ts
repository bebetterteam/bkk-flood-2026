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
  const pos: number[] = [];
  const STEPS = 24;
  for (const t of built) {
    const { south: s, west: w, north: n, east: e } = t.bbox;
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
        for (const u of [q / STEPS, (q + 1) / STEPS]) {
          const la = la0 + (la1 - la0) * u,
            lo = lo0 + (lo1 - lo0) * u;
          pos.push(f.wx(lo), groundY(la, lo) + 0.25, f.wz(la));
        }
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, depthTest: false }),
  );
  lines.renderOrder = 5;
  parent.add(lines);

  const els = built.map((t) => {
    const e = document.createElement('button');
    e.className = 'tile-lbl';
    e.textContent = STUDY.tileMapLabel(t.name);
    e.title = STUDY.tileMapHint;
    e.onclick = () => onPick(t.id);
    labelBox.appendChild(e);
    const la = (t.bbox.south + t.bbox.north) / 2,
      lo = (t.bbox.west + t.bbox.east) / 2;
    return { e, p: new THREE.Vector3(f.wx(lo), groundY(la, lo) + 0.5, f.wz(la)) };
  });
  const v = new THREE.Vector3();

  return {
    setVisible(on: boolean) {
      lines.visible = on;
      labelBox.style.display = on ? '' : 'none';
    },
    update(camera: THREE.Camera) {
      if (!lines.visible) return;
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
