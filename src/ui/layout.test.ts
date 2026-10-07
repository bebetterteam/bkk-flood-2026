import { describe, expect, it } from 'vitest';
import { layoutFor, nearestLevel } from './layout';

describe('layoutFor (breakpoints)', () => {
  it.each([
    [375, 667, 'phone'],
    [393, 852, 'phone'],
    [852, 393, 'land'],
    [667, 375, 'land'],
    [820, 1180, 'tablet'],
    [1024, 768, 'tablet'],
    [1180, 820, 'desktop'],
    [1280, 800, 'desktop'],
    [1920, 1080, 'desktop'],
  ])('%i×%i → %s', (w, h, k) => expect(layoutFor(w, h)).toBe(k));
});

describe('nearestLevel (snap ของ bottom sheet)', () => {
  const H = { peek: 200, half: 440, full: 760 };
  it('เลือกระดับที่ใกล้ที่สุด', () => {
    expect(nearestLevel(150, H)).toBe('peek');
    expect(nearestLevel(310, H)).toBe('peek');
    expect(nearestLevel(330, H)).toBe('half');
    expect(nearestLevel(650, H)).toBe('full');
    expect(nearestLevel(2000, H)).toBe('full');
  });
});
