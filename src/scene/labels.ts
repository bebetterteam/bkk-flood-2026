import * as THREE from 'three';
import { LABELS, type LabelKind } from '../data/places';
import type { SimParams } from '../sim/simulate';
import { overviewFrame, type Frame } from './frame';

/** ป้ายชื่อ HTML ที่ฉายตำแหน่งจากโลก 3 มิติ */
export function createLabels(
  container: HTMLElement,
  labels: readonly (readonly [string, number, number, LabelKind?])[] = LABELS,
  f: Frame = overviewFrame,
  /** ความสูงขั้นต่ำของป้าย (ม.) */
  minH = 0.5,
) {
  const els = labels.map(([n, la, lo, cls]) => {
    const e = document.createElement('div');
    e.className = 'lbl ' + (cls || '');
    e.textContent = n;
    container.appendChild(e);
    return { e, la, lo, cls: cls as LabelKind | undefined, isDike: n.startsWith('คัน') };
  });
  const v = new THREE.Vector3();

  function update(
    camera: THREE.Camera,
    show: boolean,
    hEff: Float32Array,
    cur: Float32Array,
    P: SimParams,
  ): void {
    container.style.display = show ? 'block' : 'none';
    if (!show) return;
    for (const L of els) {
      if (L.cls === 'infra' && !P.drains && !L.isDike) {
        L.e.style.display = 'none';
        continue;
      }
      if (L.isDike && !P.dikes) {
        L.e.style.display = 'none';
        continue;
      }
      const c = f.cellAt(L.la, L.lo);
      v.set(f.wx(L.lo), Math.max(hEff[c] + cur[c], minH) * f.vex + 0.6, f.wz(L.la)).project(camera);
      if (v.z > 1) {
        L.e.style.display = 'none';
        continue;
      }
      L.e.style.display = 'block';
      L.e.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
      L.e.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
    }
  }
  return { update };
}
