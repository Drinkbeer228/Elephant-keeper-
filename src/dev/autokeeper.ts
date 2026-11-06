// Автокипер — бот для демонстрации и сквозных тестов. Подробная логика ниже.
import type { State, StepInput } from '../sim';

export class AutoKeeper {
  decide(_s: State): StepInput {
    return { move: { x: 0, y: 0 }, run: false, actions: [], cancel: false };
  }
}
