/**
 * ตรวจภาพในเบราว์เซอร์จริง: ควบคุม headless Chrome ผ่าน DevTools Protocol — เก็บ console/exception, ตรวจ main thread ค้าง, จับภาพ
 *
 * 1) npm run dev (เช่นพอร์ต 5173)
 * 2) เปิด Chrome แบบ headless:
 *    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
 *      --user-data-dir=/tmp/bkk-chrome --window-size=1440,900 about:blank
 * 3) node scripts/visual-check.mjs http://localhost:5173/ <โฟลเดอร์ภาพ> [overview | study | study,real | ไฟล์ขั้นตอน.json]
 *    ไฟล์ .json = [{ "eval": "...", "wait": ms, "shot": "ชื่อภาพ" }] (ดู scripts/visual-check.example.json)
 *    hook ที่ใช้ได้: __mode('study'|'overview'), __quality('simple'|'real'|'high'), __cam(lat, lon, dist, h), __SIM()
 */
import { writeFileSync } from 'node:fs';
const [, , url, outDir, steps = 'overview'] = process.argv;
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
let page = list.find((t) => t.type === 'page');
if (!page) page = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const log = [];
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    log.push(
      `[${stamp()} ${m.params.type}] ` +
        m.params.args
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ')
          .slice(0, 600),
    );
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    log.push(
      `[${stamp()} EXCEPTION] ${d.exception?.description ?? d.text} @${d.url}:${d.lineNumber}`.slice(0, 1500),
    );
  } else if (m.method === 'Log.entryAdded') {
    log.push(
      `[${stamp()} log.${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url ?? ''}`.slice(
        0,
        600,
      ),
    );
  } else if (m.method === 'Debugger.paused') {
    log.push(
      `[${stamp()} PAUSED] ` +
        m.params.callFrames
          .slice(0, 12)
          .map(
            (f) =>
              `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.location.lineNumber + 1}:${f.location.columnNumber}`,
          )
          .join(' <- '),
    );
  }
};
const send = (method, params = {}, timeout = 15000) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => {
      if (pending.has(i)) {
        pending.delete(i);
        res({ timeout: true });
      }
    }, timeout);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr, timeout = 5000) => {
  const r = await send(
    'Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true },
    timeout,
  );
  if (r.timeout) return 'TIMEOUT (main thread busy?)';
  return (
    r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? JSON.stringify(r.result)
  );
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' }, 20000);
  if (r.result?.data) writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  log.push(`[${stamp()} shot] ${name} ${r.timeout ? 'TIMEOUT' : 'ok'}`);
};
const hangCheck = async (label) => {
  const v = await evaluate('1+1', 4000);
  if (v === 2) return false;
  log.push(`[${stamp()} HANG] ${label}`);
  await send('Debugger.enable');
  await send('Debugger.pause');
  await sleep(1500);
  return true;
};
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url });
await sleep(8000);
if (steps.endsWith('.json')) {
  // สคริปต์: [{eval?, wait?, shot?}]
  const { readFileSync } = await import('node:fs');
  for (const a of JSON.parse(readFileSync(steps, 'utf8'))) {
    if (a.eval)
      log.push(`[${stamp()} eval] ${String(await evaluate(a.eval, a.timeout ?? 60000)).slice(0, 300)}`);
    if (a.wait) await sleep(a.wait);
    if (a.shot) await shot(a.shot);
  }
} else if (!(await hangCheck('after load'))) {
  log.push(
    `[${stamp()} state] ` +
      (await evaluate(
        'JSON.stringify({ready:window.__ready, sim: window.__SIM && window.__SIM() && {area: window.__SIM().area, riverMid: window.__SIM().riverMid}, panel: document.getElementById("panel").children.length, canvas: !!document.querySelector("canvas")})',
      )),
  );
  await shot('01-overview');
  if (steps.includes('study')) {
    log.push(`[${stamp()} mode study] ` + (await evaluate('window.__mode("study").then(()=>"ok")', 60000)));
    await sleep(4000);
    if (!(await hangCheck('after study'))) {
      log.push(
        `[${stamp()} state] ` +
          (await evaluate(
            'JSON.stringify({area: window.__SIM() && window.__SIM().area, clock: document.getElementById("clock-t").textContent})',
          )),
      );
      await shot('02-study-simple');
      if (steps.includes('real')) {
        await evaluate('document.querySelector("[data-q=real]").click(), "clicked"');
        for (let k = 0; k < 20; k++) {
          await sleep(2000);
          const done = await evaluate('document.getElementById("clock-t").textContent', 6000);
          if (typeof done === 'string' && !done.includes('กำลังโหลด') && !done.includes('กำลังสร้าง')) break;
        }
        await sleep(3000);
        if (!(await hangCheck('after realistic'))) {
          await shot('03-real-all');
          await evaluate('document.querySelector("[data-cam=rattana]").click(), 1');
          await sleep(2500);
          await shot('04-real-rattana');
          await evaluate('document.querySelector("[data-cam=yaowarat]").click(), 1');
          await sleep(2500);
          await shot('05-real-yaowarat');
          await evaluate('document.querySelectorAll("#presets button")[4].click(), 1');
          await sleep(6000);
          await shot('06-real-2554-yaowarat');
          await evaluate('document.querySelector("[data-cam=klongtoei]").click(), 1');
          await sleep(3000);
          await shot('07-real-klongtoei');
          // fps คร่าว ๆ (headless ไม่ใช่ GPU จริง — ใช้ดูแนวโน้มเท่านั้น)
          log.push(
            `[${stamp()} fps] ` +
              (await evaluate(
                'new Promise(r=>{let n=0,t=performance.now();function f(){n++; if(performance.now()-t<3000) requestAnimationFrame(f); else r((n/3).toFixed(1))} requestAnimationFrame(f)})',
                10000,
              )),
          );
        }
      }
    }
  }
}
writeFileSync(`${outDir}/cdp-log.txt`, log.join('\n'));
console.log(log.join('\n'));
ws.close();
process.exit(0);
