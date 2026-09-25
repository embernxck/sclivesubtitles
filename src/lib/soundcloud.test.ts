import { describe, expect, it } from "vitest";
import {
  embedUrl,
  extractTrackId,
  normalizeTrackUrl,
  parseOEmbed,
  stripAuthorSuffix,
  TrackResolveError,
  upgradeArtwork,
} from "./soundcloud";

describe("адрес трека", () => {
  it("приводит разные формы к одной", () => {
    const expected = "https://soundcloud.com/author/track";
    expect(normalizeTrackUrl("https://soundcloud.com/author/track")).toBe(expected);
    expect(normalizeTrackUrl("soundcloud.com/author/track")).toBe(expected);
    expect(normalizeTrackUrl("https://m.soundcloud.com/author/track?utm_source=clipboard")).toBe(
      expected,
    );
  });

  it("сохраняет токен приватной ссылки", () => {
    expect(normalizeTrackUrl("https://soundcloud.com/author/track?secret_token=s-abc")).toBe(
      "https://soundcloud.com/author/track?secret_token=s-abc",
    );
  });

  it("отвергает не треки", () => {
    expect(() => normalizeTrackUrl("https://soundcloud.com/author")).toThrow(TrackResolveError);
    expect(() => normalizeTrackUrl("https://soundcloud.com/author/sets/album")).toThrow(
      /плейлист/i,
    );
    expect(() => normalizeTrackUrl("https://example.com/author/track")).toThrow(/SoundCloud/i);
    expect(() => normalizeTrackUrl("  ")).toThrow(TrackResolveError);
  });
});

describe("ответ oEmbed", () => {
  const sample = {
    title: "Flickermood by Forss",
    author_name: "Forss",
    thumbnail_url: "https://i1.sndcdn.com/artworks-000067273316-smsiqx-t120x120.jpg",
    html: '<iframe src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F293"></iframe>',
  };

  it("достаёт номер трека из встроенного плеера", () => {
    expect(extractTrackId(sample.html)).toBe("293");
    expect(extractTrackId(undefined)).toBeNull();
    expect(extractTrackId("<iframe src='нет номера'></iframe>")).toBeNull();
  });

  it("переживает одиночный «%» в ответе", () => {
    // Такой ответ валит decodeURIComponent целиком — а «%» там живой,
    // из описания трека. Номер всё равно должен находиться.
    const broken =
      '<iframe src="https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F293"></iframe> скидка 100% сегодня';
    expect(extractTrackId(broken)).toBe("293");
  });

  it("находит номер и в нераскодированном адресе", () => {
    expect(
      extractTrackId('<iframe src="https://api.soundcloud.com/tracks/777"></iframe>'),
    ).toBe("777");
  });

  it("снимает «by Автор» с заголовка", () => {
    expect(stripAuthorSuffix("Flickermood by Forss", "Forss")).toBe("Flickermood");
    expect(stripAuthorSuffix("Название", "")).toBe("Название");
  });

  it("просит обложку побольше", () => {
    expect(upgradeArtwork(sample.thumbnail_url)).toContain("-t500x500.jpg");
    expect(upgradeArtwork(null)).toBeNull();
  });

  it("собирает карточку трека", () => {
    const info = parseOEmbed(sample, "https://soundcloud.com/forss/flickermood");
    expect(info).toMatchObject({
      scTrackId: "293",
      title: "Flickermood",
      artist: "Forss",
      permalink: "https://soundcloud.com/forss/flickermood",
    });
    expect(info.fingerprint).toBe("forss|flickermood");
  });

  it("без номера трека карточку не собрать", () => {
    expect(() => parseOEmbed({ title: "x", html: "<iframe></iframe>" }, "u")).toThrow(
      TrackResolveError,
    );
  });
});

describe("встроенный плеер", () => {
  it("собирает адрес без лишнего в интерфейсе", () => {
    const url = new URL(embedUrl("293"));
    expect(url.searchParams.get("url")).toBe("https://api.soundcloud.com/tracks/293");
    expect(url.searchParams.get("sharing")).toBe("false");
    expect(url.searchParams.get("download")).toBe("false");
  });
});
