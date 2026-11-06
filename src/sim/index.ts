// Публичный API симуляции: рендер и интерфейс импортируют только отсюда.

export { createState, SAVE_VERSION, type NewGameOptions } from './state';
export { step, runMinutes, NO_INPUT } from './step';
export { availableActions, actionTarget, heldLabel, zoneEmpty, keeperZone, doorUnlocked } from './keeper';
export { clockText, shiftDay, minuteOfDay, darkness, temperature, isNight } from './time';
export { describeCharacter, characterHints, salientTraits, TRAIT_LABELS, rankScore, bondKey } from './herd';
export { wellbeing, pressingNeed, ambientTemp } from './behavior/needs';
export { signalClarity, signalText } from './behavior/signals';
export { headPos, rearPos, zoneOf, bond } from './behavior/perceive';
export { cleanliness, cellCenter, isBeddingCell, troughSpoiled } from './world';
export { drainEvents } from './events';
export * from './save';
export * from './storage';
export type * from './types';
export { TRAIT_KEYS } from './types';
