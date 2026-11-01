import { state, elephants, player, stats, dayNightCycle, gameTime, addLog, showToast } from '../gameState.js';
import { sfx } from '../sound.js';
import { getCurrentPhase } from '../systems/dayNight.js';

export function tryInspectElephant() {
        if (state.gameState === 'INSPECTION_MODAL') {
          state.gameState = 'PLAYING';
          state.inspectingElephant = null;
          sfx.playSuccess();
          return;
        }
        if (state.gameState !== 'PLAYING') return;

        for (const el of elephants) {
          const dist = Math.hypot(player.x - el.x, player.y - el.y);
          if (dist < el.radius + 45) {
            state.inspectingElephant = el;
            state.gameState = 'INSPECTION_MODAL';
            const curPh = getCurrentPhase();
            const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
            el.lastInspected = timeStr;

            // Реакция на повторный осмотр после зафиксированного наблюдения (Этап 10)
            if (el.observations && el.observations.length > 0) {
              if (el.id === 'audrey') el.statusText = 'Спокойно воспринимает повторный осмотр кипера';
              else if (el.id === 'margo') el.statusText = 'Узнала кипера, дружелюбно тянется хоботом';
              else if (el.id === 'pretty') el.statusText = 'Доверчиво воспринимает контрольный осмотр';
            }

            // Начисление очков только один раз за фазу дня для этой слонихи (защита от спама)
            if (el.inspectedInPhase !== curPh.id) {
              el.inspectedInPhase = curPh.id;
              stats.inspectionsDone++;
              stats.totalScore += 30;
              sfx.playSuccess();
              addLog(`Проведен ветеринарный осмотр слонихи ${el.name} (${curPh.title.split(' · ')[1] || 'Смена'}). +30 очков.`);
            } else {
              sfx.playSuccess();
            }
            return;
          }
        }
      }

export function getElephantObservationOptions(el) {
        if (!el) return [];
        const isEventActive = state.activeSituationalEvent && state.activeSituationalEvent.status === 'active' && state.activeSituationalEvent.elephantId === el.id;
        const ev = isEventActive ? state.activeSituationalEvent : null;

        let behaviorText = 'Штатное, уравновешенное; естественные позы, активный контакт с кипером';
        if (ev && ev.type === 'trough_low_thirst') {
          behaviorText = ev.actionDone ? 'Водный баланс в норме: слониха напилась свежей воды, спокойна' : 'Повышенная жажда: слониха томится у пустой автопоилки';
        } else if (ev && ev.type === 'margo_distracted') {
          behaviorText = ev.actionDone ? 'Поведение штатное: вернулась к привычному кормлению' : 'Отвлеклась на почесывание о брусья ограды, пропустила подход к корму';
        } else if (ev && ev.type === 'tool_misplaced') {
          behaviorText = ev.actionDone ? 'Проход вольера свободен: инвентарь убран, движение раскованное' : 'С любопытством разглядывает постороннее ведро на проходе вольера';
        } else if (ev && ev.type === 'vet_followup_check') {
          behaviorText = ev.actionDone ? 'Контрольный осмотр подтвержден: дыхание ровное, реакции адекватные' : 'Повторный ветеринарный контроль: спокойный контакт, симптомов нет';
        } else if (el.id === 'audrey' && el.state === 'WANDER') {
          behaviorText = 'Исследовательский интерес: матриарх изучает предметы обогащения и порядок в вольере';
        } else if (el.id === 'margo' && (el.state === 'IDLE' || el.statusText.includes('чешет'))) {
          behaviorText = 'Переменчивое внимание: периодически отвлекается на окружающие звуки и чешет бок';
        } else if (el.id === 'pretty' && (el.state === 'REST' || el.energy < 55)) {
          behaviorText = 'Склонность к покою: глубокий длительный отдых на мягком настиле, сохранение сил';
        } else if (el.state === 'REST') {
          behaviorText = 'Спокойное, глубокий физиологический отдых; дыхание мерное, стресс отсутствует';
        } else if (el.state === 'EAT') {
          behaviorText = 'Естественное кормовое поведение; спокойно поедает рацион, контактная и дружелюбная';
        } else if (el.thirst > 60) {
          behaviorText = 'Повышенная настороженность и беспокойство: частый поиск воды у автопоилки';
        }

        let appetiteText = el.satiety < 40
          ? `Аппетит снижен: уровень сытости ${Math.round(el.satiety)}%, кормушка пустует, требуется раздача корма`
          : `Аппетит отличный: сытость ${Math.round(el.satiety)}%, охотно поедает предложенные сено и кашу`;
        if (el.id === 'pretty' && el.satiety < 55) {
          appetiteText = `Аппетит умеренный (${Math.round(el.satiety)}%): чутка к свежести корма, ожидает теплую кашу и морковь`;
        }
        if (ev && ev.type === 'pretty_low_activity') {
          appetiteText = ev.actionDone ? 'Аппетит сохранен: охотно принимает предложенную кашу и морковь' : 'Аппетит вялый: требуется свежая раздача и контроль поедаемости корма';
        } else if (ev && ev.type === 'scattered_hay') {
          appetiteText = ev.actionDone ? 'Кормовая зона в порядке: сено в кормушке, рацион усваивается' : 'Игривое кормовое поведение: вытаскивает сено из кормушки на настил';
        } else if (ev && ev.type === 'feeder_crust') {
          appetiteText = ev.actionDone ? 'Гигиена кормления соблюдена: бортик кормушки очищен от засохшей каши' : 'Осторожничает у кормушки: требуется санитарная очистка бортика';
        }

        return [
          {
            category: 'Поведение и покой',
            text: behaviorText,
            ok: el.thirst <= 60 && (!ev || (ev.type !== 'trough_low_thirst' && ev.type !== 'tool_misplaced') || ev.actionDone)
          },
          {
            category: 'Аппетит и питание',
            text: appetiteText,
            ok: el.satiety >= 40 && (!ev || (ev.type !== 'pretty_low_activity' && ev.type !== 'scattered_hay' && ev.type !== 'feeder_crust') || ev.actionDone)
          },
          {
            category: 'Опора и стопы',
            text: ev && ev.type === 'sanitation_cluster'
              ? (ev.actionDone ? 'Чистый настил: сектор прибран, походка уверенная, опора на 4 конечности' : 'Осторожная поступь: избегает наступать на загрязненный участок настила')
              : (el.pedicureDone
                ? 'Стопы в отличном состоянии: ногти и подошвы расчищены, трещин и наминов нет'
                : (el.isWantingPedicure
                  ? 'Осторожное наступание: отросли роговые пластины ногтей, показана плановая расчистка'
                  : 'Походка ровная, опора на все 4 конечности, подошвенный слой без признаков деформаций')),
            ok: !el.isWantingPedicure || el.pedicureDone
          },
          {
            category: 'Глаза, уши и хобот',
            text: el.age >= 40
              ? 'Возрастные особенности: умеренное слезоотделение, ушные раковины эластичные, хобот влажный'
              : 'Взгляд ясный, роговица чистая, дыхание ровное, хобот подвижный без повреждений',
            ok: true
          },
          {
            category: 'Тонус и активность',
            text: ev && ev.type === 'pretty_low_activity'
              ? (ev.actionDone ? 'Тонус нормализовался: животное поднялось и реагирует на кипера' : 'Сниженная активность: долгий отдых в углу, замедленные реакции')
              : (el.energy < 35
                ? `Сниженная активность: бодрость ${Math.round(el.energy)}%, преобладает статический отдых`
                : `Тонус высокий: бодрость ${Math.round(el.energy)}%, энергично исследует вольер и окружение`),
            ok: el.energy >= 35 && (!ev || ev.type !== 'pretty_low_activity' || ev.actionDone)
          }
        ];
      }

export function recordObservationForElephant(el) {
        if (!el) return;
        const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(Math.floor(gameTime.minute)).padStart(2, '0')}`;
        const options = getElephantObservationOptions(el);
        const catIdx = el.selectedObsCategory || 0;
        const selected = options[catIdx] || options[0];

        // Защита от дубликатов: не более одного наблюдения той же категории в текущий час
        const alreadyDoneThisHour = el.observations.some(obs => obs.category === selected.category && obs.hourRecorded === gameTime.hour);
        if (alreadyDoneThisHour) {
          showToast(`⚠️ Наблюдение «${selected.category}» для ${el.name} уже внесено в этом часу!`, '#f39c12');
          sfx.playAlert();
          return;
        }

        const record = {
          time: timeStr,
          hourRecorded: gameTime.hour,
          category: selected.category,
          text: selected.text,
          keeper: 'Дежурный кипер',
          ok: selected.ok,
          snapshot: {
            time: timeStr,
            satiety: Math.round(el.satiety),
            thirst: Math.round(el.thirst),
            energy: Math.round(el.energy)
          }
        };

        el.observations.unshift(record);
        if (el.observations.length > 6) el.observations.pop();

        el.lastInspectionSnapshot = record.snapshot;
        el.lastInspected = timeStr;
        stats.observationsRecorded = (stats.observationsRecorded || 0) + 1;

        // Фиксация наблюдения поощряется очками за бдительность (+25 очков)
        const bonusPoints = 25;
        stats.totalScore += bonusPoints;

        sfx.playSuccess();
        showToast(`📝 Наблюдение «${selected.category}» занесено в журнал (+${bonusPoints} очк.)`, '#2ecc71');
        addLog(`[Журнал кипера · ${el.name}] ${selected.category}: ${selected.text}. (+${bonusPoints} очков).`);
      }
