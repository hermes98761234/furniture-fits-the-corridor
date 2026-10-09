import type { Lang, Step } from './lib/model'

export type T = (s: string, ...args: (string | number)[]) => string

/** Marks a string for translation where it is defined away from its t() call. */
export const N = (s: string) => s

export const STEP_LABEL: Record<Step['kind'], string> = { doorway: N('Doorway'), turn: N('Corridor turn') }

/** English source string → Ukrainian. `{0}`, `{1}` are placeholders for interpolated values. */
export const UK: Record<string, string> = {
  'Furniture fits the corridor': 'Чи пройдуть меблі коридором',
  'Will it get through? A 3D check for doorways and corridor turns.': 'Чи пройде? 3D-перевірка для дверей і поворотів коридору.',
  'Results are estimates on a grid. Leave a little extra room.': 'Результати — оцінка на сітці. Залиште трохи запасу.',
  'Source on GitHub': 'Код на GitHub',
  Item: 'Предмет',
  Length: 'Довжина',
  Width: 'Ширина',
  Height: 'Висота',
  cm: 'см',
  in: 'дюйм',
  'Clearance per side': 'Запас з кожного боку',
  'Added to every side for wrapping and hands.': 'Додається з усіх боків на пакування та руки.',
  Settings: 'Налаштування',
  Units: 'Одиниці',
  Centimetres: 'Сантиметри',
  Inches: 'Дюйми',
  Quality: 'Точність',
  Fast: 'Швидко',
  Balanced: 'Збалансовано',
  Precise: 'Точно',
  Language: 'Мова',
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  Route: 'Маршрут',
  'Add a doorway or turn.': 'Додайте дверний проріз або поворот.',
  Doorway: 'Дверний проріз',
  'Corridor turn': 'Поворот коридору',
  'Move up': 'Вгору',
  'Move down': 'Вниз',
  Remove: 'Видалити',
  'Opening width': 'Ширина прорізу',
  'Opening height': 'Висота прорізу',
  'Wall thickness': 'Товщина стіни',
  'Hallway width in front': 'Ширина коридору перед дверима',
  'open space': 'відкритий простір',
  'Leave the hallway empty if you come from a room. Fill it in if you come along a hallway that runs past the door.':
    'Залиште коридор порожнім, якщо заходите з кімнати. Заповніть, якщо підходите коридором уздовж стіни з дверима.',
  'Corridor width before': 'Ширина коридору до повороту',
  'Corridor width after': 'Ширина коридору після повороту',
  'Ceiling height': 'Висота стелі',
  Result: 'Результат',
  'Checking…': 'Перевіряємо…',
  'Timed out. Try a faster quality setting.': 'Час вичерпано. Спробуйте швидший режим точності.',
  'Error: {0}': 'Помилка: {0}',
  "Doesn't fit: short by {0} or more": 'Не проходить: бракує {0} або більше',
  "Doesn't fit: short by {0}": 'Не проходить: бракує {0}',
  'lying flat': 'лежачи',
  'on its side': 'на боці',
  'stood on end': 'стоячи',
  ', tilted up to {0}°': ', з нахилом до {0}°',
  'Fits with {0}+ to spare': 'Проходить, запас {0}+',
  'Fits with {0} to spare': 'Проходить, запас {0}',
  'Fix the highlighted fields.': 'Виправте виділені поля.',
  "It won't fit: {0} of {1} steps blocked.": 'Не пройде: заблоковано кроків — {0} з {1}.',
  'It fits through the whole route.': 'Проходить увесь маршрут.',
  'Walk-through': 'Прохід',
  'Plan and side view of the selected step': 'План і вигляд збоку для вибраного кроку',
  "No path: it doesn't fit here.": 'Шляху немає: тут не проходить.',
  Pause: 'Пауза',
  Play: 'Відтворити',
  'Position along the path': 'Положення на шляху',
  'Tightest point': 'Найвужче місце',
  Plan: 'План',
  Side: 'Збоку',
}

export function tr(lang: Lang, s: string, ...args: (string | number)[]): string {
  const src = lang === 'uk' ? (UK[s] ?? s) : s
  return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
}
