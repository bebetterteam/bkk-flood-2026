# MVP 7 Phase A — Audit UI ปัจจุบัน

ถ่ายเมื่อ 2026-10-07 จาก commit `274b3fc` ด้วย Playwright + Google Chrome (headless, software GL)

- ภาพทั้งหมด: `reports/mvp7-before/<viewport>-<light|dark>-<สถานะ>.jpg` (6 viewport × 2 โหมดสี × 4 สถานะ = 48 ภาพ)
  - สถานะ: `1-overview` ภาพรวม · `2-study-prompt` พื้นที่ศึกษา "สมจริง" + การ์ดชวน · `3-study-real` หลังกด "ไว้ทีหลัง" · `4-pin-card` หลังกด "ตำแหน่งของฉัน" (GPS จำลองที่เยาวราช)
- ตัวเลข bounding box: `reports/mvp7-audit.json` (สร้างด้วย `AUDIT=reports/mvp7-audit.json npx playwright test e2e/audit.spec.ts`)
- ถ่ายใหม่: `SHOTS=reports/mvp7-before npx playwright test e2e/screens.spec.ts` (`SHOTS_ONLY=phone-375` กรอง viewport)

## สรุปตัวเลข (วัดอัตโนมัติ)

| viewport | สถานะ | ซ้อนทับ (คู่) | หลุดขอบ | h-scroll | ปุ่มเล็ก < 44 px | แถบบนสูง | การ์ดหมุดสูง |
|---|---|---|---|---|---|---|---|
| phone-375x667 | ภาพรวม | – | – | – | 26 | 166 px | – |
| phone-375x667 | ศึกษา+การ์ดชวน | #topbar×#place | – | – | 32 | 230 px | 24 px |
| phone-375x667 | การ์ดหมุด | #topbar×#place | – | – | 31 | 230 px | 24 px |
| phone-393x852 | ภาพรวม | – | – | – | 28 | 166 px | – |
| phone-393x852 | ศึกษา+การ์ดชวน | #topbar×#place | – | – | 38 | 209 px | 178 px |
| phone-393x852 | การ์ดหมุด | – | – | – | 37 | 209 px | 123 px |
| phone-land-852x393 | ภาพรวม | #panel×#clock | – | – | 30 | 123 px | – |
| phone-land-852x393 | ศึกษา+การ์ดชวน | #panel×#clock, #topbar×#place | – | – | 39 | 166 px | 24 px |
| phone-land-852x393 | การ์ดหมุด | #panel×#clock, #topbar×#place | – | – | 38 | 166 px | 24 px |
| tablet-820x1180 | ภาพรวม | – | – | – | 28 | 80 px | – |
| tablet-820x1180 | ศึกษา+การ์ดชวน | – | – | – | 38 | 80 px | 138 px |
| tablet-820x1180 | การ์ดหมุด | – | – | – | 37 | 80 px | 429 px |
| laptop-1280x800 | ภาพรวม | – | – | – | 30 | 80 px | – |
| laptop-1280x800 | ศึกษา+การ์ดชวน | – | – | – | 39 | 80 px | 178 px |
| laptop-1280x800 | การ์ดหมุด | – | – | – | 38 | 80 px | 469 px |
| desktop-1920x1080 | ภาพรวม | – | – | – | 30 | 37 px | – |
| desktop-1920x1080 | ศึกษา+การ์ดชวน | – | – | – | 39 | 37 px | 178 px |
| desktop-1920x1080 | การ์ดหมุด | – | – | – | 38 | 37 px | 792 px |


> ซ้อนทับ = คู่ overlay (`#panel #topbar #legend #clock #attrib #locmsg #place`) ที่ bounding box ทับกัน > 1 px · หลุดขอบ = กล่องเกินขอบจอ ·
> ปุ่มเล็ก = ปุ่ม/ช่องกรอก/แท็บที่มองเห็น ด้านใดด้านหนึ่ง < 44 px (ช่องติ๊กนับรวม label)

## ปัญหาที่พบ

### P1 — พังจนใช้งานไม่ได้

1. **มือถือ: การ์ด "ที่นี่ท่วมไหม?" แทบไม่มีความสูง** — `max-height: calc(54vh - 120px - var(--topbar-bottom))` ติดลบเมื่อแถบปุ่มขึ้น 5 แถว
   การ์ดเหลือเพียงหัวเรื่องที่ถูกตัด และทับ attribution (375×667 และ 393×852 ทั้งการ์ดชวนและการ์ดผล) ผู้ใช้มือถือ **ไม่เห็นผลของหมุดและพยากรณ์เลย**
   ![](mvp7-before/phone-375x667-light-4-pin-card.jpg)
2. **มือถือ: แถบปุ่มด้านบนกินครึ่งบนของจอ** — ปุ่ม 16–18 ปุ่ม wrap เป็น 4–5 แถว (สูง 230 px บน 375×667 โหมดพื้นที่ศึกษา) + แผงควบคุมล่าง 46vh
   เหลือแผนที่ให้เห็นราว 15% ของจอ ปุ่มมุมกล้องตัดคำ ("ทั้ง/พื้นที่") ปุ่มทิศแผ่นถูกดันไปท้ายแถว
   ![](mvp7-before/phone-375x667-dark-2-study-prompt.jpg)
3. **มือถือแนวนอน (852×393): ทุกอย่างทับกัน** — ไม่เข้า breakpoint 820 px จึงได้ layout เดสก์ท็อป: แผง 360 px สูงเต็มจอ,
   legend ทับการ์ดหมุด, attribution ทับแผนที่ครึ่งกลาง, การ์ดหมุดเหลือแถบหัวเรื่อง
   ![](mvp7-before/phone-land-852x393-light-4-pin-card.jpg)
4. **คำเตือน "แบบจำลองเพื่อการศึกษา" ไม่ปรากฏบนจอเลยตอนเปิดหน้า** ทุกขนาดจอ — อยู่ท้ายแผงที่ต้องเลื่อนลงสุด (เดสก์ท็อปก็ต้องเลื่อน)

### P2 — ใช้ได้แต่ไม่ดี

5. **ซ้อนกันด้วยค่าตายตัว** — `calc(46vh + 16px)`, `calc(46vh + 66px)`, `calc(46vh + 112px)`, `left: 384px`, `bottom: 60px`, `top: 100px`, `max-width: calc(100% - 400px)`
   และ ResizeObserver 2 ตัวใน `main.ts` (`--topbar-bottom`, `--legend-h`) ที่แก้เฉพาะจุด → เปลี่ยนเนื้อหา/ขนาดจอแล้วพัง (ข้อ 1–3)
6. **ใช้ `vh`** — บน iOS Safari `46vh` นับรวมแถบที่อยู่ใต้ toolbar → แผงล่างหลุดใต้แถบเครื่องมือของเบราว์เซอร์; ไม่มี `env(safe-area-inset-*)` และ
   `<meta viewport>` ไม่มี `viewport-fit=cover`
7. **legend ถูกซ่อนบนจอ < 820 px** — ผู้ใช้มือถือไม่รู้ว่าสีน้ำหมายถึงความลึกเท่าไร และกดเลือกระบบป้องกัน (การ์ดข้อมูล) ไม่ได้
8. **จอสัมผัสดูข้อมูลจุดไม่ได้** — tooltip ทำงานจาก `pointermove` เท่านั้น (`ui/tooltip.ts`); แตะแล้วไม่มีอะไรเกิดขึ้น
9. **จุดกึ่งกลางภาพอยู่ใต้แผง** — กล้องเล็งกลางจอเต็ม แต่แผงซ้าย 360 px (เดสก์ท็อป) / แผงล่าง 46vh (มือถือ) บังอยู่ จุดสนใจ (เช่นหมุดหลัง "ไปที่หมุด") จึงเยื้องหรือถูกบัง
10. **แท็บเล็ต 820×1180**: ได้ layout มือถือ (แผงล่าง 46vh) บนจอที่กว้างพอสำหรับแผงข้าง; แถบบน 3 แถว
11. **เดสก์ท็อป 1280×800**: แถบบน wrap 2 แถวในโหมดพื้นที่ศึกษา; attribution (2 บรรทัด) วางชิดนาฬิกา; การ์ดหมุดต้องเลื่อนภายในเพราะถูกบีบระหว่างแถบบนกับ legend

### P3 — ความสวยงาม/ความสม่ำเสมอ

12. **ขนาดตัวอักษร 16 ค่า** (9.5, 10, 10.5, 11, 11.5, 12, 12.5, 12.8, 13, 14, 15, 16, 18, 20, 22, 26 px) · มุมโค้ง 10 ค่า (3–14 px) · z-index 2/3/5/6 ปนกัน · ตัวเลข px ตายตัว 384 จุดใน `style.css`
13. **letter-spacing กับข้อความไทย** — `h2 { letter-spacing: 0.02em }` (หัวข้อในแผงทั้งหมด) ทำให้สระ/วรรณยุกต์ห่างจากพยัญชนะ
14. **ตัวอักษรเล็กเกินบนมือถือ** — 9.5–10.5 px (แถบพยากรณ์รายวัน, ป้ายในการ์ดหมุด, hint ของ legend)
15. **ไอคอนไม่เป็นชุด** — ผสม emoji (📍 ⚠️ ▶), ลูกศรตัวอักษร (↑ ← → ↓), อักษร × และ SVG ใน legend
16. **ไม่มี focus-visible** ที่ปุ่มส่วนใหญ่ (มีเฉพาะ `#place .x`, `.tile-lbl`); `.on` ใช้สีพื้นอย่างเดียว ไม่มี `aria-pressed` ในแถบบน
17. **แถบบนไม่มี role/aria** — กลุ่มปุ่มแบบ segmented ไม่มี `role=group`/`aria-label`; `<select>` แผ่นใช้ font 12.5 px (iOS ซูมเองเมื่อแตะ)
18. **ป้ายบนแผนที่ (`.lbl`) ใช้สีโหมดสว่างตายตัว** ในโหมดมืด (พื้นขาวบนฉากมืด) — ยอมรับได้เพราะอยู่บนภาพ 3 มิติ แต่ควรใช้ token
19. **การ์ดชวนบังป้าย "อุโมงค์ระบายน้ำ"** และ legend ในเดสก์ท็อป: ไม่มีระบบจัดคอลัมน์ขวา

### ความคมชัดของสี (WCAG AA ต้อง ≥ 4.5:1 สำหรับข้อความปกติ)

| คู่สี                                            | สว่าง      | มืด        | ผล                                 |
| ------------------------------------------------ | ---------- | ---------- | ---------------------------------- |
| ข้อความขาวบนปุ่มที่เลือก (`--accent`)            | 4.94       | **2.61**   | มืดไม่ผ่าน (`#5aa2ff`)             |
| `--warn` บนแผง                                   | 5.18       | **3.29**   | มืดไม่ผ่าน                         |
| `--ok` บนแผง                                     | 5.02       | **3.40**   | มืดไม่ผ่าน (ป้าย "0%" ในพยากรณ์)   |
| `--caution` บนแผง                                | **2.94**   | 5.80       | สว่างไม่ผ่าน (badge "ละเอียด/หยาบ") |
| `--sea` บนแผง (ป้าย "จำลอง")                     | 5.04       | **3.38**   | มืดไม่ผ่าน                         |
| `--accent` บน `--accent-soft` (preset ที่เลือก)  | **4.21**   | 5.43       | สว่างไม่ผ่านเล็กน้อย               |
| `--muted` บนพื้นแผง                              | 5.50       | 6.58       | ผ่าน                               |

ข้อเสนอค่าใหม่ที่ผ่านทุกคู่อยู่ใน `mvp7-design/tokens.css`

### ประสิทธิภาพ

- `setPixelRatio(min(dpr, 2))` ทุกเครื่อง (มือถือ DPR 3 → วาด 2× เต็มจอ) ไม่มีการปรับตาม FPS
- render loop ไม่หยุดเมื่อแท็บถูกซ่อน (`requestAnimationFrame` หยุดเองในเบราว์เซอร์ส่วนใหญ่ แต่ worker/อัปโหลด texture ยังค้างงานได้) — จะวัดในเครื่องจริงใน Phase C
- fps ใน headless (software GL) ไม่สะท้อนมือถือจริง — Phase C จะวัดผ่าน `npm run dev -- --host` บนเครื่องจริงด้วยตัววัด FPS ในหน้า (เปิดด้วย `?fps`)

## ภาพเทียบทุก viewport (โหมดสว่าง / มืด)


### phone-375x667

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-375x667-light-1-overview.jpg) | ![](mvp7-before/phone-375x667-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-375x667-light-2-study-prompt.jpg) | ![](mvp7-before/phone-375x667-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-375x667-light-3-study-real.jpg) | ![](mvp7-before/phone-375x667-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-375x667-light-4-pin-card.jpg) | ![](mvp7-before/phone-375x667-dark-4-pin-card.jpg) |

### phone-393x852

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-393x852-light-1-overview.jpg) | ![](mvp7-before/phone-393x852-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-393x852-light-2-study-prompt.jpg) | ![](mvp7-before/phone-393x852-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-393x852-light-3-study-real.jpg) | ![](mvp7-before/phone-393x852-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-393x852-light-4-pin-card.jpg) | ![](mvp7-before/phone-393x852-dark-4-pin-card.jpg) |

### phone-land-852x393

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/phone-land-852x393-light-1-overview.jpg) | ![](mvp7-before/phone-land-852x393-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/phone-land-852x393-light-2-study-prompt.jpg) | ![](mvp7-before/phone-land-852x393-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/phone-land-852x393-light-3-study-real.jpg) | ![](mvp7-before/phone-land-852x393-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/phone-land-852x393-light-4-pin-card.jpg) | ![](mvp7-before/phone-land-852x393-dark-4-pin-card.jpg) |

### tablet-820x1180

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/tablet-820x1180-light-1-overview.jpg) | ![](mvp7-before/tablet-820x1180-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/tablet-820x1180-light-2-study-prompt.jpg) | ![](mvp7-before/tablet-820x1180-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/tablet-820x1180-light-3-study-real.jpg) | ![](mvp7-before/tablet-820x1180-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/tablet-820x1180-light-4-pin-card.jpg) | ![](mvp7-before/tablet-820x1180-dark-4-pin-card.jpg) |

### laptop-1280x800

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/laptop-1280x800-light-1-overview.jpg) | ![](mvp7-before/laptop-1280x800-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/laptop-1280x800-light-2-study-prompt.jpg) | ![](mvp7-before/laptop-1280x800-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/laptop-1280x800-light-3-study-real.jpg) | ![](mvp7-before/laptop-1280x800-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/laptop-1280x800-light-4-pin-card.jpg) | ![](mvp7-before/laptop-1280x800-dark-4-pin-card.jpg) |

### desktop-1920x1080

| สถานะ | สว่าง | มืด |
|---|---|---|
| ภาพรวม | ![](mvp7-before/desktop-1920x1080-light-1-overview.jpg) | ![](mvp7-before/desktop-1920x1080-dark-1-overview.jpg) |
| สมจริง + การ์ดชวน | ![](mvp7-before/desktop-1920x1080-light-2-study-prompt.jpg) | ![](mvp7-before/desktop-1920x1080-dark-2-study-prompt.jpg) |
| สมจริง | ![](mvp7-before/desktop-1920x1080-light-3-study-real.jpg) | ![](mvp7-before/desktop-1920x1080-dark-3-study-real.jpg) |
| การ์ดหมุด | ![](mvp7-before/desktop-1920x1080-light-4-pin-card.jpg) | ![](mvp7-before/desktop-1920x1080-dark-4-pin-card.jpg) |

