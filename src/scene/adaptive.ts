/**
 * Adaptive quality: จำกัด devicePixelRatio ตามระดับเครื่อง แล้ววัด FPS ทุก 2 วินาที
 * ถ้าต่ำต่อเนื่อง → ลดความละเอียด (DPR) และจำนวนอนุภาคทีละขั้น; ถ้าลื่นนานพอ → คืนทีละขั้น
 * ไม่เปลี่ยนโหมดคุณภาพที่ผู้ใช้เลือกเอง — ลดถึงขั้น 2 แล้วยังช้า จะเรียก onSlow ครั้งเดียวเพื่อแนะนำ
 * ปิดได้ด้วย ?adaptive=0 (ใช้ในเทสต์ที่ต้องการภาพคงที่) · ?fps แสดงตัวเลข FPS
 */
import type * as THREE from 'three';
import { perf } from './perf';

/** สัดส่วน DPR และอนุภาคของแต่ละขั้น */
const STEPS = [
  { dpr: 1, particles: 1 },
  { dpr: 0.8, particles: 1 },
  { dpr: 0.65, particles: 0.5 },
  { dpr: 0.5, particles: 0.25 },
];
const WINDOW = 2; // วินาที
const LOW = 28,
  HIGH = 55;

export interface AdaptiveOptions {
  /** เครื่องระดับล่าง/จอเล็ก: เพดาน DPR 1.5 แทน 2 */
  lowTier: boolean;
  enabled: boolean;
  onSlow?: () => void;
  onFps?: (fps: number, step: number) => void;
}

export function lowTierDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    matchMedia('(pointer: coarse)').matches ||
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (nav.deviceMemory ?? 8) <= 4
  );
}

export function createAdaptive(renderer: THREE.WebGLRenderer, o: AdaptiveOptions) {
  const baseCap = o.lowTier ? 1.5 : 2;
  let cap = baseCap;
  let step = 0;
  let frames = 0,
    time = 0,
    low = 0,
    high = 0,
    cool = 0,
    warned = false;

  function apply(): void {
    const pr = Math.max(0.75, Math.min(devicePixelRatio, cap) * STEPS[step].dpr);
    if (Math.abs(renderer.getPixelRatio() - pr) > 1e-3) renderer.setPixelRatio(pr);
    perf.particles = STEPS[step].particles;
  }
  apply();

  return {
    /** เพดานจากโหมดคุณภาพ (สมจริง 1.5, สมจริง+ 2) ไม่เกินเพดานของเครื่อง; null = ค่าของเครื่อง */
    setCap(c: number | null): void {
      cap = c == null ? baseCap : Math.min(c, baseCap);
      apply();
    },
    /** เรียกทุกเฟรมด้วยเวลาจริง (วินาที ไม่ clamp) */
    frame(dt: number): void {
      frames++;
      time += dt;
      if (cool > 0) cool -= dt;
      if (time < WINDOW) return;
      const fps = frames / time;
      frames = 0;
      time = 0;
      o.onFps?.(fps, step);
      if (!o.enabled || cool > 0) return;
      if (fps < LOW) {
        high = 0;
        if (++low >= 2 && step < STEPS.length - 1) {
          step++;
          low = 0;
          cool = 4;
          apply();
          if (step >= 2 && !warned) {
            warned = true;
            o.onSlow?.();
          }
        }
      } else if (fps > HIGH) {
        low = 0;
        if (++high >= 8 && step > 0) {
          step--;
          high = 0;
          cool = 4;
          apply();
        }
      } else low = high = 0;
    },
    /** เริ่มนับใหม่ (หลังกลับมาจากแท็บที่ซ่อน/โหลดฉากใหม่ — เฟรมช่วงนั้นไม่สะท้อนความลื่น) */
    reset(): void {
      frames = 0;
      time = 0;
      low = high = 0;
    },
    get step() {
      return step;
    },
  };
}
