// Публичный API симуляции: рендер и интерфейс импортируют только отсюда.

export { createState, SAVE_VERSION, type NewGameOptions } from './state';
export { step, runMinutes, NO_INPUT } from './step';
export { availableActions, actionTarget, heldLabel, areaEmpty, keeperArea, nearGate, hoseUsable, nextVeg } from './keeper';
export { comfortGap, invited, irritable } from './behavior/contact';
export { keeperCatching, urinatingNearKeeper } from './behavior/urine';
export { kittenDoing } from './kitten';
export { catHabitText, catTemper } from './behavior/cat';
export { clockText, shiftDay, minuteOfDay, darkness, temperature, isNight } from './time';
export { describeCharacter, characterHints, salientTraits, TRAIT_LABELS, rankScore, bondKey, signalHabitText, dietOf, nameCase } from './herd';
export { wellbeing, pressingNeed, ambientTemp, bodyDirt } from './behavior/needs';
export { signalClarity, signalText } from './behavior/signals';
export { headPos, rearPos, zoneOf, areaOf, bond } from './behavior/perceive';
export { cleanliness, cellCenter, isBeddingCell, fruitStage, tubById, tubKg, floorLeftovers } from './world';
export { drainEvents } from './events';
export * from './save';
export * from './storage';
export type * from './types';
export { TRAIT_KEYS, ACTIVITY_KINDS, CUES } from './types';
