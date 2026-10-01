import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LAT0, LAT1, LON0, LON1 } from '../sim/coords';
import { VEX, wx, wz } from './coords';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** ระยะหมอก (เปลี่ยนตามโหมด) */
  setFog(near: number, far: number): void;
}

export const isDark = (): boolean =>
  document.documentElement.dataset.theme === 'dark' ||
  (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let fogNear = 90,
    fogFar = 190;
  const applyBg = () => {
    const col = isDark() ? 0x0e161d : 0xdfe8ee;
    scene.background = new THREE.Color(col);
    scene.fog = new THREE.Fog(col, fogNear, fogFar);
  };
  applyBg();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBg);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(-6, 46, 48);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(2, 0, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.38;
  controls.minDistance = 4;
  controls.maxDistance = 130;

  scene.add(new THREE.HemisphereLight(0xeef6ff, 0x8a7d63, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-30, 60, 25);
  scene.add(sun);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const setFog = (near: number, far: number) => {
    fogNear = near;
    fogFar = far;
    applyBg();
  };
  return { renderer, scene, camera, controls, setFog };
}

/** ฐานดินใต้แผนที่ */
export function addBaseBlock(scene: THREE.Object3D): void {
  const w = wx(LON1) - wx(LON0),
    d = wz(LAT0) - wz(LAT1);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, 2, d),
    new THREE.MeshStandardMaterial({ color: 0x5b5246, roughness: 1 }),
  );
  base.position.set(0, -1.6 * VEX - 1.0, 0);
  scene.add(base);
}
