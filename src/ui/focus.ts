// Главная цель и главное действие — то, к чему относится единственная подсказка на экране.
// Симуляция уже расставила цели по «намерению» (sim/keeper/targets.ts); здесь — время:
//   • пока кипер стоит, цель не меняется: мир вокруг живёт, но подсказка не скачет. Исключения —
//     цель пропала, ушла из-под руки или у другой цели появилось срочное дело;
//   • на ходу подсказка не перескакивает на всё, мимо чего идёшь: цель появляется, только
//     продержавшись лучшей треть секунды, а слониха, до которой не дотянуться, на ходу целью не
//     становится вовсе (кроме срочного — окликнуть ту, к которой подходишь сзади). Остановился —
//     цель перед тобой появляется сразу;
//   • поворот на месте меняет цель быстро — так игрок целится;
//   • игрок может выбрать цель сам («следующая цель», касание по объекту) — она закреплена,
//     пока он не отойдёт;
//   • стоя, подсказка сама не меняется чаще раза в секунду — её успевают прочесть;
//   • главное действие тоже держится: небольшие колебания важности его не меняют, а после
//     своего действия или законченной работы оно выбирается заново — шаги идут подряд;
//   • если подсказка сменилась сама за мгновение до нажатия, выполняется то, что игрок видел.
// Время приходит снаружи (мс), DOM здесь нет — модуль проверяется тестами.

import type { ActionOption, InteractionTarget } from '../sim';

export const FOCUS_T = {
  moveDwell: 120, // мс: игрок поворачивается или только что остановился — новая цель должна продержаться лучшей столько
  travelDwell: 300, // мс: кипер идёт — столько; мимо чего проходишь, то подсказкой не мелькает
  movingFor: 120, // мс после последнего шага считаем, что кипер ещё идёт
  callout: 90, // с такой важности просьба делает слониху целью и на ходу (окликнуть, «нельзя», похвалить)
  idleDwell: 600, // мс: стоя — столько ждём, прежде чем отпустить ушедшую цель или уступить срочной
  activeFor: 250, // мс после последнего шага или поворота считаем, что игрок ещё «ведёт»
  stickyMul: 0.8, // текущая цель «ближе»: её расстояние × это…
  stickyAdd: 0.2, // …и минус это, м
  urgent: 100, // важность действия, с которой цель считается срочной
  mainDwell: 300, // мс: стоя — столько более важное действие должно продержаться, чтобы стать главным
  mainMargin: 15, // и быть важнее хотя бы на столько
  minHold: 900, // мс: стоя — подсказка сама не меняется чаще: её успевают прочесть (пропавшее действие — исключение)
  pressBuffer: 180, // мс: нажатие сразу после самопроизвольной смены подсказки относится к прежней
  debounce: 150, // мс: пауза после своего действия — от двойного нажатия
  settle: 250, // мс после своего действия: главное выбирается заново, смена подсказки — «своя»
  pinRelease: 1.2, // м: на столько отошёл от места, где выбрал цель, — закрепление снято
  pinLost: 1000, // мс: столько ждём закреплённую цель, если она пропала
  moveEps: 0.01, // м за кадр — кипер идёт
  turnEps: 0.02, // рад за кадр — кипер поворачивается
} as const;

export interface FocusView {
  target: InteractionTarget | null;
  main: ActionOption | null;
  more: number; // сколько ещё действий у этой цели
  others: number; // сколько ещё целей рядом
  pinned: boolean; // цель выбрана игроком
  seq: number; // растёт при каждой смене цели
}

export interface Pose {
  x: number;
  y: number;
  facing: number;
}

function turn(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class FocusTracker {
  private key: string | null = null;
  private pending: { key: string | null; since: number } | null = null;
  private pinned: { key: string; x: number; y: number; lostAt: number | null } | null = null;
  private mainId: string | null = null;
  private pendingMain: { id: string; since: number } | null = null;
  private last: Pose | null = null;
  private activeAt = -1e9; // когда игрок последний раз шагнул или повернулся
  private movedAt = -1e9; // когда кипер последний раз сдвинулся
  private lostAt: number | null = null; // с какого момента текущая цель «не под рукой»
  private standKey: string | null = null; // цель, которая была у кипера, когда он стоял: к ней он, возможно, и идёт
  private wasBusy = false;
  private busy = false;
  private targets: InteractionTarget[] = [];
  private seq = 0;
  private freshUntil = -1e9; // до этого момента главное действие — просто лучшее
  private ownUntil = -1e9; // до этого момента смена подсказки вызвана самим игроком
  private guardUntil = -1e9;
  private changedAt = -1e9; // когда подсказка менялась в последний раз
  // Что показано и что было показано до самопроизвольной смены
  private shown: { id: string | null; prev: string | null; at: number; buffered: boolean } = { id: null, prev: null, at: -1e9, buffered: false };
  view: FocusView = { target: null, main: null, more: 0, others: 0, pinned: false, seq: 0 };

  reset(): void {
    this.key = null;
    this.pending = null;
    this.pinned = null;
    this.mainId = null;
    this.pendingMain = null;
    this.last = null;
    this.activeAt = this.movedAt = -1e9;
    this.lostAt = null;
    this.standKey = null;
    this.wasBusy = false;
    this.busy = false;
    this.targets = [];
    this.freshUntil = this.ownUntil = this.guardUntil = this.changedAt = -1e9;
    this.shown = { id: null, prev: null, at: -1e9, buffered: false };
    this.view = { target: null, main: null, more: 0, others: 0, pinned: false, seq: ++this.seq };
  }

  private setKey(key: string | null): void {
    if (key === this.key) return;
    this.key = key;
    this.lostAt = null;
    this.seq++;
    this.mainId = null;
    this.pendingMain = null;
  }

  // Каждый кадр: цели от симуляции, время, где кипер и занят ли он работой
  update(targets: InteractionTarget[], now: number, pose: Pose, busy = false): FocusView {
    this.targets = targets;
    this.busy = busy;
    const prev = this.last;
    if (prev && Math.hypot(pose.x - prev.x, pose.y - prev.y) > FOCUS_T.moveEps) this.movedAt = this.activeAt = now;
    else if (prev && Math.abs(turn(prev.facing, pose.facing)) > FOCUS_T.turnEps) this.activeAt = now;
    this.last = { x: pose.x, y: pose.y, facing: pose.facing };
    const active = now - this.activeAt <= FOCUS_T.activeFor;
    const moving = now - this.movedAt <= FOCUS_T.movingFor;
    if (busy) {
      this.wasBusy = true;
      this.pending = null;
      this.pendingMain = null;
      return (this.view = { target: null, main: null, more: 0, others: targets.length, pinned: this.pinned !== null, seq: this.seq });
    }
    if (this.wasBusy) {
      this.wasBusy = false;
      this.freshUntil = this.ownUntil = now + FOCUS_T.settle;
    }
    const find = (key: string | null): InteractionTarget | undefined => (key === null ? undefined : targets.find((t) => t.key === key));
    // Игрок стоит и ничего не делал, а подсказка только что менялась — пусть её дочитают
    const hold = !active && now > this.ownUntil && now - this.changedAt < FOCUS_T.minHold;

    // Цель выбрана игроком: держим, пока он рядом и пока она есть
    if (this.pinned) {
      const p = this.pinned;
      if (Math.hypot(pose.x - p.x, pose.y - p.y) > FOCUS_T.pinRelease) this.pinned = null;
      else if (find(p.key)) p.lostAt = null;
      else {
        if (p.lostAt === null) p.lostAt = now;
        if (now - p.lostAt > FOCUS_T.pinLost) this.pinned = null;
      }
    }

    if (!this.pinned) {
      // Может ли цель быть главной сейчас. На ходу — только то, до чего дотягиваешься, срочное
      // и та цель, что была у кипера, пока он стоял (к ней он, возможно, и идёт)
      if (!moving) this.standKey = this.key;
      const fits = (t: InteractionTarget): boolean => t.auto && (!moving || t.contact || t.top >= FOCUS_T.callout || t.key === this.standKey);

      // 1. Текущая цель: пропала — отпускаем сразу; ушла из-под руки (далеко, за спиной) — после паузы
      let cur = find(this.key);
      if (this.key !== null && !cur) this.setKey(null);
      else if (cur && !fits(cur)) {
        if (this.lostAt === null) this.lostAt = now;
        if (now - this.lostAt >= (active ? FOCUS_T.moveDwell : FOCUS_T.idleDwell) && !hold) {
          this.setKey(null);
          cur = undefined;
        }
      } else this.lostAt = null;

      // 2. Кто лучший. Текущая цель «липкая»: чуть лучшая её не перебивает
      let best: InteractionTarget | null = null;
      let bestScore = Infinity;
      for (const t of targets) {
        if (!fits(t)) continue;
        const sc = t.key === this.key ? t.score * FOCUS_T.stickyMul - FOCUS_T.stickyAdd : t.score;
        if (sc < bestScore) {
          bestScore = sc;
          best = t;
        }
      }

      // 3. Сколько лучший должен продержаться, чтобы стать целью
      if (!best || best.key === this.key) this.pending = null;
      else {
        let dwell: number | null = null;
        if (moving) dwell = FOCUS_T.travelDwell;
        else if (this.key === null) dwell = 0;
        else if (active) dwell = FOCUS_T.moveDwell;
        else if (cur && best.top >= FOCUS_T.urgent && cur.top < FOCUS_T.urgent) dwell = FOCUS_T.idleDwell;
        if (dwell === null) this.pending = null;
        else {
          if (!this.pending || this.pending.key !== best.key) this.pending = { key: best.key, since: now };
          if (now - this.pending.since >= dwell && !(hold && this.key !== null)) {
            this.pending = null;
            this.setKey(best.key);
          }
        }
      }
    }

    const target = find(this.key) ?? null;
    let main: ActionOption | null = null;
    if (target) {
      const best = target.options[0];
      const cur = now <= this.freshUntil || this.mainId === null ? undefined : target.options.find((o) => o.id === this.mainId);
      if (!cur) main = best;
      else if (!cur.enabled && best.enabled) main = best;
      else if (best.id !== cur.id && best.enabled === cur.enabled && best.priority - cur.priority > FOCUS_T.mainMargin) {
        if (!this.pendingMain || this.pendingMain.id !== best.id) this.pendingMain = { id: best.id, since: now };
        main = now - this.pendingMain.since >= (active ? FOCUS_T.moveDwell : FOCUS_T.mainDwell) && !hold ? best : cur;
      } else {
        this.pendingMain = null;
        main = cur;
      }
      if (main !== cur) this.pendingMain = null;
    }

    // Что теперь показано. Смена «сама по себе» (игрок стоит и ничего не делал) открывает окно,
    // в котором нажатие ещё относится к прежней подсказке
    const id = main ? main.id : null;
    if (id !== this.shown.id) {
      if (active || now <= this.ownUntil) this.shown.buffered = false;
      else {
        const open = this.shown.buffered && now - this.shown.at < FOCUS_T.pressBuffer;
        if (!open) {
          this.shown.prev = this.shown.id;
          this.shown.at = now;
        }
        this.shown.buffered = true;
      }
      this.shown.id = id;
      this.changedAt = now;
    }
    this.mainId = id;
    return (this.view = {
      target,
      main,
      more: target ? target.options.length - 1 : 0,
      others: targets.length - (target ? 1 : 0),
      pinned: this.pinned !== null,
      seq: this.seq,
    });
  }

  private option(id: string): ActionOption | null {
    for (const t of this.targets) for (const o of t.options) if (o.id === id) return o;
    return null;
  }

  // Что выполнилось бы по нажатию прямо сейчас (null — ничего). Ничего не меняет: кнопка на
  // экране спрашивает это в момент касания и запоминает — пока палец на ней, подсказка может смениться
  peek(now: number): ActionOption | null {
    if (this.busy || now < this.guardUntil) return null;
    if (this.shown.buffered && now - this.shown.at < FOCUS_T.pressBuffer) {
      const o = this.shown.prev ? this.option(this.shown.prev) : null;
      return o && o.enabled ? o : null;
    }
    return this.view.main;
  }

  // Нажата клавиша «главное действие»: что выполнить (null — ничего)
  press(now: number): ActionOption | null {
    const o = this.peek(now);
    if (o) this.acted(now);
    return o;
  }

  // Палец отпущен: выполнить то, что кнопка запомнила при касании, — если оно ещё есть
  commit(id: string | null, now: number): ActionOption | null {
    if (this.busy || id === null) return null;
    const o = this.option(id);
    if (o) this.acted(now);
    return o;
  }

  // Игрок только что что-то сделал (в том числе выбрал действие из списка)
  acted(now: number): void {
    this.guardUntil = now + FOCUS_T.debounce;
    this.freshUntil = this.ownUntil = now + FOCUS_T.settle;
  }

  private setPinned(key: string, now: number): void {
    const p = this.last ?? { x: 0, y: 0, facing: 0 };
    this.pinned = { key, x: p.x, y: p.y, lostAt: null };
    this.pending = null;
    this.setKey(key);
    this.freshUntil = this.ownUntil = now + FOCUS_T.settle;
  }

  // «Следующая цель»: перебирает всё, что рядом, — сначала то, что ближе к намерению
  cycle(now: number, dir: 1 | -1 = 1): void {
    if (this.busy) return;
    const list = this.targets.slice().sort((a, b) => Number(b.auto) - Number(a.auto) || a.score - b.score);
    if (!list.length) return;
    const i = list.findIndex((t) => t.key === this.key);
    const next = i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
    this.setPinned(next.key, now);
  }

  // Выбрать цель по ключу (касание по объекту). false — такой цели рядом нет
  pin(key: string, now: number): boolean {
    if (this.busy || !this.targets.some((t) => t.key === key)) return false;
    this.setPinned(key, now);
    return true;
  }
}
