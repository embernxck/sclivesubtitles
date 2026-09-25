import { describe, expect, it } from "vitest";
import { splitContent } from "./lyricsService";

describe("разбор присланного текста", () => {
  it("простыню чистит и не считает размеченной", () => {
    const result = splitContent("[Куплет]\nпервая строка\n\n\n\nвторая строка\n");
    expect(result.plain).toBe("первая строка\n\nвторая строка");
    expect(result.synced).toBeNull();
    expect(result.hasWords).toBe(false);
  });

  it("LRC раскладывает на текст и разметку", () => {
    const result = splitContent("[00:01.00]первая\n[00:05.00]вторая");
    expect(result.plain).toBe("первая\nвторая");
    expect(result.synced).toBe("[00:01.00]первая\n[00:05.00]вторая");
  });

  it("узнаёт пословную разметку", () => {
    const result = splitContent("[00:01.00]<00:01.00>раз <00:01.50>два");
    expect(result.hasWords).toBe(true);
    expect(result.plain).toBe("раз два");
  });

  it("пустое остаётся пустым", () => {
    expect(splitContent("   \n\n  ")).toMatchObject({ plain: "", synced: null });
  });
});
