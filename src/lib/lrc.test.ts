import { describe, expect, it } from "vitest";
import {
  activeLineIndex,
  activeWordIndex,
  formatLrc,
  formatStamp,
  hasWordTiming,
  isLrc,
  linesFromPlain,
  parseLrc,
  parseStamp,
  shiftLines,
  stripWordTags,
  syncedCount,
} from "./lrc";

describe("метки времени", () => {
  it("разбирает привычные формы", () => {
    expect(parseStamp("00:12.34")).toBeCloseTo(12.34, 5);
    expect(parseStamp("01:00")).toBe(60);
    expect(parseStamp("02:03,50")).toBeCloseTo(123.5, 5);
    expect(parseStamp("00:01:30.00")).toBe(90);
  });

  it("дробь дополняет справа, а не слева", () => {
    // «.5» — это полсекунды, а не пять сотых.
    expect(parseStamp("00:10.5")).toBeCloseTo(10.5, 5);
    expect(parseStamp("00:10.05")).toBeCloseTo(10.05, 5);
  });

  it("отказывает мусору и мета-тегам", () => {
    expect(parseStamp("ti:Название")).toBeNull();
    expect(parseStamp("00:99.00")).toBeNull();
    expect(parseStamp("")).toBeNull();
  });

  it("собирает обратно и переносит через минуту", () => {
    expect(formatStamp(12.34)).toBe("00:12.34");
    expect(formatStamp(59.999)).toBe("01:00.00");
    expect(formatStamp(605.5)).toBe("10:05.50");
    expect(formatStamp(-1)).toBe("00:00.00");
  });

  it("минуты за 59 не сворачиваются в часы", () => {
    expect(formatStamp(3601)).toBe("60:01.00");
  });
});

describe("разбор LRC", () => {
  it("читает метаданные и строки", () => {
    const parsed = parseLrc(
      ["[ti:Проверка]", "[ar:Никто]", "[00:01.00]первая", "[00:05.50]вторая"].join("\n"),
    );
    expect(parsed.meta.title).toBe("Проверка");
    expect(parsed.meta.artist).toBe("Никто");
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({ time: 1, text: "первая" });
  });

  it("несколько меток на одной строке дают несколько строк", () => {
    const parsed = parseLrc("[00:10.00][01:10.00]повтор");
    expect(parsed.lines.map((line) => line.time)).toEqual([10, 70]);
    expect(parsed.lines.every((line) => line.text === "повтор")).toBe(true);
  });

  it("читает пословные метки", () => {
    const parsed = parseLrc("[00:01.00]<00:01.00>раз <00:01.50>два <00:02.00>три");
    const [line] = parsed.lines;
    expect(line.text).toBe("раз два три");
    expect(line.words).toHaveLength(3);
    expect(line.words?.[1]).toMatchObject({ time: 1.5, text: "два" });
  });

  it("текст до первой пословной метки поётся с начала строки", () => {
    const parsed = parseLrc("[00:04.00]эй <00:05.00>ты");
    expect(parsed.lines[0].words).toEqual([
      { time: 4, text: "эй" },
      { time: 5, text: "ты" },
    ]);
  });

  it("сортирует строки по времени", () => {
    const parsed = parseLrc(["[00:09.00]поздняя", "[00:02.00]ранняя"].join("\n"));
    expect(parsed.lines.map((line) => line.text)).toEqual(["ранняя", "поздняя"]);
  });

  it("строки без меток не теряются", () => {
    const parsed = parseLrc(["[00:01.00]размеченная", "просто текст"].join("\n"));
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[1]).toMatchObject({ time: null, text: "просто текст" });
  });

  it("тег offset вкатывается в метки", () => {
    // Положительный offset по соглашению LRC показывает строки раньше.
    const parsed = parseLrc(["[offset:+500]", "[00:10.00]строка"].join("\n"));
    expect(parsed.lines[0].time).toBeCloseTo(9.5, 5);
  });

  it("узнаёт LRC среди простого текста", () => {
    expect(isLrc("[00:01.00]строка")).toBe(true);
    expect(isLrc("просто текст\nещё строка")).toBe(false);
    expect(isLrc("[Припев]\nстрока")).toBe(false);
  });
});

describe("сборка LRC", () => {
  it("переживает круг разбор → сборка", () => {
    const source = ["[00:01.00]первая", "[00:05.25]вторая", "[00:09.90]третья"].join("\n");
    expect(formatLrc(parseLrc(source).lines)).toBe(source);
  });

  it("переживает круг с пословными метками", () => {
    const source = "[00:01.00]<00:01.00>раз <00:01.50>два";
    expect(formatLrc(parseLrc(source).lines)).toBe(source);
  });

  it("умеет отдавать без пословных меток", () => {
    const source = "[00:01.00]<00:01.00>раз <00:01.50>два";
    expect(formatLrc(parseLrc(source).lines, { words: false })).toBe("[00:01.00]раз два");
  });

  it("не пишет неразмеченные строки", () => {
    const lines = [
      { time: 1, text: "есть метка" },
      { time: null, text: "нет метки" },
    ];
    expect(formatLrc(lines)).toBe("[00:01.00]есть метка");
  });

  it("пишет шапку, когда её просят", () => {
    const out = formatLrc([{ time: 1, text: "строка" }], {
      meta: { title: "Название", artist: "Артист" },
    });
    expect(out.split("\n")).toEqual(["[ti:Название]", "[ar:Артист]", "", "[00:01.00]строка"]);
  });
});

describe("помощники", () => {
  it("снимает пословные метки", () => {
    expect(stripWordTags("<00:01.00>раз <00:01.50>два")).toBe("раз два");
  });

  it("сдвигает всю разметку", () => {
    const lines = shiftLines([{ time: 10, text: "строка", words: [{ time: 10, text: "строка" }] }], -2);
    expect(lines[0].time).toBe(8);
    expect(lines[0].words?.[0].time).toBe(8);
  });

  it("не уводит метки в минус при сдвиге", () => {
    expect(shiftLines([{ time: 1, text: "строка" }], -5)[0].time).toBe(0);
  });

  it("считает размеченное", () => {
    const lines = [
      { time: 1, text: "раз" },
      { time: null, text: "два" },
    ];
    expect(syncedCount(lines)).toBe(1);
    expect(hasWordTiming(lines)).toBe(false);
  });
});

describe("простыня текста в строки", () => {
  it("режет и чистит", () => {
    const lines = linesFromPlain("  первая  \n\n\n\nвторая\n");
    expect(lines.map((line) => line.text)).toEqual(["первая", "", "вторая"]);
  });

  it("убирает шапки разделов", () => {
    const lines = linesFromPlain("[Припев]\nстрока\n[Verse 1]\nещё");
    expect(lines.map((line) => line.text)).toEqual(["строка", "ещё"]);
  });

  it("шапки можно и оставить", () => {
    const lines = linesFromPlain("[Припев]\nстрока", { stripSectionHeaders: false });
    expect(lines).toHaveLength(2);
  });

  it("пустые строки в начале и в конце срезает", () => {
    expect(linesFromPlain("\n\nстрока\n\n")).toEqual([{ time: null, text: "строка" }]);
  });
});

describe("что звучит сейчас", () => {
  const lines = [
    { time: 1, text: "первая" },
    { time: 5, text: "вторая" },
    { time: 9, text: "третья" },
  ];

  it("находит строку по позиции", () => {
    expect(activeLineIndex(lines, 0.5)).toBe(-1);
    expect(activeLineIndex(lines, 1)).toBe(0);
    expect(activeLineIndex(lines, 4.9)).toBe(0);
    expect(activeLineIndex(lines, 5)).toBe(1);
    expect(activeLineIndex(lines, 100)).toBe(2);
  });

  it("находит слово внутри строки", () => {
    const line = {
      time: 1,
      text: "раз два",
      words: [
        { time: 1, text: "раз" },
        { time: 2, text: "два" },
      ],
    };
    expect(activeWordIndex(line, 0)).toBe(-1);
    expect(activeWordIndex(line, 1.5)).toBe(0);
    expect(activeWordIndex(line, 2.5)).toBe(1);
  });

  it("без пословной разметки слова не ищутся", () => {
    expect(activeWordIndex({ time: 1, text: "строка" }, 5)).toBe(-1);
  });
});
