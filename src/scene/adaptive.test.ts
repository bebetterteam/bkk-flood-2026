import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { createAdaptive } from './adaptive';
import { perf } from './perf';

function fakeRenderer() {
  let pr = 1;
  return {
    getPixelRatio: () => pr,
    setPixelRatio: (v: number) => (pr = v),
  } as unknown as THREE.WebGLRenderer;
}
/** ป้อนเฟรมที่ fps คงที่เป็นเวลา sec วินาที */
const run = (a: ReturnType<typeof createAdaptive>, fps: number, sec: number) => {
  for (let t = 0; t < sec; t += 1 / fps) a.frame(1 / fps);
};

describe('adaptive quality', () => {
  beforeEach(() => ((globalThis as { devicePixelRatio?: number }).devicePixelRatio = 3));
  afterEach(() => (perf.particles = 1));

  it('จำกัด DPR ตามระดับเครื่อง และตามโหมดคุณภาพ', () => {
    const r = fakeRenderer();
    const a = createAdaptive(r, { lowTier: true, enabled: true });
    expect(r.getPixelRatio()).toBe(1.5);
    a.setCap(2); // สมจริง+ ไม่เกินเพดานเครื่อง
    expect(r.getPixelRatio()).toBe(1.5);
    a.setCap(1);
    expect(r.getPixelRatio()).toBe(1);
    const hi = fakeRenderer();
    createAdaptive(hi, { lowTier: false, enabled: true });
    expect(hi.getPixelRatio()).toBe(2);
  });

  it('FPS ต่ำต่อเนื่อง → ลดทีละขั้น; ลื่นนาน → คืน', () => {
    const r = fakeRenderer();
    let slow = 0;
    const a = createAdaptive(r, { lowTier: false, enabled: true, onSlow: () => slow++ });
    run(a, 60, 4);
    expect(a.step).toBe(0);
    run(a, 20, 4.5); // 2 ช่วงต่ำ → ลด 1 ขั้น
    expect(a.step).toBe(1);
    expect(r.getPixelRatio()).toBeCloseTo(1.6);
    run(a, 20, 30);
    expect(a.step).toBe(3);
    expect(perf.particles).toBe(0.25);
    expect(slow).toBe(1); // แนะนำครั้งเดียว
    run(a, 60, 60);
    expect(a.step).toBe(0);
    expect(perf.particles).toBe(1);
  });

  it('ปิดด้วย enabled: false (เทสต์ภาพ)', () => {
    const r = fakeRenderer();
    const a = createAdaptive(r, { lowTier: false, enabled: false });
    run(a, 10, 30);
    expect(a.step).toBe(0);
  });
});
