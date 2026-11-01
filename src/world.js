import { obstacles, CANVAS_WIDTH, CANVAS_HEIGHT, washZone } from './config.js';
import { state, player, elephants, garbageTruck } from './gameState.js';

export function checkCollision(x, y, radius) {
        // Проверка со статическими препятствиями
        for (const obs of obstacles) {
          const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
          const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
          const dx = x - closestX;
          const dy = y - closestY;
          if (dx * dx + dy * dy < radius * radius) {
            return true;
          }
        }
        // Проверка со слонами (чтобы кипер не наступал на туловище)
        for (const el of elephants) {
          const dx = x - el.x;
          const dy = y - el.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + el.radius * 0.7) {
            return true;
          }
        }
        // Препятствие: прибывший мусоровоз коммунальной службы (когда на территории слоновника x < 980)
        if (typeof garbageTruck !== 'undefined' && garbageTruck.active && garbageTruck.x < 980) {
          const tx = garbageTruck.x - garbageTruck.w / 2;
          const ty = garbageTruck.y - garbageTruck.h / 2;
          const closestX = Math.max(tx, Math.min(x, tx + garbageTruck.w));
          const closestY = Math.max(ty, Math.min(y, ty + garbageTruck.h));
          const dx = x - closestX;
          const dy = y - closestY;
          if (dx * dx + dy * dy < radius * radius) {
            return true;
          }
        }
        return false;
      }

export function resolveKeeperCollisions() {
        for (const el of elephants) {
          const minDist = player.radius + el.radius * 0.7;
          let dx = player.x - el.x;
          let dy = player.y - el.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= minDist) continue;

          if (dist < 0.01) {
            // Полный совпад центров — выталкиваем вверх (в сторону зоны кипера)
            dx = 0; dy = -1; dist = 0.01;
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          const maxStep = Math.max(overlap, player.speed * 0.05); // плавная коррекция <= ~8 px/кадр

          // Проверяем позиции по мере удаления от слона и занимаем первую свободную:
          // если кипер прижат к стене/объекту, он выходит вдоль преграды, а не сквозь неё.
          let resolved = false;
          for (let s = maxStep; s >= 1; s -= 1) {
            const tx = player.x + nx * s;
            const ty = player.y + ny * s;
            if (!checkCollision(tx, ty, player.radius)) {
              player.x = tx;
              player.y = ty;
              resolved = true;
              break;
            }
          }
          if (!resolved && !checkCollision(player.x, player.y, player.radius)) {
            // Текущая позиция формально допустима (слон вошёл в персонаж) — выходим на дистанцию контакта
            player.x = el.x + nx * minDist;
            player.y = el.y + ny * minDist;
          }
        }
      }

export function canElephantMoveTo(x, y, radius, ignoreElId) {
        // Границы вольера
        if (x < 50 || x > CANVAS_WIDTH - 50 || y < 240 || y > 580) {
          return false;
        }

        // Проверка с препятствиями (стены, кормушки, поилка)
        for (const obs of obstacles) {
          const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
          const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
          const dx = x - closestX;
          const dy = y - closestY;
          if (dx * dx + dy * dy < (radius * 0.65) * (radius * 0.65)) {
            return false;
          }
        }

        // Проверка с другими слонихами (не допускаем застреваний при случайном сближении)
        const currentEl = elephants.find(e => e.id === ignoreElId);
        for (const el of elephants) {
          if (el.id === ignoreElId) continue;
          const dist = Math.hypot(x - el.x, y - el.y);
          const minAllowed = (radius + el.radius) * 0.7;
          if (dist < minAllowed) {
            // Если слонихи уже оказались ближе нормы (например, после огибания навоза),
            // не блокируем шаг, если он увеличивает дистанцию (позволяет разойтись)
            if (currentEl) {
              const currentDist = Math.hypot(currentEl.x - el.x, currentEl.y - el.y);
              if (dist > currentDist) continue;
            }
            return false;
          }
        }

        return true;
      }
