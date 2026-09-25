import { describe, expect, it } from "vitest";
import { cleanTitle, fingerprint, withoutFeaturing } from "./normalize";

describe("чистка названий SoundCloud", () => {
  it("убирает «(prod. …)»", () => {
    expect(cleanTitle("Артист", "Песня (prod. Somebody)")).toEqual({
      artist: "Артист",
      title: "Песня",
    });
  });

  it("убирает «[Free DL]» и родню", () => {
    expect(cleanTitle("A", "Track [Free DL]").title).toBe("Track");
    expect(cleanTitle("A", "Track (FREE DOWNLOAD)").title).toBe("Track");
    expect(cleanTitle("A", "Track | Free Download").title).toBe("Track");
  });

  it("убирает «(Official Video)» и родню", () => {
    expect(cleanTitle("A", "Track (Official Video)").title).toBe("Track");
    expect(cleanTitle("A", "Track [Official Audio]").title).toBe("Track");
    expect(cleanTitle("A", "Track (Visualizer)").title).toBe("Track");
  });

  it("разбирает «Артист - Название» внутри названия", () => {
    expect(cleanTitle("label-profile", "Real Artist - Real Song")).toEqual({
      artist: "Real Artist",
      title: "Real Song",
    });
  });

  it("убирает дубль артиста", () => {
    expect(cleanTitle("Artist", "Artist - Song")).toEqual({ artist: "Artist", title: "Song" });
  });

  it("длинное тире тоже разделитель", () => {
    expect(cleanTitle("profile", "Someone – Something")).toEqual({
      artist: "Someone",
      title: "Something",
    });
  });

  it("справляется со всем мусором сразу", () => {
    expect(
      cleanTitle("Some Label", "Real Artist - Real Song (prod. Guy) [Free DL] (Official Audio) *OUT NOW*"),
    ).toEqual({ artist: "Real Artist", title: "Real Song" });
  });

  it("не оставляет пустого названия", () => {
    // Весь заголовок оказался мусором — лучше неточное, чем ничего.
    expect(cleanTitle("A", "(Official Video)").title).not.toBe("");
  });
});

describe("отпечаток трека", () => {
  it("сводит один трек с разной обёрткой к одному ключу", () => {
    const first = fingerprint("Artist", "Song (Official Video)");
    const second = fingerprint("Artist", "  ARTIST - song  ");
    expect(first).toBe(second);
  });

  it("разные треки не слипаются", () => {
    expect(fingerprint("A", "Первая")).not.toBe(fingerprint("A", "Вторая"));
  });

  it("работает с кириллицей", () => {
    expect(fingerprint("Артист", "Песня")).toBe("артист|песня");
  });
});

describe("feat.", () => {
  it("снимает приписку с участниками", () => {
    expect(withoutFeaturing("Song (feat. Someone)")).toBe("Song");
    expect(withoutFeaturing("Song ft. Someone")).toBe("Song");
  });

  it("не трогает название без приписки", () => {
    expect(withoutFeaturing("Song")).toBe("Song");
  });
});
