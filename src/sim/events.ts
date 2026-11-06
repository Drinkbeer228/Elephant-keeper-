// Журнал смены и поток событий для интерфейса и звука.
// Журнал — часть состояния (сохраняется), поток событий — только на текущий шаг.

import type { Severity, SimEvent, State } from './types';

export const JOURNAL_LIMIT = 400;

let pending: SimEvent[] = [];

export function emitEvent(ev: SimEvent): void {
  pending.push(ev);
  if (pending.length > 500) pending = pending.slice(-500);
}

export function drainEvents(): SimEvent[] {
  const out = pending;
  pending = [];
  return out;
}

export interface LogOptions {
  key?: string; // одинаковые записи с одним ключом не чаще, чем раз в cooldown минут
  cooldown?: number;
  elephantId?: string | null;
  x?: number;
  y?: number;
  kind?: string; // тип события для звука и эффектов
  silent?: boolean; // только в журнал, без всплывающего уведомления
}

export function log(s: State, severity: Severity, text: string, opts: LogOptions = {}): void {
  const key = opts.key ?? text;
  const cooldown = opts.cooldown ?? 0;
  if (cooldown > 0) {
    for (let i = s.journal.length - 1; i >= 0; i--) {
      const j = s.journal[i];
      if (s.t - j.t > cooldown) break;
      if (j.key === key) return;
    }
  }
  s.journal.push({ id: s.nextId++, t: s.t, severity, text, elephantId: opts.elephantId ?? null, key });
  if (s.journal.length > JOURNAL_LIMIT) s.journal.splice(0, s.journal.length - JOURNAL_LIMIT);
  emitEvent({
    kind: opts.kind ?? (opts.silent ? 'journal' : 'note'),
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    elephantId: opts.elephantId ?? null,
    severity: opts.silent ? 'info' : severity,
    text: opts.silent ? '' : text,
  });
}

// Событие без записи в журнал: звук, частицы, анимация
export function fx(kind: string, x: number, y: number, elephantId: string | null = null): void {
  emitEvent({ kind, x, y, elephantId, severity: 'info', text: '' });
}
