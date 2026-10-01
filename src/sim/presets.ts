import type { SimParams } from './simulate';

export type PresetParams = Pick<SimParams, 'rain' | 'dur' | 'flow' | 'tide' | 'subs'>;
export interface Preset {
  id: string;
  /** ชื่อที่แสดงใน UI */
  name: string;
  p: PresetParams;
}

/** สถานการณ์ตัวอย่าง (ทุก preset เปิดระบบป้องกันทั้งหมด) */
export const PRESETS: readonly Preset[] = [
  { id: 'normal', name: 'วันปกติ', p: { rain: 0, dur: 2, flow: 1000, tide: 1.0, subs: 0 } },
  { id: 'rain', name: 'ฝนตกหนักกลางเมือง', p: { rain: 100, dur: 3, flow: 1200, tide: 1.1, subs: 0 } },
  { id: 'north', name: 'น้ำเหนือหลาก', p: { rain: 10, dur: 2, flow: 3800, tide: 1.2, subs: 0 } },
  { id: 'tide', name: 'น้ำทะเลหนุนสูง', p: { rain: 0, dur: 2, flow: 1500, tide: 2.0, subs: 0 } },
  {
    id: 'y2011',
    name: '3 น้ำพร้อมกัน (แบบปี 2554)',
    p: { rain: 60, dur: 3, flow: 3800, tide: 1.9, subs: 0 },
  },
  {
    id: 'future',
    name: 'อนาคต: ทรุด + ทะเลสูงขึ้น',
    p: { rain: 60, dur: 3, flow: 2500, tide: 2.3, subs: 60 },
  },
];

export const DEFENSES_ON = { walls: true, dikes: true, drains: true } as const;

export const DEFAULT_PARAMS: SimParams = { rain: 0, dur: 2, flow: 1000, tide: 1.0, subs: 0, ...DEFENSES_ON };

export const presetParams = (p: Preset): SimParams => ({ ...DEFAULT_PARAMS, ...p.p, ...DEFENSES_ON });
