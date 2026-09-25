/**
 * Движок тап-синхронизации.
 *
 * Играет трек, человек жмёт кнопку в начале каждой строки — из этого
 * получается размеченный текст. Плюс то же самое по словам, если хочется
 * караоке с подсветкой по слогам.
 *
 * Здесь только состояние и переходы: ни плеера, ни React. Всё неизменяемое —
 * каждое действие возвращает новое состояние, так его удобно и хранить
 * в `useState`, и проверять тестами.
 */

import type { LrcLine, LrcWord } from "./lrc";
import { sortLines, syncedCount } from "./lrc";

/** Метки не должны налезать друг на друга: у двух тапов подряд разное время. */
const MIN_GAP = 0.05;

/**
 * Насколько человек опаздывает с тапом. Слышишь строку — и только потом
 * жмёшь; без поправки весь текст съезжает вперёд на эту величину.
 */
export const DEFAULT_LATENCY = 0.15;

export type SyncMode = "line" | "word";

export type SyncSnapshot = {
  lines: LrcLine[];
  cursor: number;
  wordCursor: number;
};

export type SyncState = SyncSnapshot & {
  mode: SyncMode;
  /** Поправка на задержку реакции, секунды. Вычитается из времени тапа. */
  latency: number;
  history: SyncSnapshot[];
};

export type SyncOptions = {
  mode?: SyncMode;
  latency?: number;
};

/** Режет строку на слова так же, как их потом показывает караоке. */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function createSession(lines: LrcLine[], options: SyncOptions = {}): SyncState {
  const { mode = "line", latency = DEFAULT_LATENCY } = options;
  return {
    lines: lines.map((line) => ({ ...line })),
    cursor: 0,
    wordCursor: 0,
    mode,
    latency,
    history: [],
  };
}

function snapshot(state: SyncState): SyncSnapshot {
  return {
    lines: state.lines.map((line) => ({
      ...line,
      words: line.words ? line.words.map((word) => ({ ...word })) : undefined,
    })),
    cursor: state.cursor,
    wordCursor: state.wordCursor,
  };
}

/** Последняя проставленная метка — от неё считаем минимальный зазор. */
function lastStamp(lines: LrcLine[], before: number): number | null {
  for (let index = Math.min(before, lines.length) - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.words?.length) return line.words[line.words.length - 1].time;
    if (line.time !== null) return line.time;
  }
  return null;
}

export function isFinished(state: SyncState): boolean {
  return state.cursor >= state.lines.length;
}

/** Строка, которую разметит следующий тап. */
export function currentLine(state: SyncState): LrcLine | null {
  return state.lines[state.cursor] ?? null;
}

/**
 * Тап: ставит метку на текущую строку (или слово) и двигает курсор.
 *
 * `position` — время плеера в секундах. Поправка на задержку и минимальный
 * зазор применяются здесь же, звать их отдельно не нужно.
 */
export function tap(state: SyncState, position: number): SyncState {
  if (isFinished(state)) return state;

  const previous = lastStamp(state.lines, state.cursor + 1);
  const floor = previous === null ? 0 : previous + MIN_GAP;
  const time = Math.max(floor, Math.max(0, position - state.latency));

  const history = [...state.history, snapshot(state)];
  const lines = state.lines.map((line) => ({ ...line }));
  const line = lines[state.cursor];

  if (state.mode === "line") {
    lines[state.cursor] = { ...line, time };
    return { ...state, lines, history, cursor: state.cursor + 1, wordCursor: 0 };
  }

  const tokens = tokenize(line.text);
  if (tokens.length === 0) {
    // Проигрыш: слов нет, метим строку целиком и идём дальше.
    lines[state.cursor] = { ...line, time };
    return { ...state, lines, history, cursor: state.cursor + 1, wordCursor: 0 };
  }

  const words: LrcWord[] = line.words ? [...line.words] : [];
  while (words.length < tokens.length) {
    words.push({ time: 0, text: tokens[words.length] });
  }
  words[state.wordCursor] = { time, text: tokens[state.wordCursor] };

  const isFirstWord = state.wordCursor === 0;
  lines[state.cursor] = {
    ...line,
    time: isFirstWord ? time : line.time,
    words: words.slice(0, tokens.length),
  };

  const nextWord = state.wordCursor + 1;
  if (nextWord >= tokens.length) {
    return { ...state, lines, history, cursor: state.cursor + 1, wordCursor: 0 };
  }
  return { ...state, lines, history, wordCursor: nextWord };
}

export type UndoResult = {
  state: SyncState;
  /** Куда перемотать плеер, чтобы переразметить с этого места. `null` — некуда. */
  seekTo: number | null;
};

/** Отменяет последний тап и говорит, откуда переигрывать. */
export function undo(state: SyncState): UndoResult {
  const previous = state.history[state.history.length - 1];
  if (!previous) return { state, seekTo: null };

  const restored: SyncState = {
    ...state,
    lines: previous.lines,
    cursor: previous.cursor,
    wordCursor: previous.wordCursor,
    history: state.history.slice(0, -1),
  };

  // Перематываем к предыдущей метке, а не к отменённой: иначе человек
  // услышит строку с середины и опять промахнётся.
  const anchor = lastStamp(restored.lines, restored.cursor);
  return { state: restored, seekTo: anchor };
}

/** Двигает одну строку на `delta` секунд — для точечной правки после разметки. */
export function nudgeLine(state: SyncState, index: number, delta: number): SyncState {
  const line = state.lines[index];
  if (!line || line.time === null) return state;

  const history = [...state.history, snapshot(state)];
  const lines = state.lines.map((item) => ({ ...item }));
  const time = Math.max(0, line.time + delta);
  lines[index] = {
    ...line,
    time,
    words: line.words?.map((word) => ({ ...word, time: Math.max(0, word.time + delta) })),
  };
  return { ...state, lines, history };
}

/** Ставит курсор на строку и снимает метки с неё и со всех следующих. */
export function retimeFrom(state: SyncState, index: number): SyncState {
  if (index < 0 || index >= state.lines.length) return state;

  const history = [...state.history, snapshot(state)];
  const lines = state.lines.map((line, position) =>
    position >= index ? { ...line, time: null, words: undefined } : { ...line },
  );
  return { ...state, lines, history, cursor: index, wordCursor: 0 };
}

/** Заменяет текст, сохраняя уже проставленные метки там, где строки совпали. */
export function replaceText(state: SyncState, next: LrcLine[]): SyncState {
  const history = [...state.history, snapshot(state)];
  const lines = next.map((line, index) => {
    const old = state.lines[index];
    if (old && old.time !== null && old.text === line.text) return { ...old };
    return { ...line };
  });
  const cursor = lines.findIndex((line) => line.time === null);
  return {
    ...state,
    lines,
    history,
    cursor: cursor === -1 ? lines.length : cursor,
    wordCursor: 0,
  };
}

export type SyncProgress = {
  done: number;
  total: number;
  complete: boolean;
};

export function progress(state: SyncState): SyncProgress {
  const total = state.lines.length;
  const done = syncedCount(state.lines);
  return { done, total, complete: total > 0 && done === total };
}

/** Готовый результат: только размеченные строки, по времени. */
export function finish(state: SyncState): LrcLine[] {
  return sortLines(state.lines.filter((line) => line.time !== null));
}

/** Всё вместе, включая ещё не размеченное, — для сохранения черновика. */
export function draft(state: SyncState): LrcLine[] {
  return sortLines(state.lines);
}
