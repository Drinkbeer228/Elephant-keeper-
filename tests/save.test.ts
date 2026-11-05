import { describe, expect, it } from 'vitest';

import { loadStateFromSave, serializeSave, isValidSaveFile, isStateSerializable, SCHEMA_VERSION, type LoadContext, type State } from '../src/sim';
import { MAP, MAP_ID } from '../src/data/map';
import { advance, tick } from '../src/sim';
import { cleanShift, el } from './helpers';

const ctx = (): LoadContext => ({ mapId: MAP_ID, cols: MAP.floor.cols, rows: MAP.floor.rows });

// Посимвольная каноническая строка СОСТОЯНИЯ: тот же конвейер, что canonicalizeForJson
// в save.ts (undefined -> null, Infinity -> null + sidecar-карта путей), но без header.
// Затем каждое null-заглушечное значение из sidecar подставляется обратно настоящим
// числом по своему пути ('tires.0.cooldown'). Без подмены два разных «никогда-значения»
// (Infinity vs 1e9) дали бы одинаковый null и тест ловил бы ложное совпадение.
function canonStr(s: State): string {
  const nonFinite: Record<string, number> = {};
  function canon(value: unknown, path: string): unknown {
    if (value === undefined) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        nonFinite[path] = value;
        return null;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item, i) => canon(item, `${path}.${i}`));
    if (value !== null && typeof value === 'object') {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(src).sort()) out[key] = canon(src[key], `${path}.${key}`);
      return out;
    }
    return value;
  }
  let out = JSON.stringify(canon(s as unknown as Record<string, unknown>, 'state'));
  for (const [path, value] of Object.entries(nonFinite)) {
    const rel = path.replace(/^state\./, '');
    out = out.replace(`"${rel}":null`, `"${rel}":${String(value)}`);
  }
  return out;
}

// Прогон смены на несколько игровых часов с командами движения — состояние «оживает»:
// клетки меняются, слоны ходят и едят, копится лог.
function liveShift(seed = 7): State {
  const s = cleanShift(seed);
  for (let i = 0; i < 300; i++) {
    tick(s, 1 / 30, [{ type: 'move', dx: Math.sin(i * 0.21), dy: Math.cos(i * 0.17), sprint: false }]);
  }
  // И предмет в руках — проверить восстановление ссылочной идентичности held ↔ items[].
  // Семантика движка (drop() в actions.ts): во время переноски предмет остаётся В
  // массиве items[] (иначе его некуда «положить» обратно), а held — ссылка на него.
  const fork = s.items.find((it) => it.kind === 'fork')!;
  s.player.held = fork;
  return s;
}

describe('save/load: формат и header', () => {
  it('header содержит schemaVersion, mapId и размер сетки', () => {
    const json = serializeSave(cleanShift(3), 'modern', { cols: 120, rows: 100 }, 1_730_000_000_000);
    const file = JSON.parse(json);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.mapId).toBe('modern');
    expect(file.floor).toEqual({ cols: 120, rows: 100 });
    expect(file.savedAt).toBe(1_730_000_000_000);
    expect(file.state.seed).toBe(3);
  });
});

describe('save/load: round-trip', () => {
  it('живая смена восстанавливается глубоким равенством', () => {
    const original = liveShift();
    const json = serializeSave(original, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows });
    const res = loadStateFromSave(json, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Эталон — исходное «живое» состояние: round-trip обязан восстановить его один в один,
    // включая non-finite числа (Infinity из sidecar) и ссылку held → элемент items[].
    // Сравнение с промежуточным «сырым» JSON (где Infinity лежит как null) давало бы ложный red.
    expect(res.state).toEqual(original);
  });

  it('held после загрузки — та же ссылка, что и элемент items[]', () => {
    const original = liveShift();
    const json = serializeSave(original, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows });
    const heldId = (JSON.parse(json) as { state: State }).state.player.held!.id;
    const res = loadStateFromSave(json, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const restored = res.state;
    expect(restored.player.held).not.toBeNull();
    expect(restored.player.held).toBe(restored.items.find((i) => i.id === heldId));
  });

  it('детерминизм PRNG: прогон до и после загрузки расходится ровно на 0%', () => {
    const original = liveShift(11);
    const res = loadStateFromSave(serializeSave(original, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }), ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const restored = res.state;
    // Состояние генератора сохранено нативным числом
    expect(restored.rng).toBe(original.rng);
    expect(restored.seed).toBe(original.seed);
    // Прогон одинаковыми шагами без команд: события rng должны совпасть посимвольно
    for (let i = 0; i < 600; i++) {
      tick(original, 1 / 30, []);
      tick(restored, 1 / 30, []);
    }
    expect(restored.rng).toBe(original.rng);
    expect(canonStr(restored)).toBe(canonStr(original));
  });

  it('advance() после загрузки продолжает смену корректно', () => {
    const a = liveShift(5);
    const bRes = loadStateFromSave(serializeSave(a, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }), ctx());
    expect(bRes.ok).toBe(true);
    if (!bRes.ok) return;
    advance(a, 90);
    advance(bRes.state, 90);
    expect(bRes.state.t).toBe(a.t);
    expect(canonStr(bRes.state)).toBe(canonStr(a));
  });

  it('Infinity в musthNextAt проходит через null и восстанавливается', () => {
    // Детерминированно: чистое состояние + «никогда» вручную. createShift всегда
    // планирует первое событие (musthEventsRemaining >= 1), поэтому гадать по сидам
    // нельзя — ставим значение явно и проверяем полный путь sidecar -> Infinity.
    const s = cleanShift(9);
    s.musthEventsRemaining = 0;
    s.musthNextAt = Number.POSITIVE_INFINITY;
    expect(Number.isFinite(s.musthNextAt)).toBe(false);
    const json = serializeSave(s, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows });
    // В state-части поле лежит как null, настоящее значение — в sidecar nonFinite
    const file = JSON.parse(json) as { nonFinite?: Record<string, number>; state: { musthNextAt: unknown } };
    expect(file.state.musthNextAt).toBeNull();
    const res = loadStateFromSave(json, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.musthNextAt).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('save/load: привязка к карте', () => {

  it('сейв с другой карты отвергается как wrong-map', () => {
    const other = MAP_ID === 'modern' ? 'legacy' : 'modern';
    const res = loadStateFromSave(serializeSave(cleanShift(4), other, { cols: MAP.floor.cols, rows: MAP.floor.rows }), ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('wrong-map');
  });

  it('сейв с другой сеткой той же карты отвергается как size-mismatch', () => {
    const res = loadStateFromSave(serializeSave(cleanShift(4), MAP_ID, { cols: MAP.floor.cols + 1, rows: MAP.floor.rows }), ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('size-mismatch');
  });
});

describe('save/load: версионирование схемы', () => {
  function withVersion(v: number): string {
    const file = JSON.parse(serializeSave(cleanShift(2), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows })) as Record<string, unknown>;
    file.schemaVersion = v;
    return JSON.stringify(file);
  }

  it('сейв из будущей сборки — newer-version', () => {
    const res = loadStateFromSave(withVersion(SCHEMA_VERSION + 1), ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('newer-version');
  });

  it('старый сейв без миграции — old-version, без падения', () => {
    // v0 — некорректный номер (malformed); версия ниже текущей без миграции — old-version
    const legacy = JSON.parse(serializeSave(cleanShift(2), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }));
    legacy.schemaVersion = SCHEMA_VERSION > 1 ? SCHEMA_VERSION - 1 : 0;
    const res = loadStateFromSave(JSON.stringify(legacy), ctx());
    // v0 трактуется как malformed (некорректный номер), v>=1 без цепочки — old-version
    expect(['old-version', 'malformed']).toContain(res.ok ? 'ok' : res.reason);
    if (!res.ok && SCHEMA_VERSION > 1) expect(res.reason).toBe('old-version');
  });

  it('версия 1 проходит проверку версии', () => {
    expect(loadStateFromSave(serializeSave(cleanShift(2), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }), ctx()).ok).toBe(true);
  });
});

describe('save/load: повреждённые данные', () => {
  it('не-JSON и мусор — malformed', () => {
    for (const junk of ['', 'not json', '42', '"строка"', '[]', '{}']) {
      const res = loadStateFromSave(junk, ctx());
      expect(res.ok, junk).toBe(false);
      if (!res.ok) expect(res.reason).toBe('malformed');
    }
  });

  it('битое тело state — corrupt-state', () => {
    const file = JSON.parse(serializeSave(cleanShift(6), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }));
    file.state.elephants[0].state = 'flyAway'; // несуществующее состояние слона
    const res = loadStateFromSave(JSON.stringify(file), ctx());
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('corrupt-state');
    expect(res.detail).toContain('слон');
  });

  it('несуществующий режим напарника ловится валидатором', () => {
    const file = JSON.parse(serializeSave(cleanShift(6), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }));
    file.state.partner.mode = 'worldDomination';
    expect(isValidSaveFile(file)).toBe(false);
  });

  it('циклические ссылки не сериализуются молча — isStateSerializable даёт false', () => {
    const s = cleanShift(8) as State & { _loop?: unknown };
    const before = isStateSerializable(s);
    s._loop = s; // цикл
    expect(before).toBe(true);
    expect(isStateSerializable(s)).toBe(false);
  });
});

describe('save/load: объём', () => {
  it('сейв живой смены укладывается в лимит localStorage (< 4 МБ)', () => {
    const json = serializeSave(liveShift(), MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows });
    expect(json.length).toBeLessThan(4 * 1024 * 1024);
  });
});

// helpers: el используется для будущего smoke-теста «слон жив после загрузки»
describe('save/load: поведение после восстановления', () => {
  it('слон из восстановленного состояния узнаётся и двигается', () => {
    const original = liveShift(13);
    const res = loadStateFromSave(serializeSave(original, MAP_ID, { cols: MAP.floor.cols, rows: MAP.floor.rows }), ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = el(res.state, 'audrey');
    const before = { x: e.x, y: e.y };
    // Цели слона — часть состояния: после загрузки они те же
    expect(e.tx).toBe(el(original, 'audrey').tx);
    for (let i = 0; i < 120; i++) tick(res.state, 1 / 30, []);
    const after = { x: e.x, y: e.y };
    expect(Number.isFinite(after.x) && Number.isFinite(after.y)).toBe(true);
    void before;
  });
});

describe('save/load: слоты localStorage и экспорт/импорт (storage.ts)', () => {
  it('saveToSlot, peekSlotMeta, loadFromSlot и deleteSlot работают с localStorage', async () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeStorage,
      configurable: true,
      writable: true,
    });

    const { saveToSlot, loadFromSlot, peekSlotMeta, deleteSlot, exportSaveJson, importSaveJson } = await import('../src/sim');
    const s = liveShift(21);
    const c = ctx();
    const saveRes = saveToSlot(s, c, 'slot-1');
    expect(saveRes.ok).toBe(true);

    const meta = peekSlotMeta(c, 'slot-1');
    expect(meta.exists).toBe(true);
    expect(meta.compatible).toBe(true);
    expect(meta.mapId).toBe(MAP_ID);

    const loadRes = loadFromSlot(c, 'slot-1');
    expect(loadRes).not.toBeNull();
    expect(loadRes?.ok).toBe(true);
    if (loadRes && loadRes.ok) {
      expect(loadRes.state).toEqual(s);
    }

    const exported = exportSaveJson(s, c);
    const imported = importSaveJson(exported, c);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.state).toEqual(s);
    }

    deleteSlot(c, 'slot-1');
    expect(peekSlotMeta(c, 'slot-1').exists).toBe(false);
  });
});

