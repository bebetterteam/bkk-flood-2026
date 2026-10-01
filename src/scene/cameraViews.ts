import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sstep } from '../sim/math';
import { wx, wz } from './coords';

export type CamView = 'all' | 'core' | 'mouth' | 'east';
/** [ตำแหน่งกล้อง, จุดมอง] ในพิกัดโลก */
export const CAMS: Record<CamView, [[number, number, number], [number, number, number]]> = {
  all: [
    [-6, 46, 48],
    [2, 0, 0],
  ],
  core: [
    [wx(100.47), 9, wz(13.68)],
    [wx(100.53), 0, wz(13.745)],
  ],
  mouth: [
    [wx(100.5), 12, wz(13.44)],
    [wx(100.58), 0, wz(13.55)],
  ],
  east: [
    [wx(100.6), 16, wz(13.62)],
    [wx(100.76), 0, wz(13.78)],
  ],
};

/** เลื่อนกล้องแบบนุ่มนวลไปยังมุมมองที่กำหนด */
export function createCameraTween(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  let tween: {
    t: number;
    p0: THREE.Vector3;
    t0: THREE.Vector3;
    p1: THREE.Vector3;
    t1: THREE.Vector3;
  } | null = null;
  function goTo(view: CamView): void {
    const [p, t] = CAMS[view];
    goToPose(p, t);
  }
  function goToPose(p: [number, number, number], t: [number, number, number], jump = false): void {
    if (jump) {
      camera.position.set(...p);
      controls.target.set(...t);
      tween = null;
      return;
    }
    tween = {
      t: 0,
      p0: camera.position.clone(),
      t0: controls.target.clone(),
      p1: new THREE.Vector3(...p),
      t1: new THREE.Vector3(...t),
    };
  }
  function tick(dt: number): void {
    if (!tween) return;
    tween.t = Math.min(1, tween.t + dt * 1.2);
    const e = sstep(tween.t);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  return { goTo, goToPose, tick };
}
