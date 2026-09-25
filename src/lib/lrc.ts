/**
 * Разбор и сборка LRC — обычного и расширенного (Enhanced LRC).
 *
 * Обычный LRC — метка на строку:      [00:12.34]строка
 * Расширенный — ещё и метка на слово: [00:12.34]<00:12.34>сло<00:12.80>во
 *
 * Расширенный формат понимают не все плееры, поэтому наружу мы умеем отдавать
 * и урезанную версию (`stripWordTags`). Внутри сервиса слова нужны для
 * караоке-подсветки — того самого, ради чего люди и держат Musixmatch.
 *
 * Модуль чистый: ни сети, ни базы, ни DOM. Поэтому он весь под тестами.
 */

export type LrcWord = {
  /** Секунды от начала трека. */
  time: number;
  text: string;
};

export type LrcLine = {
  /** Секунды от начала трека. `null` — строка написана, но ещё не размечена. */
  time: number | null;
  text: string;
  /** Пословная разметка. Пусто — её нет, подсвечиваем строку целиком. */
  words?: LrcWord[];
};

export type LrcMeta = {
  title?: string;
  artist?: string;
  album?: string;
  /** Кто разметил — тег `[by:]`. */
  by?: string;
  /** Длительность трека, секунды — тег `[length:]`. */
  length?: number;
  /**
   * Тег `[offset:]` в миллисекундах. По устоявшемуся в LRC соглашению
   * положительное значение показывает строки РАНЬШЕ, то есть вычитается
   * из меток. Мы его так и применяем при разборе и наружу больше не пишем:
   * в выгрузке сдвиг уже вкатан в сами метки, так что файл везде одинаков.
   */
  offsetMs?: number;
  language?: string;
};

export type ParsedLrc = {
  meta: LrcMeta;
  lines: LrcLine[];
};

/** Метка времени: `mm:ss`, `mm:ss.xx`, `mm:ss.xxx`, `hh:mm:ss.xx`. */
const STAMP = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?$/;
/** Метаданные: `[ar:Артист]`. */
const META = /^([a-zA-Z_]+):(.*)$/;
/** Пословная метка внутри строки. */
const WORD_TAG = /<(\d{1,3}:\d{1,2}(?:[.,]\d{1,3})?)>/g;

/** Разбирает тело метки в секунды. Возвращает `null`, если это не метка. */
export function parseStamp(body: string): number | null {
  const match = STAMP.exec(body.trim());
  if (!match) return null;

  const [, rawHours, rawMinutes, rawSeconds, rawFraction] = match;
  const hours = rawHours ? Number(rawHours) : 0;
  const minutes = Number(rawMinutes);
  const seconds = Number(rawSeconds);
  if (seconds >= 60) return null;

  // «.5» — это полсекунды, «.05» — пять сотых. Дополняем справа, а не слева.
  const fraction = rawFraction ? Number(rawFraction.padEnd(3, "0")) / 1000 : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

/** Секунды → `mm:ss.xx`. Минуты за 59 не сворачиваются в часы: так принято в LRC. */
export function formatStamp(seconds: number, precision: 2 | 3 = 2): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const scale = precision === 3 ? 1000 : 100;

  let ticks = Math.round(safe * scale);
  const whole = Math.floor(ticks / scale);
  ticks -= whole * scale;

  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const fraction = String(ticks).padStart(precision, "0");
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}.${fraction}`;
}

/** Похоже ли это на LRC, а не на простой текст. */
export function isLrc(raw: string): boolean {
  return /^\s*\[\d{1,3}:\d{1,2}(?:[.,]\d{1,3})?\]/m.test(raw);
}

function parseWords(content: string, lineTime: number): LrcWord[] {
  WORD_TAG.lastIndex = 0;
  const words: LrcWord[] = [];
  let cursor = 0;
  let pendingTime: number | null = null;

  for (let match = WORD_TAG.exec(content); match; match = WORD_TAG.exec(content)) {
    const chunk = content.slice(cursor, match.index);
    if (pendingTime === null) {
      // Текст до первой метки поётся с начала строки.
      if (chunk.trim()) words.push({ time: lineTime, text: chunk.trim() });
    } else if (chunk.trim()) {
      words.push({ time: pendingTime, text: chunk.trim() });
    }
    pendingTime = parseStamp(match[1]);
    cursor = match.index + match[0].length;
  }

  const tail = content.slice(cursor);
  if (pendingTime !== null && tail.trim()) words.push({ time: pendingTime, text: tail.trim() });
  return words;
}

/** Убирает пословные метки, оставляя обычный текст строки. */
export function stripWordTags(content: string): string {
  return content.replace(WORD_TAG, "").replace(/\s+/g, " ").trim();
}

export function parseLrc(raw: string): ParsedLrc {
  const meta: LrcMeta = {};
  const lines: LrcLine[] = [];

  for (const rawLine of raw.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const stamps: number[] = [];
    let cursor = 0;
    let sawMeta = false;

    // Скобки идут только слева, одна за другой: `[00:01.00][00:31.00]строка`.
    while (cursor < line.length && line[cursor] === "[") {
      const close = line.indexOf("]", cursor);
      if (close === -1) break;

      const body = line.slice(cursor + 1, close);
      const stamp = parseStamp(body);
      if (stamp !== null) {
        stamps.push(stamp);
        cursor = close + 1;
        continue;
      }

      const metaMatch = META.exec(body);
      if (!metaMatch) break;

      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (key === "ti") meta.title = value;
      else if (key === "ar") meta.artist = value;
      else if (key === "al") meta.album = value;
      else if (key === "by") meta.by = value;
      else if (key === "la" || key === "lang") meta.language = value;
      else if (key === "length") meta.length = parseStamp(value) ?? undefined;
      else if (key === "offset") {
        const offset = Number(value.replace("+", ""));
        if (Number.isFinite(offset)) meta.offsetMs = offset;
      }
      sawMeta = true;
      cursor = close + 1;
    }

    const content = line.slice(cursor).trim();

    if (stamps.length === 0) {
      // Строка без метки. Если это был только мета-тег — пропускаем,
      // иначе считаем неразмеченным текстом: так вставленный вперемешку
      // текст не теряется.
      if (!sawMeta && content) lines.push({ time: null, text: content });
      continue;
    }

    const plain = stripWordTags(content);
    for (const time of stamps) {
      const words = parseWords(content, time);
      lines.push(words.length > 1 ? { time, text: plain, words } : { time, text: plain });
    }
  }

  // Сдвиг из тега вкатываем в метки сразу, чтобы дальше о нём не помнить.
  const shift = meta.offsetMs ? meta.offsetMs / 1000 : 0;
  const shifted = shift
    ? lines.map((line) => shiftLine(line, -shift))
    : lines;

  return { meta, lines: sortLines(shifted) };
}

function shiftLine(line: LrcLine, delta: number): LrcLine {
  const time = line.time === null ? null : Math.max(0, line.time + delta);
  const words = line.words?.map((word) => ({ ...word, time: Math.max(0, word.time + delta) }));
  return words ? { time, text: line.text, words } : { time, text: line.text };
}

/** Сдвигает всю разметку на `delta` секунд. Отрицательное — раньше. */
export function shiftLines(lines: LrcLine[], delta: number): LrcLine[] {
  if (!delta) return lines;
  return sortLines(lines.map((line) => shiftLine(line, delta)));
}

/** Размеченные строки идут по времени, неразмеченные — в хвост в своём порядке. */
export function sortLines(lines: LrcLine[]): LrcLine[] {
  const timed = lines.filter((line) => line.time !== null);
  const untimed = lines.filter((line) => line.time === null);
  timed.sort((a, b) => (a.time as number) - (b.time as number));
  return [...timed, ...untimed];
}

export type FormatOptions = {
  /** Писать ли пословные метки. По умолчанию да, если они есть. */
  words?: boolean;
  precision?: 2 | 3;
  meta?: LrcMeta;
};

export function formatLrc(lines: LrcLine[], options: FormatOptions = {}): string {
  const { words = true, precision = 2, meta } = options;
  const out: string[] = [];

  if (meta?.title) out.push(`[ti:${meta.title}]`);
  if (meta?.artist) out.push(`[ar:${meta.artist}]`);
  if (meta?.album) out.push(`[al:${meta.album}]`);
  if (meta?.by) out.push(`[by:${meta.by}]`);
  if (meta?.length !== undefined) out.push(`[length:${formatStamp(meta.length, 2)}]`);
  if (out.length) out.push("");

  for (const line of sortLines(lines)) {
    if (line.time === null) continue;
    const stamp = `[${formatStamp(line.time, precision)}]`;

    if (words && line.words && line.words.length > 1) {
      const body = line.words
        .map((word) => `<${formatStamp(word.time, precision)}>${word.text}`)
        .join(" ");
      out.push(`${stamp}${body}`);
    } else {
      out.push(`${stamp}${line.text}`);
    }
  }

  return out.join("\n");
}

/** Простой текст из строк — то, что показываем, когда разметки нет. */
export function formatPlain(lines: LrcLine[]): string {
  return lines.map((line) => line.text).join("\n");
}

export type PlainOptions = {
  /**
   * Убирать ли шапки разделов вроде `[Припев]` или `[Verse 1]`.
   * В караоке их не поют, а место они занимают.
   */
  stripSectionHeaders?: boolean;
};

/**
 * Простыня текста → строки для разметки.
 *
 * Пустая строка сохраняется ровно одна подряд — это проигрыш, во время
 * которого в караоке показывают «♪». Больше одной подряд не нужно.
 */
export function linesFromPlain(raw: string, options: PlainOptions = {}): LrcLine[] {
  const { stripSectionHeaders = true } = options;
  const result: LrcLine[] = [];
  let lastWasBlank = true; // чтобы срезать пустоту в начале

  for (const rawLine of raw.split(/\r\n|\r|\n/)) {
    let text = rawLine.replace(/\s+/g, " ").trim();

    if (stripSectionHeaders && /^[[(【][^\])】]{1,40}[\])】]$/.test(text)) continue;

    if (!text) {
      if (lastWasBlank) continue;
      lastWasBlank = true;
      result.push({ time: null, text: "" });
      continue;
    }

    lastWasBlank = false;
    result.push({ time: null, text });
  }

  while (result.length && result[result.length - 1].text === "") result.pop();
  return result;
}

/** Строка, которая звучит в момент `position`. `-1`, если ещё не началась. */
export function activeLineIndex(lines: LrcLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const time = lines[middle].time;
    if (time === null || time > position) {
      high = middle - 1;
    } else {
      found = middle;
      low = middle + 1;
    }
  }
  return found;
}

/** Слово, которое звучит внутри строки. `-1`, если разметки слов нет. */
export function activeWordIndex(line: LrcLine, position: number): number {
  if (!line.words || line.words.length === 0) return -1;
  let found = -1;
  for (let index = 0; index < line.words.length; index += 1) {
    if (line.words[index].time <= position) found = index;
    else break;
  }
  return found;
}

/** Сколько строк размечено. Показываем в интерфейсе как прогресс. */
export function syncedCount(lines: LrcLine[]): number {
  return lines.reduce((count, line) => (line.time !== null ? count + 1 : count), 0);
}

export function hasWordTiming(lines: LrcLine[]): boolean {
  return lines.some((line) => (line.words?.length ?? 0) > 1);
}
