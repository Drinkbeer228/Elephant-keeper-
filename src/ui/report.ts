import type { Report } from '../sim';
import { ICON } from './icons';

const STATUS: Record<string, string> = { ok: 'вовремя', late: 'опоздание', missed: 'пропущено' };

export function renderReport(r: Report): string {
  const stars = [1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}">${ICON.star}</span>`).join('');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const statusTag = (s: string) => `<em class="st ${s}">${STATUS[s]}</em>`;
  return `
    <div class="card poster report">
      <div class="marquee"></div>
      <p class="kicker">08:00 · сдача смены</p>
      <h1>Табель дежурства</h1>
      <div class="report-body">
      <div class="stars">${stars}</div>
      <p class="score">${r.score} из 100</p>
      <p class="phrase">${r.phrase}</p>
      <table>
        <tr><th>Туалет</th><td>${r.pees.map((p) => `<div>${p.name}: в бак <b>${p.inBucket}</b>, мимо <b>${p.missed}</b>, кал ${p.dung}</div>`).join('')}<div class="sum">В бак: ${pct(r.bucketRate)}</div></td></tr>
        <tr><th>Сухость пола</th><td>${pct(r.dryAvg)} в среднем</td></tr>
        <tr><th>Корм</th><td>${r.meals
          .map((m) => `<div><b>${m.label}</b>: ${m.statuses.map((s) => `${s.name} ${statusTag(s.status)}`).join(' ')}</div>`)
          .join('')}</td></tr>
        <tr><th>Ноги</th><td>${r.footDebt.map((f) => `${f.name}: ${f.debt}`).join(' · ')} <small>— минут на мокром; от 300 хромают</small></td></tr>
        <tr><th>Потери</th><td>${r.losses.length ? r.losses.join(', ') : 'нет'}</td></tr>
        <tr><th>Сдача</th><td>${r.checklist
          .map((c) => `<div><span class="${c.ok ? 'check' : 'cross'}">${c.ok ? ICON.check : ICON.cross}</span> ${c.label}</div>`)
          .join('')}</td></tr>
        <tr><th>Замечания</th><td>${r.remarks.length ? r.remarks.map((x) => `<div>${x}</div>`).join('') : 'нет'}</td></tr>
      </table>
      </div>
      <button class="btn primary big" data-restart>Ещё смена</button>
    </div>`;
}
