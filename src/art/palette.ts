import type { Tone } from './pixel';

// Палитра в духе NES: мало цветов, все яркие, тени — соседние тона того же цвета.

export const C = {
  k: '#000000',
  white: '#fcfcfc',
  sky: '#5c94fc',
  skyLight: '#a4e4fc',
  red: '#d82800',
  redDark: '#881400',
  orange: '#c84c0c',
  orangeLight: '#fc9838',
  cream: '#fcbcb0',
  gold: '#f8b800',
  goldLight: '#fce0a8',
  goldDark: '#ac7c00',
  green: '#00a800',
  greenLight: '#80d010',
  greenDark: '#005800',
  blue: '#0078f8',
  blueLight: '#3cbcfc',
  blueDark: '#0058b8',
  navy: '#0000a8',
  brown: '#503000',
  grey: '#bcbcbc',
  greyMid: '#7c7c7c',
  greyDark: '#545454',
  pink: '#fcb4a4',
  pinkDark: '#e4846c',
};

export const T: Record<string, Tone> = {
  wood: { L: C.orangeLight, M: C.orange, D: C.redDark },
  metal: { L: C.white, M: C.grey, D: C.greyMid },
  steel: { L: C.grey, M: C.greyMid, D: C.greyDark },
  straw: { L: C.goldLight, M: C.gold, D: C.goldDark },
  black: { L: '#5c5c64', M: '#2c2c30', D: '#141416' },
  green: { L: C.greenLight, M: C.green, D: C.greenDark },
  blue: { L: C.blueLight, M: C.blue, D: C.blueDark },
  red: { L: '#f87858', M: C.red, D: C.redDark },
  dung: { L: '#c88c4c', M: '#8c5418', D: '#5c3000' },
  cream: { L: C.white, M: C.goldLight, D: '#e4b878' },
  pink: { L: '#fcd8d0', M: C.pink, D: C.pinkDark },
  skin: { L: '#fcd8a8', M: '#fcbc94', D: '#e4946c' },
  cloud: { L: C.white, M: C.white, D: C.skyLight },
};
