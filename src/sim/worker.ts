/// <reference lib="webworker" />
/**
 * Web Worker: รันการจำลองนอก main thread
 *   → {type:'initStudy', inputs}        สร้างกริดพื้นที่ศึกษา ตอบ {type:'studyGrid', grid}
 *   → {type:'run', id, mode, P}         ตอบ {type:'result', id, mode, res}
 *   → {type:'probe', id, lat, lon}      ตอบ {type:'probe', id, result} (ผลทุก preset ที่จุดเดียว)
 * โหมด study: รันภาพรวมก่อน แล้วใช้ผลเป็นเงื่อนไขขอบ (nesting)
 */
import { buildGrid } from './grid';
import { nestBoundary } from './nest';
import { simulate, type SimParams, type SimResult } from './simulate';
import { buildStudyGrid, type StudyGrid, type StudyInputs } from './studyGrid';
import { probeLocation, type ProbeResult } from './probe';

export type SimMode = 'overview' | 'study';
export type WorkerRequest =
  | { type: 'initStudy'; inputs: StudyInputs }
  | { type: 'run'; id: number; mode: SimMode; P: SimParams }
  | { type: 'probe'; id: number; lat: number; lon: number };
export type WorkerResponse =
  | { type: 'studyGrid'; grid: StudyGrid }
  | { type: 'result'; id: number; mode: SimMode; res: SimResult }
  | { type: 'probe'; id: number; result: ProbeResult | null }
  | { type: 'error'; id?: number; message: string };

const overview = buildGrid();
let study: StudyGrid | null = null;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);
const buffersOf = (r: SimResult) => [r.hEff, r.reach, r.arrival, r.src, r.tExt, r.tRain].map((a) => a.buffer);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === 'initStudy') {
      study = buildStudyGrid(m.inputs);
      post({ type: 'studyGrid', grid: study });
    } else if (m.type === 'run') {
      const ov = simulate(overview, m.P);
      let res = ov;
      if (m.mode === 'study') {
        if (!study) throw new Error('ยังไม่ได้โหลดพื้นที่ศึกษา');
        res = simulate(study, m.P, nestBoundary(overview, ov, study));
      }
      post({ type: 'result', id: m.id, mode: m.mode, res }, buffersOf(res));
    } else if (m.type === 'probe') {
      post({ type: 'probe', id: m.id, result: probeLocation(overview, study, m.lat, m.lon) });
    }
  } catch (err) {
    post({ type: 'error', id: m.type === 'initStudy' ? undefined : m.id, message: (err as Error).message });
  }
};
