/** tooltip เมื่อชี้เมาส์บนแผนที่: เขต ความสูงพื้น ความลึกน้ำ และสาเหตุ */
import * as THREE from 'three';
import { DISTRICTS } from '../data/places';
import type { Grid } from '../sim/grid';
import { wallTop, type SimParams, type SimResult } from '../sim/simulate';
import type { Frame } from '../scene/frame';
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

export interface TooltipContext {
  grid: Grid;
  frame: Frame;
  sim: SimResult;
  cur: Float32Array;
  P: SimParams;
  /** บรรทัดเพิ่มเติมของพื้นดินช่อง c (เช่น ความสูงจาก DEM) */
  extra?: (c: number) => string;
  /** ชี้โดนวัตถุ (เช่นตึก) หรือไม่ — คืน html และจุดที่ชน */
  pick?: (ray: THREE.Raycaster) => { html: string; point: THREE.Vector3 } | null;
}

export function createTooltip(tip: HTMLElement, canvas: HTMLElement, camera: THREE.Camera) {
  const ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  let hoverEv: PointerEvent | null = null;
  let lastEv: PointerEvent | null = null,
    lastAt = 0;
  canvas.addEventListener('pointermove', (e) => {
    hoverEv = e;
  });
  canvas.addEventListener('pointerleave', () => {
    hoverEv = null;
    tip.style.display = 'none';
  });

  function update(ctx: TooltipContext): void {
    if (!hoverEv) return;
    const e = hoverEv;
    const { grid, frame: f, sim, cur, P } = ctx;
    const { hEff, tExt, tRain, src } = sim;
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    // raycast กับตึก (หนัก) ทำเมื่อเมาส์ขยับและไม่บ่อยกว่า 10 ครั้ง/วินาที
    let picked: { html: string; point: THREE.Vector3 } | null = null;
    if (ctx.pick) {
      const now = performance.now();
      if (e === lastEv || now - lastAt < 100) return;
      lastEv = e;
      lastAt = now;
      picked = ctx.pick(ray);
    }
    const pt = new THREE.Vector3();
    if (picked) pt.copy(picked.point);
    else {
      // หาจุดตัดกับพื้นแบบวนซ้ำ 3 รอบ (ระนาบแนวนอนที่ความสูงพื้น)
      let y = 1 * f.vex;
      for (let it = 0; it < 3; it++) {
        const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
        if (!ray.ray.intersectPlane(pl, pt)) {
          tip.style.display = 'none';
          return;
        }
        const lon = f.lonOfX(pt.x),
          lat = f.latOfZ(pt.z);
        if (!f.inBounds(lat, lon)) {
          tip.style.display = 'none';
          return;
        }
        y = Math.max(hEff[f.cellAt(lat, lon)], 0) * f.vex;
      }
    }
    const lon = f.lonOfX(pt.x),
      lat = f.latOfZ(pt.z),
      c = f.cellAt(lat, lon);
    let html: string;
    if (grid.kind[c] === 1)
      html = `<b>${TIP.river}</b><br>${TIP.riverLevel} ${(hEff[c] + cur[c]).toFixed(2)} ม.รทก.`;
    else if (grid.kind[c] === 2) html = `<b>${TIP.sea}</b><br>${TIP.seaLevel} ${P.tide.toFixed(2)} ม.รทก.`;
    else {
      const d = cur[c];
      const cs = tExt[c] > 0 ? CAUSES[src[c]][0] : tRain[c] > 0.02 ? CAUSES[0][0] : '';
      html = `<b>${nearestDistrict(lat, lon)}</b> <span style="color:var(--muted)">${TIP.approx}</span><br>${TIP.ground} ${hEff[c].toFixed(2)} ม.รทก.${ctx.extra ? ctx.extra(c) : ''}<br>${TIP.flood} ${d > 0.02 ? Math.round(d * 100) + TIP.cm : '–'}${cs && d > 0.02 ? ' · ' + cs : ''}`;
      if (grid.wallType[c])
        html += `<br>${TIP.walls[grid.wallType[c]]} ${TIP.height} ${wallTop(grid, P, c).toFixed(2)} ม.`;
    }
    if (picked)
      html = picked.html + '<hr style="border:0;border-top:1px solid var(--line);margin:5px 0">' + html;
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 220) + 'px';
    tip.style.top = e.clientY + 14 + 'px';
  }
  return { update };
}
