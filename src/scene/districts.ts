/** เส้นเขต กทม. (เส้นประม่วง) จาก bangkok-districts.json — ใช้ทั้งโหมดภาพรวมและพื้นที่ศึกษา */
import * as THREE from 'three';
import type { LabelKind } from '../data/places';
import type { DistrictOutlines } from '../data/studyArea';
import type { Frame } from './frame';

export function createDistrictLines(
  parent: THREE.Object3D,
  f: Frame,
  districts: DistrictOutlines,
  /** ความสูงของเส้นที่จุด lat/lon (หน่วยโลก) */
  y: (lat: number, lon: number) => number,
  dash: { size: number; gap: number },
) {
  const group = new THREE.Group();
  parent.add(group);
  const names = new Set<string>();
  const ll: number[] = [];
  for (const d of districts.districts)
    for (const r of d.rings)
      for (let k = 0; k < r.length; k++) {
        const [la0, lo0] = r[k],
          [la1, lo1] = r[(k + 1) % r.length];
        if (!f.inBounds(la0, lo0) || !f.inBounds(la1, lo1)) continue;
        names.add(d.name);
        ll.push(la0, lo0, la1, lo1);
      }
  const pos = new Float32Array((ll.length / 2) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(
    geo,
    new THREE.LineDashedMaterial({
      color: 0x6d28d9,
      dashSize: dash.size,
      gapSize: dash.gap,
      transparent: true,
      opacity: 0.8,
    }),
  );
  group.add(line);

  /** คำนวณความสูงของเส้นใหม่ (เช่น เมื่อพื้นทรุด) */
  function setY(yFn: (lat: number, lon: number) => number): void {
    for (let k = 0, p = 0; k < ll.length; k += 2, p += 3) {
      const la = ll[k],
        lo = ll[k + 1];
      pos[p] = f.wx(lo);
      pos[p + 1] = yFn(la, lo);
      pos[p + 2] = f.wz(la);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
    line.computeLineDistances();
  }
  setY(y);

  /** ป้ายชื่อเขต (ไม่มีคำว่า "เขต") ที่ centroid ของ ring ใหญ่สุด — เฉพาะเขตที่มีเส้นในกรอบและไม่ซ้ำกับ `exclude` */
  const labels = (exclude: ReadonlySet<string> = new Set()) =>
    districts.districts.flatMap((d) => {
      const n = d.name.replace(/^เขต/, '');
      if (!names.has(d.name) || exclude.has(n)) return [];
      let best: [number, number, number] = [0, 0, 0];
      for (const r of d.rings) {
        const c = ringCentroid(r);
        if (Math.abs(c[2]) > Math.abs(best[2])) best = c;
      }
      if (!f.inBounds(best[0], best[1])) return [];
      return [[n, best[0], best[1], 'dist'] as const satisfies readonly [string, number, number, LabelKind]];
    });

  return { group, names, setY, labels };
}

/** centroid ของ polygon [lat, lon][] → [lat, lon, พื้นที่แบบมีเครื่องหมาย] */
function ringCentroid(r: [number, number][]): [number, number, number] {
  let a = 0,
    cy = 0,
    cx = 0;
  for (let k = 0; k < r.length; k++) {
    const [y0, x0] = r[k],
      [y1, x1] = r[(k + 1) % r.length];
    const t = x0 * y1 - x1 * y0;
    a += t;
    cx += (x0 + x1) * t;
    cy += (y0 + y1) * t;
  }
  return a ? [cy / (3 * a), cx / (3 * a), a / 2] : [r[0][0], r[0][1], 0];
}
