/** ประกอบทุกส่วน: กริด → การจำลอง (Web Worker) → ฉาก 3 มิติ → UI  มี 2 โหมด: ภาพรวมทั้งเมือง / พื้นที่ศึกษา */
import './style.css';
import * as THREE from 'three';
import { buildGrid } from './sim/grid';
import { mulberry } from './sim/math';
import { DEFAULT_PARAMS } from './sim/presets';
import type { SimParams, SimResult } from './sim/simulate';
import { createSimClient } from './sim/client';
import { loadStudyData, STUDY_CONFIG } from './data/studyArea';
import { addBaseBlock, createStage } from './scene/stage';
import { createTerrain, type ViewMode } from './scene/terrain';
import { createWater } from './scene/water';
import { createWalls } from './scene/walls';
import { createCanals } from './scene/canals';
import { createBuildings } from './scene/buildings';
import { createInfra } from './scene/infra';
import { createRain, createRiverFlow } from './scene/particles';
import { createLabels } from './scene/labels';
import { CAMS, createCameraTween, type CamView } from './scene/cameraViews';
import { overviewFrame } from './scene/frame';
import { createStudyScene, type StudyScene } from './scene/study/studyScene';
import type { Quality, RealisticScene } from './scene/realistic/realisticScene';
import type { StudyData } from './data/studyArea';
import { $ } from './ui/dom';
import { bindPanel, renderPanel } from './ui/panel';
import { renderResults } from './ui/results';
import { renderLegend } from './ui/legend';
import { createTooltip, type TooltipContext } from './ui/tooltip';
import { createTopbar, type AppMode } from './ui/topbar';
import { enableSpacePan } from './ui/spacePan';
import { createLocate, type PickedLocation } from './ui/locate';
import { createPlaceCard } from './ui/placeCard';
import { createMarker } from './scene/marker';
import { groundPoint } from './scene/pick';
import { cellOf, readCell } from './sim/probe';
import { PLACE } from './ui/strings';
import { STUDY } from './ui/strings';

const grid = buildGrid();
const P: SimParams = { ...DEFAULT_PARAMS };
let mode: AppMode = 'overview';
let sim: SimResult | null = null;
let viewMode: ViewMode = 'real';
let showLabels = true;
const client = createSimClient();

// ---- ฉากภาพรวม (ลำดับการสร้างเหมือนต้นแบบ: มีผลกับลำดับการวาดและลำดับเลขสุ่ม) ----
const stage = createStage($('stage'));
const { renderer, scene, camera, controls } = stage;
const ov = new THREE.Group();
scene.add(ov);
const terrain = createTerrain(ov, grid);
const water = createWater(ov, grid);
addBaseBlock(ov);
const walls = createWalls(ov, grid);
const canals = createCanals(ov);
const rnd = mulberry(42);
const buildings = createBuildings(ov, grid, rnd);
const infra = createInfra(ov);
const rain = createRain(ov, rnd);
const riverFlow = createRiverFlow(ov, rnd);
const ovLabelBox = document.createElement('div'),
  studyLabelBox = document.createElement('div');
$('labels').append(ovLabelBox, studyLabelBox);
const labels = createLabels(ovLabelBox);
const camTween = createCameraTween(camera, controls);
enableSpacePan(controls, renderer.domElement);

// ---- ฉากพื้นที่ศึกษา (โหลดเมื่อกดครั้งแรก) ----
let study: StudyScene | null = null;
let studyData: StudyData | null = null;
let studyLoading: Promise<StudyScene> | null = null;
// ---- โหมดสมจริง (โหลดเมื่อเลือกครั้งแรก; โค้ดแยก chunk) ----
let realistic: RealisticScene | null = null;
let realLoading: Promise<RealisticScene> | null = null;
let quality: Quality = 'simple';
const EXAG = STUDY_CONFIG.view.terrainExaggeration;
const calibrated = STUDY_CONFIG.verticalOffset.status === 'calibrated';

async function ensureStudy(): Promise<StudyScene> {
  if (study) return study;
  studyLoading ??= (async () => {
    const t0 = performance.now();
    topbar.setText(STUDY.loading);
    const data = await loadStudyData();
    studyData = data;
    const g = await client.initStudy(data.inputs);
    topbar.setText(STUDY.building);
    await new Promise((r) => setTimeout(r, 0)); // ให้ข้อความแสดงก่อนงานหนัก
    const s = createStudyScene(scene, studyLabelBox, g, data, EXAG);
    const bm = data.buildings.meta;
    const defaultPct = Math.round((bm.heightSourceCount[2] / bm.count) * 100);
    $('study-note').innerHTML = STUDY.note(STUDY_CONFIG.verticalOffset.value, calibrated, defaultPct, EXAG);
    $('attrib').textContent = STUDY.attribution(g.meta.source.id);
    console.info(`[study] โหลดเสร็จใน ${(performance.now() - t0).toFixed(0)} ms`);
    return (study = s);
  })();
  return studyLoading;
}

async function ensureRealistic(): Promise<RealisticScene> {
  if (realistic) return realistic;
  realLoading ??= (async () => {
    const t0 = performance.now();
    topbar.setText(STUDY.loadingReal);
    const [{ createRealisticScene }, { loadRealisticData }] = await Promise.all([
      import('./scene/realistic/realisticScene'),
      import('./data/realisticData'),
    ]);
    const data = await loadRealisticData();
    topbar.setText(STUDY.buildingReal);
    await new Promise((r) => setTimeout(r, 0));
    const r = await createRealisticScene({
      scene,
      renderer,
      stageLights: stage.lights,
      study: study!,
      studyData: studyData!,
      data,
    });
    console.info(`[realistic] โหลดเสร็จใน ${(performance.now() - t0).toFixed(0)} ms`);
    return (realistic = r);
  })();
  return realLoading;
}

/** เปลี่ยนคุณภาพภาพ (มีผลเฉพาะโหมดพื้นที่ศึกษา) */
async function setQuality(q: Quality): Promise<void> {
  topbar.setQualityBusy(true);
  try {
    if (q !== 'simple') await ensureRealistic();
    quality = q;
    topbar.setQuality(q);
    applyQuality();
    if (sim) topbar.setMoving(true);
  } catch (e) {
    console.error(e);
    topbar.setText(STUDY.loadFailed((e as Error).message));
  } finally {
    topbar.setQualityBusy(false);
  }
}
function applyQuality(): void {
  const q = mode === 'study' ? quality : 'simple';
  realistic?.setQuality(q);
  realistic?.update();
  const real = q !== 'simple';
  if (study)
    $('attrib').textContent =
      STUDY.attribution(study.grid.meta.source.id) + (real ? STUDY.textureCredit : '');
  const note = $('study-note');
  if (study && studyData) {
    const bm = studyData.buildings.meta;
    const defaultPct = Math.round((bm.heightSourceCount[2] / bm.count) * 100);
    note.innerHTML =
      STUDY.note(STUDY_CONFIG.verticalOffset.value, calibrated, defaultPct, EXAG) +
      (real ? STUDY.realNote : '');
  }
}

function studyCam(view: string): [[number, number, number], [number, number, number]] {
  const f = study!.frame;
  const at = (
    lat: number,
    lon: number,
    dist: number,
    h: number,
  ): [[number, number, number], [number, number, number]] => [
    [f.wx(lon) - dist * 0.35, h, f.wz(lat) + dist],
    [f.wx(lon), 0, f.wz(lat)],
  ];
  if (view === 'rattana') return at(13.752, 100.494, 90, 70);
  if (view === 'yaowarat') return at(13.74, 100.512, 80, 60);
  if (view === 'klongtoei') return at(13.712, 100.56, 110, 80);
  const [W, D] = study!.size;
  return [
    [-W * 0.15, Math.max(W, D) * 0.55, D * 0.75],
    [0, 0, 0],
  ];
}

async function setMode(m: AppMode): Promise<void> {
  topbar.setModeBusy(true);
  try {
    if (m === 'study') await ensureStudy();
    mode = m;
    sim = null; // ผลของโหมดเดิมใช้กับกริดใหม่ไม่ได้ (ขนาดต่างกัน) — รอผลใหม่ก่อนวาดน้ำ
    const isStudy = m === 'study';
    applyQuality();
    ov.visible = !isStudy;
    if (study) study.group.visible = isStudy;
    ovLabelBox.style.display = isStudy ? 'none' : '';
    studyLabelBox.style.display = isStudy ? '' : 'none';
    $('study-note').style.display = isStudy ? '' : 'none';
    $('attrib').style.display = isStudy ? '' : 'none';
    camera.far = isStudy ? 6000 : 500;
    camera.near = isStudy ? 1 : 0.1; // ความแม่นยำของ depth (ถนนบนพื้น/ผิวน้ำ)
    camera.updateProjectionMatrix();
    controls.minDistance = isStudy ? 2 : 4;
    controls.maxDistance = isStudy ? 2500 : 130;
    stage.setFog(...((isStudy ? [1500, 3500] : [90, 190]) as [number, number]));
    if (isStudy) camTween.goToPose(...studyCam('all'), true);
    else camTween.goToPose(...CAMS.all, true);
    topbar.setMode(m);
    renderLegend(viewMode, isStudy);
    lastSubs = -1;
    await run(true);
  } catch (e) {
    console.error(e);
    topbar.setText(STUDY.loadFailed((e as Error).message));
  } finally {
    topbar.setModeBusy(false);
  }
}

function updateTerrain(): void {
  if (!sim) return;
  if (mode === 'study') {
    study!.updateTerrain(sim.hEff, viewMode, P);
    realistic?.update();
  } else {
    terrain.update(sim.hEff, viewMode);
    walls.update(sim.hEff, P);
    canals.update(sim.hEff);
  }
}

// ---- UI ----
renderPanel($('panel'));
const panel = bindPanel(P, { onChange: (reset) => void run(reset) });
const topbar = createTopbar($('topbar'), $('clock'), {
  onView: (v) => {
    viewMode = v;
    updateTerrain();
    renderLegend(viewMode, mode === 'study');
  },
  onLabels: (s) => {
    showLabels = s;
  },
  onCam: (v) => (mode === 'study' ? camTween.goToPose(...studyCam(v)) : camTween.goTo(v as CamView)),
  onReplay: () => activeWater().reset(),
  onMode: (m) => void setMode(m),
  onQuality: (q) => void setQuality(q as Quality),
});
const tooltip = createTooltip($('tip'), renderer.domElement, camera);
// ความสูงจริงของแถบปุ่มด้านบน (บนจอแคบปุ่มขึ้นหลายแถว) — ใช้จำกัดความสูงการ์ดตำแหน่งไม่ให้ทับ
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    '--topbar-bottom',
    `${$('topbar').getBoundingClientRect().bottom}px`,
  ),
).observe($('topbar'));

// ---- ตำแหน่งของผู้ใช้ / หมุด (MVP 4) — ตำแหน่งอยู่ในหน่วยความจำของหน้านี้เท่านั้น ----
const marker = createMarker(scene, $('labels'));
let place: PickedLocation | null = null;
const locMsg = $('locmsg');
const showMsg = (m: string | null) => {
  locMsg.hidden = !m;
  locMsg.textContent = m ?? '';
};
const activeFrame = () => (mode === 'study' ? study!.frame : overviewFrame);
const activeGrid = () => (mode === 'study' ? study!.grid : grid);
const inStudyBbox = (lat: number, lon: number) => {
  const b = STUDY_CONFIG.bbox;
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
};
function flyTo(lat: number, lon: number): void {
  if (mode === 'study') {
    const f = study!.frame;
    camTween.goToPose([f.wx(lon) - 21, 45, f.wz(lat) + 60], [f.wx(lon), 0, f.wz(lat)]);
  } else {
    const f = overviewFrame;
    camTween.goToPose([f.wx(lon) - 2.5, 7, f.wz(lat) + 6.5], [f.wx(lon), 0, f.wz(lat)]);
  }
}
function updatePlaceNow(): void {
  if (!place || !sim) return;
  const g = activeGrid();
  const c = cellOf(g, place.lat, place.lon);
  card.setNow(c >= 0 && !g.kind[c] ? readCell(g, sim, c) : null);
}
const card = createPlaceCard($('place'), {
  onGoTo: () => place && flyTo(place.lat, place.lon),
  onClear: () => {
    place = null;
    marker.set(null);
    card.setLocation(null);
  },
});
async function goToLocation(p: PickedLocation): Promise<void> {
  if (cellOf(grid, p.lat, p.lon) < 0) {
    locate.setPicking(true); // เปิดโหมดปักหมุดให้เลย (ข้อความนอกพื้นที่แทนคำแนะนำปักหมุด)
    showMsg(PLACE.outside);
    return;
  }
  place = p;
  marker.set({ ...p, label: p.source === 'gps' ? PLACE.markerGps : PLACE.markerPin });
  card.setLocation(p);
  const wantStudy = inStudyBbox(p.lat, p.lon);
  if (wantStudy && mode !== 'study') await setMode('study');
  else if (!wantStudy && mode === 'study') await setMode('overview');
  flyTo(p.lat, p.lon);
  updatePlaceNow();
  const res = await client.probe(p.lat, p.lon);
  if (place === p) card.setProbe(res);
}
const locate = createLocate($('topbar'), {
  canvas: renderer.domElement,
  pickAt: (x, y) => {
    if (!sim) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    const hit = groundPoint(ray.ray, activeFrame(), sim.hEff);
    return hit && { lat: hit.lat, lon: hit.lon };
  },
  onLocation: (p) => void goToLocation(p),
  onMessage: showMsg,
});
const activeWater = () => (mode === 'study' ? study!.water : water);

let lastSubs = -1;
async function run(reset: boolean): Promise<void> {
  const m = mode;
  const res = await client.run(m, P);
  if (!res || m !== mode) return; // มีคำขอใหม่กว่าแล้ว หรือสลับโหมดระหว่างรอ
  sim = res;
  if (mode === 'study') {
    if (P.subs !== lastSubs) {
      updateTerrain();
      lastSubs = P.subs;
    } else study!.updateWalls(sim.hEff, P);
  } else {
    if (P.subs !== lastSubs) {
      updateTerrain();
      buildings.update(sim.hEff);
      lastSubs = P.subs;
    } else walls.update(sim.hEff, P);
    infra.update(sim.hEff, P);
  }
  if (reset) activeWater().reset();
  renderResults(sim, P);
  updatePlaceNow();
}

function tooltipContext(s: SimResult): TooltipContext {
  if (mode === 'overview') return { grid, frame: overviewFrame, sim: s, cur: water.cur, P };
  const st = study!;
  return {
    grid: st.grid,
    frame: st.frame,
    sim: s,
    cur: st.water.cur,
    P,
    extra: (c) => STUDY.tipDem(calibrated) + (st.grid.canal[c] ? STUDY.tipCanal : ''),
    pick: (ray) => {
      const hit = st.pickBuilding(ray);
      if (!hit) return null;
      const b = st.buildings;
      const type = study!.buildingTypeName(b.type[hit.b]);
      return {
        html: STUDY.tipBuilding(
          STUDY.buildingTypes[type] ?? type,
          b.heightDm[hit.b] / 10,
          STUDY.heightSources[b.src[hit.b]],
        ),
        point: hit.point,
      };
    },
  };
}

// ---- loop ----
const clock = new THREE.Clock();
function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  camTween.tick(dt);
  controls.update();
  if (sim) {
    topbar.setMoving(activeWater().update(dt, sim));
    if (mode === 'study') {
      study!.tick(dt, P);
      realistic?.tick(dt, P, camera, controls.target);
      study!.labels.update(camera, showLabels, sim.hEff, study!.water.cur, P);
    } else {
      rain.tick(dt, P);
      riverFlow.tick(dt, P);
      labels.update(camera, showLabels, sim.hEff, water.cur, P);
    }
    tooltip.update(tooltipContext(sim));
    marker.update(dt, activeFrame(), sim.hEff, activeWater().cur, camera);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderLegend(viewMode);
studyLabelBox.style.display = 'none';
void run(true);
panel.markFirstPreset();

// hook สำหรับตรวจสอบ/ทดสอบในเบราว์เซอร์ (เหมือนต้นแบบ) + สลับโหมด
type SimSummary = Omit<SimResult, 'hEff' | 'reach' | 'arrival' | 'src' | 'tExt' | 'tRain'>;
declare global {
  interface Window {
    __ready?: boolean;
    __P?: SimParams;
    __SIM?: () => SimSummary | null;
    __run?: (reset: boolean) => Promise<void>;
    __mode?: (m: AppMode) => Promise<void>;
    /** โหมดพื้นที่ศึกษา: วางกล้องที่ lat/lon ระยะ dist และสูง h (หน่วยโลก = 10 ม.) */
    __cam?: (lat: number, lon: number, dist: number, h: number) => void;
    __quality?: (q: Quality) => Promise<void>;
  }
}
window.__ready = true;
window.__P = P;
window.__SIM = () => {
  if (!sim) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hEff, reach, arrival, src, tExt, tRain, ...rest } = sim;
  return rest;
};
window.__run = run;
window.__mode = setMode;
window.__quality = setQuality;
// dev เท่านั้น: เข้าถึง three.js สำหรับดีบัก (ไม่อยู่ใน build จริง)
if (import.meta.env.DEV)
  (window as unknown as Record<string, unknown>).__three = { renderer, scene, camera, controls };
window.__cam = (lat, lon, dist, h) => {
  if (!study) return;
  const f = study.frame;
  camTween.goToPose([f.wx(lon) - dist * 0.35, h, f.wz(lat) + dist], [f.wx(lon), 0, f.wz(lat)], true);
};
tick();
