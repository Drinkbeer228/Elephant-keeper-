import type { Report } from '../sim';

const STATUS: Record<string, string> = { ok: 'вовремя', late: 'опоздание', missed: 'пропущено' };

export function renderReport(r: Report): string {
  const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return `
    <div class="card report">
      <h1>Смена сдана <span class="stars">${stars}</span></h1>
      <p class="phrase">${r.phrase}</p>
      <p class="score">${r.score} из 100</p>
      <table>
        <tr><th>Туалет</th><td>${r.pees.map((p) => `${p.name}: в бак ${p.inBucket}, мимо ${p.missed}, кал ${p.dung}`).join('<br>')}<br><b>В бак: ${pct(r.bucketRate)}</b></td></tr>
        <tr><th>Сухость пола</th><td>${pct(r.dryAvg)} в среднем</td></tr>
        <tr><th>Корм</th><td>${r.meals
          .map((m) => `${m.label}: ${m.statuses.map((s) => `${s.name} — ${STATUS[s.status]}`).join(', ')}`)
          .join('<br>')}</td></tr>
        <tr><th>Ноги</th><td>${r.footDebt.map((f) => `${f.name}: ${f.debt}`).join(', ')} <small>(долг ног: больше — хуже)</small></td></tr>
        <tr><th>Потери</th><td>${r.losses.length ? r.losses.join(', ') : 'нет'}</td></tr>
        <tr><th>Приём</th><td>Найдено косяков сменщика: ${r.acceptance.found} из ${r.acceptance.defects}${
          r.acceptance.missed.length ? `<br>Пропустил: ${r.acceptance.missed.join(', ')}` : ''
        }${r.acceptance.nitpicks.length ? `<br>Придрался зря: ${r.acceptance.nitpicks.join(', ')}` : ''}</td></tr>
        <tr><th>Замечания при сдаче</th><td>${r.remarks.length ? r.remarks.join('<br>') : 'нет'}</td></tr>
        ${r.begTreats ? `<tr><th>Лакомства просто так</th><td>${r.begTreats}</td></tr>` : ''}
      </table>
      <button class="btn primary" data-restart>Ещё смена</button>
    </div>`;
}
