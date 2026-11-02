// Иконка игры: пиксель-арт слонихи 16×16, растянутый до 256×256, PNG без зависимостей.
// Запуск: node scripts/make-icon.mjs  → icon.png в корне проекта
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

// 16×16: слониха мордой вправо, ухо, хобот вниз, красная цирковая шапочка.
// . — прозрачный, # — тёмный контур, L — свет, M — средний тон, D — тень, R — красный, W — белый
const ART = `
................
.....RRRR.......
....RWWWWRR.....
...#LLLLLL##....
..#LLMLLLMM#....
..#LMLLLLMML#...
.#LLLLLLLLLLL#..
.#LMMLLLLWLLLL#.
.#LLLLLLLLLLLM#.
.#LLLLLLLL#.MM#.
..#LLLLLL#.#M#..
..#LLLLL#..#M#..
...#LLL#...#M#..
...#LL#....#M#..
....##.....#M#..
...........###..
`;

const COLORS = {
  '#': [40, 36, 33, 255], // контур
  L: [204, 196, 188, 255], // светлый
  M: [154, 145, 138, 255], // средний
  W: [252, 252, 252, 255], // глаз
  R: [216, 40, 0, 255], // шапочка
  '.': [0, 0, 0, 0],
};

const rows = ART.split('\n').filter((r) => r.length === 16);
if (rows.length !== 16) throw new Error(`Ожидалось 16 строк, получено ${rows.length}`);

const SCALE = 16;
const SIZE = 16 * SCALE;

// RGBA-буфер
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const row = rows[Math.floor(y / SCALE)];
  raw[y * (SIZE * 4 + 1)] = 0; // фильтр None
  for (let x = 0; x < SIZE; x++) {
    const c = COLORS[row[x]] ?? COLORS['.'];
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[o] = c[0];
    raw[o + 1] = c[1];
    raw[o + 2] = c[2];
    raw[o + 3] = c[3];
  }
}

// ——— Минимальный PNG-энкодер ———
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // бит на канал
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../icon.png', import.meta.url), png);
console.log(`icon.png готов: ${SIZE}×${SIZE}`);
