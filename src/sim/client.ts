/** ตัวกลางคุยกับ Web Worker ของการจำลอง (ผลล่าสุดชนะ: คำขอเก่าที่ตอบช้าจะถูกทิ้ง) */
import type { SimParams, SimResult } from './simulate';
import type { StudyGrid, StudyInputs } from './studyGrid';
import type { ProbeResult } from './probe';
import type { SimMode, WorkerRequest, WorkerResponse } from './worker';

export type { SimMode };

export function createSimClient() {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1,
    latest = 0;
  const pending = new Map<number, { resolve: (r: SimResult | null) => void; reject: (e: Error) => void }>();
  let onGrid: { resolve: (g: StudyGrid) => void; reject: (e: Error) => void } | null = null;
  const probes = new Map<number, { resolve: (r: ProbeResult | null) => void; reject: (e: Error) => void }>();
  const send = (m: WorkerRequest) => worker.postMessage(m);

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const m = e.data;
    if (m.type === 'studyGrid') onGrid?.resolve(m.grid);
    else if (m.type === 'probe') {
      probes.get(m.id)?.resolve(m.result);
      probes.delete(m.id);
    } else if (m.type === 'result') {
      const p = pending.get(m.id);
      pending.delete(m.id);
      p?.resolve(m.id === latest ? m.res : null);
    } else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id !== undefined) {
        pending.get(m.id)?.reject(err);
        probes.get(m.id)?.reject(err);
        pending.delete(m.id);
        probes.delete(m.id);
      } else onGrid?.reject(err);
    }
  };
  worker.onerror = (e) => console.error('[sim worker]', e.message);

  return {
    /** คืนผล หรือ null ถ้ามีคำขอใหม่กว่าเข้ามาแล้ว */
    run(mode: SimMode, P: SimParams): Promise<SimResult | null> {
      const id = nextId++;
      latest = id;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: 'run', id, mode, P: { ...P } });
      });
    },
    /** ผลทุก preset ที่จุดเดียว (ใช้กริดพื้นที่ศึกษาถ้าโหลดแล้วและจุดอยู่ใน bbox) */
    probe(lat: number, lon: number): Promise<ProbeResult | null> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        probes.set(id, { resolve, reject });
        send({ type: 'probe', id, lat, lon });
      });
    },
    initStudy(inputs: StudyInputs): Promise<StudyGrid> {
      return new Promise((resolve, reject) => {
        onGrid = { resolve, reject };
        send({ type: 'initStudy', inputs });
      });
    },
  };
}
