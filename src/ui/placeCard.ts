/** การ์ด "ที่นี่ท่วมไหม?" — ผลที่ตำแหน่งเดียว: ตอนนี้ + ทุกสถานการณ์ตัวอย่าง */
import { nearestDistrict } from '../data/places';
import type { ForecastDay, ForecastResult } from '../sim/forecast';
import { FLOOD_DEPTH, type CellReading, type ProbeResult } from '../sim/probe';
import { PRESETS } from '../sim/presets';
import type { PickedLocation } from './locate';
import { CAUSES, PLACE } from './strings';

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
const dateText = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Date(date + 'T00:00:00Z').toLocaleDateString('th-TH', { timeZone: 'UTC', ...o });

/** สถานะส่วนพยากรณ์ของการ์ด */
export type ForecastState = 'idle' | 'loading' | 'error' | ForecastResult | null;

function forecastHtml(fc: ForecastState): string {
  if (fc === 'idle' || fc === null) return '';
  if (fc === 'loading')
    return `<div class="fc"><div class="k">${PLACE.fcTitle}</div><div class="loading">${PLACE.fcLoading}</div></div>`;
  if (fc === 'error')
    return `<div class="fc"><div class="k">${PLACE.fcTitle}</div><div class="err"><span>${PLACE.fcError}</span><button type="button" class="retry">${PLACE.fcRetry}</button></div></div>`;
  const [tm, ...rest] = fc.days;
  if (!tm) return '';
  const need =
    tm.rainNeeded === 0
      ? PLACE.fcNeedExt
      : tm.rainNeeded == null
        ? PLACE.fcNeedNone
        : PLACE.fcNeed(tm.rainNeeded);
  const depth =
    tm.depthP90 > FLOOD_DEPTH ? `<div class="in">${PLACE.fcDepth(PLACE.cm(tm.depthP90))}</div>` : '';
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
      );
      return `<li title="${title}"><span>${dateText(d.date, { weekday: 'short' })}</span><span class="cb"><i style="height:${rp}%"></i></span><b>${rp}%</b><small class="lvl-${level(d.chance)}">${PLACE.fcFloodShort(p)}</small></li>`;
    })
    .join('');
  const fetched = new Date(fc.fetched).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `<div class="fc">
      <div class="k">${PLACE.fcTitle}</div>
      <div class="tm lvl-${level(tm.chance)}" title="${PLACE.fcChanceHint(tm.members)}">
        <div class="pc">${pctOf(tm)}%</div><div class="lv">${PLACE.fcLevels[level(tm.chance)]} ${causeChip(tm.cause)}</div>
        <div class="tl">${PLACE.fcTomorrow(dateText(tm.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</div>
      </div>
      <div class="rn">${PLACE.fcRain(pct(tm.rainChance), pct(tm.heavyChance), tm.totalMed, tm.totalMax)}</div>
      ${depth}
      <div class="in">${PLACE.fcInputs(tm.rainMax, tm.tide, tm.flow)}</div>
      <div class="need">${need}</div>
      ${days ? `<ol>${days}</ol><div class="in hint">${PLACE.fcStripHint}</div>` : ''}
      <p class="fine">${PLACE.fcFetched(fetched)} · ${PLACE.fcSource}<br>${PLACE.fcNote}</p>
    </div>`;
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
  let forecast: ForecastState = 'idle';
  /** การ์ดชวน (ยังไม่มีตำแหน่ง) — แสดงเมื่อเปิดโหมดพื้นที่ศึกษาครั้งแรก */
  let prompt: PromptActions | null = null;

  function renderPrompt(a: PromptActions): void {
    root.hidden = false;
    root.innerHTML = `
      <div class="head"><b>${PLACE.title}</b><button class="x" type="button" aria-label="${PLACE.close}">×</button></div>
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
    const meta = [
      PLACE.near(nearestDistrict(loc.lat, loc.lon)),
      `${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`,
      loc.source === 'gps' ? PLACE.sourceGps(loc.accuracy ?? 0) : PLACE.sourcePin,
      probe ? (probe.grid === 'study' ? PLACE.dataStudy : PLACE.dataOverview) : '',
    ].filter(Boolean);
    const land = probe && probe.kind === 0;
    const nowHtml =
      now && land
        ? `<div class="now"><div class="k">${PLACE.now}</div><div class="v ${now.depth > FLOOD_DEPTH ? 'wet' : ''}">${depthText(now)}</div>${causeChip(now.cause)}
           <div class="g">${PLACE.ground} ${now.ground.toFixed(2)} ม.</div></div>`
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
      <div class="head"><b>${PLACE.title}</b><button class="x" type="button" aria-label="${PLACE.close}">×</button></div>
      <div class="meta">${meta.map((m) => `<div>${m}</div>`).join('')}</div>
      ${special ? `<div class="note">${special}</div>` : ''}
      ${nowHtml}
      ${land ? forecastHtml(forecast) : ''}
      ${loading ? `<div class="loading">${PLACE.probing}</div>` : ''}
      ${rows ? `<table><thead><tr><th>${PLACE.colScenario}</th><th>${PLACE.colDepth}</th><th>${PLACE.colCause}</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${summary ? `<p class="sum">${summary}</p>` : ''}
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
    setNow(r: CellReading | null): void {
      const changed =
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
