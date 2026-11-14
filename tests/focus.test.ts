import { describe, expect, it } from 'vitest';
import { FOCUS_T, FocusTracker, type FocusView } from '../src/ui/focus';
import type { ActionOption, InteractionTarget, Verb } from '../src/sim/types';

interface Pose {
  x: number;
  y: number;
  facing: number;
}

const STILL: Pose = { x: 0, y: 0, facing: 0 };

function opt(id: string, priority = 50, enabled = true): ActionOption {
  const [verb, ...rest] = id.split(':');
  return { id, ref: { verb: verb as Verb, target: rest.join(':') }, label: id, enabled, reason: enabled ? '' : 'нельзя', priority, elephantId: null, timed: false, group: '', dist: 0, order: 0, at: null };
}

function tgt(key: string, score: number, options: ActionOption[] = [opt(`pet:${key}`)], extra: Partial<InteractionTarget> = {}): InteractionTarget {
  const sorted = options.slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.priority - a.priority);
  return { key, label: key, elephantId: null, x: 0, y: 0, rect: null, gap: score, bearing: 0, contact: true, enabled: sorted[0].enabled, top: sorted[0].priority, auto: true, score, options: sorted, ...extra };
}

// Прокрутить кадры: что видит трекер в каждый момент
function run(f: FocusTracker, from: number, to: number, frame: (t: number) => { targets: InteractionTarget[]; pose?: Pose; busy?: boolean }): FocusView {
  let v = f.view;
  for (let t = from; t <= to; t += 16) {
    const fr = frame(t);
    v = f.update(fr.targets, t, fr.pose ?? STILL, fr.busy ?? false);
  }
  return v;
}

// Момент, к которому подсказка уже давно на экране и ничего не менялось
const T0 = 2000;

// Показать цели и дать подсказке отстояться до T0
function settled(targets: () => InteractionTarget[]): FocusTracker {
  const f = new FocusTracker();
  run(f, 0, T0, () => ({ targets: targets() }));
  return f;
}

// Кипер идёт: каждый кадр чуть смещается
function walking(t: number): Pose {
  return { x: t * 0.003, y: 0, facing: 0 };
}

describe('какая цель главная', () => {
  it('целей нет — пусто; появилась — сразу главная', () => {
    const f = new FocusTracker();
    expect(f.update([], 0, STILL).target).toBeNull();
    const v = f.update([tgt('a', 1)], 16, STILL);
    expect(v.target?.key).toBe('a');
    expect(v.main?.id).toBe('pet:a');
  });

  it('пока кипер стоит, цель не меняется, даже если другая стала ближе', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, STILL);
    const v = run(f, 16, 5000, () => ({ targets: [tgt('a', 2), tgt('b', 0.3)] }));
    expect(v.target?.key).toBe('a');
  });

  it('на ходу цель меняется, когда другая продержалась лучшей треть секунды', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, walking(0));
    const early = run(f, 16, 16 + FOCUS_T.travelDwell - 32, (t) => ({ targets: [tgt('a', 2), tgt('b', 0.3)], pose: walking(t) }));
    expect(early.target?.key).toBe('a');
    const later = run(f, 16 + FOCUS_T.travelDwell - 16, 700, (t) => ({ targets: [tgt('a', 2), tgt('b', 0.3)], pose: walking(t) }));
    expect(later.target?.key).toBe('b');
  });

  it('на ходу мимо: то, что было рядом лишь мгновение, подсказкой не становится', () => {
    const f = new FocusTracker();
    f.update([], 0, walking(0));
    // Кипер идёт; цель оказывается под рукой на 200 мс и остаётся позади
    const seen: (string | null)[] = [];
    for (let t = 16; t <= 1500; t += 16) seen.push(f.update(t >= 400 && t < 600 ? [tgt('a', 0.5)] : [], t, walking(t)).target?.key ?? null);
    expect(seen.every((k) => k === null)).toBe(true);
  });

  it('на ходу слониха, до которой не дотянуться, целью не становится; остановился — сразу становится', () => {
    const f = new FocusTracker();
    const voice = () => [tgt('el', 3, [opt('voice:e1:come', 30)], { contact: false })];
    f.update([], 0, walking(0));
    expect(run(f, 16, 2000, (t) => ({ targets: voice(), pose: walking(t) })).target).toBeNull();
    const stop = walking(2000);
    expect(run(f, 2016, 2016 + FOCUS_T.movingFor + 48, () => ({ targets: voice(), pose: stop })).target?.key).toBe('el');
  });

  it('на ходу срочное всё же становится целью: окликнуть ту, к которой подходишь сзади', () => {
    const f = new FocusTracker();
    const urgent = () => [tgt('el', 3, [opt('voice:e1:name', 98)], { contact: false })];
    f.update([], 0, walking(0));
    expect(run(f, 16, 16 + FOCUS_T.travelDwell + 64, (t) => ({ targets: urgent(), pose: walking(t) })).target?.key).toBe('el');
  });

  it('на ходу цель, с которой уже работаешь, не теряется, даже если до неё не дотянуться', () => {
    const f = settled(() => [tgt('el', 3, [opt('voice:e1:come', 30)], { contact: false })]);
    const v = run(f, T0 + 16, T0 + 2000, (t) => ({ targets: [tgt('el', 2.5, [opt('voice:e1:come', 30)], { contact: false })], pose: walking(t) }));
    expect(v.target?.key).toBe('el');
  });

  it('на ходу цель, взятая мимоходом, отпускается, как только до неё уже не дотянуться', () => {
    const f = new FocusTracker();
    f.update([], 0, walking(0));
    // Проходим мимо слонихи: полсекунды она под рукой…
    const near = run(f, 16, 600, (t) => ({ targets: [tgt('el', 0.5, [opt('treat:e1', 55), opt('voice:e1:talk', 32)])], pose: walking(t) }));
    expect(near.target?.key).toBe('el');
    // …а дальше — только голосом. Идём дальше: подсказка не переключается на «поговорить», а исчезает
    const past = run(f, 616, 616 + FOCUS_T.moveDwell + 64, (t) => ({ targets: [tgt('el', 2, [opt('voice:e1:talk', 32)], { contact: false })], pose: walking(t) }));
    expect(past.target).toBeNull();
  });

  it('поворот на месте: цель меняется быстро — так игрок целится', () => {
    const f = settled(() => [tgt('a', 1), tgt('b', 2)]);
    const turning = (t: number): Pose => ({ x: 0, y: 0, facing: (t - T0) * 0.004 });
    const early = run(f, T0 + 16, T0 + 16 + FOCUS_T.moveDwell - 32, (t) => ({ targets: [tgt('a', 2), tgt('b', 0.3)], pose: turning(t) }));
    expect(early.target?.key).toBe('a');
    const later = run(f, T0 + FOCUS_T.moveDwell, T0 + FOCUS_T.moveDwell + 100, (t) => ({ targets: [tgt('a', 2), tgt('b', 0.3)], pose: turning(t) }));
    expect(later.target?.key).toBe('b');
  });

  it('на ходу чуть лучшая цель текущую не перебивает', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, walking(0));
    const v = run(f, 16, 2000, (t) => ({ targets: [tgt('a', 1), tgt('b', 0.85)], pose: walking(t) }));
    expect(v.target?.key).toBe('a');
  });

  it('мелькнувшая на кадр-другой цель фокус не забирает', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, walking(0));
    const v = run(f, 16, 1500, (t) => ({ targets: [tgt('a', 1), tgt('b', Math.floor(t / 48) % 2 ? 0.2 : 2)], pose: walking(t) }));
    expect(v.target?.key).toBe('a');
  });

  it('цель пропала — сразу следующая', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, STILL);
    expect(f.update([tgt('b', 2)], 16, STILL).target?.key).toBe('b');
    expect(f.update([], 32, STILL).target).toBeNull();
  });

  it('цель ушла из-под руки (далеко или за спиной): стоя — сбрасывается после паузы', () => {
    const f = settled(() => [tgt('a', 1)]);
    const gone = [tgt('a', 5, undefined, { auto: false })];
    expect(run(f, T0 + 16, T0 + FOCUS_T.idleDwell - 32, () => ({ targets: gone })).target?.key).toBe('a');
    expect(run(f, T0 + FOCUS_T.idleDwell - 16, T0 + FOCUS_T.idleDwell + 200, () => ({ targets: gone })).target).toBeNull();
  });

  it('стоя: срочная цель перебивает обычную, но не мгновенно; обычная — никогда', () => {
    const f = settled(() => [tgt('a', 1), tgt('b', 2)]);
    const urgent = [tgt('a', 1), tgt('b', 0.2, [opt('treat:b', 145)])];
    expect(run(f, T0 + 16, T0 + FOCUS_T.idleDwell - 32, () => ({ targets: urgent })).target?.key).toBe('a');
    expect(run(f, T0 + FOCUS_T.idleDwell - 16, T0 + FOCUS_T.idleDwell + 200, () => ({ targets: urgent })).target?.key).toBe('b');
  });

  it('стоя: подсказка сама не меняется чаще, чем раз в секунду — её успевают прочесть', () => {
    const f = settled(() => [tgt('a', 1), tgt('b', 2)]);
    // Цель «a» ушла из-под руки — после паузы главной стала «b»
    let switchedAt = -1;
    for (let t = T0 + 16; t < T0 + 3000 && switchedAt < 0; t += 16) if (f.update([tgt('a', 5, undefined, { auto: false }), tgt('b', 2)], t, STILL).target?.key === 'b') switchedAt = t;
    expect(switchedAt).toBeGreaterThan(0);
    // Сразу следом из-под руки ушла и «b», а «a» вернулась: обратная смена ждёт
    const back = () => [tgt('a', 1), tgt('b', 5, undefined, { auto: false })];
    expect(run(f, switchedAt + 16, switchedAt + FOCUS_T.minHold - 32, () => ({ targets: back() })).target?.key).toBe('b');
    expect(run(f, switchedAt + FOCUS_T.minHold - 16, switchedAt + FOCUS_T.minHold + 200, () => ({ targets: back() })).target?.key).toBe('a');
  });

  it('…но если показанное действие пропало, подсказка обновляется сразу', () => {
    const f = settled(() => [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])]);
    let changedAt = -1;
    for (let t = T0 + 16; t < T0 + 3000 && changedAt < 0; t += 16) if (f.update([tgt('a', 1, [opt('treat:a', 55), opt('praise:a', 100)])], t, STILL).main?.id === 'praise:a') changedAt = t;
    expect(changedAt).toBeGreaterThan(0);
    expect(f.update([tgt('a', 1, [opt('treat:a', 55)])], changedAt + 16, STILL).main?.id).toBe('treat:a');
  });

  it('во время работы и после неё цель та же', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, STILL);
    const busy = run(f, 16, 1000, () => ({ targets: [], busy: true }));
    expect(busy.target).toBeNull();
    expect(busy.main).toBeNull();
    expect(f.update([tgt('a', 2), tgt('b', 0.3)], 1016, STILL).target?.key).toBe('a');
  });

  it('смена цели увеличивает счётчик — по нему интерфейс понимает, что цель новая', () => {
    const f = new FocusTracker();
    const s0 = f.update([tgt('a', 1)], 0, STILL).seq;
    const s1 = f.update([tgt('a', 1)], 16, STILL).seq;
    expect(s1).toBe(s0);
    const s2 = f.update([tgt('b', 1)], 32, STILL).seq;
    expect(s2).toBeGreaterThan(s1);
  });
});

describe('следующая цель и закрепление', () => {
  const three = () => [tgt('a', 1), tgt('b', 2), tgt('c', 9, undefined, { auto: false })];

  it('«следующая цель» перебирает все цели по порядку, включая дальние', () => {
    const f = new FocusTracker();
    f.update(three(), 0, STILL);
    f.cycle(16);
    let v = f.update(three(), 16, STILL);
    expect(v.target?.key).toBe('b');
    expect(v.pinned).toBe(true);
    expect(v.others).toBe(2);
    f.cycle(32);
    v = f.update(three(), 32, STILL);
    expect(v.target?.key).toBe('c');
    f.cycle(48);
    expect(f.update(three(), 48, STILL).target?.key).toBe('a');
  });

  it('закреплённая цель держится, пока кипер рядом; отошёл — выбор снова по взгляду', () => {
    const f = new FocusTracker();
    f.update(three(), 0, STILL);
    f.cycle(16);
    expect(run(f, 16, 3000, () => ({ targets: three() })).target?.key).toBe('b');
    // Полшага в сторону — ещё закреплена
    expect(run(f, 3016, 3200, () => ({ targets: three(), pose: { x: 0.5, y: 0, facing: 0 } })).target?.key).toBe('b');
    // Ушёл дальше — закрепление снято, на ходу главной снова становится ближайшая
    const v = run(f, 3216, 4000, (t) => ({ targets: three(), pose: { x: 1.3 + (t - 3216) * 0.003, y: 0, facing: 0 } }));
    expect(v.pinned).toBe(false);
    expect(v.target?.key).toBe('a');
  });

  it('закреплённая цель пропала — ждём недолго и отпускаем', () => {
    const f = new FocusTracker();
    f.update(three(), 0, STILL);
    f.cycle(16);
    f.update(three(), 16, STILL);
    const without = [tgt('a', 1)];
    expect(run(f, 32, FOCUS_T.pinLost - 16, () => ({ targets: without })).target).toBeNull();
    expect(run(f, FOCUS_T.pinLost, FOCUS_T.pinLost + 300, () => ({ targets: without })).target?.key).toBe('a');
  });

  it('цель можно закрепить по ключу — так работает касание по объекту', () => {
    const f = new FocusTracker();
    f.update(three(), 0, STILL);
    expect(f.pin('c', 16)).toBe(true);
    expect(f.update(three(), 16, STILL).target?.key).toBe('c');
    expect(f.pin('нет такой', 32)).toBe(false);
    expect(f.update(three(), 32, STILL).target?.key).toBe('c');
  });
});

describe('главное действие цели', () => {
  it('главное — самое важное из доступных; остальные считаются', () => {
    const f = new FocusTracker();
    const v = f.update([tgt('a', 1, [opt('pet:a', 40), opt('treat:a', 55), opt('hand:a', 90, false)])], 0, STILL);
    expect(v.main?.id).toBe('treat:a');
    expect(v.more).toBe(2);
  });

  it('небольшие колебания важности главное действие не меняют', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])], 0, STILL);
    const v = run(f, 16, 3000, (t) => ({ targets: [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 55 + (Math.floor(t / 100) % 2 ? FOCUS_T.mainMargin - 1 : -5))])] }));
    expect(v.main?.id).toBe('treat:a');
  });

  it('заметно более важное действие становится главным, продержавшись', () => {
    const f = settled(() => [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])]);
    const now = [tgt('a', 1, [opt('treat:a', 55), opt('praise:a', 100)])];
    expect(run(f, T0 + 16, T0 + FOCUS_T.mainDwell - 32, () => ({ targets: now })).main?.id).toBe('treat:a');
    expect(run(f, T0 + FOCUS_T.mainDwell - 16, T0 + FOCUS_T.mainDwell + 200, () => ({ targets: now })).main?.id).toBe('praise:a');
  });

  it('главное стало недоступным или исчезло — сразу следующее', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])], 0, STILL);
    expect(f.update([tgt('a', 1, [opt('treat:a', 55, false), opt('pet:a', 42)])], 16, STILL).main?.id).toBe('pet:a');
    expect(f.update([tgt('a', 1, [opt('hand:a', 38)])], 32, STILL).main?.id).toBe('hand:a');
  });

  it('если доступного нет, показывается недоступное — с причиной', () => {
    const f = new FocusTracker();
    const v = f.update([tgt('a', 1, [opt('take:hay', 40, false)])], 0, STILL);
    expect(v.main?.enabled).toBe(false);
    expect(v.main?.reason).toBe('нельзя');
  });

  it('после своего действия главным сразу становится лучшее — шаги идут подряд без паузы', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('drainTrough:a', 128), opt('valve:a', 40)])], 0, STILL);
    expect(f.press(1000)?.id).toBe('drainTrough:a');
    // Слив закрыли: то же действие теперь значит «слить снова», а главное по делу — кран
    const v = f.update([tgt('a', 1, [opt('drainTrough:a', 30), opt('valve:a', 125)])], 1016, STILL);
    expect(v.main?.id).toBe('valve:a');
  });

  it('после работы, занявшей время, главное тоже выбирается заново', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('chemTrough:a', 110), opt('valve:a', 40)])], 0, STILL);
    run(f, 16, 900, () => ({ targets: [], busy: true }));
    const v = f.update([tgt('a', 1, [opt('scrubTrough:a', 112), opt('valve:a', 40)])], 916, STILL);
    expect(v.main?.id).toBe('scrubTrough:a');
  });
});

describe('нажатие главного действия', () => {
  it('выполняется то, что показано', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('treat:a', 55)])], 0, STILL);
    expect(f.press(500)?.id).toBe('treat:a');
  });

  it('нет цели — нажатие ничего не делает', () => {
    const f = new FocusTracker();
    f.update([], 0, STILL);
    expect(f.press(500)).toBeNull();
  });

  it('подсказка сменилась сама за мгновение до нажатия — выполняется то, что игрок видел', () => {
    const f = new FocusTracker();
    const before = [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])];
    const after = [tgt('a', 1, [opt('treat:a', 55), opt('praise:a', 100)])];
    f.update(before, 0, STILL);
    run(f, 16, 2000, () => ({ targets: after }));
    // Главным стало «praise» где-то после паузы; найдём момент смены
    const g = new FocusTracker();
    g.update(before, 0, STILL);
    let changedAt = -1;
    for (let t = 16; t < 2000 && changedAt < 0; t += 16) if (g.update(after, t, STILL).main?.id === 'praise:a') changedAt = t;
    expect(changedAt).toBeGreaterThan(0);
    expect(g.press(changedAt + FOCUS_T.pressBuffer - 30)?.id).toBe('treat:a');
    // Чуть позже игрок уже видел новую подсказку
    const h = new FocusTracker();
    h.update(before, 0, STILL);
    for (let t = 16; t <= changedAt + FOCUS_T.pressBuffer + 16; t += 16) h.update(after, t, STILL);
    expect(h.press(changedAt + FOCUS_T.pressBuffer + 20)?.id).toBe('praise:a');
  });

  it('…а если прежнего действия уже нет — нажатие пропускается', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])], 0, STILL);
    run(f, 16, 1000, () => ({ targets: [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])] }));
    const v = f.update([tgt('a', 1, [opt('pet:a', 42)])], 1016, STILL);
    expect(v.main?.id).toBe('pet:a');
    expect(f.press(1016 + 60)).toBeNull();
    f.update([tgt('a', 1, [opt('pet:a', 42)])], 1016 + FOCUS_T.pressBuffer + 16, STILL);
    expect(f.press(1016 + FOCUS_T.pressBuffer + 20)?.id).toBe('pet:a');
  });

  it('только что появившаяся сама подсказка не срабатывает от нажатия «в пустоту»', () => {
    const f = new FocusTracker();
    run(f, 0, 1000, () => ({ targets: [] }));
    f.update([tgt('a', 1)], 1016, STILL);
    expect(f.press(1016 + 50)).toBeNull();
    f.update([tgt('a', 1)], 1016 + FOCUS_T.pressBuffer + 16, STILL);
    expect(f.press(1016 + FOCUS_T.pressBuffer + 20)?.id).toBe('pet:a');
  });

  it('на ходу нажатие относится к новой цели: игрок подходит и жмёт заранее', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 3)], 0, walking(0));
    let switched = -1;
    for (let t = 16; t < 1000 && switched < 0; t += 16) if (f.update([tgt('a', 3), tgt('b', 0.2)], t, walking(t)).target?.key === 'b') switched = t;
    expect(switched).toBeGreaterThan(0);
    expect(f.press(switched + 20)?.id).toBe('pet:b');
  });

  it('после выбора «следующая цель» нажатие сразу относится к ней', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1), tgt('b', 2)], 0, STILL);
    run(f, 16, 500, () => ({ targets: [tgt('a', 1), tgt('b', 2)] }));
    f.cycle(516);
    f.update([tgt('a', 1), tgt('b', 2)], 516, STILL);
    expect(f.press(540)?.id).toBe('pet:b');
  });

  it('двойное нажатие подряд второй раз не срабатывает', () => {
    const f = new FocusTracker();
    const t = [tgt('a', 1, [opt('treat:a', 55)])];
    f.update(t, 0, STILL);
    expect(f.press(500)?.id).toBe('treat:a');
    f.update(t, 516, STILL);
    expect(f.press(500 + FOCUS_T.debounce - 20)).toBeNull();
    f.update(t, 500 + FOCUS_T.debounce + 16, STILL);
    expect(f.press(500 + FOCUS_T.debounce + 20)?.id).toBe('treat:a');
  });

  it('во время работы нажатие ничего не делает', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1)], 0, STILL);
    f.update([], 16, STILL, true);
    expect(f.press(500)).toBeNull();
  });

  it('касание: кнопка запоминает действие в момент касания — оно и выполнится, даже если подсказка сменилась под пальцем', () => {
    const f = settled(() => [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])]);
    const armed = f.peek(T0 + 10);
    expect(armed?.id).toBe('treat:a');
    // Палец ещё на кнопке, а главным стало другое действие
    run(f, T0 + 16, T0 + 700, () => ({ targets: [tgt('a', 1, [opt('treat:a', 55), opt('praise:a', 100)])] }));
    expect(f.view.main?.id).toBe('praise:a');
    expect(f.commit(armed!.id, T0 + 710)?.id).toBe('treat:a');
  });

  it('касание: если запомненного действия к отпусканию уже нет — ничего не выполняется', () => {
    const f = settled(() => [tgt('a', 1, [opt('treat:a', 55), opt('pet:a', 42)])]);
    const armed = f.peek(T0 + 10);
    f.update([tgt('a', 1, [opt('pet:a', 42)])], T0 + 16, STILL);
    expect(f.commit(armed!.id, T0 + 150)).toBeNull();
    expect(f.commit(null, T0 + 150)).toBeNull();
  });

  it('касание запоминает то же, что выполнила бы клавиша, и ничего не меняет само', () => {
    const f = settled(() => [tgt('a', 1, [opt('treat:a', 55)])]);
    expect(f.peek(T0 + 10)?.id).toBe('treat:a');
    expect(f.peek(T0 + 20)?.id).toBe('treat:a');
    expect(f.press(T0 + 30)?.id).toBe('treat:a');
    // сразу после своего действия — пауза от двойного нажатия: касание ничего не запомнит
    expect(f.peek(T0 + 40)).toBeNull();
  });

  it('недоступное главное действие тоже «нажимается» — игра объяснит, почему нельзя', () => {
    const f = new FocusTracker();
    f.update([tgt('a', 1, [opt('take:hay', 40, false)])], 0, STILL);
    expect(f.press(500)?.id).toBe('take:hay');
  });
});
