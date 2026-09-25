/**
 * Что происходит между «дали ссылку» и «показали текст».
 *
 * Порядок поиска такой:
 *   1. своя база — тексты, размеченные людьми под конкретный залив;
 *   2. LRCLIB — вдруг трек выходил и на стримингах, и текст уже есть;
 *   3. ничего — и тогда человеку предлагают написать самому.
 *
 * Найденное в LRCLIB мы кладём к себе один раз: дальше отдаём из своей базы,
 * чужой сервис лишний раз не дёргаем.
 */

import {
  formatLrc,
  formatPlain,
  hasWordTiming,
  isLrc,
  linesFromPlain,
  parseLrc,
  stripWordTags,
} from "./lrc";
import * as lrclib from "./lrclib";
import { withoutFeaturing } from "./normalize";
import * as repo from "./repo";
import type { LyricsRow, TrackRow } from "./repo";

export type LyricsPayload = {
  id: string;
  plain: string;
  synced: string | null;
  hasWords: boolean;
  source: repo.LyricsSource;
  authorName: string | null;
  votes: number;
  published: boolean;
  createdAt: number;
  updatedAt: number;
  /** Свой ли это текст для того, кто спрашивает. */
  mine: boolean;
};

export type TrackPayload = {
  id: string;
  permalink: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationMs: number | null;
};

export function toTrackPayload(track: TrackRow): TrackPayload {
  return {
    id: track.id,
    permalink: track.permalink,
    title: track.title,
    artist: track.artist,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
  };
}

export function toLyricsPayload(row: LyricsRow, mine: boolean): LyricsPayload {
  return {
    id: row.id,
    plain: row.plain,
    synced: row.synced,
    hasWords: row.hasWords,
    source: row.source,
    authorName: row.authorName,
    votes: row.votes,
    published: row.published,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    mine,
  };
}

/**
 * Ищет текст в LRCLIB и сохраняет к себе.
 *
 * Возвращает `null`, если не нашлось или если мы уже ходили туда за этим
 * треком: второй раз спрашивать незачем.
 */
export async function importFromLrclib(track: TrackRow): Promise<LyricsRow | null> {
  const existing = await repo.findBySource(track.id, "lrclib");
  if (existing) return null;

  const duration = track.durationMs ? track.durationMs / 1000 : undefined;
  const query = { artist: track.artist, title: track.title, duration };

  let found = await lrclib.find(query).catch(() => null);
  if (!found) {
    // Название с «feat. …» часто мешает попасть в их карточку.
    const shorter = withoutFeaturing(track.title);
    if (shorter && shorter !== track.title) {
      found = await lrclib.find({ ...query, title: shorter }).catch(() => null);
    }
  }
  if (!found || found.instrumental) return null;

  const plain = found.plainLyrics?.trim();
  const synced = found.syncedLyrics?.trim();
  if (!plain && !synced) return null;

  const lines = synced ? parseLrc(synced).lines : [];
  return repo.createLyrics({
    trackId: track.id,
    plain: plain || lines.map((line) => line.text).join("\n"),
    synced: synced || null,
    hasWords: hasWordTiming(lines),
    source: "lrclib",
    authorName: "LRCLIB",
    authorKey: "lrclib",
  });
}

export type TrackView = {
  track: TrackPayload;
  lyrics: LyricsPayload[];
};

/** Полная карточка трека: он сам и все версии текста по убыванию годности. */
export async function trackView(track: TrackRow, viewerKey: string): Promise<TrackView> {
  let rows = await repo.listLyrics(track.id);
  if (rows.length === 0) {
    const imported = await importFromLrclib(track);
    if (imported) rows = [imported];
  }

  return {
    track: toTrackPayload(track),
    lyrics: rows.map((row) => toLyricsPayload(row, row.authorKey === viewerKey)),
  };
}

export type SaveInput = {
  trackId: string;
  /** Либо простыня текста, либо готовый LRC — разберёмся сами. */
  content: string;
  authorName?: string | null;
  language?: string | null;
  authorKey: string;
};

/** Разбирает то, что прислали, и раскладывает на «текст» и «разметку». */
export function splitContent(content: string): {
  plain: string;
  synced: string | null;
  hasWords: boolean;
} {
  if (!isLrc(content)) {
    // Простыню приводим в порядок здесь, а не в браузере: через API текст
    // приходит и мимо нашей формы, а обещание «пометки уберём сами» должно
    // выполняться в любом случае.
    return { plain: formatPlain(linesFromPlain(content)), synced: null, hasWords: false };
  }

  const { lines } = parseLrc(content);
  const timed = lines.filter((line) => line.time !== null);
  return {
    plain: lines.map((line) => stripWordTags(line.text)).join("\n").trim(),
    synced: timed.length ? formatLrc(lines) : null,
    hasWords: hasWordTiming(lines),
  };
}
