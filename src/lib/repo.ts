/**
 * Запросы к базе. Всё общение с SQL живёт здесь, наружу торчат обычные объекты.
 */

import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db, ensureSchema } from "./db";
import type { TrackInfo } from "./soundcloud";

export type TrackRow = {
  id: string;
  permalink: string;
  title: string;
  artist: string;
  rawTitle: string;
  artworkUrl: string | null;
  fingerprint: string;
  durationMs: number | null;
  createdAt: number;
  updatedAt: number;
};

export type LyricsSource = "user" | "lrclib";

export type LyricsRow = {
  id: string;
  trackId: string;
  plain: string;
  synced: string | null;
  hasWords: boolean;
  language: string | null;
  source: LyricsSource;
  authorName: string | null;
  /** Свёртка ключа автора. Наружу не отдаётся — только сравнивается. */
  authorKey: string;
  votes: number;
  reports: number;
  hidden: boolean;
  published: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Строка для поиска. Приводим регистр здесь: SQL этого с кириллицей не умеет. */
export function searchText(title: string, artist: string): string {
  return `${title} ${artist}`.toLowerCase();
}

/** Сколько жалоб прячет текст до разбора. */
const REPORT_THRESHOLD = Number(process.env.SCLIVE_REPORT_THRESHOLD ?? 3);

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function maybeText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function maybeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return number(value);
}

function toTrack(row: Row): TrackRow {
  return {
    id: text(row.id),
    permalink: text(row.permalink),
    title: text(row.title),
    artist: text(row.artist),
    rawTitle: text(row.raw_title),
    artworkUrl: maybeText(row.artwork_url),
    fingerprint: text(row.fingerprint),
    durationMs: maybeNumber(row.duration_ms),
    createdAt: number(row.created_at),
    updatedAt: number(row.updated_at),
  };
}

function toLyrics(row: Row): LyricsRow {
  return {
    id: text(row.id),
    trackId: text(row.track_id),
    plain: text(row.plain),
    synced: maybeText(row.synced),
    hasWords: number(row.has_words) === 1,
    language: maybeText(row.language),
    source: text(row.source) === "lrclib" ? "lrclib" : "user",
    authorName: maybeText(row.author_name),
    authorKey: text(row.author_key),
    votes: number(row.votes),
    reports: number(row.reports),
    hidden: number(row.hidden) === 1,
    published: number(row.published) === 1,
    createdAt: number(row.created_at),
    updatedAt: number(row.updated_at),
  };
}

/**
 * Порядок версий текста.
 *
 * Размеченный руками под ЭТОТ залив побеждает всё: на SoundCloud у трека
 * бывает своё вступление или другой монтаж, и метки из чужой базы по нему
 * не лягут. Дальше — размеченное из LRCLIB, потом текст без разметки.
 */
const RANK = `
  CASE
    WHEN synced IS NOT NULL AND source = 'user'   THEN 0
    WHEN synced IS NOT NULL                       THEN 1
    WHEN source = 'user'                          THEN 2
    ELSE 3
  END`;

export async function upsertTrack(info: TrackInfo, durationMs?: number | null): Promise<TrackRow> {
  await ensureSchema();
  const now = Date.now();

  await db().execute({
    sql: `INSERT INTO tracks (id, permalink, title, artist, raw_title, artwork_url,
                              fingerprint, search, duration_ms, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            permalink   = excluded.permalink,
            title       = excluded.title,
            artist      = excluded.artist,
            raw_title   = excluded.raw_title,
            artwork_url = excluded.artwork_url,
            fingerprint = excluded.fingerprint,
            search      = excluded.search,
            -- длительность приходит от плеера, поэтому известную не затираем
            duration_ms = COALESCE(excluded.duration_ms, tracks.duration_ms),
            updated_at  = excluded.updated_at`,
    args: [
      info.scTrackId, info.permalink, info.title, info.artist, info.rawTitle,
      info.artworkUrl, info.fingerprint, searchText(info.title, info.artist),
      durationMs ?? null, now, now,
    ],
  });

  const track = await getTrack(info.scTrackId);
  if (!track) throw new Error("трек не сохранился");
  return track;
}

export async function getTrack(id: string): Promise<TrackRow | null> {
  await ensureSchema();
  const result = await db().execute({ sql: `SELECT * FROM tracks WHERE id = ?`, args: [id] });
  return result.rows[0] ? toTrack(result.rows[0]) : null;
}

export async function setTrackDuration(id: string, durationMs: number): Promise<void> {
  await ensureSchema();
  await db().execute({
    sql: `UPDATE tracks SET duration_ms = ?, updated_at = ? WHERE id = ?`,
    args: [Math.round(durationMs), Date.now(), id],
  });
}

/** Треки, у которых уже есть хоть какой-то текст, — для главной. */
export async function recentTracks(limit = 24): Promise<TrackRow[]> {
  await ensureSchema();
  const result = await db().execute({
    sql: `SELECT t.* FROM tracks t
          WHERE EXISTS (SELECT 1 FROM lyrics l WHERE l.track_id = t.id AND l.hidden = 0)
          ORDER BY t.updated_at DESC
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(toTrack);
}

export async function searchTracks(query: string, limit = 24): Promise<TrackRow[]> {
  await ensureSchema();
  const needle = `%${query.trim().toLowerCase()}%`;
  const result = await db().execute({
    sql: `SELECT * FROM tracks
          WHERE search LIKE ?
          ORDER BY updated_at DESC
          LIMIT ?`,
    args: [needle, limit],
  });
  return result.rows.map(toTrack);
}

export async function listLyrics(trackId: string, includeHidden = false): Promise<LyricsRow[]> {
  await ensureSchema();
  const result = await db().execute({
    sql: `SELECT * FROM lyrics
          WHERE track_id = ? ${includeHidden ? "" : "AND hidden = 0"}
          ORDER BY ${RANK}, votes DESC, updated_at DESC`,
    args: [trackId],
  });
  return result.rows.map(toLyrics);
}

export async function bestLyrics(trackId: string): Promise<LyricsRow | null> {
  const all = await listLyrics(trackId);
  return all[0] ?? null;
}

export async function getLyrics(id: string): Promise<LyricsRow | null> {
  await ensureSchema();
  const result = await db().execute({ sql: `SELECT * FROM lyrics WHERE id = ?`, args: [id] });
  return result.rows[0] ? toLyrics(result.rows[0]) : null;
}

/** Уже лежит ли у нас этот текст из LRCLIB — чтобы не плодить копии. */
export async function findBySource(trackId: string, source: LyricsSource): Promise<LyricsRow | null> {
  await ensureSchema();
  const result = await db().execute({
    sql: `SELECT * FROM lyrics WHERE track_id = ? AND source = ? LIMIT 1`,
    args: [trackId, source],
  });
  return result.rows[0] ? toLyrics(result.rows[0]) : null;
}

export type NewLyrics = {
  trackId: string;
  plain: string;
  synced: string | null;
  hasWords: boolean;
  language?: string | null;
  source: LyricsSource;
  authorName?: string | null;
  authorKey: string;
};

export async function createLyrics(input: NewLyrics): Promise<LyricsRow> {
  await ensureSchema();
  const id = randomUUID();
  const now = Date.now();

  await db().execute({
    sql: `INSERT INTO lyrics (id, track_id, plain, synced, has_words, language,
                              source, author_name, author_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, input.trackId, input.plain, input.synced, input.hasWords ? 1 : 0,
      input.language ?? null, input.source, input.authorName ?? null,
      input.authorKey, now, now,
    ],
  });

  await touchTrack(input.trackId, now);
  const created = await getLyrics(id);
  if (!created) throw new Error("текст не сохранился");
  return created;
}

export type LyricsPatch = {
  plain?: string;
  synced?: string | null;
  hasWords?: boolean;
  language?: string | null;
  authorName?: string | null;
};

/**
 * Правка. Свой текст правит автор; чужой — никто, из него делается своя версия.
 * Аккаунтов у нас нет, поэтому «свой» — это тот же ключ из браузера.
 */
export async function updateLyrics(
  id: string,
  authorKey: string,
  patch: LyricsPatch,
): Promise<LyricsRow | null> {
  await ensureSchema();

  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (patch.plain !== undefined) { fields.push("plain = ?"); args.push(patch.plain); }
  if (patch.synced !== undefined) { fields.push("synced = ?"); args.push(patch.synced); }
  if (patch.hasWords !== undefined) { fields.push("has_words = ?"); args.push(patch.hasWords ? 1 : 0); }
  if (patch.language !== undefined) { fields.push("language = ?"); args.push(patch.language); }
  if (patch.authorName !== undefined) { fields.push("author_name = ?"); args.push(patch.authorName); }
  if (fields.length === 0) return getLyrics(id);

  const now = Date.now();
  fields.push("updated_at = ?");
  args.push(now, id, authorKey);

  const result = await db().execute({
    sql: `UPDATE lyrics SET ${fields.join(", ")} WHERE id = ? AND author_key = ?`,
    args,
  });
  if (result.rowsAffected === 0) return null;

  const updated = await getLyrics(id);
  if (updated) await touchTrack(updated.trackId, now);
  return updated;
}

export async function markPublished(id: string): Promise<void> {
  await ensureSchema();
  await db().execute({ sql: `UPDATE lyrics SET published = 1 WHERE id = ?`, args: [id] });
}

/** Голос: +1 или −1. Повторный от того же ключа заменяет прежний. */
export async function vote(lyricsId: string, voterKey: string, value: 1 | -1): Promise<number> {
  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO votes (lyrics_id, voter_key, value, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(lyrics_id, voter_key) DO UPDATE SET value = excluded.value`,
    args: [lyricsId, voterKey, value, Date.now()],
  });

  // Пересчитываем из голосов, а не прибавляем: так счётчик не разъедется.
  await db().execute({
    sql: `UPDATE lyrics
          SET votes = (SELECT COALESCE(SUM(value), 0) FROM votes WHERE lyrics_id = ?)
          WHERE id = ?`,
    args: [lyricsId, lyricsId],
  });

  const row = await getLyrics(lyricsId);
  return row?.votes ?? 0;
}

export type ReportReason = "wrong" | "spam" | "copyright" | "other";

/**
 * Жалоба. Набралось достаточно — текст прячется сам, не дожидаясь разбора.
 * Правообладателю это даёт способ убрать текст сразу, а не письмом.
 */
export async function report(
  lyricsId: string,
  reason: ReportReason,
  note: string | null,
  reporterKey: string | null,
): Promise<{ reports: number; hidden: boolean }> {
  await ensureSchema();
  const now = Date.now();

  await db().execute({
    sql: `INSERT INTO reports (id, lyrics_id, reason, note, reporter_key, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), lyricsId, reason, note, reporterKey, now],
  });

  await db().execute({
    sql: `UPDATE lyrics
          SET reports = (SELECT COUNT(*) FROM reports WHERE lyrics_id = ?),
              hidden = CASE
                WHEN (SELECT COUNT(*) FROM reports WHERE lyrics_id = ?) >= ? THEN 1
                ELSE hidden
              END
          WHERE id = ?`,
    args: [lyricsId, lyricsId, REPORT_THRESHOLD, lyricsId],
  });

  const row = await getLyrics(lyricsId);
  return { reports: row?.reports ?? 0, hidden: row?.hidden ?? false };
}

async function touchTrack(trackId: string, now: number): Promise<void> {
  await db().execute({
    sql: `UPDATE tracks SET updated_at = ? WHERE id = ?`,
    args: [now, trackId],
  });
}

export type Stats = {
  tracks: number;
  lyrics: number;
  synced: number;
};

export async function stats(): Promise<Stats> {
  await ensureSchema();
  const result = await db().execute(
    `SELECT
       (SELECT COUNT(*) FROM tracks) AS tracks,
       (SELECT COUNT(*) FROM lyrics WHERE hidden = 0) AS lyrics,
       (SELECT COUNT(*) FROM lyrics WHERE hidden = 0 AND synced IS NOT NULL) AS synced`,
  );
  const row = result.rows[0];
  return {
    tracks: number(row?.tracks),
    lyrics: number(row?.lyrics),
    synced: number(row?.synced),
  };
}
