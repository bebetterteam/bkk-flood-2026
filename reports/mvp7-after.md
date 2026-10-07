# MVP 7 — หลังแก้ (before / after)

ถ่ายด้วยชุดเดียวกับ `mvp7-audit.md` (Playwright + Google Chrome headless, software GL, `?adaptive=0` ให้ภาพคงที่)

- ภาพหลังแก้: `reports/mvp7-after/` (48 ภาพ) · ก่อนแก้: `reports/mvp7-before/`
- ตัวเลข bounding box หลังแก้: `reports/mvp7-after.json` (`AUDIT=reports/mvp7-after.json npx playwright test e2e/audit.spec.ts`)
- เทสต์อัตโนมัติ: `npm run test:e2e` (`e2e/layout.spec.ts`)

## สิ่งที่เปลี่ยน

| หัวข้อ | ก่อน | หลัง |
| --- | --- | --- |
| ระบบ layout | overlay วางแยกกันด้วย `calc(46vh + 112px)` ฯลฯ + ResizeObserver เฉพาะจุด | `ui/layout.ts` ตัวเดียว: `data-layout` + CSS variables (`--topbar-h`, `--sheet-h`, `--occ-l/r` …), safe area, `dvh` |
| breakpoint | 820 px จุดเดียว | phone < 600 · land สูง < 500 · tablet ≤ 1024 · desktop |
| มือถือแนวตั้ง | แผง 46vh ตลอด + แถบบน 4–5 แถว | bottom sheet 3 ระดับ (ลาก/ปุ่ม), แท็บ 4 หมวด, แถบบนเหลือ 3 ปุ่ม + เมนู "เพิ่มเติม" |
| มือถือแนวนอน | layout เดสก์ท็อป ทับกันหมด | แผงซ้าย min(300 px, 42vw) มีแท็บ พับได้ |
| แท็บเล็ต | layout มือถือ (แผงล่าง) | แผงลอย 320 px มีแท็บ พับได้ |
| เดสก์ท็อป | แผง 360 px | แผงเดิม + ปุ่มพับ (การ์ดผลหลักแทน) + คอลัมน์ขวาจัดอัตโนมัติ |
| การ์ดหมุด/พยากรณ์ | กล่องลอย (มือถือสูงเหลือ 24 px) | แท็บ "ที่นี่" ในแผง (จอเล็ก) / คอลัมน์ขวา (เดสก์ท็อป) |
| legend / เครดิต | มือถือซ่อน legend | ชิป "สัญลักษณ์" กดขยาย / ปุ่ม ⓘ |
| คำเตือน | ท้ายแผง ต้องเลื่อนลงสุด | คำเตือนสั้นอยู่ในจอเสมอทุกขนาด (+ ฉบับเต็มในแท็บ "เรียนรู้") |
| จอสัมผัส | hover อย่างเดียว | แตะ 1 ครั้ง = ข้อมูลจุด, 1 นิ้วหมุน / 2 นิ้วซูม+เลื่อน, Space-pan เฉพาะเมาส์ |
| จุดกึ่งกลางภาพ | อยู่ใต้แผง | `camera.setViewOffset` กลางพื้นที่ที่มองเห็น เลื่อนตาม sheet/แผงอย่างนุ่ม |
| tokens | ตัวอักษร 16 ขนาด, มุม 10 ค่า, z-index ปน | ระยะ/มุม/ตัวอักษร 8 ขั้น/เงา/ชั้น/เวลา, สีผ่าน AA ทั้งสองโหมด, ไม่มี letter-spacing |
| ไอคอน | emoji + ลูกศรตัวอักษร + × | SVG ชุดเดียว (`ui/icons.ts`) |
| เข้าถึงได้ | focus เฉพาะบางปุ่ม | focus-visible ทุกปุ่ม, ARIA tabs/dialog/aria-pressed/role=status, ปุ่มจอสัมผัส ≥ 44 px, input 16 px |
| ประสิทธิภาพ | DPR ≤ 2 ทุกเครื่อง, render ตลอด | DPR ≤ 1.5 บนจอสัมผัส/เครื่องเล็ก, ลด DPR/อนุภาคตาม FPS, หยุด render เมื่อแท็บถูกซ่อน |

## ตัวเลข bounding box ก่อน / หลัง

| viewport | สถานะ | ก่อน: ซ้อน / หลุด / ปุ่มเล็ก | หลัง: ซ้อน / หลุด / ปุ่มเล็ก | การ์ดหมุดสูง ก่อน → หลัง |
|---|---|---|---|---|
| phone-375x667 | ภาพรวม | 0 / 0 / 26 | 0 / 0 / 0 | – → – |
| phone-375x667 | ศึกษา+การ์ดชวน | 1 / 0 / 32 | 0 / 0 / 0 | 24 → 199 |
| phone-375x667 | การ์ดหมุด | 1 / 0 / 31 | 0 / 0 / 0 | 24 → 1426 |
| phone-393x852 | ภาพรวม | 0 / 0 / 28 | 0 / 0 / 0 | – → – |
| phone-393x852 | ศึกษา+การ์ดชวน | 1 / 0 / 38 | 0 / 0 / 0 | 178 → 199 |
| phone-393x852 | การ์ดหมุด | 0 / 0 / 37 | 0 / 0 / 0 | 123 → 877 |
| phone-land-852x393 | ภาพรวม | 1 / 0 / 30 | 0 / 0 / 0 | – → – |
| phone-land-852x393 | ศึกษา+การ์ดชวน | 2 / 0 / 39 | 0 / 0 / 0 | 24 → 269 |
| phone-land-852x393 | การ์ดหมุด | 2 / 0 / 38 | 0 / 0 / 0 | 24 → 1594 |
| tablet-820x1180 | ภาพรวม | 0 / 0 / 28 | 0 / 0 / 0 | – → – |
| tablet-820x1180 | ศึกษา+การ์ดชวน | 0 / 0 / 38 | 0 / 0 / 0 | 138 → 251 |
| tablet-820x1180 | การ์ดหมุด | 0 / 0 / 37 | 0 / 0 / 0 | 429 → 974 |
| laptop-1280x800 | ภาพรวม | 0 / 0 / 30 | 0 / 0 / 28 | – → – |
| laptop-1280x800 | ศึกษา+การ์ดชวน | 0 / 0 / 39 | 0 / 0 / 36 | 178 → 245 |
| laptop-1280x800 | การ์ดหมุด | 0 / 0 / 38 | 0 / 0 / 33 | 469 → 443 |
| desktop-1920x1080 | ภาพรวม | 0 / 0 / 30 | 0 / 0 / 29 | – → – |
| desktop-1920x1080 | ศึกษา+การ์ดชวน | 0 / 0 / 39 | 0 / 0 / 39 | 178 → 245 |
| desktop-1920x1080 | การ์ดหมุด | 0 / 0 / 38 | 0 / 0 / 36 | 792 → 723 |


> ซ้อน = คู่ overlay ที่ทับกัน · หลุด = กล่องเกินขอบจอ · ปุ่มเล็ก = ด้านใดด้านหนึ่ง < 44 px (เดสก์ท็อปใช้เมาส์ ปุ่ม 36 px ตามตั้งใจ)
> หลังแก้การ์ดหมุดบนจอเล็กอยู่ในแผง (สูงตามเนื้อหา เลื่อนในแผง)

## FPS

**ยังไม่ได้วัดบนมือถือจริง** — ต้องเปิดบนเครื่องจริงผ่าน `npm run dev -- --host` แล้วต่อท้าย URL ด้วย `?fps` (ตัวเลขขึ้นใน pill สถานะ: FPS · ระดับ adaptive 0–3)

วัดใน headless Chrome (SwiftShader ซึ่งเป็น software GL) ระหว่างที่เครื่องมีโหลดอื่นสูง (load average ~11) ตัวเลขจึงต่ำผิดปกติ ใช้ดูได้แค่ทิศทาง:

| viewport | adaptive | ภาพรวม | สมจริง (เริ่ม → หลัง 8 วินาที) | pixel ratio สุดท้าย |
| --- | --- | --- | --- | --- |
| 393×852 DPR 3 | ปิด | 4.9 | 0.4 → 0.4 | 1.5 (เพดานจอสัมผัส; เดิม 2) |
| 393×852 DPR 3 | เปิด | 5.7 | 0.1 → 0.3 | 0.75 (ลดถึงขั้นต่ำสุด) |
| 1280×800 DPR 1 | ปิด | 3.0 | 0.2 → 0.4 | 1 |
| 1280×800 DPR 1 | เปิด | 5.2 | 0.1 → 4.2 | 1 |

- มือถือ DPR 3: เดิมวาดที่ pixel ratio 2 (2.25 เท่าของจำนวนพิกเซลที่ 1.5) ตอนนี้เพดานเหลือ 1.5 และ adaptive ลดลงได้ถึง 0.75
- ความแตกต่างระหว่างแถวที่เปิด/ปิด adaptive ส่วนใหญ่มาจากโหลดของเครื่องที่แกว่ง ไม่ใช่ผลของ adaptive อย่างเดียว

## เทสต์

- `npm run test:e2e` → `e2e/layout.spec.ts` **15 เทสต์ผ่านทั้งหมด**: 6 viewport (overlay ไม่ซ้อน, ไม่หลุดขอบ, ไม่มี horizontal scroll,
  ปุ่มบนจอสัมผัส ≥ 44 px, คำเตือนอยู่ในจอ, เมนู/legend ไม่หลุดขอบ, การ์ดชวน → GPS → การ์ดหมุดในแท็บ "ที่นี่" → ปิดการ์ด → กลับภาพรวม),
  sheet 3 ระดับ + pill อยู่เหนือ sheet, ลาก sheet แล้ว snap และกล้องไม่ขยับ, แตะดูข้อมูลจุด (tooltip ไม่ลงไปใต้ sheet),
  หมุนจอ แนวตั้ง ↔ แนวนอน, พับ/เปิดแผง (แนวนอน/แท็บเล็ต/เดสก์ท็อป), Space-pan บนเดสก์ท็อป, ไม่มี letter-spacing + input ≥ 16 px
- unit (Vitest): `src/ui/layout.test.ts` (breakpoint, snap), `src/scene/adaptive.test.ts` (เพดาน DPR, ลด/คืนขั้น, ปิดได้)

## ภาพเทียบ


### phone-375x667

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-375x667-light-1-overview.jpg) | ![](mvp7-after/phone-375x667-light-1-overview.jpg) | ![](mvp7-after/phone-375x667-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-375x667-light-2-study-prompt.jpg) | ![](mvp7-after/phone-375x667-light-2-study-prompt.jpg) | ![](mvp7-after/phone-375x667-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-375x667-light-3-study-real.jpg) | ![](mvp7-after/phone-375x667-light-3-study-real.jpg) | ![](mvp7-after/phone-375x667-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-375x667-light-4-pin-card.jpg) | ![](mvp7-after/phone-375x667-light-4-pin-card.jpg) | ![](mvp7-after/phone-375x667-dark-4-pin-card.jpg) |

### phone-393x852

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-393x852-light-1-overview.jpg) | ![](mvp7-after/phone-393x852-light-1-overview.jpg) | ![](mvp7-after/phone-393x852-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-393x852-light-2-study-prompt.jpg) | ![](mvp7-after/phone-393x852-light-2-study-prompt.jpg) | ![](mvp7-after/phone-393x852-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-393x852-light-3-study-real.jpg) | ![](mvp7-after/phone-393x852-light-3-study-real.jpg) | ![](mvp7-after/phone-393x852-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-393x852-light-4-pin-card.jpg) | ![](mvp7-after/phone-393x852-light-4-pin-card.jpg) | ![](mvp7-after/phone-393x852-dark-4-pin-card.jpg) |

### phone-land-852x393

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-land-852x393-light-1-overview.jpg) | ![](mvp7-after/phone-land-852x393-light-1-overview.jpg) | ![](mvp7-after/phone-land-852x393-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-land-852x393-light-2-study-prompt.jpg) | ![](mvp7-after/phone-land-852x393-light-2-study-prompt.jpg) | ![](mvp7-after/phone-land-852x393-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-land-852x393-light-3-study-real.jpg) | ![](mvp7-after/phone-land-852x393-light-3-study-real.jpg) | ![](mvp7-after/phone-land-852x393-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-land-852x393-light-4-pin-card.jpg) | ![](mvp7-after/phone-land-852x393-light-4-pin-card.jpg) | ![](mvp7-after/phone-land-852x393-dark-4-pin-card.jpg) |

### tablet-820x1180

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/tablet-820x1180-light-1-overview.jpg) | ![](mvp7-after/tablet-820x1180-light-1-overview.jpg) | ![](mvp7-after/tablet-820x1180-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/tablet-820x1180-light-2-study-prompt.jpg) | ![](mvp7-after/tablet-820x1180-light-2-study-prompt.jpg) | ![](mvp7-after/tablet-820x1180-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/tablet-820x1180-light-3-study-real.jpg) | ![](mvp7-after/tablet-820x1180-light-3-study-real.jpg) | ![](mvp7-after/tablet-820x1180-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/tablet-820x1180-light-4-pin-card.jpg) | ![](mvp7-after/tablet-820x1180-light-4-pin-card.jpg) | ![](mvp7-after/tablet-820x1180-dark-4-pin-card.jpg) |

### laptop-1280x800

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/laptop-1280x800-light-1-overview.jpg) | ![](mvp7-after/laptop-1280x800-light-1-overview.jpg) | ![](mvp7-after/laptop-1280x800-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/laptop-1280x800-light-2-study-prompt.jpg) | ![](mvp7-after/laptop-1280x800-light-2-study-prompt.jpg) | ![](mvp7-after/laptop-1280x800-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/laptop-1280x800-light-3-study-real.jpg) | ![](mvp7-after/laptop-1280x800-light-3-study-real.jpg) | ![](mvp7-after/laptop-1280x800-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/laptop-1280x800-light-4-pin-card.jpg) | ![](mvp7-after/laptop-1280x800-light-4-pin-card.jpg) | ![](mvp7-after/laptop-1280x800-dark-4-pin-card.jpg) |

### desktop-1920x1080

| สถานะ | ก่อน (สว่าง) | หลัง (สว่าง) | หลัง (มืด) |
|---|---|---|---|
| ภาพรวม | ![](mvp7-before/desktop-1920x1080-light-1-overview.jpg) | ![](mvp7-after/desktop-1920x1080-light-1-overview.jpg) | ![](mvp7-after/desktop-1920x1080-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/desktop-1920x1080-light-2-study-prompt.jpg) | ![](mvp7-after/desktop-1920x1080-light-2-study-prompt.jpg) | ![](mvp7-after/desktop-1920x1080-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/desktop-1920x1080-light-3-study-real.jpg) | ![](mvp7-after/desktop-1920x1080-light-3-study-real.jpg) | ![](mvp7-after/desktop-1920x1080-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/desktop-1920x1080-light-4-pin-card.jpg) | ![](mvp7-after/desktop-1920x1080-light-4-pin-card.jpg) | ![](mvp7-after/desktop-1920x1080-dark-4-pin-card.jpg) |

