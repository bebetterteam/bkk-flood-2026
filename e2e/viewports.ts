/** viewport ที่ต้องรองรับ (MVP 7) — touch = จำลองจอสัมผัส */
export interface Viewport {
  name: string;
  width: number;
  height: number;
  touch: boolean;
}
export const VIEWPORTS: Viewport[] = [
  { name: 'phone-375x667', width: 375, height: 667, touch: true },
  { name: 'phone-393x852', width: 393, height: 852, touch: true },
  { name: 'phone-land-852x393', width: 852, height: 393, touch: true },
  { name: 'tablet-820x1180', width: 820, height: 1180, touch: true },
  { name: 'laptop-1280x800', width: 1280, height: 800, touch: false },
  { name: 'desktop-1920x1080', width: 1920, height: 1080, touch: false },
];
/** จุดในแผ่น r3c2 (เยาวราช) สำหรับทดสอบการ์ดหมุด */
export const PIN = { latitude: 13.7405, longitude: 100.5105, accuracy: 25 };
