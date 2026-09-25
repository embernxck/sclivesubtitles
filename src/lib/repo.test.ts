import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "sclive-"));
process.env.DATABASE_URL = `file:${join(directory, "test.db")}`;

const { resetForTests } = await import("./db");
const repo = await import("./repo");
import type { TrackInfo } from "./soundcloud";

const TRACK: TrackInfo = {
  scTrackId: "293",
  permalink: "https://soundcloud.com/author/track",
  title: "Проверка",
  artist: "Никто",
  rawTitle: "Никто - Проверка",
  artworkUrl: null,
  fingerprint: "никто|проверка",
};

beforeAll(async () => {
  await repo.upsertTrack(TRACK);
});

afterAll(() => {
  resetForTests();
  rmSync(directory, { recursive: true, force: true });
});

describe("треки", () => {
  it("сохраняет и читает", async () => {
    const track = await repo.getTrack("293");
    expect(track).toMatchObject({ id: "293", title: "Проверка", artist: "Никто" });
  });

  it("повторный залив обновляет, а не двоит", async () => {
    await repo.upsertTrack({ ...TRACK, title: "Проверка 2" });
    expect((await repo.getTrack("293"))?.title).toBe("Проверка 2");
  });

  it("известную длительность не затирает пустой", async () => {
    await repo.setTrackDuration("293", 180_000);
    await repo.upsertTrack({ ...TRACK, title: "Проверка 2" });
    expect((await repo.getTrack("293"))?.durationMs).toBe(180_000);
  });

  it("ищет по названию и артисту", async () => {
    expect(await repo.searchTracks("провер")).toHaveLength(1);
    expect(await repo.searchTracks("никто")).toHaveLength(1);
    expect(await repo.searchTracks("такого нет")).toHaveLength(0);
  });
});

describe("тексты", () => {
  it("создаёт и отдаёт", async () => {
    const created = await repo.createLyrics({
      trackId: "293",
      plain: "первая\nвторая",
      synced: null,
      hasWords: false,
      source: "user",
      authorName: "Кто-то",
      authorKey: "ключ-1",
    });

    expect(created.plain).toContain("первая");
    expect(await repo.listLyrics("293")).toHaveLength(1);
  });

  it("правит только свой", async () => {
    const [existing] = await repo.listLyrics("293");

    const foreign = await repo.updateLyrics(existing.id, "чужой-ключ", { plain: "подменили" });
    expect(foreign).toBeNull();

    const own = await repo.updateLyrics(existing.id, "ключ-1", { plain: "поправил" });
    expect(own?.plain).toBe("поправил");
  });

  it("размеченный руками побеждает размеченный из LRCLIB", async () => {
    await repo.createLyrics({
      trackId: "293",
      plain: "из базы",
      synced: "[00:01.00]из базы",
      hasWords: false,
      source: "lrclib",
      authorKey: "lrclib",
    });
    await repo.createLyrics({
      trackId: "293",
      plain: "свой",
      synced: "[00:01.00]свой",
      hasWords: true,
      source: "user",
      authorKey: "ключ-2",
    });

    expect((await repo.bestLyrics("293"))?.source).toBe("user");
  });

  it("размеченный побеждает неразмеченный", async () => {
    const all = await repo.listLyrics("293");
    const withoutSync = all.findIndex((item) => item.synced === null);
    const withSync = all.findIndex((item) => item.synced !== null);
    expect(withSync).toBeLessThan(withoutSync);
  });
});

describe("голоса", () => {
  it("считает и не даёт голосовать дважды", async () => {
    const [top] = await repo.listLyrics("293");

    expect(await repo.vote(top.id, "гость-1", 1)).toBe(1);
    expect(await repo.vote(top.id, "гость-2", 1)).toBe(2);
    // Тот же гость передумал — голос заменяется, а не прибавляется.
    expect(await repo.vote(top.id, "гость-2", -1)).toBe(0);
  });
});

describe("жалобы", () => {
  it("прячут текст, когда их набирается достаточно", async () => {
    const target = await repo.createLyrics({
      trackId: "293",
      plain: "ерунда",
      synced: null,
      hasWords: false,
      source: "user",
      authorKey: "ключ-3",
    });

    await repo.report(target.id, "spam", null, "гость-1");
    await repo.report(target.id, "spam", null, "гость-2");
    expect((await repo.getLyrics(target.id))?.hidden).toBe(false);

    const third = await repo.report(target.id, "copyright", "правообладатель", "гость-3");
    expect(third.hidden).toBe(true);

    // Спрятанный в общий список не попадает.
    const visible = await repo.listLyrics("293");
    expect(visible.some((item) => item.id === target.id)).toBe(false);
  });
});

describe("сводка", () => {
  it("считает треки и тексты", async () => {
    const result = await repo.stats();
    expect(result.tracks).toBe(1);
    expect(result.lyrics).toBeGreaterThan(0);
    expect(result.synced).toBeGreaterThan(0);
  });

  it("на главную идут только треки с текстом", async () => {
    expect((await repo.recentTracks()).map((track) => track.id)).toEqual(["293"]);
  });
});
