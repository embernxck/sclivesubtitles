/**
 * База. Тексты, треки, голоса, жалобы.
 *
 * Держим на libsql: это SQLite, который умеет жить и файлом рядом с проектом,
 * и облачной базой (Turso) по тому же адресу. Поэтому «склонировал и запустил»
 * работает без докера, без миграций и без единой настройки, а на боевом
 * достаточно подменить `DATABASE_URL`.
 *
 * Схему создаём сами при первом обращении — так у того, кто поднимает свою
 * копию, нет отдельного шага «накати миграции», на котором обычно всё и встаёт.
 */

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tracks (
     id           TEXT PRIMARY KEY,
     permalink    TEXT NOT NULL,
     title        TEXT NOT NULL,
     artist       TEXT NOT NULL,
     raw_title    TEXT NOT NULL,
     artwork_url  TEXT,
     fingerprint  TEXT NOT NULL,
     -- Название и артист в нижнем регистре, для поиска. Считаем его в JS:
     -- lower() в SQLite умеет только латиницу и кириллицу не трогает.
     search       TEXT NOT NULL DEFAULT '',
     duration_ms  INTEGER,
     created_at   INTEGER NOT NULL,
     updated_at   INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tracks_fingerprint ON tracks (fingerprint)`,
  `CREATE TABLE IF NOT EXISTS lyrics (
     id            TEXT PRIMARY KEY,
     track_id      TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
     plain         TEXT NOT NULL,
     synced        TEXT,
     has_words     INTEGER NOT NULL DEFAULT 0,
     language      TEXT,
     source        TEXT NOT NULL DEFAULT 'user',
     author_name   TEXT,
     author_key    TEXT NOT NULL,
     votes         INTEGER NOT NULL DEFAULT 0,
     reports       INTEGER NOT NULL DEFAULT 0,
     hidden        INTEGER NOT NULL DEFAULT 0,
     published     INTEGER NOT NULL DEFAULT 0,
     created_at    INTEGER NOT NULL,
     updated_at    INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS lyrics_track ON lyrics (track_id)`,
  `CREATE TABLE IF NOT EXISTS votes (
     lyrics_id  TEXT NOT NULL REFERENCES lyrics(id) ON DELETE CASCADE,
     voter_key  TEXT NOT NULL,
     value      INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (lyrics_id, voter_key)
   )`,
  `CREATE TABLE IF NOT EXISTS reports (
     id           TEXT PRIMARY KEY,
     lyrics_id    TEXT NOT NULL REFERENCES lyrics(id) ON DELETE CASCADE,
     reason       TEXT NOT NULL,
     note         TEXT,
     reporter_key TEXT,
     created_at   INTEGER NOT NULL
   )`,
];

export function db(): Client {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL ?? "file:./sclive.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return client;
}

/** Создаёт схему один раз за процесс. Звать перед любым запросом. */
export async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const statement of SCHEMA) await db().execute(statement);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** Только для тестов: начать с чистого листа. */
export function resetForTests(): void {
  client = null;
  ready = null;
}
