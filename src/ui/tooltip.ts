/**
 * ข้อมูลจุดบนแผนที่: เขต ความสูงพื้น ความลึกน้ำ และสาเหตุ
 * เมาส์ (hover) = ตามตำแหน่งเมาส์; จอสัมผัส (hover: none) = แตะ 1 ครั้งแล้วค้างไว้ แตะที่อื่น/ลาก/Esc เพื่อปิด
 */
import * as THREE from 'three';
import { nearestDistrict } from '../data/places';
import { groundPoint } from '../scene/pick';
import type { Grid } from '../sim/grid';
import { wallTop, type SimParams, type SimResult } from '../sim/simulate';
import type { Frame } from '../scene/frame';
import { CAUSES, TIP } from './strings';

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

/** จุดบนจอที่ต้องการดูข้อมูล (PointerEvent หรือจุดที่แตะ) */
interface At {
  clientX: number;
  clientY: number;
}

export function createTooltip(
  tip: HTMLElement,
  canvas: HTMLElement,
  camera: THREE.Camera,
  /** ขอบล่างของแผนที่ที่มองเห็น (เหนือ bottom sheet) */
  mapBottom: () => number = () => innerHeight,
) {
  const ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  let hoverEv: At | null = null;
  let lastEv: At | null = null,
    lastAt = 0;
  /** แตะค้างไว้ (จอสัมผัส): ไม่หายเมื่อไม่มี pointermove */
  let tapped = false;
  const hide = () => {
    hoverEv = null;
    tapped = false;
    tip.style.display = 'none';
  };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || tapped) return;
    hoverEv = e;
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch' && !tapped) hide();
  });
  // ลาก/หมุนแผนที่ = ปิดข้อมูลที่แตะไว้
  canvas.addEventListener('pointerdown', () => tapped && hide());
  window.addEventListener('keydown', (e) => e.key === 'Escape' && tapped && hide());

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
      if (!groundPoint(ray.ray, f, hEff, pt)) {
        tip.style.display = 'none';
        return;
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
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.style.display = 'block';
    // อยู่ในจอและเหนือ sheet: ล้นขวา → ไปซ้ายของจุด, ล้นล่าง → ไปเหนือจุด
    const w = tip.offsetWidth,
      h = tip.offsetHeight,
      pad = 8;
    let x = e.clientX + 14,
      y = e.clientY + 14;
    if (x + w > innerWidth - pad) x = Math.max(pad, e.clientX - 14 - w);
    if (y + h > mapBottom() - pad) y = Math.max(pad, e.clientY - 14 - h);
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  return {
    update,
    /** แตะ 1 ครั้งบนจอสัมผัส: แสดงข้อมูลจุดนั้นค้างไว้ */
    tap(x: number, y: number): void {
      hoverEv = { clientX: x, clientY: y };
      lastEv = null;
      lastAt = 0;
      tapped = true;
    },
    hide,
  };
}
