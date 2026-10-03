/** ประกอบทุกส่วน: กริด → การจำลอง (Web Worker) → ฉาก 3 มิติ → UI  มี 2 โหมด: ภาพรวมทั้งเมือง / พื้นที่ศึกษา */
import './style.css';
import * as THREE from 'three';
import { buildGrid } from './sim/grid';
import { mulberry } from './sim/math';
import { DEFAULT_PARAMS } from './sim/presets';
import type { SimParams, SimResult } from './sim/simulate';
import { createSimClient } from './sim/client';
import {
  loadDistricts,
  loadStudyData,
  loadTileIndex,
  STUDY_CONFIG,
  type DistrictOutlines,
  type TileIndex,
  type TileInfo,
} from './data/studyArea';
import { neighborTile, tileAt } from './sim/tiles';
import { createTileGrid } from './scene/tileGrid';
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
import { createTopbar, type AppMode, type TileDir } from './ui/topbar';
import { enableSpacePan } from './ui/spacePan';
import { createLocate, type PickedLocation } from './ui/locate';
import { createPlaceCard } from './ui/placeCard';
import { fetchForecast } from './data/forecast';
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

// ---- ฉากพื้นที่ศึกษา (โหลดทีละแผ่นเมื่อเลือก; สลับแผ่น = ทิ้งฉากเดิมแล้วสร้างใหม่) ----
let study: StudyScene | null = null;
let studyData: StudyData | null = null;
/** แผ่นของฉากที่โหลดอยู่ / แผ่นที่จะเปิดเมื่อกด "พื้นที่ศึกษา" */
let studyTile: string | null = null;
let wantTile = STUDY_CONFIG.defaultTile;
let tileIndex: TileIndex | null = null;
/** เพิ่มทุกครั้งที่ทิ้งฉากพื้นที่ศึกษา — ผลจำลองที่ขอไว้ก่อนสลับแผ่นจะถูกทิ้ง */
let studyGen = 0;
let districts: DistrictOutlines | null = null;
// ---- โหมดสมจริง (โหลดเมื่อเลือกครั้งแรก; โค้ดแยก chunk) ----
let realistic: RealisticScene | null = null;
let realLoading: Promise<RealisticScene> | null = null;
let quality: Quality = 'simple';
const EXAG = STUDY_CONFIG.view.terrainExaggeration;
const calibrated = STUDY_CONFIG.verticalOffset.status === 'calibrated';

const tileInfo = (id: string) => tileIndex?.tiles.find((t) => t.id === id);
const tileName = (id: string) => tileInfo(id)?.name ?? id;
/** แผ่นที่จุดนี้อยู่ (ตามตาราง) ถ้าแผ่นนั้นตัด กทม. */
const tileFor = (lat: number, lon: number): TileInfo | undefined => {
  const id = tileIndex && tileAt(tileIndex.tiling, lat, lon);
  return id ? tileInfo(id) : undefined;
};

/** ทิ้งฉากพื้นที่ศึกษา/สมจริงของแผ่นเดิม คืนหน่วยความจำ GPU */
function disposeStudy(): void {
  if (!study) return;
  studyGen++;
  if (mode === 'study') sim = null; // ผลเดิมใช้กับกริดใหม่ไม่ได้ และหยุดวาดระหว่างโหลด
  realistic?.dispose();
  realistic = null;
  realLoading = null;
  study?.dispose();
  study = null;
  studyData = null;
  studyTile = null;
}

async function ensureStudy(tile: string): Promise<StudyScene> {
  if (study && studyTile === tile) return study;
  const t0 = performance.now();
  disposeStudy();
  topbar.setText(STUDY.loadingTile(tileName(tile)));
  const data = await loadStudyData(tile);
  const g = await client.initStudy(data.inputs);
  topbar.setText(STUDY.building);
  await new Promise((r) => setTimeout(r, 0)); // ให้ข้อความแสดงก่อนงานหนัก
  const s = createStudyScene(scene, studyLabelBox, g, data, EXAG, districts);
  studyData = data;
  studyTile = tile;
  $('attrib').textContent = STUDY.attribution(g.meta.source.id);
  console.info(`[study] โหลดแผ่น ${tile} เสร็จใน ${(performance.now() - t0).toFixed(0)} ms`);
  return (study = s);
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
    const data = await loadRealisticData(studyTile!);
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
const setQuality = (q: Quality): Promise<void> => serial(() => doSetQuality(q));
async function doSetQuality(q: Quality): Promise<void> {
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
      STUDY.note(STUDY_CONFIG.verticalOffset.value, calibrated, defaultPct, EXAG, tileName(studyTile!)) +
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
  const hasViews = studyTile === STUDY_CONFIG.defaultTile;
  if (hasViews && view === 'rattana') return at(13.752, 100.494, 90, 70);
  if (hasViews && view === 'yaowarat') return at(13.74, 100.512, 80, 60);
  if (hasViews && view === 'klongtoei') return at(13.712, 100.56, 110, 80);
  const [W, D] = study!.size;
  return [
    [-W * 0.15, Math.max(W, D) * 0.55, D * 0.75],
    [0, 0, 0],
  ];
}

/** เรียงคำขอสลับโหมด/แผ่น/คุณภาพทีละคำขอ (กันโหลดสองแผ่นพร้อมกัน) */
let queue: Promise<void> = Promise.resolve();
const serial = (job: () => Promise<void>): Promise<void> => (queue = queue.then(job, job));

/** สลับโหมด; tile = แผ่นพื้นที่ศึกษาที่จะเปิด (ไม่ระบุ = แผ่นล่าสุด) */
const setMode = (m: AppMode, tile = wantTile): Promise<void> => serial(() => doSetMode(m, tile));
async function doSetMode(m: AppMode, tile: string): Promise<void> {
  topbar.setModeBusy(true);
  try {
    if (m === 'study') {
      const changed = studyTile !== tile;
      await ensureStudy(tile);
      wantTile = tile;
      if (changed && quality !== 'simple') await ensureRealistic();
      updateTileUi();
    }
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
    tileGrid?.setVisible(!isStudy);
    topbar.setMode(m, studyTile === STUDY_CONFIG.defaultTile ? STUDY.cams : STUDY.camsOther);
    renderLegend(viewMode, isStudy);
    // ครั้งแรกที่เปิดพื้นที่ศึกษา (ต่อการเปิดหน้า) ชวนดู "ที่นี่ท่วมไหม?" — ไม่ขอ GPS เองจนกว่าผู้ใช้จะกด
    if (isStudy && !place && !prompted) {
      prompted = true;
      card.showPrompt({
        onGps: () => locate.locate(),
        onPin: () => {
          card.hidePrompt();
          locate.setPicking(true);
        },
        onLater: () => undefined,
      });
    } else if (!isStudy) card.hidePrompt();
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
  onMode: (m) => {
    showMsg(null);
    void setMode(m);
  },
  onQuality: (q) => void setQuality(q as Quality),
  onTile: (id) => {
    showMsg(null);
    void setMode('study', id);
  },
});

/** dropdown/ปุ่มทิศ ตามแผ่นปัจจุบัน */
function updateTileUi(): void {
  if (!tileIndex || !studyTile) return;
  const nb: Partial<Record<TileDir, string>> = {};
  for (const d of ['n', 's', 'e', 'w'] as const) {
    const id = neighborTile(tileIndex.tiling, studyTile, d);
    if (id && tileInfo(id)?.built) nb[d] = id;
  }
  topbar.setTile(studyTile, nb, Object.fromEntries(tileIndex.tiles.map((t) => [t.id, t.name])));
}
// รายการแผ่น + เส้นเขต (ถ้าโหลดไม่ได้ก็ยังใช้แผ่นเริ่มต้นได้ตามเดิม)
let tileGrid: ReturnType<typeof createTileGrid> | null = null;
const tileLabelBox = document.createElement('div');
$('labels').append(tileLabelBox);
void Promise.all([loadTileIndex(), loadDistricts().catch(() => null)])
  .then(([idx, dist]) => {
    tileIndex = idx;
    districts = dist;
    const built = idx.tiles.filter((t) => t.built);
    topbar.setTiles(built.map((t) => [t.id, t.name]));
    tileGrid = createTileGrid(
      ov,
      tileLabelBox,
      overviewFrame,
      idx.tiles,
      (la, lo) => Math.max(grid.h0[overviewFrame.cellAt(la, lo)], 0) * overviewFrame.vex,
      (id) => {
        showMsg(null);
        void setMode('study', id);
      },
    );
    tileGrid.setVisible(mode === 'overview');
    if (studyTile) {
      updateTileUi();
      // ฉากที่โหลดก่อนได้เส้นเขต: ไม่สร้างใหม่ (เส้นเขตจะมีเมื่อสลับแผ่นครั้งถัดไป)
    } else topbar.setTile(wantTile, {}, Object.fromEntries(idx.tiles.map((t) => [t.id, t.name])));
  })
  .catch((e) => console.warn('[tiles]', (e as Error).message));
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
let prompted = false;
const locMsg = $('locmsg');
const locMsgText = document.createElement('span');
const locMsgClose = document.createElement('button');
locMsgClose.type = 'button';
locMsgClose.className = 'x';
locMsgClose.textContent = '×';
locMsgClose.setAttribute('aria-label', PLACE.close);
locMsgClose.addEventListener('click', () => showMsg(null));
locMsg.append(locMsgText, locMsgClose);
const showMsg = (m: string | null) => {
  locMsg.hidden = !m;
  locMsgText.textContent = m ?? '';
};
const activeFrame = () => (mode === 'study' ? study!.frame : overviewFrame);
const activeGrid = () => (mode === 'study' ? study!.grid : grid);
/** จุดอยู่ในแผ่นที่เปิดอยู่ */
const inStudyTile = (lat: number, lon: number) => !!study && study.frame.inBounds(lat, lon);
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
  card.setNow(c >= 0 && !g.kind[c] ? readCell(g, sim, c) : null, P);
}
const card = createPlaceCard($('place'), {
  onGoTo: async () => {
    if (!place) return;
    if (mode === 'study' && !inStudyTile(place.lat, place.lon)) {
      showMsg(null);
      const t = tileFor(place.lat, place.lon);
      await setMode(t?.built ? 'study' : 'overview', t?.built ? t.id : wantTile);
    }
    if (place) flyTo(place.lat, place.lon);
  },
  onClear: () => {
    showMsg(null);
    place = null;
    marker.set(null);
    card.setLocation(null);
  },
  onRetryForecast: () => place && void loadForecast(place),
});
/** พยากรณ์ที่หมุด — ดึงข้อมูลจากจุดคงที่ (ไม่ส่งตำแหน่ง) แล้วคำนวณที่จุดใน worker */
async function loadForecast(p: PickedLocation): Promise<void> {
  card.setForecast('loading');
  try {
    const input = await fetchForecast();
    if (place !== p) return;
    const res = await client.forecast(p.lat, p.lon, input);
    if (place === p) card.setForecast(res);
  } catch (err) {
    console.warn('[forecast]', (err as Error).message);
    if (place === p) card.setForecast('error');
  }
}
async function goToLocation(p: PickedLocation): Promise<void> {
  if (cellOf(grid, p.lat, p.lon) < 0) {
    locate.setPicking(true); // เปิดโหมดปักหมุดให้เลย (ข้อความนอกพื้นที่แทนคำแนะนำปักหมุด)
    showMsg(PLACE.outside);
    return;
  }
  place = p;
  marker.set({ ...p, label: p.source === 'gps' ? PLACE.markerGps : PLACE.markerPin });
  card.setLocation(p);
  // อยู่ในพื้นที่ศึกษา → สลับไปโหมดศึกษา; อยู่นอก bbox ขณะดูโหมดศึกษา → คงโหมดไว้ (ไม่ดึงผู้ใช้ออก)
  // การ์ดยังแสดงผลจากกริดภาพรวม ส่วนหมุดจะเห็นเมื่อสลับไปภาพรวมเองหรือกด "ไปที่หมุด"
  const t = tileFor(p.lat, p.lon);
  if (t?.built) {
    if (mode !== 'study' || studyTile !== t.id) await setMode('study', t.id);
    flyTo(p.lat, p.lon);
  } else if (mode === 'study') showMsg(t ? STUDY.noTileData : PLACE.outsideStudy);
  else flyTo(p.lat, p.lon);
  updatePlaceNow();
  const res = await client.probe(p.lat, p.lon);
  if (place !== p) return;
  card.setProbe(res);
  if (res?.kind === 0) void loadForecast(p);
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
const activeWater = () => (mode === 'study' && study ? study.water : water);

let lastSubs = -1;
async function run(reset: boolean): Promise<void> {
  const m = mode,
    gen = studyGen;
  if (m === 'study' && !study) return; // กำลังโหลดแผ่นใหม่ — setMode จะเรียก run เองเมื่อเสร็จ
  const res = await client.run(m, P);
  if (!res || m !== mode || gen !== studyGen) return; // มีคำขอใหม่กว่า หรือสลับโหมด/แผ่นระหว่างรอ
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
    const waterMoving = activeWater().update(dt, sim);
    topbar.setMoving(waterMoving);
    if (mode === 'study') {
      study!.tick(dt, P);
      realistic?.tick(dt, P, camera, controls.target, sim, waterMoving);
      study!.labels.update(camera, showLabels, sim.hEff, study!.water.cur, P);
    } else {
      rain.tick(dt, P);
      riverFlow.tick(dt, P);
      labels.update(camera, showLabels, sim.hEff, water.cur, P);
      tileGrid?.update(camera);
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
