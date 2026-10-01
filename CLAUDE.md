# Bangkok Flood Lab

สื่อการสอน 3 มิติ (Three.js) อธิบายว่าน้ำท่วมกรุงเทพฯ เกิดจากอะไร โดยใช้กรอบ "น้ำ 3 น้ำ" (น้ำฝน น้ำเหนือ น้ำทะเลหนุน) + แผ่นดินทรุด
และระบบป้องกัน (เขื่อนริมเจ้าพระยา คันกั้นน้ำ สถานีสูบ/อุโมงค์) กลุ่มผู้ใช้คือนักเรียนและคนทั่วไป เน้นให้เข้าใจกลไก ไม่ใช่พยากรณ์

## คำสั่ง

```bash
npm run dev       # dev server (Vite)
npm run build     # typecheck (tsc) + build → dist/
npm run preview   # เสิร์ฟ dist/
npm test          # Vitest (src/**/*.test.ts)
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
  main.ts              ประกอบ grid → sim → scene → ui + render loop, เปิด window.__SIM/__P/__run ไว้ตรวจ
  style.css            CSS (ยกมาจากต้นแบบ)
  data/                ข้อมูลภูมิศาสตร์แบบประมาณ: geo.ts (ขอบเขต แม่น้ำ คลอง คันกั้นน้ำ ชายฝั่ง), places.ts (เขต ป้าย สถานีสูบ อุโมงค์)
  sim/                 pure TS ห้าม import three.js/DOM (มีเทสต์ purity.test.ts บังคับ)
    coords.ts          กริด NX×NZ, lat/lon ↔ index
    grid.ts            buildGrid(): ความสูงพื้น ชนิดเซลล์ เขื่อน pond factor
    simulate.ts        simulate(grid, params) → SimResult (priority-flood + ลดระดับตามระยะ + น้ำฝนส่วนเกิน)
    presets.ts         สถานการณ์ตัวอย่าง
    golden.ts          ตัวเลขอ้างอิงจากต้นแบบ (ใช้ในเทสต์)
  scene/               three.js: stage (renderer/camera/lights), terrain, water, walls, buildings, canals, infra, particles (ฝน/การไหล), labels, cameraViews
  ui/                  strings.ts (ข้อความไทยทั้งหมด), panel, results (เกจ/สถิติ/คำอธิบาย), legend, tooltip, topbar
config/study-area.json bbox, ขนาดช่อง, แหล่ง DEM, verticalOffset, ความสูงเขื่อน, ค่าความสูงตึกเริ่มต้น
scripts/               pipeline (Node 22 รัน .ts ตรง ๆ, typecheck ด้วย scripts/tsconfig.json)
  fetch-dem.ts         FABDEM: ดึงเฉพาะ tile N13E100 ออกจาก zip 1.7 GB ด้วย HTTP Range (lib/zip-range.ts); --source=copernicus
  fetch-osm.ts         Overpass (สลับ mirror เมื่อ 429/504): ตึก (แบ่ง 4 ส่วน), แม่น้ำ, คลอง
  build-dem.ts         crop + bilinear → dem.f32 + meta.json
  build-osm.ts         ตึก → buildings.bin/.json, river.json, canals.json
  report.ts            รายงาน + preview; calibration จาก data/calibration.json
  data.test.ts         ตรวจไฟล์ใน public/data/study-area/
data/calibration.json  จุดอ้างอิง (ว่างไว้ให้ผู้ใช้กรอก ห้ามแต่งค่า)
public/data/study-area/ ข้อมูลที่ประมวลผลแล้ว (~3.7 MB)
reports/               รายงาน Phase A
```

## ข้อมูลพื้นที่ศึกษา (MVP 2)

- **bbox / กริด:** lat 13.70–13.78, lon 100.48–100.58 → 360 × 295 ช่อง ช่องละ ~30 × 30 ม. (แก้ใน `config/study-area.json` แล้วรัน `npm run data:build`)
- **dem.f32:** Float32 LE, row-major แถวแรก = ขอบเหนือ ค่าที่กึ่งกลางช่อง หน่วยเมตร **อ้างอิง geoid EGM2008**
- **buildings.bin:** อาร์เรย์ต่อกัน ตำแหน่ง/ความยาวใน `buildings.json.offsets`; พิกัด Uint16 หน่วย 0.25 ม. จากมุม SW ของ bbox;
  ring แรกของแต่ละตึก = outer ที่เหลือ = hole; `heightDm` (เดซิเมตร); `src` 0=`height`, 1=`building:levels`×3.2 ม., 2=ค่าเริ่มต้นตามประเภท
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

## Roadmap

1. ใช้ DEM จริง (Copernicus GLO-30 / FABDEM) แทนค่าประมาณ — ระวัง: GLO-30 เป็น DSM (รวมตึก/ต้นไม้) และความคลาดเคลื่อน 1–2 ม.
   ใกล้เคียงความต่างความสูงทั้งเมือง ต้องแปลง datum (EGM2008 → ม.รทก.) และปรับเทียบกับหมุดระดับ/ข้อมูล กทม.
2. ตึกจาก OpenStreetMap ทีละเขต
3. มุมมองภาพตัดขวาง (แม่น้ำ–เขื่อน–ถนน–อุโมงค์)
4. ไทม์ไลน์รายชั่วโมง (กราฟน้ำขึ้นน้ำลง + ฝน)
5. รองรับมือถือ/ประสิทธิภาพ
6. แก้ข้อจำกัด non-monotonic ด้านบน
