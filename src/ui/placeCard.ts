/** การ์ด "ที่นี่ท่วมไหม?" — ผลที่ตำแหน่งเดียว: ตอนนี้ + ทุกสถานการณ์ตัวอย่าง */
import { nearestDistrict } from '../data/places';
import type { ForecastDay, ForecastResult } from '../sim/forecast';
import { FLOOD_DEPTH, type CellReading, type ProbeResult } from '../sim/probe';
import { PRESETS } from '../sim/presets';
import type { SimParams } from '../sim/simulate';
import type { PickedLocation } from './locate';
import { icon } from './icons';
import { CAUSES, PLACE, SLIDERS, type SliderKey } from './strings';

/** ความลึกเต็มแถบ (ม.) */
const BAR_MAX = 1.5;

const causeChip = (cause: number) =>
  cause < 0
    ? ''
    : `<span class="chip"><i style="background:${CAUSES[cause][1]}"></i>${CAUSES[cause][0]}</span>`;
const depthText = (r: CellReading) =>
  r.depth > FLOOD_DEPTH ? PLACE.cm(r.depth) : r.depth > 0.02 ? PLACE.shallow : PLACE.noFlood;

/** ระดับโอกาส: 0 ต่ำ (< 20%), 1 ปานกลาง (20–50%), 2 สูง (> 50%) */
const level = (chance: number) => (chance > 0.5 ? 2 : chance >= 0.2 ? 1 : 0);
const pctOf = (d: ForecastDay) => Math.round(d.chance * 100);
/** หัวข้อส่วน + ป้ายบอกว่าเป็นผลจำลองหรือพยากรณ์จริง */
const secHead = (title: string, tag: 'sim' | 'fc') =>
  `<div class="sec-h"><b>${title}</b><span class="tag ${tag}">${tag === 'sim' ? PLACE.tagSim : PLACE.tagForecast}</span></div>`;
/** แถว ป้าย — ค่า (dot = CSS var ของจุดสีแบบเดียวกับแถบเลื่อน) */
const kv = (label: string, value: string, dot?: string, stack = false) =>
  `<div class="kv${stack ? ' stack' : ''}"><span>${dot ? `<i class="dot" style="background:var(${dot})"></i>` : ''}${label}</span><b>${value}</b></div>`;
const fmtOf = (key: SliderKey, v: number) => SLIDERS.find((d) => d.key === key)!.fmt(v);
const dateText = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', ...o });

/** สถานะส่วนพยากรณ์ของการ์ด */
export type ForecastState = 'idle' | 'loading' | 'error' | ForecastResult | null;

function forecastHtml(fc: ForecastState): string {
  if (fc === 'idle' || fc === null) return '';
  if (fc === 'loading')
    return `<section class="sec fc">${secHead(PLACE.fcTitle, 'fc')}<div class="loading">${PLACE.fcLoading}</div></section>`;
  if (fc === 'error')
    return `<section class="sec fc">${secHead(PLACE.fcTitle, 'fc')}<div class="err"><span>${PLACE.fcError}</span><button type="button" class="retry">${PLACE.fcRetry}</button></div></section>`;
  const [tm, ...rest] = fc.days;
  if (!tm) return '';
  const need =
    tm.rainNeeded === 0
      ? PLACE.fcNeedExt
      : tm.rainNeeded == null
        ? PLACE.fcNeedNone
        : PLACE.fcNeed(tm.rainNeeded);
  const depth =
    tm.depthP90 > FLOOD_DEPTH ? `<div class="dp">${PLACE.fcDepth(PLACE.cm(tm.depthP90))}</div>` : '';
  const pct = (x: number) => Math.round(x * 100);
  const days = rest
    .map((d) => {
      const p = pctOf(d),
        rp = pct(d.rainChance);
      const title = PLACE.fcDayTitle(
        dateText(d.date, { weekday: 'long', day: 'numeric', month: 'short' }),
        rp,
        pct(d.heavyChance),
        p,
        d.totalMed,
        d.det?.total ?? null,
      );
      return `<li title="${title}"><span>${dateText(d.date, { weekday: 'short' })}</span><span class="cb"><i style="height:${rp}%"></i></span><b>${rp}%</b><small class="lvl-${level(d.chance)}">${PLACE.fcFloodShort(p)}</small></li>`;
    })
    .join('');
  const fetched = new Date(fc.fetched).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const det = tm.det
    ? kv(
        PLACE.fcDetLabel,
        PLACE.fcDetValue(
          tm.det.total,
          tm.det.rate,
          tm.det.depth > FLOOD_DEPTH ? PLACE.fcDetFlood(PLACE.cm(tm.det.depth)) : PLACE.fcDetDry,
        ),
        undefined,
        true,
      )
    : '';
  return `<section class="sec fc">
      ${secHead(PLACE.fcTitle, 'fc')}
      <div class="sub">${PLACE.fcNote1}</div>
      <div class="tm lvl-${level(tm.chance)}" title="${PLACE.fcChanceHint(tm.members)}">
        <div class="pc">${pctOf(tm)}%</div><div class="lv">${PLACE.fcLevels[level(tm.chance)]} ${causeChip(tm.cause)}</div>
        <div class="tl">${PLACE.fcTomorrow(dateText(tm.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
      </div>
      ${depth}
      <div class="fc-sec"><div class="h">${PLACE.fcSecRain}</div>
        ${kv(PLACE.fcRainChance, `${pct(tm.rainChance)}%`)}
        ${kv(PLACE.fcHeavyChance, `${pct(tm.heavyChance)}%`)}
        ${kv(PLACE.fcTotalLabel, PLACE.fcTotal(tm.totalMed, tm.totalMax))}
        ${det}
      </div>
      <div class="fc-sec"><div class="h">${PLACE.fcSecInputs}</div>
        ${kv(PLACE.fcInRain, PLACE.fcRate(tm.rainMax), '--rain')}
        ${kv(PLACE.fcInTide, PLACE.fcM(tm.tide), '--sea')}
        ${kv(PLACE.fcInFlow, PLACE.fcFlow(tm.flow), '--north')}
      </div>
      <div class="fc-sec"><div class="h">${PLACE.fcSecNeed}</div><div class="need">${need}</div></div>
      ${days ? `<div class="fc-sec"><div class="h">${PLACE.fcSecWeek}</div><ol>${days}</ol><div class="hint">${PLACE.fcStripHint}</div></div>` : ''}
      <details class="fine"><summary>${PLACE.fcFetched(fetched)} · ${PLACE.fcAbout}</summary>${PLACE.fcSource}<br>${PLACE.fcNote}</details>
    </section>`;
}

export interface PromptActions {
  onGps: () => void;
  onPin: () => void;
  onLater: () => void;
}

export function createPlaceCard(
  root: HTMLElement,
  actions: { onGoTo: () => void; onClear: () => void; onRetryForecast: () => void },
) {
  root.hidden = true;
  let loc: PickedLocation | null = null;
  let probe: ProbeResult | null = null;
  let loading = false;
  let now: CellReading | null = null;
  let params: SimParams | null = null;
  let forecast: ForecastState = 'idle';
  /** การ์ดชวน (ยังไม่มีตำแหน่ง) — แสดงเมื่อเปิดโหมดพื้นที่ศึกษาครั้งแรก */
  let prompt: PromptActions | null = null;

  function renderPrompt(a: PromptActions): void {
    root.hidden = false;
    root.innerHTML = `
      <div class="head"><h2>${PLACE.title}</h2><button class="x icon-btn" type="button" aria-label="${PLACE.close}">${icon('close')}</button></div>
      <p class="intro">${PLACE.promptText}</p>
      <div class="acts"><button type="button" class="primary gps">${PLACE.promptGps}</button><button type="button" class="pin">${PLACE.promptPin}</button><button type="button" class="later">${PLACE.promptLater}</button></div>
      <p class="fine">${PLACE.privacy}</p>`;
    const close = () => {
      prompt = null;
      root.hidden = true;
      a.onLater();
    };
    root.querySelector<HTMLButtonElement>('.x')!.onclick = close;
    root.querySelector<HTMLButtonElement>('.later')!.onclick = close;
    root.querySelector<HTMLButtonElement>('.gps')!.onclick = () => a.onGps();
    root.querySelector<HTMLButtonElement>('.pin')!.onclick = () => a.onPin();
  }

  function render(): void {
    if (!loc) {
      if (prompt) renderPrompt(prompt);
      else root.hidden = true;
      return;
    }
    root.hidden = false;
    const special =
      probe?.kind === 1
        ? PLACE.inRiver
        : probe?.kind === 2
          ? PLACE.inSea
          : probe?.wall
            ? PLACE.onWall
            : probe?.canal
              ? PLACE.onCanal
              : '';
    const src =
      loc.source === 'gps'
        ? `<span class="pill" title="${PLACE.srcGpsHint}">${PLACE.srcGps(loc.accuracy ?? 0)}</span>`
        : `<span class="pill">${PLACE.srcPin}</span>`;
    const fine = probe?.grid === 'study';
    const res = probe
      ? `<div class="res"><span>${PLACE.resLabel}</span><span class="badge ${fine ? 'fine' : ''}">${fine ? PLACE.resFine : PLACE.resCoarse}</span>
           <p>${fine ? PLACE.resStudy : PLACE.resOverview}</p></div>`
      : '';
    const locHtml = `<div class="loc">
        <div class="nm">${icon('pin')}${PLACE.near(nearestDistrict(loc.lat, loc.lon))}</div>
        <div class="pills"><span class="pill co">${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}</span>${src}</div>
        ${res}
      </div>`;
    const land = probe && probe.kind === 0;
    const nowHtml =
      now && land
        ? `<section class="sec now">${secHead(PLACE.nowTitle, 'sim')}
           <div class="sub">${PLACE.nowNote}</div>
           <div class="vr"><div class="v ${now.depth > FLOOD_DEPTH ? 'wet' : ''}">${depthText(now)}</div>${causeChip(now.cause)}</div>
           ${params ? `<div class="g">${PLACE.nowParams(fmtOf('rain', params.rain), fmtOf('dur', params.dur), fmtOf('flow', params.flow), fmtOf('tide', params.tide))}</div>` : ''}
           <div class="g">${PLACE.ground} ${now.ground.toFixed(2)} ม.</div></section>`
        : '';
    const rows =
      probe && land
        ? probe.rows
            .map((r, k) => {
              const w = Math.min(100, (r.depth / BAR_MAX) * 100);
              return `<tr><th>${PRESETS[k].name}</th><td class="d"><span class="bar"><i style="width:${w}%"></i></span>${depthText(r)}</td><td>${causeChip(r.cause)}</td></tr>`;
            })
            .join('')
        : '';
    const flooded = probe ? probe.causeCount.reduce((a, b) => a + b, 0) : 0;
    const summary =
      probe && land
        ? flooded
          ? PLACE.summary(flooded, probe.rows.length, CAUSES[probe.mainCause][0])
          : PLACE.summaryNone(probe.rows.length)
        : '';
    root.innerHTML = `
      <div class="head"><h2>${PLACE.title}</h2><button class="x icon-btn" type="button" aria-label="${PLACE.close}">${icon('close')}</button></div>
      ${locHtml}
      ${special ? `<div class="note">${special}</div>` : ''}
      ${nowHtml}
      ${land ? forecastHtml(forecast) : ''}
      ${loading ? `<div class="loading">${PLACE.probing}</div>` : ''}
      ${rows ? `<section class="sec">${secHead(PLACE.presetsTitle, 'sim')}<table><thead><tr><th>${PLACE.colScenario}</th><th>${PLACE.colDepth}</th><th>${PLACE.colCause}</th></tr></thead><tbody>${rows}</tbody></table>${summary ? `<p class="sum">${summary}</p>` : ''}</section>` : ''}
      <div class="acts"><button type="button" class="go">${PLACE.goTo}</button><button type="button" class="clr">${PLACE.clear}</button></div>
      <p class="fine">${PLACE.privacy}<br>${PLACE.disclaimer}</p>`;
    root.querySelector<HTMLButtonElement>('.x')!.onclick = () => (root.hidden = true);
    root.querySelector<HTMLButtonElement>('.go')!.onclick = actions.onGoTo;
    root.querySelector<HTMLButtonElement>('.clr')!.onclick = actions.onClear;
    const retry = root.querySelector<HTMLButtonElement>('.retry');
    if (retry) retry.onclick = actions.onRetryForecast;
  }

  return {
    /** ตั้งตำแหน่งใหม่ (ล้างผลเดิม รอผลจาก worker) */
    setLocation(l: PickedLocation | null): void {
      loc = l;
      if (l) prompt = null;
      probe = null;
      now = null;
      forecast = 'idle';
      loading = !!l;
      render();
    },
    setProbe(p: ProbeResult | null): void {
      probe = p;
      loading = false;
      render();
    },
    /** ส่วนพยากรณ์พรุ่งนี้ + 7 วัน */
    setForecast(f: ForecastState): void {
      forecast = f;
      render();
    },
    /** ค่าจากผลการจำลองปัจจุบัน (อัปเดตเมื่อขยับแถบเลื่อน) */
    setNow(r: CellReading | null, p?: SimParams): void {
      const pChanged =
        !!p &&
        (!params ||
          p.rain !== params.rain ||
          p.dur !== params.dur ||
          p.flow !== params.flow ||
          p.tide !== params.tide);
      if (p) params = { ...p };
      const changed =
        pChanged ||
        !now ||
        !r ||
        Math.abs(now.depth - r.depth) > 1e-4 ||
        now.cause !== r.cause ||
        Math.abs(now.ground - r.ground) > 1e-4;
      now = r;
      if (changed) render();
    },
    show(): void {
      if (loc) root.hidden = false;
    },
    /** แสดงการ์ดชวน (ถ้ายังไม่มีตำแหน่ง) */
    showPrompt(a: PromptActions): void {
      if (loc) return;
      prompt = a;
      render();
    },
    /** ซ่อนการ์ดชวน (เช่นสลับกลับโหมดภาพรวม) — ไม่กระทบการ์ดผลของหมุดที่มีอยู่ */
    hidePrompt(): void {
      if (!prompt) return;
      prompt = null;
      render();
    },
    isPrompting: () => !!prompt && !loc,
  };
}
