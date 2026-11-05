import { WHY, type WhyKey } from '../data/why';
import { ELEPHANTS } from '../data/elephants';
import { displayTemperamentOf, type State } from '../sim';
import { ICON, portraitIcon } from './icons';

const WHY_BY_CHECK: Record<string, WhyKey> = {
  gate: 'gateOpen',
  paddockClear: 'itemBroken',
  standing: 'missedPee',
  water: 'troughOverflow',
  hay: 'sway',
  basins: 'basinCrushed',
  dryBedding: 'wetFloor',
  dungCleared: 'dung',
};

const WHY_BY_REMARK: Record<string, WhyKey> = {
  'Мухи и вонь': 'wetFloor',
  'Слонихи лежали в мокром': 'lieInWet',
  'Слоны лежали в мокром': 'lieInWet',
  'Груз не принят': 'supplyMissed',
};

export function renderReport(
  root: HTMLElement,
  state: State,
  onRestart: () => void,
  onWhy: (k: WhyKey) => void,
): void {
  const r = state.report!;
  const stars = [1, 2, 3]
    .map((i) => `<span style="opacity:${i <= r.stars ? 1 : 0.22}">${ICON.star}</span>`)
    .join('');

  const checksHtml = r.checklist
    .map((c) => {
      const w = !c.ok ? WHY_BY_CHECK[c.id] : undefined;
      return `<li class="checklist-item ${c.ok ? 'ok' : 'fail'}">
        <span class="ico">${c.ok ? ICON.check : ICON.cross}</span>
        <span style="flex:1">${c.label}</span>
        ${w ? `<button class="why-btn" data-why="${w}">Почему?</button>` : ''}
      </li>`;
    })
    .join('');

  const remarksHtml = r.remarks.length
    ? r.remarks
        .map((m) => {
          const w = WHY_BY_REMARK[m];
          return `<div class="log-entry bad" style="margin-bottom:4px">
            <span>• ${m}</span>
            ${w ? `<button class="why-btn" data-why="${w}">Почему?</button>` : ''}
          </div>`;
        })
        .join('')
    : '<div class="log-entry good"><span>Замечаний от сменщика нет — идеальная дисциплина.</span></div>';

  const statusBadge = (st: 'ok' | 'late' | 'missed') =>
    st === 'ok'
      ? '<span class="status-ok">Вовремя</span>'
      : st === 'late'
        ? '<span class="status-late">Поздно</span>'
        : '<span class="status-bad">Пропуск</span>';

  const elephantRows = state.elephants
    .map((e, idx) => {
      const prof = ELEPHANTS.find((p) => p.id === e.id)!;
      const pee = r.pees[idx] ?? { name: prof.name, inBucket: e.tally.inBucket, missed: e.tally.missed, dung: e.tally.dung };
      const foot = r.footDebt[idx] ?? { name: prof.name, debt: Math.round(e.footDebt - e.footDebtStart) };
      const k1 = r.meals[0]?.statuses[idx]?.status ?? 'missed';
      const k2 = r.meals[1]?.statuses[idx]?.status ?? 'missed';
      const dn = r.meals[2]?.statuses[idx]?.status ?? 'missed';
      const temp = displayTemperamentOf(prof).name;
      const zone = prof.paddock === 'female' ? 'Верхний' : 'Нижний (Димон)';
      const bucketTotal = pee.inBucket + pee.missed;
      const bucketCls = pee.missed === 0 ? 'status-ok' : pee.inBucket >= pee.missed ? 'status-late' : 'status-bad';

      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <img src="${portraitIcon(e.id)}" alt="" style="width:22px;height:22px;background:#2c2520;border:1px solid #463c32" />
            <div>
              <b>${prof.name}</b>
              <div style="font-size:10px;color:#988b7a">${zone} • ${temp}</div>
            </div>
          </div>
        </td>
        <td class="${bucketCls}">${pee.inBucket} / ${bucketTotal}</td>
        <td>${pee.dung}</td>
        <td>${statusBadge(k1)}</td>
        <td>${statusBadge(k2)}</td>
        <td>${statusBadge(dn)}</td>
        <td class="${foot.debt >= 100 ? 'status-bad' : foot.debt > 35 ? 'status-late' : 'status-ok'}">
          +${foot.debt}
        </td>
      </tr>`;
    })
    .join('');

  root.innerHTML = `<div class="modal-overlay">
    <div class="modal-card wide">
      <div class="modal-header">
        <div>
          <div class="modal-kicker">08:00 • Акт приёма-передачи суточного дежурства</div>
          <h2 class="modal-title">Смена сдана сменщику</h2>
          <p class="modal-subtitle">«${r.phrase}»</p>
        </div>
        <div style="text-align:right">
          <div class="report-stars">${stars}</div>
          <div class="report-score-num">${r.score} / 100</div>
        </div>
      </div>

      <div class="report-summary-banner">
        <div>
          <div style="font-size:11px;color:#988b7a">Сухость подстилки за сутки</div>
          <b style="font-size:15px;color:${r.dryAvg >= 0.8 ? '#58d854' : '#f85840'}">${Math.round(r.dryAvg * 100)}%</b>
          ${r.dryAvg < 0.85 ? `<button class="why-btn" data-why="wetFloor" style="margin-left:6px">Почему?</button>` : ''}
        </div>
        <div>
          <div style="font-size:11px;color:#988b7a">Чек-лист обхода</div>
          <b style="font-size:15px">${r.checklist.filter((c) => c.ok).length} / ${r.checklist.length} пунктов</b>
        </div>
        <div>
          <div style="font-size:11px;color:#988b7a">Сломано / Потеряно</div>
          <b style="font-size:15px;color:${r.losses.length ? '#f85840' : '#58d854'}">${r.losses.length ? r.losses.join(', ') : 'Без потерь'}</b>
          ${r.losses.length ? `<button class="why-btn" data-why="itemBroken" style="margin-left:6px">Почему?</button>` : ''}
        </div>
      </div>

      <div class="report-grid-2col">
        <div>
          <h3 class="drawer-title" style="margin-bottom:6px">Обход сменщика (нажми ✓, чтобы придраться)</h3>
          <ul class="checklist-list">${checksHtml}</ul>
        </div>
        <div>
          <h3 class="drawer-title" style="margin-bottom:6px">Замечания по журналу смены</h3>
          ${remarksHtml}
          <div id="why-box-report" class="frame" style="margin-top:10px;padding:10px;display:none;border-color:#f8b800"></div>
        </div>
      </div>

      <h3 class="drawer-title" style="margin-bottom:6px">Сводная ведомость по поголовью (6 слонов)</h3>
      <div style="overflow-x:auto;margin-bottom:14px">
        <table class="report-table">
          <thead>
            <tr>
              <th>Слон</th>
              <th>В бак</th>
              <th>Куч</th>
              <th>Каша 13:00</th>
              <th>Каша 17:00</th>
              <th>Ужин 19:00</th>
              <th>Нагрузка ног</th>
            </tr>
          </thead>
          <tbody>${elephantRows}</tbody>
        </table>
      </div>

      <div class="title-cta-row">
        <span style="font-size:11px;color:#988b7a">Совет: все 10 пунктов чек-листа можно отслеживать прямо во время смены по кнопке <b>Регламент [J]</b>.</span>
        <button class="primary cta-big" data-restart="true">Заступить на новую смену</button>
      </div>
    </div>
  </div>`;

  root.querySelectorAll<HTMLElement>('[data-why]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.why as WhyKey;
      const box = root.querySelector<HTMLElement>('#why-box-report');
      if (box && WHY[key]) {
        box.style.display = 'block';
        box.innerHTML = `<b style="color:#f8b800">Зоотехника и уход:</b> ${WHY[key]}`;
      } else {
        onWhy(key);
      }
    }),
  );

  root.querySelector('[data-restart]')?.addEventListener('click', onRestart);
}
