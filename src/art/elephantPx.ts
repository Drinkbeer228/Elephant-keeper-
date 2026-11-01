import { C } from './palette';
import { Sprite, ellipse, line, minus, rect, union, type Mask, type Tone } from './pixel';

// Азиатская слониха сбоку, мордой вправо. Кадр 46×34 пикселя, ноги на нижней строке.
// Кадры: стоит (2 положения хобота), шаг (4), топ передней, топ задней, ест, лежит.

export const EL_W = 46;
export const EL_H = 34;

export interface ElephantLook {
  tone: Tone;
  size: number; // 1 — взрослая, меньше — моложе
  spots?: boolean; // розовые крапинки депигментации у старших
  hair?: boolean; // волоски на макушке у молодых
}

export const LOOKS: Record<string, ElephantLook> = {
  pretty: { tone: { L: '#ccc4bc', M: '#9a918a', D: '#686059' }, size: 0.95 },
  margo: { tone: { L: '#b2aca8', M: '#807a76', D: '#524c48' }, size: 1, spots: true },
  audrey: { tone: { L: '#e2dad2', M: '#b6aea6', D: '#847c74' }, size: 0.84, hair: true },
};

interface Pose {
  legs: { nf: [number, number]; nb: [number, number]; ff: [number, number]; fb: [number, number] };
  head: number; // опустить голову на столько пикселей
  trunk: 'down' | 'left' | 'right' | 'curl';
  body: number;
}

const POSES: Record<string, Pose> = {
  idle0: { legs: { nf: [0, 0], nb: [0, 0], ff: [0, 0], fb: [0, 0] }, head: 0, trunk: 'down', body: 0 },
  idle1: { legs: { nf: [0, 0], nb: [0, 0], ff: [0, 0], fb: [0, 0] }, head: 0, trunk: 'left', body: 0 },
  walk0: { legs: { nf: [2, 0], nb: [-2, 0], ff: [-2, 0], fb: [2, 0] }, head: 0, trunk: 'right', body: 0 },
  walk1: { legs: { nf: [0, -2], nb: [0, 0], ff: [0, 0], fb: [0, -2] }, head: 0, trunk: 'down', body: -1 },
  walk2: { legs: { nf: [-2, 0], nb: [2, 0], ff: [2, 0], fb: [-2, 0] }, head: 0, trunk: 'left', body: 0 },
  walk3: { legs: { nf: [0, 0], nb: [0, -2], ff: [0, -2], fb: [0, 0] }, head: 0, trunk: 'down', body: -1 },
  stomp: { legs: { nf: [2, -4], nb: [0, 0], ff: [0, 0], fb: [0, 0] }, head: -1, trunk: 'right', body: 0 },
  stompBack: { legs: { nf: [0, 0], nb: [-1, -4], ff: [0, 0], fb: [0, 0] }, head: 0, trunk: 'left', body: 0 },
  eat: { legs: { nf: [0, 0], nb: [0, 0], ff: [0, 0], fb: [0, 0] }, head: 2, trunk: 'curl', body: 0 },
};

export const ELEPHANT_FRAMES = [...Object.keys(POSES), 'lying'];

function darker(t: Tone): Tone {
  // Дальние ноги — на тон темнее
  const dim = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v: number) => Math.round(v * 0.78);
    return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  return { L: t.M, M: t.D, D: dim(t.D) };
}

function scaled(size: number) {
  // Масштаб от точки между ногами на земле, чтобы молодые стояли на той же линии
  const ax = 22;
  const ay = EL_H - 1;
  const X = (x: number) => ax + (x - ax) * size;
  const Y = (y: number) => ay + (y - ay) * size;
  const R = (r: number) => r * size;
  return { X, Y, R };
}

export function elephantFrame(look: ElephantLook, frame: string): Sprite {
  const s = new Sprite(EL_W, EL_H);
  const { X, Y, R } = scaled(look.size);
  const tone = look.tone;
  if (frame === 'lying') return lying(look);
  const pose = POSES[frame];
  const b = pose.body;
  const h = pose.head;

  const leg = (x: number, [dx, dy]: [number, number]): Mask =>
    union(rect(X(x + dx), Y(21 + dy + b), X(x + dx + 5), Y(31 + dy)), rect(X(x + dx - 1), Y(30 + dy), X(x + dx + 6), Y(32 + dy)));

  // Дальние ноги
  s.shape(leg(29, pose.legs.ff), darker(tone));
  s.shape(leg(11, pose.legs.fb), darker(tone));
  // Хвост
  s.shape(line([[X(6), Y(12 + b)], [X(4.5), Y(18 + b)], [X(3.6), Y(23 + b)]], R(0.9)), tone);
  s.fill(ellipse(X(3.5), Y(24.5 + b), R(1.3), R(1.8)), C.k);
  // Туловище с куполом спины
  const torso = union(ellipse(X(19), Y(15 + b), R(14), R(9.5)), ellipse(X(16), Y(10 + b), R(10.5), R(6.5)));
  s.shape(torso, tone);
  // Блик на спине и складки на боку
  for (const [x, y] of [[13, 6], [14, 6], [15, 6], [17, 7]]) s.set(X(x), Y(y + b), '#ffffff');
  for (const [x, y] of [[29, 12], [29, 14], [28, 16]]) s.set(X(x), Y(y + b), tone.D);
  // Ближние ноги
  const nf = leg(25, pose.legs.nf);
  const nb = leg(8, pose.legs.nb);
  s.shape(nf, tone);
  s.shape(nb, tone);
  // Ногти и складки на ближних ногах
  for (const [x, [dx, dy]] of [
    [25, pose.legs.nf],
    [8, pose.legs.nb],
  ] as [number, [number, number]][]) {
    for (const nx of [0.5, 2.5, 4.5]) s.set(X(x + dx + nx), Y(31 + dy), C.goldLight);
    s.set(X(x + dx + 1), Y(26 + dy), tone.D);
    s.set(X(x + dx + 2), Y(26 + dy), tone.D);
    s.set(X(x + dx + 3), Y(27 + dy), tone.D);
  }

  // Голова: два купола на лбу, щека, морда
  const hy = h + b;
  const head = union(
    ellipse(X(33), Y(8.5 + hy), R(6), R(6)),
    ellipse(X(38), Y(9 + hy), R(4.6), R(5.6)),
    rect(X(30), Y(9 + hy), X(41.5), Y(16 + hy)),
    ellipse(X(35), Y(16 + hy), R(6), R(3.6)),
  );
  // Хобот: толще у основания, кончик чуть загнут вперёд
  const tip: Record<Pose['trunk'], [number, number][]> = {
    down: [[40, 14], [41.5, 21], [41.5, 27], [42.5, 31], [44.5, 31.5]],
    left: [[40, 14], [41, 21], [40.2, 27], [40.5, 31], [42.5, 31.5]],
    right: [[40, 14], [42, 21], [43, 26], [44.5, 29], [45.5, 28.5]],
    curl: [[40, 14], [42, 19], [41.5, 24], [38.5, 25.5], [37.5, 23.5]],
  };
  const pts = tip[pose.trunk].map(([x, y]) => [X(x), Y(y + hy)] as [number, number]);
  const trunk = union(line(pts.slice(0, 3), R(2.3)), line(pts.slice(2), R(1.6)));
  // Ямка между куполами лба
  s.shape(minus(union(head, trunk), ellipse(X(35.7), Y(2.6 + hy), R(1.1), R(1.6))), tone);
  // Складки на хоботе: короткие тёмные чёрточки поперёк, через 2 пикселя
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.3; t < 1; t += 0.45) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      s.set(x - 0.5, y, tone.D);
      s.set(x + 0.5, y, tone.D);
    }
  }
  // Ухо со светлой внутренней стороной
  const ear = ellipse(X(31), Y(12.5 + hy), R(3.9), R(5.6));
  s.shape(ear, tone);
  s.fill(ellipse(X(30.2), Y(14.2 + hy), R(1.6), R(2.6)), C.pink);
  s.set(X(29.6), Y(15.6 + hy), C.pinkDark);
  if (look.spots) {
    for (const [x, y] of [
      [40, 15],
      [41, 17],
      [39, 18],
      [31, 9],
      [32, 15],
    ])
      s.set(X(x), Y(y + hy), '#fcc4b4');
  }
  // Глаз и бровь
  s.set(X(37.5), Y(8.5 + hy), C.k);
  s.set(X(37.5), Y(9.5 + hy), C.k);
  s.set(X(36.5), Y(7.3 + hy), tone.D);
  s.set(X(37.5), Y(7 + hy), tone.D);
  s.set(X(38.5), Y(7.3 + hy), tone.D);
  // Рот под хоботом
  s.set(X(36), Y(18.5 + hy), C.k);
  s.set(X(37), Y(18.8 + hy), C.k);
  if (look.hair) {
    for (const [x, y] of [
      [31, 2],
      [33, 1.5],
      [35, 2],
      [37, 2.5],
    ])
      s.set(X(x), Y(y + hy), C.k);
  }
  return s;
}

function lying(look: ElephantLook): Sprite {
  const s = new Sprite(EL_W, EL_H);
  const { X, Y, R } = scaled(look.size);
  const tone = look.tone;
  // Поджатые ноги
  s.shape(ellipse(X(34), Y(31), R(4.5), R(2.6)), darker(tone));
  s.shape(ellipse(X(9), Y(31), R(4.5), R(2.6)), darker(tone));
  // Туловище лежит
  s.shape(union(ellipse(X(21), Y(24.5), R(16), R(7.6)), ellipse(X(18), Y(21), R(11), R(5.5))), tone);
  // Голова на подстилке
  const head = union(ellipse(X(36), Y(21), R(5.5), R(5.4)), rect(X(33), Y(21), X(42), Y(28)), ellipse(X(38), Y(28), R(5), R(3)));
  const trunk = line([[X(41.5), Y(26)], [X(43.5), Y(30.5)], [X(45), Y(32)]], R(1.8));
  s.shape(union(head, trunk), tone);
  s.shape(ellipse(X(34), Y(24.5), R(3.6), R(5)), tone);
  s.fill(ellipse(X(33.8), Y(25), R(2.2), R(3.4)), C.pink);
  // Закрытый глаз
  s.set(X(39), Y(22), C.k);
  s.set(X(40), Y(22.4), C.k);
  if (look.spots) for (const [x, y] of [[41, 27], [40, 29], [34, 22]]) s.set(X(x), Y(y), '#fcc4b4');
  // Хвост на полу
  s.shape(line([[X(6), Y(22)], [X(3), Y(29)], [X(1.6), Y(32)]], R(0.9)), tone);
  return s;
}

// Портрет для интерфейса: голова крупно
export function elephantPortrait(look: ElephantLook): Sprite {
  const full = elephantFrame({ ...look, size: 1 }, 'idle0');
  const p = new Sprite(20, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) p.set(x, y, full.get(x + 26, y + 1));
  return p;
}
