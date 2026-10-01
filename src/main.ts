/** ประกอบทุกส่วน: กริด → การจำลอง → ฉาก 3 มิติ → UI */
import './style.css';
import * as THREE from 'three';
import { buildGrid } from './sim/grid';
import { mulberry } from './sim/math';
import { DEFAULT_PARAMS } from './sim/presets';
import { simulate, type SimParams, type SimResult } from './sim/simulate';
import { addBaseBlock, createStage } from './scene/stage';
import { createTerrain, type ViewMode } from './scene/terrain';
import { createWater } from './scene/water';
import { createWalls } from './scene/walls';
import { createCanals } from './scene/canals';
import { createBuildings } from './scene/buildings';
import { createInfra } from './scene/infra';
import { createRain, createRiverFlow } from './scene/particles';
import { createLabels } from './scene/labels';
import { createCameraTween } from './scene/cameraViews';
import { $ } from './ui/dom';
import { bindPanel, renderPanel } from './ui/panel';
import { renderResults } from './ui/results';
import { renderLegend } from './ui/legend';
import { createTooltip } from './ui/tooltip';
import { createTopbar } from './ui/topbar';

const grid = buildGrid();
const P: SimParams = { ...DEFAULT_PARAMS };
let sim: SimResult = simulate(grid, P);
let viewMode: ViewMode = 'real';
let showLabels = true;

// ---- ฉาก (ลำดับการสร้างเหมือนต้นแบบ: มีผลกับลำดับการวาดและลำดับเลขสุ่ม) ----
const { renderer, scene, camera, controls } = createStage($('stage'));
const terrain = createTerrain(scene, grid);
const water = createWater(scene, grid);
addBaseBlock(scene);
const walls = createWalls(scene, grid);
const canals = createCanals(scene);
const rnd = mulberry(42);
const buildings = createBuildings(scene, grid, rnd);
const infra = createInfra(scene);
const rain = createRain(scene, rnd);
const riverFlow = createRiverFlow(scene, rnd);
const labels = createLabels($('labels'));
const camTween = createCameraTween(camera, controls);

function updateTerrain(): void {
  terrain.update(sim.hEff, viewMode);
  walls.update(sim.hEff, P);
  canals.update(sim.hEff);
}

// ---- UI ----
renderPanel($('panel'));
const panel = bindPanel(P, { onChange: (reset) => run(reset) });
const topbar = createTopbar($('topbar'), $('clock'), {
  onView: (v) => {
    viewMode = v;
    updateTerrain();
    renderLegend(viewMode);
  },
  onLabels: (s) => {
    showLabels = s;
  },
  onCam: (v) => camTween.goTo(v),
  onReplay: () => water.reset(),
});
const tooltip = createTooltip($('tip'), renderer.domElement, camera, grid);

let lastSubs = -1;
function run(reset: boolean): void {
  sim = simulate(grid, P);
  if (P.subs !== lastSubs) {
    updateTerrain();
    buildings.update(sim.hEff);
    lastSubs = P.subs;
  } else walls.update(sim.hEff, P);
  infra.update(sim.hEff, P);
  if (reset) water.reset();
  renderResults(sim, P);
}

// ---- loop ----
const clock = new THREE.Clock();
function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  camTween.tick(dt);
  controls.update();
  topbar.setMoving(water.update(dt, sim));
  rain.tick(dt, P);
  riverFlow.tick(dt, P);
  labels.update(camera, showLabels, sim.hEff, water.cur, P);
  tooltip.update(sim, water.cur, P);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderLegend(viewMode);
run(true);
panel.markFirstPreset();

// hook สำหรับตรวจสอบ/ทดสอบในเบราว์เซอร์ (เหมือนต้นแบบ)
declare global {
  interface Window {
    __ready?: boolean;
    __P?: SimParams;
    __SIM?: () => Omit<SimResult, 'hEff' | 'reach' | 'arrival' | 'src' | 'tExt' | 'tRain'>;
    __run?: (reset: boolean) => void;
  }
}
window.__ready = true;
window.__P = P;
window.__SIM = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hEff, reach, arrival, src, tExt, tRain, ...rest } = sim;
  return rest;
};
window.__run = run;
tick();
