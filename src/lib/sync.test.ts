import { describe, expect, it } from "vitest";
import { linesFromPlain } from "./lrc";
import {
  createSession,
  currentLine,
  draft,
  finish,
  isFinished,
  nudgeLine,
  progress,
  replaceText,
  retimeFrom,
  tap,
  tokenize,
  undo,
} from "./sync";

const TEXT = "первая\nвторая\nтретья";

/** Сессия без поправки на задержку — так в тестах видно ровно то, что подали. */
function session(text = TEXT) {
  return createSession(linesFromPlain(text), { latency: 0 });
}

describe("тап по строкам", () => {
  it("ставит метки и двигает курсор", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);

    expect(state.cursor).toBe(2);
    expect(state.lines[0]).toMatchObject({ time: 1, text: "первая" });
    expect(state.lines[1]).toMatchObject({ time: 5, text: "вторая" });
    expect(state.lines[2].time).toBeNull();
  });

  it("вычитает задержку реакции", () => {
    const state = tap(createSession(linesFromPlain(TEXT), { latency: 0.2 }), 10);
    expect(state.lines[0].time).toBeCloseTo(9.8, 5);
  });

  it("не уводит метку в минус", () => {
    const state = tap(createSession(linesFromPlain(TEXT), { latency: 0.5 }), 0.1);
    expect(state.lines[0].time).toBe(0);
  });

  it("две метки подряд не совпадают", () => {
    let state = session();
    state = tap(state, 5);
    state = tap(state, 5);
    expect(state.lines[1].time!).toBeGreaterThan(state.lines[0].time!);
  });

  it("метка назад не пускается раньше предыдущей", () => {
    let state = session();
    state = tap(state, 10);
    state = tap(state, 2);
    expect(state.lines[1].time!).toBeGreaterThan(10);
  });

  it("после последней строки тап ничего не портит", () => {
    let state = session("одна");
    state = tap(state, 1);
    expect(isFinished(state)).toBe(true);
    expect(tap(state, 99)).toBe(state);
  });

  it("знает, какая строка следующая", () => {
    const state = tap(session(), 1);
    expect(currentLine(state)?.text).toBe("вторая");
  });
});

describe("отмена", () => {
  it("возвращает состояние и говорит, куда перемотать", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);

    const result = undo(state);
    expect(result.state.cursor).toBe(1);
    expect(result.state.lines[1].time).toBeNull();
    // Переигрываем с предыдущей метки, а не с отменённой.
    expect(result.seekTo).toBe(1);
  });

  it("на пустой истории ничего не делает", () => {
    const state = session();
    const result = undo(state);
    expect(result.state).toBe(state);
    expect(result.seekTo).toBeNull();
  });

  it("отменяется столько раз, сколько было тапов", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);
    state = undo(state).state;
    state = undo(state).state;
    expect(progress(state).done).toBe(0);
    expect(state.cursor).toBe(0);
  });
});

describe("тап по словам", () => {
  it("метит слова и переходит к следующей строке", () => {
    let state = createSession(linesFromPlain("раз два\nтри"), { latency: 0, mode: "word" });
    state = tap(state, 1);
    state = tap(state, 2);

    expect(state.lines[0].words).toEqual([
      { time: 1, text: "раз" },
      { time: 2, text: "два" },
    ]);
    // Слова кончились — курсор сам ушёл на следующую строку.
    expect(state.cursor).toBe(1);
    expect(state.wordCursor).toBe(0);
  });

  it("первое слово задаёт время всей строки", () => {
    let state = createSession(linesFromPlain("раз два"), { latency: 0, mode: "word" });
    state = tap(state, 3);
    expect(state.lines[0].time).toBe(3);
  });

  it("проигрыш без слов метится целиком", () => {
    let state = createSession(linesFromPlain("раз\n\nдва"), { latency: 0, mode: "word" });
    state = tap(state, 1);
    state = tap(state, 4);
    expect(state.lines[1]).toMatchObject({ time: 4, text: "" });
    expect(state.cursor).toBe(2);
  });

  it("режет строку на слова так же, как показывает караоке", () => {
    expect(tokenize("  раз   два  ")).toEqual(["раз", "два"]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("правка после разметки", () => {
  it("двигает одну строку вместе с её словами", () => {
    let state = createSession(linesFromPlain("раз два"), { latency: 0, mode: "word" });
    state = tap(state, 5);
    state = tap(state, 6);
    state = nudgeLine(state, 0, -0.5);

    expect(state.lines[0].time).toBe(4.5);
    expect(state.lines[0].words?.[1].time).toBe(5.5);
  });

  it("неразмеченную строку двигать нечего", () => {
    const state = session();
    expect(nudgeLine(state, 0, 1)).toBe(state);
  });

  it("переразметка снимает метки со строки и со всех следующих", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);
    state = tap(state, 9);
    state = retimeFrom(state, 1);

    expect(state.cursor).toBe(1);
    expect(state.lines[0].time).toBe(1);
    expect(state.lines[1].time).toBeNull();
    expect(state.lines[2].time).toBeNull();
  });

  it("правка текста сохраняет метки у совпавших строк", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);

    const next = linesFromPlain("первая\nвторая\nтретья\nчетвёртая");
    state = replaceText(state, next);

    expect(state.lines[0].time).toBe(1);
    expect(state.lines[1].time).toBe(5);
    expect(state.lines).toHaveLength(4);
    // Курсор встал на первую неразмеченную.
    expect(state.cursor).toBe(2);
  });

  it("изменённая строка теряет метку", () => {
    let state = session();
    state = tap(state, 1);
    state = replaceText(state, linesFromPlain("другая\nвторая\nтретья"));
    expect(state.lines[0].time).toBeNull();
    expect(state.cursor).toBe(0);
  });
});

describe("итог", () => {
  it("считает прогресс", () => {
    let state = session();
    expect(progress(state)).toEqual({ done: 0, total: 3, complete: false });
    state = tap(state, 1);
    state = tap(state, 5);
    state = tap(state, 9);
    expect(progress(state)).toEqual({ done: 3, total: 3, complete: true });
  });

  it("готовый результат — только размеченное, по времени", () => {
    let state = session();
    state = tap(state, 1);
    state = tap(state, 5);

    expect(finish(state)).toEqual([
      { time: 1, text: "первая" },
      { time: 5, text: "вторая" },
    ]);
    // Черновик сохраняет и неразмеченное, чтобы дописать потом.
    expect(draft(state)).toHaveLength(3);
  });
});
