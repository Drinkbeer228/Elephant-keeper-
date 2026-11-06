import v2save from './fixtures/save-v2.json?raw';
import v3save from './fixtures/save-v3.json?raw';
import { beforeEach, describe, expect, it } from 'vitest';
import { deserialize, serialize, runMinutes, step, saveSlot, loadSlot, slotInfo, legacyKeys, clearLegacy, validateState, SAVE_VERSION, type State } from '../src/sim';
import { AREA_IDS, HOSE_REEL, STATIONS, TANK_HOME, areaAt, inRect } from '../src/data/facility';
import { elephantCanStand } from '../src/sim/nav';
import { keeperIndex } from '../src/sim/geometry';
import { game, walk } from './helpers';

class MemoryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

function busy(seed = 3): State {
  const s = game(seed, 3, undefined, true);
  runMinutes(s, 200);
  walk(s, 1, -1, 2);
  return s;
}

describe('сохранение и загрузка', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
  });

  it('сохранение и загрузка дают то же самое состояние', () => {
    const s = busy();
    const res = deserialize(serialize(s));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state).toEqual(s);
    expect(serialize(res.state, 1)).toBe(serialize(s, 1));
  });

  it('после загрузки смена продолжается точно так же, как без неё', () => {
    const a = busy(11);
    const res = deserialize(serialize(a));
    if (!res.ok) throw new Error(res.detail);
    const b = res.state;
    for (let i = 0; i < 3000; i++) {
      step(a);
      step(b);
    }
    expect(serialize(b, 1)).toBe(serialize(a, 1));
  });

  it('загрузка не генерирует характер заново: профили и выученное берутся из сейва', () => {
    const s = busy(21);
    s.elephants[0].learned.trust = 0.987;
    s.elephants[0].profile.traits.curiosity = 0.123;
    s.elephants[0].profile.name = 'Проверка';
    const res = deserialize(serialize(s));
    if (!res.ok) throw new Error(res.detail);
    expect(res.state.elephants[0].learned.trust).toBe(0.987);
    expect(res.state.elephants[0].profile.traits.curiosity).toBe(0.123);
    expect(res.state.elephants[0].profile.name).toBe('Проверка');
    expect(res.state.elephants.map((e) => e.profile)).toEqual(s.elephants.map((e) => e.profile));
  });

  it('старые сейвы пиксельной версии распознаются и не ломают игру', () => {
    const old = JSON.stringify({ schemaVersion: 1, mapId: 'legacy', floor: { cols: 64, rows: 48 }, savedAt: 1, state: {} });
    const res = deserialize(old);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('legacy');
    localStorage.setItem('keeper-sim:save:legacy:autosave', old);
    expect(legacyKeys()).toHaveLength(1);
    expect(clearLegacy()).toBe(1);
    expect(legacyKeys()).toHaveLength(0);
  });

  it('битые, чужие и будущие файлы отвергаются с причиной', () => {
    expect(deserialize('не json').ok).toBe(false);
    const s = busy(4);
    const doc = JSON.parse(serialize(s));
    const newer = deserialize(JSON.stringify({ ...doc, version: 99 }));
    expect(!newer.ok && newer.reason).toBe('newer');
    const broken = structuredClone(doc);
    broken.state.elephants[0].needs.hunger = 'много';
    const r = deserialize(JSON.stringify(broken));
    expect(!r.ok && r.reason).toBe('corrupt');
    const noCells = structuredClone(doc);
    noCells.state.world.cells.wet = [1, 2];
    expect(validateState(noCells.state)).toMatch(/пол/);
    expect(deserialize(JSON.stringify({ format: 'something-else', version: 2 })).ok).toBe(false);
  });

  it('сейв прошлой версии (v2, записан прежней сборкой) переносится: стадо и выученное сохраняются, новое — дописано', () => {
    const text = v2save;
    const old = JSON.parse(text) as { version: number; state: { elephants: { id: string; profile: { name: string; traits: Record<string, number> }; learned: { trust: number } }[]; world: { gateOpen: boolean } } };
    expect(old.version).toBe(2);
    const res = deserialize(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.migrated).toBe(true);
    const s = res.state;
    expect(s.version).toBe(SAVE_VERSION);
    // Те же слоны, тот же характер и доверие
    expect(s.elephants.map((e) => e.profile.name)).toEqual(old.state.elephants.map((e) => e.profile.name));
    s.elephants.forEach((e, i) => {
      expect(e.profile.traits.confidence).toBe(old.state.elephants[i].profile.traits.confidence);
      expect(e.learned.trust).toBe(old.state.elephants[i].learned.trust);
      // Новые черты и привычки — постоянные, из seed: проказливость, манера звать; знание просьб
      expect(e.profile.traits.mischief).toBeGreaterThanOrEqual(0);
      expect(e.profile.habits).not.toHaveProperty('whistle');
      expect(e.learned.cues.come).toBeGreaterThan(0);
      expect(AREA_IDS).toContain(areaAt(e.x, e.y) ?? 'paddock');
    });
    expect(s.world.gates.outer).toBe(old.state.world.gateOpen);
    expect(s.world.tubs).toHaveLength(s.elephants.length);
    expect(validateState(s)).toBeNull();
    // Повторная загрузка того же файла даёт то же самое (перенос детерминирован)
    const again = deserialize(text);
    expect(again.ok && serialize(again.state, 1)).toBe(serialize(s, 1));
    // И смена идёт дальше без поломок
    runMinutes(s, 120);
    expect(validateState(s)).toBeNull();
    const round = deserialize(serialize(s));
    expect(round.ok).toBe(true);
  });

  it('сейв v3 (защищённый контакт, записан прежней сборкой) переносится в общий зал: доверие то же, свисток снят, бак и шланг на местах', () => {
    const old = JSON.parse(v3save) as { version: number; state: { t: number; elephants: { profile: { name: string; habits: Record<string, unknown> }; learned: { trust: number; cooperation: number } }[]; keeper: { x: number; y: number } } };
    expect(old.version).toBe(3);
    expect(old.state.elephants[0].profile.habits).toHaveProperty('whistle');
    const res = deserialize(v3save);
    if (!res.ok) throw new Error(res.detail);
    expect(res.migrated).toBe(true);
    const s = res.state;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.t).toBe(old.state.t);
    s.elephants.forEach((e, i) => {
      expect(e.profile.name).toBe(old.state.elephants[i].profile.name);
      expect(e.learned.trust).toBe(old.state.elephants[i].learned.trust);
      expect(e.learned.cooperation).toBe(old.state.elephants[i].learned.cooperation);
      expect(e.profile.habits).not.toHaveProperty('whistle');
      expect(e.learned.familiarity).toBeGreaterThan(0);
      expect(Object.keys(e.learned.cues).sort()).toEqual(['come', 'follow', 'lie', 'move', 'no', 'stay']);
      expect(e.mem.tension).toBe(0);
      if (e.mem.call) expect(e.mem.call.why).not.toBe('call');
      const r = 0.95 * e.profile.look.size;
      expect(elephantCanStand(e.x, e.y, r, (s.world.gates.outer ? 1 : 0) | (s.world.gates.shift ? 2 : 0)), e.profile.name).toBe(true);
    });
    // Бак стоял в проходе (там теперь поилка) — перенесён домой; шланг смотан; кипер не в стене
    const tank = s.world.items.find((it) => it.kind === 'tank')!;
    expect(tank.x).toBe(TANK_HOME.x);
    expect(tank.y).toBe(TANK_HOME.y);
    expect(inRect(STATIONS.barnWaterE.rect!, tank.x, tank.y)).toBe(false);
    expect(s.world.hose.state).toBe('reel');
    expect(s.world.hose.end).toEqual({ x: HOSE_REEL.x, y: HOSE_REEL.y });
    expect(keeperIndex.hits(s.keeper.x, s.keeper.y, 0.3)).toBe(false);
    expect(s.keeper.stun).toBe(0);
    expect(validateState(s)).toBeNull();
    // Перенос детерминирован, смена идёт дальше
    const again = deserialize(v3save);
    expect(again.ok && serialize(again.state, 1)).toBe(serialize(s, 1));
    runMinutes(s, 120);
    expect(validateState(s)).toBeNull();
    expect(deserialize(serialize(s)).ok).toBe(true);
  });

  it('слоты localStorage: сохранить, прочитать сводку, загрузить', () => {
    const s = busy(8);
    expect(slotInfo('slot-1').exists).toBe(false);
    expect(saveSlot(s, 'slot-1').ok).toBe(true);
    const info = slotInfo('slot-1');
    expect(info.ok).toBe(true);
    expect(info.text).toContain(s.elephants[0].profile.name);
    const res = loadSlot('slot-1');
    expect(res && res.ok && res.state.t).toBe(s.t);
  });
});
