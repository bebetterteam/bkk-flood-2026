/** รายงาน MVP 3 Phase A → reports/mvp3-phase-a.md + reports/mvp3-preview.png (แผนที่ 2 มิติ: ตึก ถนน สวน ต้นไม้) */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { OUT, REPORTS, ROOT, loadConfig } from './lib/config.ts';
import { encodePng } from './lib/png.ts';

const cfg = loadConfig();
const rj = JSON.parse(readFileSync(OUT + 'roads.json', 'utf8'));
const rb = readFileSync(OUT + 'roads.bin');
const bj = JSON.parse(readFileSync(OUT + 'buildings.json', 'utf8'));
const bb = readFileSync(OUT + 'buildings.bin');
const green = JSON.parse(readFileSync(OUT + 'green.json', 'utf8')).polygons as {
  kind: string;
  outer: number[][];
}[];
const tj = JSON.parse(readFileSync(OUT + 'trees.json', 'utf8'));
const tb = readFileSync(OUT + 'trees.bin');
const view = <T>(
  buf: Buffer,
  offs: Record<string, [number, number]>,
  C: new (b: ArrayBuffer, o: number, n: number) => T,
  k: string,
) => new C(buf.buffer as ArrayBuffer, buf.byteOffset + offs[k][0], offs[k][1]);

// ภาพ 1 px = 6 ม.
const [Wm, Hm] = rj.extentMeters as [number, number];
const S = 6,
  w = Math.ceil(Wm / S),
  h = Math.ceil(Hm / S);
const img = new Uint8Array(w * h * 3).fill(0);
for (let i = 0; i < w * h; i++) img.set([226, 222, 212], i * 3);
const put = (x: number, y: number, c: number[]) => {
  const px = Math.floor(x / S),
    py = h - 1 - Math.floor(y / S);
  if (px >= 0 && py >= 0 && px < w && py < h) img.set(c, (py * w + px) * 3);
};
const { south, west } = cfg.bbox;
const [kx, ky] = rj.metersPerDegree as [number, number];
const toM = (lat: number, lon: number) => [(lon - west) * kx, (lat - south) * ky];
// สวน: เติมด้วย scanline
for (const g of green) {
  const r = g.outer.map(([la, lo]) => toM(la, lo));
  const col = g.kind === 'wood' ? [120, 160, 100] : g.kind === 'temple' ? [230, 196, 120] : [165, 205, 140];
  const ys = r.map((p) => p[1]);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += S) {
    const xs: number[] = [];
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (r[a][1] > y !== r[b][1] > y)
        xs.push(r[a][0] + ((y - r[a][1]) * (r[b][0] - r[a][0])) / (r[b][1] - r[a][1]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = xs[k]; x <= xs[k + 1]; x += S) put(x, y, col);
  }
}
// ตึก: จุดยอด outer ring (พอให้เห็นความหนาแน่น)
{
  const Q = bj.quantMeters;
  const v = view(bb, bj.offsets, Uint16Array, 'verts'),
    use = view(bb, bj.offsets, Uint8Array, 'use'),
    rs = view(bb, bj.offsets, Uint32Array, 'ringStart'),
    rvs = view(bb, bj.offsets, Uint32Array, 'ringVertStart'),
    rvc = view(bb, bj.offsets, Uint16Array, 'ringVertCount');
  const USE_COL = [
    [150, 140, 130],
    [190, 150, 120],
    [140, 120, 160],
    [110, 130, 170],
    [210, 120, 40],
    [90, 150, 150],
    [130, 130, 130],
    [170, 170, 170],
  ];
  for (let b = 0; b < bj.count; b++) {
    const r = rs[b];
    for (let k = 0; k < rvc[r]; k++)
      put(v[(rvs[r] + k) * 2] * Q, v[(rvs[r] + k) * 2 + 1] * Q, USE_COL[use[b]]);
  }
}
// ถนน: ทางยกระดับแดง, ถนนหลักดำ, รอง เทา, ราง ม่วง
{
  const Q = rj.quantMeters;
  const ls = view(rb, rj.offsets, Uint32Array, 'lineStart'),
    lc = view(rb, rj.offsets, Uint16Array, 'lineCount'),
    v = view(rb, rj.offsets, Uint16Array, 'verts'),
    lift = view(rb, rj.offsets, Uint16Array, 'liftDm'),
    cls = view(rb, rj.offsets, Uint8Array, 'cls'),
    flags = view(rb, rj.offsets, Uint8Array, 'flags');
  for (let i = 0; i < rj.count; i++) {
    const major = cls[i] <= 9;
    for (let k = 0; k + 1 < lc[i]; k++) {
      const a = ls[i] + k,
        b = a + 1;
      const ax = v[a * 2] * Q,
        ay = v[a * 2 + 1] * Q,
        bx = v[b * 2] * Q,
        by = v[b * 2 + 1] * Q;
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (S / 2)) + 1;
      const col =
        flags[i] & 4 ? [120, 60, 170] : lift[a] > 50 ? [210, 40, 40] : major ? [40, 40, 40] : [110, 110, 110];
      for (let s = 0; s <= n; s++) put(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n, col);
    }
  }
}
// ต้นไม้
{
  const t = new Uint16Array(tb.buffer, tb.byteOffset, tj.count * 2);
  for (let i = 0; i < tj.count; i++)
    put(t[i * 2] * tj.quantMeters, t[i * 2 + 1] * tj.quantMeters, [20, 110, 40]);
}
writeFileSync(REPORTS + 'mvp3-preview.png', encodePng(w, h, img));

const files = readdirSync(OUT).map((f) => [f, statSync(OUT + f).size] as const);
const tex = readdirSync(ROOT + 'public/textures/').map(
  (f) => [f, statSync(ROOT + 'public/textures/' + f).size] as const,
);
const sum = (xs: (readonly [string, number])[]) => xs.reduce((s, [, n]) => s + n, 0);
const st = bj.style.counts;
const pct = (n: number, d: number) => ((n / d) * 100).toFixed(1) + '%';
const md = `# รายงาน MVP 3 Phase A — ข้อมูลโหมดสมจริง

สร้างด้วย \`node scripts/report-real.ts\`

## ถนนและราง (roads.bin)
- **${rj.count.toLocaleString()} เส้น** (${rj.vertices.toLocaleString()} จุด) จาก way ${rj.stats.kept.toLocaleString()} เส้น
  — ตัดทิ้ง: ทางเดิน/บันได/ทางจักรยาน/ก่อสร้าง ฯลฯ ${rj.stats.skippedClass.toLocaleString()}, อุโมงค์ใต้ดิน ${rj.stats.tunnel}
- ตามประเภท: ${Object.entries(rj.byClass)
  .map(([c, n]) => `${c} ${n}`)
  .join(', ')}
- มี \`lanes\` ${rj.stats.withLanes} เส้น (${pct(rj.stats.withLanes, rj.stats.kept)}), มี \`width\` ${rj.stats.withWidth} (${pct(rj.stats.withWidth, rj.stats.kept)}) ที่เหลือใช้ความกว้างเริ่มต้นตามประเภท
- ยกระดับ: ทางด่วน/รางยกระดับ ${rj.stats.elevated} เส้น, สะพานข้ามแยก ${rj.stats.flyover}, สะพานสั้น (ข้ามคลอง) ${rj.stats.smallBridge}
- กติกาความสูง (ค่าประมาณเพื่อแสดงผล): ${rj.liftRule}

## พื้นที่สีเขียวและต้นไม้
- polygon ${green.length.toLocaleString()} รูป: ${Object.entries(
  green.reduce((a: Record<string, number>, g) => ((a[g.kind] = (a[g.kind] ?? 0) + 1), a), {}),
)
  .map(([k, n]) => `${k} ${n}`)
  .join(', ')}
- ต้นไม้ (natural=tree) ${tj.count.toLocaleString()} ต้น

## ตึก — แท็กสำหรับหน้าตา
- ตึก ${bj.count.toLocaleString()} หลัง: มีสีผนัง ${st.colour} (${pct(st.colour, bj.count)}), สีหลังคา ${st.roofColour}, รูปหลังคา ${st.roofShape} (${pct(st.roofShape, bj.count)})
  → เกือบทั้งหมดต้องใช้สี/หลังคาแบบ procedural ตามประเภทการใช้งาน
- การใช้งาน: ${(bj.style.use as string[]).map((u, i) => `${u} ${st.use[i].toLocaleString()}`).join(', ')}

## Texture (public/textures, CC0 จาก Poly Haven + waternormals MIT)
${tex.map(([f, n]) => `- ${f}: ${(n / 1024).toFixed(0)} KB`).join('\n')}

## ขนาดไฟล์รวม
- ข้อมูล public/data/study-area: **${(sum(files) / 1e6).toFixed(2)} MB** (${files.map(([f, n]) => `${f} ${(n / 1e6).toFixed(2)}`).join(', ')})
- texture: **${(sum(tex) / 1e6).toFixed(2)} MB**
- **รวม ${((sum(files) + sum(tex)) / 1e6).toFixed(2)} MB** (เป้า ≤ 15 MB)

![preview](mvp3-preview.png)

ภาพ (1 px = 6 ม.): ดำ = ถนนหลัก, เทา = ถนนรอง/ซอย, **แดง = ทางยกระดับ**, ม่วง = ราง, เขียว = สวน/หญ้า, เขียวเข้ม = ป่า/ต้นไม้, ทอง = ลานวัด,
จุดสีตามการใช้งานตึก (ส้ม = ศาสนสถาน, น้ำเงิน = พาณิชย์, น้ำตาลอ่อน = บ้าน)
`;
writeFileSync(REPORTS + 'mvp3-phase-a.md', md);
console.log(md);
