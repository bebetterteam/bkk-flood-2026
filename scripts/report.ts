/** รายงาน Phase A → reports/phase-a.md + reports/dem-preview.png */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { OUT, RAW, REPORTS, ROOT, TILE, loadConfig } from './lib/config.ts';
import { encodePng } from './lib/png.ts';
import { rasterizeLines, rasterizePolygons, type GridMeta } from '../src/sim/raster.ts';

const cfg = loadConfig();
const meta: GridMeta & Record<string, unknown> = JSON.parse(readFileSync(OUT + 'meta.json', 'utf8'));
const { nx, nz } = meta;
const N = nx * nz;
const dem = new Float32Array(readFileSync(OUT + 'dem.f32').buffer.slice(0));
const off = cfg.verticalOffset.value;
const river = JSON.parse(readFileSync(OUT + 'river.json', 'utf8'));
const canals = JSON.parse(readFileSync(OUT + 'canals.json', 'utf8'));
const bmeta = JSON.parse(readFileSync(OUT + 'buildings.json', 'utf8'));
const bbin = readFileSync(OUT + 'buildings.bin');
const arr = <T>(C: new (b: ArrayBuffer, o: number, n: number) => T, k: string): T =>
  new C(bbin.buffer as ArrayBuffer, bbin.byteOffset + bmeta.offsets[k][0], bmeta.offsets[k][1]);
const heightDm = arr(Uint16Array, 'heightDm'),
  bsrc = arr(Uint8Array, 'src'),
  btype = arr(Uint8Array, 'type');

const riverMask = rasterizePolygons(meta, river.polygons);
const canalMask = rasterizePolygons(meta, canals.polygons);
rasterizeLines(
  meta,
  canals.lines.map((l: { pts: number[][] }) => l.pts),
  canalMask,
);
const latOf = (j: number) => meta.bbox.north - (j + 0.5) * meta.dlat,
  lonOf = (i: number) => meta.bbox.west + (i + 0.5) * meta.dlon;
const f2 = (v: number) => v.toFixed(2);
const quant = (vals: number[]) => {
  const s = vals.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.floor(p * (s.length - 1))];
  return {
    n: s.length,
    min: q(0),
    p1: q(0.01),
    p5: q(0.05),
    med: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: q(1),
  };
};
const all = Array.from(dem, (v) => v + off);
const land: number[] = [],
  riv: number[] = [],
  can: number[] = [];
for (let c = 0; c < N; c++) (riverMask[c] ? riv : canalMask[c] ? can : land).push(dem[c] + off);
const qa = quant(all),
  ql = quant(land),
  qr = quant(riv),
  qc = quant(can);

// histogram (0.5 ม.)
const bins = new Map<number, number>();
for (const v of land) {
  const b = Math.floor(v * 2) / 2;
  bins.set(b, (bins.get(b) ?? 0) + 1);
}
const maxBin = Math.max(...bins.values());
const histo = [...bins.entries()]
  .sort((a, b) => a[0] - b[0])
  .filter(([, n]) => n >= 5)
  .map(
    ([b, n]) =>
      `${f2(b).padStart(6)}–${f2(b + 0.5).padEnd(6)} ${'█'.repeat(Math.round((n / maxBin) * 50)).padEnd(50)} ${n}`,
  )
  .join('\n');

// กลุ่มช่องผิดปกติ (connected components)
function clusters(pred: (c: number) => boolean, minSize = 1) {
  const seen = new Uint8Array(N),
    out: { size: number; lat: number; lon: number; max: number; min: number }[] = [];
  for (let c0 = 0; c0 < N; c0++) {
    if (seen[c0] || !pred(c0)) continue;
    const st = [c0];
    seen[c0] = 1;
    let size = 0,
      si = 0,
      sj = 0,
      mx = -1e9,
      mn = 1e9;
    while (st.length) {
      const c = st.pop()!,
        i = c % nx,
        j = (c / nx) | 0;
      size++;
      si += i;
      sj += j;
      mx = Math.max(mx, dem[c] + off);
      mn = Math.min(mn, dem[c] + off);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ii = i + di,
          jj = j + dj,
          n = jj * nx + ii;
        if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && !seen[n] && pred(n)) {
          seen[n] = 1;
          st.push(n);
        }
      }
    }
    if (size >= minSize) out.push({ size, lat: latOf(sj / size), lon: lonOf(si / size), max: mx, min: mn });
  }
  return out.sort((a, b) => b.size - a.size);
}
const HIGH = 8;
const high = clusters((c) => !riverMask[c] && dem[c] + off > HIGH);
const riverHigh = clusters((c) => riverMask[c] === 1 && dem[c] + off > 2);
// spike: ต่างจากค่ากลางของ 3×3 รอบข้างเกิน 3 ม.
let spikes = 0;
for (let j = 1; j < nz - 1; j++)
  for (let i = 1; i < nx - 1; i++) {
    const nb: number[] = [];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) if (di || dj) nb.push(dem[(j + dj) * nx + i + di]);
    nb.sort((a, b) => a - b);
    if (Math.abs(dem[j * nx + i] - (nb[3] + nb[4]) / 2) > 3) spikes++;
  }
const exactZero = Array.from(dem).filter((v) => v === 0).length;
const zeroOutsideRiver = clusters((c) => dem[c] === 0 && !riverMask[c], 4);

// DSM (Copernicus) − DTM (FABDEM)
let dsmLine = 'ไม่มีไฟล์ Copernicus บนกริดเดียวกัน (รัน data:fetch --source=copernicus แล้ว data:build)';
const copPath = RAW + 'dem/copernicus_grid-' + TILE + '.f32';
if (existsSync(copPath)) {
  const cop = new Float32Array(readFileSync(copPath).buffer.slice(0));
  const d = Array.from(cop, (v, c) => v - dem[c]);
  const qd = quant(d);
  dsmLine = `ผลต่าง Copernicus (DSM) − FABDEM: median ${f2(qd.med)} ม., p95 ${f2(qd.p95)} ม., max ${f2(qd.max)} ม. (ส่วนที่ FABDEM ตัดตึก/ต้นไม้ออก)`;
}

// ตึก
const nB = bmeta.count as number;
const hs = Array.from(heightDm, (v) => v / 10);
const qb = quant(hs);
const srcN = bmeta.heightSourceCount as number[];
const pct = (n: number) => ((n / nB) * 100).toFixed(1) + '%';
const tall = hs
  .map((h, i) => ({ h, i }))
  .sort((a, b) => b.h - a.h)
  .slice(0, 8)
  .map(
    ({ h, i }) =>
      `${f2(h)} ม. (${bmeta.typeNames[btype[i]] ?? 'อื่น ๆ'}, จาก ${bmeta.heightSources[bsrc[i]]})`,
  );
const typeTop = (bmeta.typeNames as string[])
  .slice(0, 8)
  .map((t, k) => `${t} ${Array.from(btype).filter((x) => x === k).length}`)
  .join(', ');

// calibration
const calib = JSON.parse(readFileSync(ROOT + 'data/calibration.json', 'utf8'));
const pts = (calib.points ?? []) as {
  name: string;
  lat: number;
  lon: number;
  elevation: number | null;
  floodStatus: string | null;
  source: string;
}[];
const demAt = (lat: number, lon: number) => {
  const i = Math.floor((lon - meta.bbox.west) / meta.dlon),
    j = Math.floor((meta.bbox.north - lat) / meta.dlat);
  return i >= 0 && j >= 0 && i < nx && j < nz ? dem[j * nx + i] + off : NaN;
};
let calibText: string;
if (!pts.length)
  calibText =
    'ยังไม่มีจุดอ้างอิงใน `data/calibration.json` (เว้นไว้ให้กรอก — ดูรายการแหล่งข้อมูลที่แนะนำในไฟล์)';
else {
  const rows = pts.map(
    (p) =>
      `| ${p.name} | ${p.lat}, ${p.lon} | ${p.elevation ?? '–'} | ${p.floodStatus ?? '–'} | ${f2(demAt(p.lat, p.lon))} | ${p.source} |`,
  );
  const withE = pts.filter((p) => p.elevation !== null && Number.isFinite(demAt(p.lat, p.lon)));
  let stat = `จุดที่มีความสูงอ้างอิง ${withE.length} จุด (ต้อง ≥3 จึงคำนวณ bias/RMSE)`;
  if (withE.length >= 3) {
    const e = withE.map((p) => demAt(p.lat, p.lon) - p.elevation!);
    const bias = e.reduce((s, v) => s + v, 0) / e.length;
    const rmse = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
    stat = `bias (DEM − อ้างอิง) = ${f2(bias)} ม., RMSE = ${f2(rmse)} ม. → offset ที่เสนอ = ${f2(off - bias)} ม. (ยังไม่ได้ใส่ใน config — ให้ผู้ใช้ตัดสินใจ)`;
  }
  calibText = `| ชื่อ | lat, lon | ความสูงอ้างอิง | สถานะน้ำท่วม | DEM | แหล่งที่มา |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\n${stat}`;
}

// ขนาดไฟล์
const files = readdirSync(OUT).map((f) => [f, statSync(OUT + f).size] as const);
const total = files.reduce((s, [, n]) => s + n, 0);

// ภาพ preview: heightmap 0–8 ม. + ขอบแม่น้ำ (ฟ้า) + คลอง (น้ำเงิน) ขยาย 2 เท่า
const SC = 2,
  W = nx * SC,
  H = nz * SC;
const rgb = new Uint8Array(W * H * 3);
const ramp: [number, number[]][] = [
  [-0.5, [91, 42, 134]],
  [1, [47, 128, 237]],
  [2, [34, 163, 159]],
  [3, [124, 195, 107]],
  [4, [233, 196, 106]],
  [6, [224, 122, 63]],
  [10, [150, 40, 40]],
];
const color = (h: number) => {
  if (h <= ramp[0][0]) return ramp[0][1];
  for (let k = 1; k < ramp.length; k++)
    if (h <= ramp[k][0]) {
      const t = (h - ramp[k - 1][0]) / (ramp[k][0] - ramp[k - 1][0]);
      return ramp[k - 1][1].map((a, q) => a + (ramp[k][1][q] - a) * t);
    }
  return ramp[ramp.length - 1][1];
};
const edge = (m: Uint8Array, c: number) => {
  const i = c % nx,
    j = (c / nx) | 0;
  return (
    m[c] &&
    ((i > 0 && !m[c - 1]) || (i < nx - 1 && !m[c + 1]) || (j > 0 && !m[c - nx]) || (j < nz - 1 && !m[c + nx]))
  );
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = ((y / SC) | 0) * nx + ((x / SC) | 0);
    let col = color(dem[c] + off);
    // hillshade เล็กน้อยให้เห็นรูปพื้น
    const i = c % nx,
      j = (c / nx) | 0;
    const dzdx = (dem[Math.min(c + 1, j * nx + nx - 1)] - dem[Math.max(c - 1, j * nx)]) / 2;
    const dzdy = j > 0 && j < nz - 1 ? (dem[c + nx] - dem[c - nx]) / 2 : 0;
    const shade = Math.max(0.6, Math.min(1.25, 1 - (dzdx - dzdy) * 0.15));
    col = col.map((v) => v * shade);
    if (edge(riverMask, c)) col = [0, 230, 255];
    else if (canalMask[c] && !riverMask[c]) col = [20, 40, 140];
    void i;
    rgb.set(
      col.map((v) => Math.max(0, Math.min(255, Math.round(v)))),
      (y * W + x) * 3,
    );
  }
mkdirSync(REPORTS, { recursive: true });
writeFileSync(REPORTS + 'dem-preview.png', encodePng(W, H, rgb));

const cl = (xs: { size: number; lat: number; lon: number; max: number; min: number }[], k = 8) =>
  xs
    .slice(0, k)
    .map(
      (x) =>
        `  - ${x.size} ช่อง @ ${x.lat.toFixed(4)}, ${x.lon.toFixed(4)} (ค่า ${f2(x.min)}–${f2(x.max)} ม.)`,
    )
    .join('\n') || '  - ไม่พบ';
const row = (name: string, q: ReturnType<typeof quant>) =>
  `| ${name} | ${q.n} | ${f2(q.min)} | ${f2(q.p5)} | ${f2(q.med)} | ${f2(q.p95)} | ${f2(q.max)} |`;

const md = `# รายงาน Phase A — ข้อมูลพื้นที่ศึกษา "${meta.name}" (แผ่น ${TILE})

สร้างเมื่อ ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC ด้วย \`npm run data:report\`

## DEM
- แหล่ง: **${(meta.source as { id: string }).id}** — ${(meta.source as { license: string }).license}
- กริด ${nx} × ${nz} = ${N.toLocaleString()} ช่อง ขนาดช่อง ~${(meta.cellMeters as number[]).join(' × ')} ม., bbox lat ${cfg.bbox.south}–${cfg.bbox.north}, lon ${cfg.bbox.west}–${cfg.bbox.east}
- datum: EGM2008, **verticalOffset = ${off} ม. (${cfg.verticalOffset.status})** — ตัวเลขทั้งหมดด้านล่างยัง *ไม่ใช่* ม.รทก.
- ${dsmLine}

| กลุ่มช่อง | จำนวน | min | p5 | median | p95 | max |
|---|---|---|---|---|---|---|
${row('ทั้งหมด', qa)}
${row('พื้นดิน (ไม่รวมแม่น้ำ/คลอง)', ql)}
${row('ในแม่น้ำ (OSM)', qr)}
${row('ในคลอง (OSM)', qc)}

### Histogram ความสูงพื้นดิน (ช่วง 0.5 ม., ซ่อนช่วงที่มี < 5 ช่อง)
\`\`\`
${histo}
\`\`\`

![heightmap](dem-preview.png)

ภาพ: สีตามความสูง (ม่วง ≤ −0.5 → น้ำเงิน 1 → เขียว 3 → เหลือง 4 → ส้ม 6 → แดง ≥ 10 ม.) ขอบฟ้า = แม่น้ำ OSM, น้ำเงินเข้ม = คลอง OSM

## OSM
- ตึก **${nB.toLocaleString()} หลัง** (${bmeta.rings} ring, ${bmeta.vertices.toLocaleString()} จุดหลัง simplify ${cfg.buildings.simplifyMeters} ม.)
  - ความสูงจาก \`height\`: ${srcN[0]} (${pct(srcN[0])}) · จาก \`building:levels\` × ${cfg.buildings.metersPerLevel}: ${srcN[1]} (${pct(srcN[1])}) · ค่าเริ่มต้นตามประเภท: ${srcN[2]} (${pct(srcN[2])})
  - ความสูง median ${f2(qb.med)} ม., p95 ${f2(qb.p95)} ม., max ${f2(qb.max)} ม.
  - สูงสุด 8 หลัง: ${tall.join('; ')}
  - ประเภทที่พบมาก: ${typeTop}
  - ตัดทิ้ง: เล็กกว่า 4 ตร.ม. ${bmeta.dropped.tooSmall}, อยู่นอก bbox ${bmeta.dropped.outsideBbox}, ค่า levels ใช้ไม่ได้ ${bmeta.dropped.levelsRejected}
- แม่น้ำ: ${river.polygons.length} polygon รวม ${river.polygons.reduce((s: number, p: { areaKm2: number }) => s + p.areaKm2, 0).toFixed(2)} ตร.กม.
  (${river.polygons.map((p: { id: string; name: string | null; areaKm2: number }) => `${p.id}${p.name ? ' ' + p.name : ''} ${p.areaKm2}`).join('; ')})
- คลอง: ${canals.lines.length} เส้น + ${canals.polygons.length} polygon

## การปรับเทียบ (calibration)
${calibText}

## ขนาดไฟล์ (public/data/study-area/)
${files.map(([f, n]) => `- ${f}: ${(n / 1024).toFixed(0)} KB`).join('\n')}
- **รวม ${(total / 1e6).toFixed(2)} MB** (เป้า ≤ 15 MB)

## จุดที่ข้อมูลดูผิดปกติ
- พื้นดินสูงเกิน ${HIGH} ม. (อาจเป็นตึก/สะพาน/ทางด่วนที่ตัดไม่หมด หรือเนินจริง): ${high.length} กลุ่ม, ${high.reduce((s, x) => s + x.size, 0)} ช่อง ใหญ่สุด:
${cl(high)}
- ช่องในแม่น้ำ (OSM) ที่ DEM สูงเกิน 2 ม. (สะพาน/ขอบ polygon ไม่ตรง DEM): ${riverHigh.length} กลุ่ม, ${riverHigh.reduce((s, x) => s + x.size, 0)} ช่อง
${cl(riverHigh, 5)}
- ช่องที่มีค่า 0.00 พอดี ${exactZero} ช่อง (Copernicus/FABDEM ปรับผิวน้ำให้แบน) กลุ่มนอกแม่น้ำ OSM (≥4 ช่อง):
${cl(zeroOutsideRiver, 5)}
- spike (ต่างจากค่ากลางรอบข้างเกิน 3 ม.): ${spikes} ช่อง
- **ระดับพื้นโดยรวม:** median พื้นดิน ${f2(ql.med)} ม. (EGM2008) สูงกว่าที่มักอ้างถึงสำหรับกรุงเทพฯ ชั้นใน (~0–2 ม. ม.รทก.)
  อาจมาจาก (ก) ความต่างระหว่าง geoid EGM2008 กับ ม.รทก. (ข) bias ของ DEM ในเขตเมืองหนาแน่น (ค) แผ่นดินทรุดหลังช่วงเก็บข้อมูล TanDEM-X (2011–2015)
  **ยังไม่ได้ปรับ** — ต้องมีจุดอ้างอิงใน \`data/calibration.json\` ก่อน
- ระดับนี้สำคัญกับการจำลอง: ระดับน้ำเจ้าพระยาในโมเดลอยู่ที่ ~1–2.7 ม.รทก. ขณะที่พื้นดินครึ่งหนึ่งสูงเกิน ${f2(ql.med)} ม. ใน DEM — ถ้า offset จริงเป็นลบมาก ผลการท่วมจะต่างจาก offset = 0 อย่างมาก จึงควรปรับเทียบก่อนตีความผล
`;
writeFileSync(REPORTS + 'phase-a.md', md);
console.log(md);
