import * as THREE from 'three';
import { LABELS, type LabelKind } from '../data/places';
import { cellAt } from '../sim/coords';
import type { SimParams } from '../sim/simulate';
import { VEX, wx, wz } from './coords';

/** ป้ายชื่อ HTML ที่ฉายตำแหน่งจากโลก 3 มิติ */
export function createLabels(container: HTMLElement) {
  const els = LABELS.map(([n, la, lo, cls]) => {
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
      const c = cellAt(L.la, L.lo);
      v.set(wx(L.lo), Math.max(hEff[c] + cur[c], 0.5) * VEX + 0.6, wz(L.la)).project(camera);
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
