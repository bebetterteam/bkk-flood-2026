import * as THREE from 'three';
import { RIVER } from '../data/geo';
import { clamp } from '../sim/math';
import { riverLevel, type SimParams } from '../sim/simulate';
import { VEX, wx, wz } from './coords';

const RMAX = 9000;

/** เม็ดฝน: จำนวนที่แสดงแปรตามความแรงฝน */
export function createRain(scene: THREE.Scene, rnd: () => number) {
  const geo = new THREE.BufferGeometry();
  const rp = new Float32Array(RMAX * 3);
  for (let k = 0; k < RMAX; k++) {
    rp[k * 3] = (rnd() - 0.5) * 60;
    rp[k * 3 + 1] = rnd() * 20;
    rp[k * 3 + 2] = (rnd() - 0.5) * 50;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  scene.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x7fb2e5, size: 0.09, transparent: true, opacity: 0.75 }),
    ),
  );

  function tick(dt: number, P: SimParams): void {
    const rc = Math.floor((P.rain / 150) * RMAX);
    geo.setDrawRange(0, rc);
    if (rc) {
      const a = geo.attributes.position.array as Float32Array;
      for (let k = 0; k < rc; k++) {
        a[k * 3 + 1] -= dt * (14 + (k % 7));
        if (a[k * 3 + 1] < 0) a[k * 3 + 1] += 20;
      }
      geo.attributes.position.needsUpdate = true;
    }
  }
  return { tick };
}

const FMAX = 700;

/** อนุภาคแสดงการไหลของเจ้าพระยา (เร็วขึ้นตามน้ำเหนือ) */
export function createRiverFlow(scene: THREE.Scene, rnd: () => number) {
  const rWorld = RIVER.map(([la, lo]) => new THREE.Vector3(wx(lo), 0, wz(la)));
  const rLen = [0];
  for (let k = 1; k < rWorld.length; k++) rLen.push(rLen[k - 1] + rWorld[k].distanceTo(rWorld[k - 1]));
  const RTOT = rLen[rLen.length - 1];
  function riverPoint(u: number, out: THREE.Vector3): number {
    const d = u * RTOT;
    let k = 1;
    while (k < rLen.length - 1 && rLen[k] < d) k++;
    const t = (d - rLen[k - 1]) / (rLen[k] - rLen[k - 1]);
    out.lerpVectors(rWorld[k - 1], rWorld[k], clamp(t, 0, 1));
    return k;
  }
  const flowU = new Float32Array(FMAX),
    flowOff = new Float32Array(FMAX);
  for (let k = 0; k < FMAX; k++) {
    flowU[k] = rnd();
    flowOff[k] = (rnd() - 0.5) * 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FMAX * 3), 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.8 }),
  );
  pts.renderOrder = 3;
  scene.add(pts);
  const fv = new THREE.Vector3();

  function tick(dt: number, P: SimParams): void {
    const fa = geo.attributes.position.array as Float32Array,
      sp = (0.004 + (P.flow / 5000) * 0.03) * dt;
    for (let k = 0; k < FMAX; k++) {
      flowU[k] = (flowU[k] + sp) % 1;
      const seg = riverPoint(flowU[k], fv);
      const a = rWorld[seg - 1],
        b = rWorld[seg];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        L = Math.hypot(dx, dz) || 1;
      fa[k * 3] = fv.x - (dz / L) * flowOff[k];
      fa[k * 3 + 2] = fv.z + (dx / L) * flowOff[k];
      fa[k * 3 + 1] = riverLevel(P, 1 - flowU[k]) * VEX + 0.04;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { tick };
}
