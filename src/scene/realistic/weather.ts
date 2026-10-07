/** ฝนแบบเส้นรอบ ๆ จุดที่กล้องมอง (ปริมาณตามความแรงฝน) และค่าความเปียกของพื้น */
import * as THREE from 'three';
import { shared } from './materials';
import { perf } from '../perf';

const MAX = 9000,
  BOX = { w: 260, h: 140, d: 260 };

export function createWeather(root: THREE.Object3D) {
  const pos = new Float32Array(MAX * 6);
  const seed = new Float32Array(MAX * 3);
  let s = 99;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < MAX; i++) seed.set([rnd(), rnd(), rnd()], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  lines.frustumCulled = false;
  root.add(lines);
  let t = 0;

  function tick(dt: number, rain: number, center: THREE.Vector3): void {
    t += dt;
    const n = Math.floor((rain / 150) * MAX * perf.particles);
    geo.setDrawRange(0, n * 2);
    lines.visible = n > 0;
    // ความเปียกค่อย ๆ เปลี่ยน
    const wetTarget = Math.min(1, rain / 60);
    shared.uWet.value += (wetTarget - shared.uWet.value) * Math.min(1, dt * 0.5);
    shared.uTime.value += dt;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const x = center.x + (seed[i * 3] - 0.5) * BOX.w,
        z = center.z + (seed[i * 3 + 2] - 0.5) * BOX.d;
      const y = center.y + BOX.h * (1 - ((seed[i * 3 + 1] + t * (0.9 + seed[i * 3] * 0.3)) % 1));
      pos.set([x, y, z, x + 0.3, y - 2.2, z + 0.15], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { tick, lines };
}
