export { createShift, type ShiftOptions } from './state';
export { tick, advance, walkable, playerSpeedFactor } from './tick';
export { availableAction, barrowSummary, inspect, itemLabel, type ActionOption } from './actions';
export { clockText, darkness, dayPart } from './clock';
export { pocketTreat, profileOf } from './elephants';
export { groundOf, sawdustAbsorbed } from './floor';
export { HANDOVER_CHECKS, stinkSources, type Report } from './handover';
export { takeStock, takeStockUpTo, giveStock, STOCK_LABELS, type StockKind } from './stock';
// Публичный API предметов: UI не импортирует внутренние модули sim напрямую
export { basinsOnRack, ITEM_NAMES, reachableItems } from './items';
// Save/Load: формат, сериализация, валидация (UI/game подставляют mapId и размер сетки)
export {
  SCHEMA_VERSION,
  MAP_IDS,
  serializeSave,
  parseSave,
  loadStateFromSave,
  isValidSaveFile,
  applyMigrations,
  isStateSerializable,
  type SaveFile,
  type LoadContext,
  type LoadResult,
  type SaveRejectReason,
} from './save';
export {
  AUTOSAVE_SLOT,
  MANUAL_SLOTS,
  SAVE_REASON_LABELS,
  storageKeyForSlot,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  peekSlotMeta,
  listAllSlotMetas,
  exportSaveJson,
  importSaveJson,
  type SaveSlotId,
  type SaveSlotMeta,
} from './storage';
export { displayTemperamentOf, STATE_LABELS, TEMPERAMENTS } from './ai/rules';
export type * from './types';

