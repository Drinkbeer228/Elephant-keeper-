// Сценарии и 4-этапная кампания стажировки со старшим кипером (docs/TRAINING-SCENARIOS.md).
// Поддерживаются как одиночные задания на одну механику (?scenario=prep и др.), так и 4 этапа
// стажировки (?scenario=stage-1..stage-4) и сквозная кампания (?scenario=internship).

import type { SimEvent } from '../sim';

export type MentorTone = 'info' | 'good' | 'warn' | 'bad';

export interface ScenarioStep {
  id: string;
  stageId?: 'stage-1' | 'stage-2' | 'stage-3' | 'stage-4';
  stageTitle?: string;
  /** Что сделать на текущем шаге, одной строкой для плашки. */
  task: string;
  /** Какие события симуляции засчитывают шаг. */
  events: readonly string[];
  count: number;
  /** Реплика старшего кипера на старте шага. */
  mentorIntro: string;
  /** Реплика старшего кипера после выполнения шага. */
  mentorDone: string;
}

export interface Scenario {
  id: string;
  title: string;
  /** Что сделать, одной строкой для плашки задания. */
  task: string;
  /** Событие работы кипера и сколько раз оно нужно (для одиночных заданий — точное число). */
  event: string;
  count: number;
  /** Номер этапа (1–4) для этапов кампании стажировки. */
  stage?: 1 | 2 | 3 | 4;
  /** Следующий этап кампании (если есть). */
  nextStageId?: string;
  /** Шаги сценария (если не указаны, создаётся один шаг из task/event/count). */
  steps?: readonly ScenarioStep[];
  /** Вложенные этапы для сквозной кампании стажировки. */
  stages?: readonly Scenario[];
  /** Напутствие старшего кипера. */
  mentorIntro?: string;
  /** Финальная реплика старшего кипера при сдаче задания. */
  mentorDone?: string;
}

const STAGE_1_STEPS: readonly ScenarioStep[] = [
  {
    id: 'stage-1:voice',
    stageId: 'stage-1',
    stageTitle: 'Этап I. Вводный инструктаж',
    task: 'Подойдите к залу на безопасную дистанцию и окликните слониху по имени или спокойно заговорите с ней.',
    events: ['voice'],
    count: 1,
    mentorIntro:
      'Старший кипер: «Добро пожаловать на стажировку! Главное правило безопасности: никогда не подходи к слону молча и со спины. Сначала подай голос, чтобы тебя заметили.»',
    mentorDone:
      'Старший кипер: «Отлично! Слониха повернула ухо и знает, где ты стоишь. Теперь проверим воду и подготовку корма.»',
  },
  {
    id: 'stage-1:water-hay',
    stageId: 'stage-1',
    stageTitle: 'Этап I. Вводный инструктаж',
    task: 'Проверьте поилку (откройте кран) или заложите тюк сена в кормушку.',
    events: ['valve', 'hay'],
    count: 1,
    mentorIntro:
      'Старший кипер: «Осмотри периметр: долей воды в поилку или возьми тюк сена на складе. Помни: возле слонов ходят только шагом — бег пугает животных.»',
    mentorDone:
      'Старший кипер: «Хорошо. Спокойная работа с водой и кормом показывает стаду, что ты здесь для заботы.»',
  },
  {
    id: 'stage-1:kitchen',
    stageId: 'stage-1',
    stageTitle: 'Этап I. Вводный инструктаж',
    task: 'В кормокухне соберите таз овощей на столе или заложите ещё сена в кормушку.',
    events: ['prepDone', 'hay', 'pour'],
    count: 1,
    mentorIntro:
      'Старший кипер: «Загляни в кормокухню: у каждой слонихи свой рацион по SlonVet. Нарежь овощи в именной таз, запарь кашу или пополни кормушку сеном.»',
    mentorDone:
      'Старший кипер: «Вводный инструктаж сдан! Ты знаешь, как обозначить себя голосом и работать на периферии без суеты.»',
  },
];

const STAGE_2_STEPS: readonly ScenarioStep[] = [
  {
    id: 'stage-2:hay',
    stageId: 'stage-2',
    stageTitle: 'Этап II. Утренний цикл',
    task: 'Заложите утреннее сено в кормушки (2 раза) или долейте воду в поилки.',
    events: ['hay', 'valve'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Второй этап — утренний цикл смены. Начни с проверки поилок и раздачи утреннего сена, чтобы стадо позавтракало.»',
    mentorDone:
      'Старший кипер: «Вода и сено в порядке. Теперь пора открыть выход на выгул и заняться уборкой зала.»',
  },
  {
    id: 'stage-2:gate',
    stageId: 'stage-2',
    stageTitle: 'Этап II. Утренний цикл',
    task: 'Подойдите к створке ворот и переключите ворота на выгул или разделительные ворота.',
    events: ['gate'],
    count: 1,
    mentorIntro:
      'Старший кипер: «Ворота открывают вручную у створки. Убедись, что в проёме не стоит слониха, и открой ворота на выгул.»',
    mentorDone:
      'Старший кипер: «Ворота переключены! Когда слоны выходят на прогулку или заняты у кормушек, мы убираем стойла.»',
  },
  {
    id: 'stage-2:clean',
    stageId: 'stage-2',
    stageTitle: 'Этап II. Утренний цикл',
    task: 'Возьмите лопату в инвентарной и уберите навоз или мокрую подстилку (3 раза).',
    events: ['shovel'],
    count: 3,
    mentorIntro:
      'Старший кипер: «Возьми лопату со стойки и подкати тачку. Убери навоз и мокрую подстилку — сухой пол бережёт стопы слонов.»',
    mentorDone:
      'Старший кипер: «Утренний цикл выполнен чисто! Стойла приведены в порядок по всем правилам санитарии.»',
  },
];

const STAGE_3_STEPS: readonly ScenarioStep[] = [
  {
    id: 'stage-3:voice',
    stageId: 'stage-3',
    stageTitle: 'Этап III. Доверие и безопасность',
    task: 'Подойдите к слонихе на комфортную дистанцию и спокойно поговорите с ней или окликните (2 раза).',
    events: ['voice'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Третий этап — работа с доверием и ТБ. У каждой слонихи своё личное место. Не подходи вплотную без приглашения: сначала поговори спокойно.»',
    mentorDone:
      'Старший кипер: «Видишь? Когда говоришь спокойно и не напираешь, напряжение спадает, и она сама подпускает ближе.»',
  },
  {
    id: 'stage-3:trust',
    stageId: 'stage-3',
    stageTitle: 'Этап III. Доверие и безопасность',
    task: 'Когда слониха спокойна, погладьте её, почешите за ухом или дайте лакомство (2 раза).',
    events: ['heart', 'treat', 'porridgeServed'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Закрепи доверительный контакт: погладь, почеши за ухом или угости. Помни: нельзя угощать слониху, пока она напирает и требует!»',
    mentorDone:
      'Старший кипер: «Отличный контакт! Доверие растёт, когда ты предсказуем и уважаешь характер животного.»',
  },
  {
    id: 'stage-3:care',
    stageId: 'stage-3',
    stageTitle: 'Этап III. Доверие и безопасность',
    task: 'Выполните уход или уборку рядом со слонами (щётка, шланг или лопата — 2 раза), не вызвав тревоги.',
    events: ['brush', 'spray', 'shovel'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Теперь поработай инструментом рядом со стадом: почисти кожу щёткой, окати из шланга или убери пол. Если слониха растопырит уши — сразу отступи!»',
    mentorDone:
      'Старший кипер: «Безупречно! Ты читаешь сигналы слонов и соблюдаешь технику безопасности.»',
  },
];

const STAGE_4_STEPS: readonly ScenarioStep[] = [
  {
    id: 'stage-4:ration',
    stageId: 'stage-4',
    stageTitle: 'Этап IV. Итоговая смена',
    task: 'Обеспечьте стадо основным рационом: соберите таз овощей в кормокухне или подайте запаренную кашу (2 действия).',
    events: ['prepDone', 'porridgeServed', 'pour'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Четвёртый этап — твоя итоговая зачётная смена. Я только наблюдаю. Приготовь и раздай слонам кашу и овощной рацион по SlonVet.»',
    mentorDone:
      'Старший кипер: «Кормокухня и рацион зачтены. Продолжай вести смену самостоятельно.»',
  },
  {
    id: 'stage-4:sanitation',
    stageId: 'stage-4',
    stageTitle: 'Этап IV. Итоговая смена',
    task: 'Поддержите порядок в вольерах: заложите сено, уберите навоз или обновите подстилку (3 действия).',
    events: ['shovel', 'hay', 'straw', 'rake', 'spray'],
    count: 3,
    mentorIntro:
      'Старший кипер: «Проверь чистоту в зале и на выгуле: убери навоз, подсыпь солому или пополни кормушки сеном.»',
    mentorDone:
      'Старший кипер: «В вольерах чистота и порядок. Остался финальный обход стада перед сдачей смены.»',
  },
  {
    id: 'stage-4:exam-bond',
    stageId: 'stage-4',
    stageTitle: 'Этап IV. Итоговая смена',
    task: 'Уделите внимание слонам перед сдачей смены: ласка, уход щёткой или угощение (2 раза) без ошибок ТБ.',
    events: ['heart', 'treat', 'brush', 'porridgeServed'],
    count: 2,
    mentorIntro:
      'Старший кипер: «Финальный шаг экзамена: удели внимание слонихам, сохраняя полное спокойствие в стаде.»',
    mentorDone:
      'Старший кипер: «Поздравляю, коллега! Все 4 этапа стажировки пройдены без нарушений ТБ. Ты официально допущен к самостоятельной смене смотрителя слонов!»',
  },
];

export const INTERNSHIP_STAGES: readonly Scenario[] = [
  {
    id: 'stage-1',
    stage: 1,
    title: 'Этап I. Вводный инструктаж',
    task: 'Подайте голос слонихе, проверьте воду/сено и познакомьтесь с кормокухней.',
    event: 'voice',
    count: STAGE_1_STEPS.reduce((a, s) => a + s.count, 0),
    nextStageId: 'stage-2',
    steps: STAGE_1_STEPS,
    mentorIntro: STAGE_1_STEPS[0].mentorIntro,
    mentorDone: STAGE_1_STEPS[STAGE_1_STEPS.length - 1].mentorDone,
  },
  {
    id: 'stage-2',
    stage: 2,
    title: 'Этап II. Утренний цикл',
    task: 'Заложите утреннее сено, откройте ворота на выгул и уберите зал лопатой.',
    event: 'shovel',
    count: STAGE_2_STEPS.reduce((a, s) => a + s.count, 0),
    nextStageId: 'stage-3',
    steps: STAGE_2_STEPS,
    mentorIntro: STAGE_2_STEPS[0].mentorIntro,
    mentorDone: STAGE_2_STEPS[STAGE_2_STEPS.length - 1].mentorDone,
  },
  {
    id: 'stage-3',
    stage: 3,
    title: 'Этап III. Доверие и безопасность',
    task: 'Установите спокойный голосовой контакт, заслужите доверие и проведите уход без нарушений ТБ.',
    event: 'heart',
    count: STAGE_3_STEPS.reduce((a, s) => a + s.count, 0),
    nextStageId: 'stage-4',
    steps: STAGE_3_STEPS,
    mentorIntro: STAGE_3_STEPS[0].mentorIntro,
    mentorDone: STAGE_3_STEPS[STAGE_3_STEPS.length - 1].mentorDone,
  },
  {
    id: 'stage-4',
    stage: 4,
    title: 'Этап IV. Итоговая смена',
    task: 'Самостоятельный экзамен: рацион, санитария вольеров и доверительный контакт со стадом.',
    event: 'prepDone',
    count: STAGE_4_STEPS.reduce((a, s) => a + s.count, 0),
    steps: STAGE_4_STEPS,
    mentorIntro: STAGE_4_STEPS[0].mentorIntro,
    mentorDone: STAGE_4_STEPS[STAGE_4_STEPS.length - 1].mentorDone,
  },
];

const ALL_CAMPAIGN_STEPS: readonly ScenarioStep[] = [
  ...STAGE_1_STEPS,
  ...STAGE_2_STEPS,
  ...STAGE_3_STEPS,
  ...STAGE_4_STEPS,
];

export const INTERNSHIP_CAMPAIGN: Scenario = {
  id: 'internship',
  title: 'Кампания стажировки (Этапы I–IV)',
  task: 'Пройдите полную 4-этапную стажировку со старшим кипером: инструктаж, утренний цикл, безопасность и итоговую смену.',
  event: 'prepDone',
  count: ALL_CAMPAIGN_STEPS.reduce((a, s) => a + s.count, 0),
  steps: ALL_CAMPAIGN_STEPS,
  stages: INTERNSHIP_STAGES,
  mentorIntro: STAGE_1_STEPS[0].mentorIntro,
  mentorDone: STAGE_4_STEPS[STAGE_4_STEPS.length - 1].mentorDone,
};

export const ATOMIC_SCENARIOS: readonly Scenario[] = [
  {
    id: 'prep',
    title: 'Кормокухня',
    task: 'Нарежьте овощи и соберите таз рациона для слона.',
    event: 'prepDone',
    count: 1,
    mentorIntro: 'Старший кипер: «Возьми чистый именной таз со стеллажа, поставь на разделочный стол и нарежь овощи по рациону SlonVet.»',
    mentorDone: 'Старший кипер: «Отлично, таз собран аккуратно и точно по весу!»',
  },
  {
    id: 'feeding',
    title: 'Раздача сена',
    task: 'Заложите сено в кормушки слонов.',
    event: 'hay',
    count: 2,
    mentorIntro: 'Старший кипер: «Возьми тюки сена на складе и заложи в две кормушки. Не беги с тюком, чтобы не рассыпать сено и не пугать слонов.»',
    mentorDone: 'Старший кипер: «Кормушки полны, слонихи довольны!»',
  },
  {
    id: 'porridge',
    title: 'Каша',
    task: 'Запарьте кашу и накормите ею двух слонов.',
    event: 'porridgeServed',
    count: 2,
    mentorIntro: 'Старший кипер: «Замешай кашу в кормокухне, дай ей запариться 60 минут и покорми двух слоних, предварительно окликнув их.»',
    mentorDone: 'Старший кипер: «Тёплая каша подана вовремя и по индивидуальному рецепту!»',
  },
  {
    id: 'cleaning',
    title: 'Уборка навоза',
    task: 'Уберите навоз лопатой в тачку.',
    event: 'shovel',
    count: 4,
    mentorIntro: 'Старший кипер: «Возьми лопату в инвентарной, подкати тачку и убери навоз. Следи за слонами вокруг и не зажимай себя у стены.»',
    mentorDone: 'Старший кипер: «Чистая работа! В зале порядок.»',
  },
  {
    id: 'bedding',
    title: 'Подстилка',
    task: 'Разровняйте граблями свежую подстилку.',
    event: 'rake',
    count: 3,
    mentorIntro: 'Старший кипер: «Возьми грабли на стойке инвентаря и взрыхли слежавшуюся подстилку или сгреби сор на выгуле.»',
    mentorDone: 'Старший кипер: «Подстилка мягкая и ровная — ночью слонихам будет удобно спать.»',
  },
  {
    id: 'washing',
    title: 'Мойка шлангом',
    task: 'Помойте шлангом пол, поилки или слона.',
    event: 'spray',
    count: 5,
    mentorIntro: 'Старший кипер: «Размотай шланг с катушки и помой бетонный пол или окати слониху. После работы не бросай шланг в зоне хобота!»',
    mentorDone: 'Старший кипер: «Отлично промыто! Не забудь вернуть шланг на катушку.»',
  },
  {
    id: 'care',
    title: 'Уход за кожей и ногами',
    task: 'Почистите щёткой кожу или ноги слона.',
    event: 'brush',
    count: 4,
    mentorIntro: 'Старший кипер: «Возьми щётку, спокойно подойди к слонихе спереди или сбоку и почисти кожу или поданную по просьбе стопу.»',
    mentorDone: 'Старший кипер: «Кожа и стопы в полном порядке, слониха расслабилась.»',
  },
  {
    id: 'trust',
    title: 'Доверие',
    task: 'Подойдите к слону спокойно и заслужите его доверие.',
    event: 'heart',
    count: 2,
    mentorIntro: 'Старший кипер: «Остановись у границы личного пространства слонихи, заговори спокойно и, когда она подпустит, погладь или почеши за ухом.»',
    mentorDone: 'Старший кипер: «Молодец! Так шаг за шагом и рождается настоящее доверие.»',
  },
];

export const SCENARIOS: readonly Scenario[] = [
  ...ATOMIC_SCENARIOS,
  ...INTERNSHIP_STAGES,
  INTERNSHIP_CAMPAIGN,
];

const ID = /^[a-z][a-z0-9-]{0,31}$/;

export function scenarioById(id: string | null): Scenario | null {
  if (!id || !ID.test(id)) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

/** Счётчик задания или многоэтапной кампании стажировки со старшим кипером и условиями провала. */
export class ScenarioRun {
  done = 0;
  failed = false;
  failReason: string | null = null;
  warnings = 0;
  justWarned = false;
  lastWarning: string | null = null;
  mentorText: string;
  mentorTone: MentorTone = 'info';

  readonly steps: readonly ScenarioStep[];
  private stepCounts: number[];
  private completedStageSet = new Set<string>();
  private newlyCompletedStages: string[] = [];

  constructor(readonly scenario: Scenario) {
    this.steps = scenario.steps ?? [
      {
        id: scenario.id,
        task: scenario.task,
        events: [scenario.event],
        count: scenario.count,
        mentorIntro:
          scenario.mentorIntro ??
          `Старший кипер: «Задание „${scenario.title}“: ${scenario.task} Соблюдай спокойствие и дистанцию рядом со слонами.»`,
        mentorDone:
          scenario.mentorDone ??
          `Старший кипер: «Задание „${scenario.title}“ выполнено без замечаний! Можно продолжать смену.»`,
      },
    ];
    this.stepCounts = this.steps.map(() => 0);
    this.mentorText = this.steps[0].mentorIntro;
  }

  /** Сбросить попытку этапа после провала. */
  reset(): void {
    this.done = 0;
    this.failed = false;
    this.failReason = null;
    this.warnings = 0;
    this.justWarned = false;
    this.lastWarning = null;
    this.stepCounts = this.steps.map(() => 0);
    this.completedStageSet.clear();
    this.newlyCompletedStages = [];
    this.mentorTone = 'info';
    this.mentorText = this.steps[0].mentorIntro;
  }

  get complete(): boolean {
    return !this.failed && this.steps.every((st, i) => this.stepCounts[i] >= st.count);
  }

  /** Индекс текущего активного шага. */
  get currentStepIndex(): number {
    const idx = this.steps.findIndex((st, i) => this.stepCounts[i] < st.count);
    return idx >= 0 ? idx : this.steps.length - 1;
  }

  get stepIndex(): number {
    return this.currentStepIndex;
  }

  get currentStep(): ScenarioStep {
    return this.steps[this.currentStepIndex];
  }

  get activeStageId(): string {
    return this.currentStep.stageId ?? this.scenario.id;
  }

  get stepDone(): number {
    const i = this.currentStepIndex;
    return Math.min(this.stepCounts[i], this.steps[i].count);
  }

  get stepTarget(): number {
    return this.currentStep.count;
  }

  /** Заголовок для плашки стажировки. */
  get headerText(): string {
    const cur = this.currentStep;
    if (cur.stageTitle && this.scenario.id === 'internship') {
      const stageSteps = this.steps.filter((s) => s.stageId === cur.stageId);
      const stageIdx = stageSteps.indexOf(cur) + 1;
      return `Стажировка · ${cur.stageTitle} (шаг ${stageIdx}/${stageSteps.length})`;
    }
    if (this.steps.length > 1) {
      return `Стажировка · ${this.scenario.title} (шаг ${this.currentStepIndex + 1}/${this.steps.length})`;
    }
    return `Стажировка · ${this.scenario.title}`;
  }

  /** Текст текущей задачи на плашке. */
  get taskText(): string {
    if (this.failed) return this.failReason ?? 'Смена прервана из-за нарушения техники безопасности.';
    if (this.complete) return 'Готово! Этап стажировки зачтён старшим кипером.';
    return this.currentStep.task;
  }

  /** Текст счётчика на плашке. */
  get countText(): string {
    if (this.failed) return 'Смена остановлена · Нарушение ТБ';
    if (this.steps.length === 1) {
      return `${Math.min(this.done, this.scenario.count)} из ${this.scenario.count}`;
    }
    if (this.complete) {
      return `Выполнено: ${this.scenario.count} из ${this.scenario.count}`;
    }
    return `Шаг: ${this.stepDone} из ${this.stepTarget} · Всего: ${Math.min(this.done, this.scenario.count)}/${this.scenario.count}`;
  }

  /** Ключ состояния для проверки, нужно ли перерисовывать плашку. */
  get stateKey(): string {
    return `${this.scenario.id}|${this.done}|${this.currentStepIndex}|${this.stepDone}|${this.failed}|${this.warnings}|${this.mentorText}`;
  }

  /** Возвращает список id этапов (`stage-1`..`stage-4`), которые только что завершились. */
  drainCompletedStages(): string[] {
    const out = this.newlyCompletedStages;
    this.newlyCompletedStages = [];
    return out;
  }

  private fail(reason: string): void {
    this.failed = true;
    this.failReason = reason;
    this.mentorTone = 'bad';
    this.mentorText = `Старший кипер: «Стоп, смена прервана! ${reason} Разберём ошибку и начнём этап заново.»`;
  }

  /** Учитывает события шага. Возвращает true, когда сценарий/этап только что полностью выполнен. */
  push(events: readonly SimEvent[]): boolean {
    this.justWarned = false;
    if (this.complete || this.failed) return false;

    for (const ev of events) {
      // 1. Проверка критических ошибок и нарушений ТБ
      if (ev.kind === 'kick') {
        this.fail('Ты подошёл к слонихе сзади в слепую зону без оклика, и она лягнула.');
        return false;
      }
      if (ev.kind === 'shove') {
        this.fail('Ты вторгся в личное пространство слонихи без приглашения и не отступил — она оттолкнула тебя.');
        return false;
      }
      if (ev.kind === 'spook') {
        this.warnings++;
        const isExam = this.scenario.stage === 4 || this.currentStep.stageId === 'stage-4';
        if (this.warnings >= 2 || isExam) {
          this.fail('Из-за бега рядом со слонами или резкого подхода к спящей начался переполох в стаде.');
          return false;
        }
        this.justWarned = true;
        this.mentorTone = 'warn';
        this.mentorText =
          'Старший кипер: «Предупреждение по ТБ! В слоновнике ходят только шагом, а спящую слониху сначала окликают. Ещё один испуг — сниму со смены!»';
        this.lastWarning = this.mentorText;
        continue;
      }
      if (ev.kind === 'warn') {
        this.warnings++;
        this.justWarned = true;
        this.mentorTone = 'warn';
        this.mentorText =
          'Старший кипер: «Осторожно! Слониха растопырила уши и мотает головой — ей тесно. Сделай шаг назад или спокойно заговори с ней!»';
        this.lastWarning = this.mentorText;
        continue;
      }
      if (ev.severity === 'bad' && ev.text.includes('средство не смыли')) {
        this.fail('В поилке оставили несмытое моющее средство — слонам нельзя это пить.');
        return false;
      }
      if (ev.kind === 'refuse' && ev.severity === 'warn') {
        this.justWarned = true;
        this.mentorTone = 'warn';
        this.mentorText =
          'Старший кипер: «Не повторяй просьбу по кругу и не хвали невпопад — так ты только портишь дисциплину и доверие.»';
        this.lastWarning = this.mentorText;
        continue;
      }

      // 2. Учёт прогресса по текущему этапу
      const activeIdx = this.currentStepIndex;
      const activeStage = this.steps[activeIdx].stageId;

      // Ищем подходящий незавершённый шаг в рамках текущего активного этапа (с приоритетом текущего шага)
      let matchedIdx = -1;
      if (this.stepCounts[activeIdx] < this.steps[activeIdx].count && this.steps[activeIdx].events.includes(ev.kind)) {
        matchedIdx = activeIdx;
      } else {
        for (let i = 0; i < this.steps.length; i++) {
          const st = this.steps[i];
          if (st.stageId !== activeStage) continue;
          if (this.stepCounts[i] < st.count && st.events.includes(ev.kind)) {
            matchedIdx = i;
            break;
          }
        }
      }

      if (matchedIdx >= 0) {
        this.stepCounts[matchedIdx]++;
        this.done++;
        const finishedStep = this.stepCounts[matchedIdx] >= this.steps[matchedIdx].count;

        // Проверяем, завершился ли целиком этап (stage-1..stage-4)
        if (activeStage && !this.completedStageSet.has(activeStage)) {
          const stageDone = this.steps.every((st, i) => st.stageId !== activeStage || this.stepCounts[i] >= st.count);
          if (stageDone) {
            this.completedStageSet.add(activeStage);
            this.newlyCompletedStages.push(activeStage);
          }
        }

        if (this.complete) {
          this.mentorTone = 'good';
          this.mentorText = this.steps[this.steps.length - 1].mentorDone;
          break;
        } else if (finishedStep) {
          this.mentorTone = 'good';
          const nextStep = this.currentStep;
          this.mentorText = nextStep.mentorIntro;
        }
      }
    }

    return this.complete;
  }
}
