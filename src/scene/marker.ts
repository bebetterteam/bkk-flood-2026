/** หมุดตำแหน่ง (ก้าน + หัว) ยืนบนผิวน้ำ/พื้น + วงความแม่นยำ GPS + ป้ายชื่อ — มองเห็นได้เสมอ (ไม่ถูกตึกบัง) */
import * as THREE from 'three';
import type { Frame } from './frame';

export interface MarkerPlace {
  lat: number;
  lon: number;
  /** ความคลาดเคลื่อน GPS (ม.) — ไม่มีถ้าปักหมุดเอง */
  accuracy?: number;
  label: string;
}

const COLOR = 0xe4572e;

export function createMarker(scene: THREE.Scene, labelBox: HTMLElement) {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 20;
  scene.add(group);
  const mat = (opts: THREE.MeshBasicMaterialParameters) =>
    new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, ...opts });
  // หมุดสูง 1 หน่วย (ขยายตามระยะกล้อง): ปลายแหลมที่ y = 0
  const pin = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.75, 16).rotateX(Math.PI).translate(0, 0.375, 0),
    mat({ color: COLOR }),
  );
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 14).translate(0, 0.85, 0),
    mat({ color: COLOR }),
  );
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 8).translate(0, 0.85, 0),
    mat({ color: 0xffffff }),
  );
  pin.add(stem, head, dot);
  pin.children.forEach((m) => (m.renderOrder = 21));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2),
    mat({ color: COLOR, opacity: 0.85, side: THREE.DoubleSide }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
    mat({ color: COLOR, opacity: 0.12, side: THREE.DoubleSide }),
  );
  ring.renderOrder = disc.renderOrder = 20;
  group.add(disc, ring, pin);

  const label = document.createElement('div');
  label.className = 'lbl me';
  label.hidden = true;
  labelBox.appendChild(label);

  let place: MarkerPlace | null = null;
  const v = new THREE.Vector3();
  let t = 0;

  function set(p: MarkerPlace | null): void {
    place = p;
    group.visible = !!p;
    label.hidden = !p;
    if (p) label.textContent = p.label;
  }

  /** เรียกทุกเฟรม: วางบนผิวน้ำของโหมดปัจจุบัน ขนาดคงที่บนจอ */
  function update(dt: number, f: Frame, hEff: Float32Array, cur: Float32Array, camera: THREE.Camera): void {
    if (!place) return;
    t += dt;
    if (!f.inBounds(place.lat, place.lon)) {
      group.visible = false;
      label.hidden = true;
      return;
    }
    const c = f.cellAt(place.lat, place.lon);
    const x = f.wx(place.lon),
      z = f.wz(place.lat),
      y = Math.max(hEff[c] + cur[c], hEff[c]) * f.vex;
    group.visible = true;
    group.position.set(x, y, z);
    const size = camera.position.distanceTo(group.position) * 0.06;
    pin.scale.setScalar(size);
    pin.position.y = Math.abs(Math.sin(t * 3)) * size * 0.08;
    // วงความแม่นยำ: ม. → หน่วยโลก (ขนาดจริง) แต่ไม่เล็กกว่าหัวหมุด
    const mPerUnit =
      1 / Math.abs(f.wx(place.lon + 1 / (111_320 * Math.cos((place.lat * Math.PI) / 180))) - x);
    const r = Math.max(place.accuracy ? place.accuracy / mPerUnit : 0, size * 0.35);
    const pulse = place.accuracy ? 1 : 1 + 0.25 * ((t * 0.8) % 1);
    ring.scale.setScalar(r * pulse);
    disc.scale.setScalar(r);
    (ring.material as THREE.MeshBasicMaterial).opacity = place.accuracy ? 0.85 : 0.85 * (1 - ((t * 0.8) % 1));
    v.set(x, y + size * 1.15, z).project(camera);
    if (v.z > 1) label.hidden = true;
    else {
      label.hidden = false;
      label.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
      label.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
    }
  }

  return { set, update, get: () => place };
}
