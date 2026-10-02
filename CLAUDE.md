# Bangkok Flood Lab

สื่อการสอน 3 มิติ (Three.js) อธิบายว่าน้ำท่วมกรุงเทพฯ เกิดจากอะไร โดยใช้กรอบ "น้ำ 3 น้ำ" (น้ำฝน น้ำเหนือ น้ำทะเลหนุน) + แผ่นดินทรุด
และระบบป้องกัน (เขื่อนริมเจ้าพระยา คันกั้นน้ำ สถานีสูบ/อุโมงค์) กลุ่มผู้ใช้คือนักเรียนและคนทั่วไป เน้นให้เข้าใจกลไก ไม่ใช่พยากรณ์

## คำสั่ง

```bash
npm run dev       # dev server (Vite)
npm run build     # typecheck (src, scripts, tests) + build → dist/
npm run preview   # เสิร์ฟ dist/
npm test          # Vitest (src/, scripts/, tests/ — tests/ ใช้ข้อมูลจริงใน public/)
npm run lint      # ESLint + Prettier --check
npx prettier --write .   # จัดรูปแบบ

# pipeline ข้อมูลพื้นที่ศึกษา (MVP 2) — รันแบบ offline ครั้งเดียว ผลลัพธ์ commit ไว้แล้ว
npm run data:fetch    # ดึง DEM + OSM ดิบ → data/raw/ (gitignored)
npm run data:build    # → public/data/study-area/
npm run data:report   # → reports/phase-a.md + reports/dem-preview.png
npm run data          # ทั้งสามขั้น
```

## โครงสร้าง

```
prototype/index.html   ต้นแบบไฟล์เดียวดั้งเดิม — ห้ามแก้ ใช้เป็นต้นฉบับอ้างอิง
index.html             โครง HTML (คอนเทนเนอร์เปล่า เนื้อหาสร้างจาก src/ui)
src/
  main.ts              ประกอบ grid → sim (worker) → scene → ui + render loop, สลับ 2 โหมด, เปิด window.__SIM/__P/__run/__mode ไว้ตรวจ
  style.css            CSS (ยกมาจากต้นแบบ)
  data/                ข้อมูลภูมิศาสตร์แบบประมาณ: geo.ts (ขอบเขต แม่น้ำ คลอง คันกั้นน้ำ ชายฝั่ง), places.ts (เขต ป้าย สถานีสูบ อุโมงค์)
                       studyArea.ts โหลดไฟล์พื้นที่ศึกษา (fetch) + config
  sim/                 pure TS ห้าม import three.js/DOM (มีเทสต์ purity.test.ts บังคับ)
    coords.ts          กริด NX×NZ, lat/lon ↔ index
    grid.ts            buildGrid(): ความสูงพื้น ชนิดเซลล์ เขื่อน pond factor
    simulate.ts        simulate(grid, params) → SimResult (priority-flood + ลดระดับตามระยะ + น้ำฝนส่วนเกิน)
    presets.ts         สถานการณ์ตัวอย่าง
    golden.ts          ตัวเลขอ้างอิงจากต้นแบบ (ใช้ในเทสต์)
    studyGrid.ts       buildStudyGrid(): กริดพื้นที่ศึกษาจาก DEM + OSM (แยกเจ้าพระยา/คลอง, เขื่อน, ค่าตามระยะ)
    nest.ts            nestBoundary(): ผลภาพรวม → แหล่งน้ำที่ขอบพื้นที่ศึกษา
    raster.ts          polygon/เส้น → mask (ใช้ร่วมกับ scripts/)
    worker.ts, client.ts  Web Worker + ตัวเรียก (ผลล่าสุดชนะ)
  scene/               three.js: stage (renderer/camera/lights/fog), terrain, water, walls, buildings, canals, infra, particles (ฝน/การไหล), labels, cameraViews
    frame.ts           Frame = ขนาดกริด + การฉายพิกัด + VEX ของแต่ละโหมด (water/walls/labels/tooltip ใช้ร่วมกัน)
    study/             studyScene.ts (ฉากพื้นที่ศึกษา), buildingGeometry.ts (extrude + รวมตึกเป็น tile 4×4)
    realistic/         MVP 3 โหมดสมจริง (โหลดแยก chunk เมื่อเลือกครั้งแรก):
                       realisticScene.ts ประกอบ, materials.ts (shader patch: พื้นตาม mask, หน้าต่าง, เส้นจราจร, น้ำ),
                       lighting.ts (Sky + เงาตามกล้อง + env map), weather.ts (ฝนเป็นเส้น + พื้นเปียก),
                       roadGeometry.ts / buildingGeometryReal.ts / landscape.ts = builder แบบ pure (เทสต์ใน Node)
  ui/                  strings.ts (ข้อความไทยทั้งหมด), panel, results (เกจ/สถิติ/คำอธิบาย), legend, tooltip, topbar
config/study-area.json bbox, ขนาดช่อง, แหล่ง DEM, verticalOffset, ความสูงเขื่อน, ค่าความสูงตึกเริ่มต้น
scripts/               pipeline (Node 22 รัน .ts ตรง ๆ, typecheck ด้วย scripts/tsconfig.json)
  fetch-dem.ts         FABDEM: ดึงเฉพาะ tile N13E100 ออกจาก zip 1.7 GB ด้วย HTTP Range (lib/zip-range.ts); --source=copernicus
  fetch-osm.ts         Overpass (สลับ mirror เมื่อ 429/504): ตึก (แบ่ง 4 ส่วน), แม่น้ำ, คลอง
  build-dem.ts         crop + bilinear → dem.f32 + meta.json
  build-osm.ts         ตึก → buildings.bin/.json, river.json, canals.json
  report.ts            รายงาน + preview; calibration จาก data/calibration.json
  build-osm-real.ts    MVP 3: ถนน/ราง (roads.bin), พื้นที่สีเขียว (green.json), ต้นไม้ (trees.bin)
  fetch-textures.ts    MVP 3: texture CC0 จาก Poly Haven → public/textures/ (ย่อด้วย sips)
  report-real.ts       MVP 3: reports/mvp3-phase-a.md + mvp3-preview.png
  lib/osm.ts           อ่าน/แปลง element OSM (polygonsOf, clipSimplify) ใช้ร่วมกัน
  data.test.ts         ตรวจไฟล์ใน public/data/study-area/
data/calibration.json  จุดอ้างอิง (ว่างไว้ให้ผู้ใช้กรอก ห้ามแต่งค่า)
public/data/study-area/ ข้อมูลที่ประมวลผลแล้ว (~3.7 MB)
reports/               รายงาน Phase A
tests/                 เทสต์ที่ใช้ข้อมูลจริง: study.test.ts (sim บนกริดจริง), buildings.test.ts (geometry)
```

## สองโหมด

|               | ภาพรวมทั้งเมือง                              | พื้นที่ศึกษา (ข้อมูลจริง)                                      |
| ------------- | -------------------------------------------- | -------------------------------------------------------------- |
| กริด          | 200 × 168 ช่อง ~330 ม. (สูตร)                | 360 × 295 ช่อง ~30 ม. (FABDEM)                                 |
| แม่น้ำ/คลอง   | เส้นประมาณใน `data/geo.ts`                   | OSM polygon (`isMainRiver` แยกเจ้าพระยา)                       |
| เขื่อน        | ตามช่องติดแม่น้ำ 2.8/2.4 ม.                  | ช่องติดแม่น้ำ `riverWallTop` (config, 2.8 ม.)                  |
| น้ำเหนือ/ทะเล | น้ำเหนือเข้าขอบบน, ทะเลเป็นแหล่งน้ำ          | **nesting**: ระดับน้ำจากผลภาพรวมที่ขอบพื้นที่ (`nest.ts`)      |
| โลก 3 มิติ    | 1 หน่วย ≈ 1.08 กม., VEX 0.6, ตึกขยายเกินจริง | 1 หน่วย = 10 ม., พื้น ×3 (`view.terrainExaggeration`), ตึกจริง |

- การจำลองทั้งสองโหมดรันใน Web Worker (`sim/worker.ts`); โหมดศึกษาโหลดข้อมูล (~3.7 MB) ครั้งแรกที่กดสลับ
- ค่าที่ผูกกับจำนวนช่องถูกเก็บใน `Grid` และแปลงตามขนาดช่อง: `loss` (0.03 ต่อ ~329 ม. → ~0.0027 ต่อ 30 ม.),
  รัศมีเบลอ pond (6 ช่อง ≈ 2 กม. → 66 ช่อง), `arrivalScale` (เวลาแอนิเมชัน) — โหมดภาพรวมได้ค่าเดิมทุกหลัก (golden test)
- คลองเป็นพื้นดินตาม DEM สำหรับ sim (ไม่ใช่แหล่งน้ำ ไม่กั้นการไหล) มี mask `canal` ไว้วาด/tooltip
- ตึกทรุดตามพื้นด้วยการเลื่อนทั้งกลุ่ม (subW ในพื้นที่ศึกษาคงที่ 0.5)
- เวลาที่วัดใน Node: สร้างกริด ~130 ms, sim ต่อครั้ง 3–15 ms, สร้าง geometry ตึก ~120 ms (1.1 ล้านสามเหลี่ยม)

## โหมดสมจริง (MVP 3)

- **ตรวจภาพจริงแล้ว** ด้วย headless Chrome (`scripts/visual-check.mjs`) — บทเรียนจากการตรวจ:
  - env map ต้อง _ไม่มี_ ดวงอาทิตย์ (ใช้ทรงกลมไล่สี) ไม่งั้นแสงอาทิตย์ผ่าน IBL ไม่มีเงา ทำให้เงาตึกจางหาย
  - `shadow.bias` เป็นสัดส่วนของช่วงความลึกกล้องเงา ต้องเล็กมาก (−0.00003) และตึกต้องใช้ `FrontSide` (ring วนทิศเดียวกัน)
    เพื่อให้ shadow pass วาดด้านหลัง ไม่เกิด shadow acne
  - ทิศแดด (เช้า ~75°) เลือกให้เงาตกมาทางกล้องสำเร็จรูป (มองจากตะวันตกเฉียงใต้); แดดบ่ายเงาตกหลังตึกมองไม่เห็น
  - น้ำท่วมต้องสีต่างจากพื้นชัดเจน (น้ำขุ่นสีอ่อน + สะท้อนท้องฟ้า, พื้นสีเทาเย็น)
- **Artifact preview ยังขึ้นจอว่าง** (หน้าเดียวกันรันได้ใน headless Chrome ทั้ง dev และ build) — สาเหตุยังไม่ทราบ ตรวจ console ใน frame ของ artifact ไม่ได้
- ปุ่ม "เรียบง่าย / สมจริง / สมจริง+" แสดงเฉพาะโหมดพื้นที่ศึกษา; ไม่แตะการจำลอง ใช้ผลและ mesh น้ำเดียวกัน (เปลี่ยนเฉพาะ material)
- ใช้เฉพาะ three.js + addons (`Sky`) — ไม่มี dependency ใหม่; SAO/post-processing ยังไม่ใส่ (ต้องปรับค่าโดยดูภาพจริง)
- tone mapping ACES + เงา (`renderer.shadowMap`) เปิดเฉพาะตอนใช้โหมดนี้ และคืนค่าเดิมเมื่อสลับกลับ (โหมดภาพรวมไม่เปลี่ยน)
- ตึกสมจริง: หน้าต่างจาก UV (ม.) ตามชนิด `facade`, หลังคาทรงพีระมิดสำหรับวัด/บ้านเล็ก/ที่ OSM ระบุทรง, สีจาก palette ตามการใช้งาน
  (การชี้เมาส์ยัง raycast กับ mesh ตึกแบบเรียบง่ายที่ซ่อนอยู่ — รูปร่างเท่ากัน ยกเว้นหลังคาทรงพีระมิด)
- ถนน: แบ่งจุดทุก 15 ม. ให้เกาะ DEM, ทางยกระดับเฉลี่ยพื้น ±60 ม. มีผนังข้างและเสาทุก ~30 ม.; `roadInfo.w = เลน×16 + bit เส้นจราจร`
- ต้นไม้ ≤ 40,000 ต้น (OSM 13k + สุ่มในสวน/ป่าแบบ seed คงที่); พุ่มไม้ทอดเงาเฉพาะ "สมจริง+"
- เวลาที่วัดใน Node: ถนน ~170 ms (518k สามเหลี่ยม, เสา 4,298), ตึก ~500 ms (1.13 ล้าน), mask+ต้นไม้ ~90 ms
- เทสต์ `tests/materials.test.ts` ตรวจว่าการแทนที่ chunk ใน shader ของ three.js 0.160 ได้ผลจริง (ถ้าอัปเกรด three ต้องผ่านเทสต์นี้)

## ข้อมูลพื้นที่ศึกษา (MVP 2)

- **bbox / กริด:** lat 13.70–13.78, lon 100.48–100.58 → 360 × 295 ช่อง ช่องละ ~30 × 30 ม. (แก้ใน `config/study-area.json` แล้วรัน `npm run data:build`)
- **dem.f32:** Float32 LE, row-major แถวแรก = ขอบเหนือ ค่าที่กึ่งกลางช่อง หน่วยเมตร **อ้างอิง geoid EGM2008**
- **buildings.bin:** อาร์เรย์ต่อกัน ตำแหน่ง/ความยาวใน `buildings.json.offsets`; พิกัด Uint16 หน่วย 0.25 ม. จากมุม SW ของ bbox;
  ring แรกของแต่ละตึก = outer ที่เหลือ = hole; `heightDm` (เดซิเมตร); `src` 0=`height`, 1=`building:levels`×3.2 ม., 2=ค่าเริ่มต้นตามประเภท
- **buildings.bin (MVP 3 เพิ่ม):** `use` (ประเภทการใช้งาน), `roofShape`, `colour`/`roofColour` (index ของ palette ใน json), `levels`
- **roads.bin:** `lineStart/lineCount/verts` (Uint16 0.25 ม.), `widthDm`, `liftDm` (ความสูงยกต่อจุด — ค่าประมาณ ดู `roads.json.liftRule`),
  `cls` (index ของ `roads.json.classes`), `lanes`, `flags` (1 oneway, 2 bridge, 4 rail); ตัดทางเดิน/บันได/อุโมงค์ใต้ดินออก
- **green.json / trees.bin:** สวน หญ้า ป่า ลานวัด สนาม (polygon lat/lon) และต้นไม้ (Uint16 คู่)
- **public/textures/:** CC0 (Poly Haven) + waternormals (MIT) รายละเอียดใน `public/textures/LICENSE.md`
- **river.json / canals.json:** polygon lat/lon 6 หลัก (clip ตาม bbox, simplify 1 ม.) + เส้นคลอง
  หมายเหตุ: OSM แท็ก `คลองบางกอกใหญ่` เป็น `water=river` ด้วย — ตอนสร้างกริดต้องแยกแม่น้ำเจ้าพระยาออกจากคลอง

### Datum และ verticalOffset

DEM (FABDEM/Copernicus) อ้างอิง geoid EGM2008 แต่แบบจำลองใช้ ม.รทก. (ระดับทะเลปานกลาง เกาะหลัก) ซึ่งไม่ตรงกัน
ค่าที่ใช้คือ `ความสูง ม.รทก. = DEM + verticalOffset.value` โดย `verticalOffset` อยู่ใน `config/study-area.json`
**ตอนนี้ใช้ 0 สถานะ `uncalibrated`** (ไม่ได้สมมติค่า) แอปต้องแสดงคำเตือนเมื่อสถานะยังไม่ใช่ `calibrated`
เมื่อมี ≥3 จุดใน `data/calibration.json` ที่มีความสูงอ้างอิง `npm run data:report` จะคำนวณ bias/RMSE และเสนอ offset ให้ตัดสินใจเอง
ข้อสังเกตจาก Phase A: median พื้นดินใน DEM = 3.64 ม. สูงกว่าค่าที่มักอ้างถึงของกรุงเทพฯ ชั้นใน (0–2 ม.)

### License

- FABDEM V1-2 — **CC BY-NC-SA 4.0** ใช้ได้เฉพาะงานไม่แสวงกำไร ต้องอ้างอิง Hawker et al. (2022) และแจกจ่ายต่อด้วย license เดียวกัน
- Copernicus DEM GLO-30 (สำรอง/เทียบ) — ใช้ฟรี ต้องระบุ "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA"
- OpenStreetMap — ODbL ต้องแสดง "© OpenStreetMap contributors"
- ห้ามใช้ Google 3D Tiles หรือ API ที่ต้องใช้ key/เสียเงิน; ห้าม commit ไฟล์ดิบ (`data/raw/`)

## หน่วยและระบบพิกัด

- พิกัดภูมิศาสตร์ lat/lon (องศา) ขอบเขต lat 13.46–13.96, lon 100.32–100.92
- กริด 200 × 168 เซลล์ (`NX`, `NZ`), index = `j*NX + i`, `j=0` คือขอบเหนือ; 1 เซลล์ ≈ 0.33 × 0.33 กม. (`CELL_KM2`)
- ความสูงและระดับน้ำ: เมตร ม.รทก. (ระดับทะเลปานกลาง)
- โลก three.js: `S = 100` หน่วยต่อองศา → 1 หน่วยโลก ≈ 1.08 กม. (ตะวันออก-ตะวันตก), `x = (lon − LONC)·S`, `z = (LATC − lat)·S`
- แนวตั้ง: `y = ความสูง(ม.) × VEX`, `VEX = 0.6` (ขยายเกินจริง); ตึกขยายเกินจริงแยกต่างหาก

## ข้อตกลง

- UI ทั้งหมดเป็นภาษาไทย ข้อความอยู่ใน `src/ui/strings.ts` เท่านั้น
- `src/sim/` ห้ามพึ่ง three.js หรือ DOM — ต้องรันใน Node ได้
- ต้องคงคำเตือน "แบบจำลองเพื่อการศึกษา" (`DISCLAIMER`) ไว้ในหน้าเสมอ
- ถ้าแก้สูตรหรือค่าคาลิเบรตใน `src/sim/` ต้องอัปเดตเทสต์ (และสร้าง `golden.ts` ใหม่) พร้อมเขียนเหตุผลใน commit
- ลำดับการเรียก `mulberry(42)` ใน `main.ts` (ตึก → ฝน → อนุภาคแม่น้ำ) มีผลกับหน้าตา อย่าสลับถ้าไม่ตั้งใจ
- ไม่เพิ่ม dependency ใหญ่โดยไม่ถามก่อน; three.js ล็อกไว้ที่ 0.160.x ให้ตรงกับต้นแบบ

## ข้อจำกัดของข้อมูลและแบบจำลอง

- ภูมิประเทศสร้างจากสูตร (แนวลาดเหนือ-ใต้ แอ่งตะวันออก/ตะวันตก + noise) ไม่ใช่ DEM จริง
- แนวแม่น้ำ คลอง เขื่อน คันกั้นน้ำ ลากด้วยมือแบบประมาณ ความสูงเขื่อนเป็นค่าตัวแทน (2.8 ม. กลางเมือง)
- การจำลองเป็น bathtub ที่ลดระดับ 0.03 ม./เซลล์ตามระยะ ไม่มีเวลา ไม่มีปริมาตร ไม่ใช่ hydrodynamic
- **ข้อจำกัดที่รู้แล้ว (non-monotonic):** เซลล์ที่น้ำภายนอกเข้าถึงจะนับน้ำฝนแค่ 30% (`tRain = e>0 ? r*0.3 : r` ใน `simulate.ts`)
  เมื่อฝนหนักมาก (เช่น 100 มม./ชม. 6 ชม.) การเพิ่มน้ำเหนือ/น้ำทะเลจึงทำให้พื้นที่ท่วมลดลงเล็กน้อยได้ (~0.1–1%)
  มีเทสต์ `it.fails` บันทึกไว้ ยังไม่แก้เพราะรอบ refactor ห้ามเปลี่ยนสูตร — ทางแก้ที่เป็นไปได้: ใช้ `max(e + 0.3r, r)`
  พบซ้ำในพื้นที่ศึกษา (preset 2554 + เพิ่มน้ำเหนือ/น้ำทะเล ลดลง ≤ 0.1 ตร.กม.) ทดลองสูตร `tRain = max(0.3r, r − e)`
  (ความลึกรวม = `max(e + 0.3r, r)`) ในสำเนาแยกแล้ว monotonic ครบ — **ข้อเสนอ ยังไม่ลงมือ**
- พื้นที่ศึกษา: DEM คลาด 1–2 ม. และ **ยังไม่ปรับ datum** (offset 0) พื้นใน DEM สูงกว่าระดับน้ำแม่น้ำของโมเดล น้ำจากแม่น้ำ/ขอบจึงแทบไม่เข้า
  ด้วย offset −2.5 ม. (สมมติเพื่อทดสอบกลไกเท่านั้น) preset 2554 ท่วมจากแม่น้ำ ~55 ตร.กม.
- ระดับน้ำที่ขอบ (nesting) มาจากโมเดลภาพรวมที่อ้าง ม.รทก. โดยประมาณ ขณะที่พื้นพื้นที่ศึกษาเป็น DEM + offset — ถ้า offset ผิด ขอบจะไม่สอดคล้อง
- ฝนในพื้นที่ศึกษา: pond factor ใช้ความเป็นเมืองจากสูตรเดิม (เกือบ 1 ทั้งพื้นที่) preset ฝนหนักจึงท่วม >10 ซม. ~60% ของพื้นที่

## Roadmap

1. ~~DEM จริง~~ / ~~ตึก OSM~~ — MVP 2 ทำในพื้นที่ศึกษาแล้ว; ต่อไป: ปรับเทียบ datum ด้วยหมุดระดับจริง แล้วขยาย bbox ทีละเขต
2. MVP 3: การไหลแบบ shallow water บน GPU (ดูข้อเสนอในสรุป MVP 2)
3. มุมมองภาพตัดขวาง (แม่น้ำ–เขื่อน–ถนน–อุโมงค์)
4. ไทม์ไลน์รายชั่วโมง (กราฟน้ำขึ้นน้ำลง + ฝน)
5. รองรับมือถือ/ประสิทธิภาพ
6. แก้ข้อจำกัด non-monotonic ด้านบน
