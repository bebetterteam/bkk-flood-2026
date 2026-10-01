/** tooltip เมื่อชี้เมาส์บนแผนที่: เขต ความสูงพื้น ความลึกน้ำ และสาเหตุ */
import * as THREE from 'three';
import { DISTRICTS } from '../data/places';
import { cellAt } from '../sim/coords';
import type { Grid } from '../sim/grid';
import { wallTop, type SimParams, type SimResult } from '../sim/simulate';
import { VEX, inBounds, latOfZ, lonOfX } from '../scene/coords';
import { CAUSES, TIP } from './strings';

function nearestDistrict(lat: number, lon: number): string {
  let b = '',
    bd = 1e9;
  for (const [n, la, lo] of DISTRICTS) {
    const d = Math.hypot(la - lat, lo - lon);
    if (d < bd) {
      bd = d;
      b = n;
    }
  }
  return b;
}

export function createTooltip(tip: HTMLElement, canvas: HTMLElement, camera: THREE.Camera, grid: Grid) {
  const ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  let hoverEv: PointerEvent | null = null;
  canvas.addEventListener('pointermove', (e) => {
    hoverEv = e;
  });
  canvas.addEventListener('pointerleave', () => {
    hoverEv = null;
    tip.style.display = 'none';
  });

  function update(sim: SimResult, cur: Float32Array, P: SimParams): void {
    if (!hoverEv) return;
    const e = hoverEv;
    const { hEff, tExt, tRain, src } = sim;
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    // หาจุดตัดกับพื้นแบบวนซ้ำ 3 รอบ (ระนาบแนวนอนที่ความสูงพื้น)
    let y = 1 * VEX;
    const pt = new THREE.Vector3();
    for (let it = 0; it < 3; it++) {
      const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
      if (!ray.ray.intersectPlane(pl, pt)) {
        tip.style.display = 'none';
        return;
      }
      const lon = lonOfX(pt.x),
        lat = latOfZ(pt.z);
      if (!inBounds(lat, lon)) {
        tip.style.display = 'none';
        return;
      }
      y = Math.max(hEff[cellAt(lat, lon)], 0) * VEX;
    }
    const lon = lonOfX(pt.x),
      lat = latOfZ(pt.z),
      c = cellAt(lat, lon);
    let html: string;
    if (grid.kind[c] === 1)
      html = `<b>${TIP.river}</b><br>${TIP.riverLevel} ${(hEff[c] + cur[c]).toFixed(2)} ม.รทก.`;
    else if (grid.kind[c] === 2) html = `<b>${TIP.sea}</b><br>${TIP.seaLevel} ${P.tide.toFixed(2)} ม.รทก.`;
    else {
      const d = cur[c];
      const cs = tExt[c] > 0 ? CAUSES[src[c]][0] : tRain[c] > 0.02 ? CAUSES[0][0] : '';
      html = `<b>${nearestDistrict(lat, lon)}</b> <span style="color:var(--muted)">${TIP.approx}</span><br>${TIP.ground} ${hEff[c].toFixed(2)} ม.รทก.<br>${TIP.flood} ${d > 0.02 ? Math.round(d * 100) + TIP.cm : '–'}${cs && d > 0.02 ? ' · ' + cs : ''}`;
      if (grid.wallType[c])
        html += `<br>${TIP.walls[grid.wallType[c]]} ${TIP.height} ${wallTop(grid, P, c).toFixed(2)} ม.`;
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 220) + 'px';
    tip.style.top = e.clientY + 14 + 'px';
  }
  return { update };
}
