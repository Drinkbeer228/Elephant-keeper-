// Короткие задания стажировки, которые открываются по ссылке `?scenario=<id>` (docs/TRAINING-SCENARIOS.md).
// Каждое задание — одна механика смены; засчитывается по событиям симуляции, которые даёт только работа кипера
// (src/sim/keeper/*). Ссылки ведут сюда из книг «Живой библиотеки» и со станции (маршрут `#/sim?scenario=`).

import type { SimEvent } from '../sim';

export interface Scenario {
  id: string;
  title: string;
  /** Что сделать, одной строкой для плашки задания. */
  task: string;
  /** Событие работы кипера и сколько раз оно нужно. */
  event: string;
  count: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'prep', title: 'Кормокухня', task: 'Нарежьте овощи и соберите таз рациона для слона.', event: 'prepDone', count: 1 },
  { id: 'feeding', title: 'Раздача сена', task: 'Заложите сено в кормушки слонов.', event: 'hay', count: 2 },
  { id: 'porridge', title: 'Каша', task: 'Запарьте кашу и накормите ею двух слонов.', event: 'porridgeServed', count: 2 },
  { id: 'cleaning', title: 'Уборка навоза', task: 'Уберите навоз лопатой в тачку.', event: 'shovel', count: 4 },
  { id: 'bedding', title: 'Подстилка', task: 'Разровняйте граблями свежую подстилку.', event: 'rake', count: 3 },
  { id: 'washing', title: 'Мойка шлангом', task: 'Помойте шлангом пол, поилки или слона.', event: 'spray', count: 5 },
  { id: 'care', title: 'Уход за кожей и ногами', task: 'Почистите щёткой кожу или ноги слона.', event: 'brush', count: 4 },
  { id: 'trust', title: 'Доверие', task: 'Подойдите к слону спокойно и заслужите его доверие.', event: 'heart', count: 2 },
];

const ID = /^[a-z][a-z0-9-]{0,31}$/;

export function scenarioById(id: string | null): Scenario | null {
  if (!id || !ID.test(id)) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/** Счётчик задания: сколько сделано и выполнено ли. */
export class ScenarioRun {
  done = 0;
  constructor(readonly scenario: Scenario) {}

  get complete(): boolean {
    return this.done >= this.scenario.count;
  }

  /** Учитывает события шага. Возвращает true, когда задание только что выполнено. */
  push(events: readonly SimEvent[]): boolean {
    if (this.complete) return false;
    for (const ev of events) if (ev.kind === this.scenario.event) this.done++;
    return this.complete;
  }
}
