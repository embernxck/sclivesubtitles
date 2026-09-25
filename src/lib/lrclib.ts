/**
 * Клиент LRCLIB — открытой базы текстов, где не нужен ключ.
 *
 * Зачем он нам, если у нас своя база: на SoundCloud много релизов, которые
 * выходили и на стримингах, и текст к ним уже кто-то разметил. Незачем
 * заставлять человека набирать заново то, что лежит рядом.
 *
 * И наоборот: то, что человек разметил у нас, можно вернуть в LRCLIB, чтобы
 * это увидели пользователи других плееров. Отдача — по кнопке и только для
 * своих текстов, чужое мы не перекладываем.
 */

import { solveChallenge, publishToken, type Challenge } from "./pow";

const HOST = "https://lrclib.net";

function userAgent(): string {
  const site = process.env.SCLIVE_PUBLIC_URL ?? "https://github.com/embernxck/sclivesubtitles";
  return `SCLiveSubtitles (${site})`;
}

export type LrclibRecord = {
  id: number;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

export type LrclibQuery = {
  artist: string;
  title: string;
  album?: string;
  /** Длительность в секундах — с ней попадание куда точнее. */
  duration?: number;
};

type RawRecord = Partial<Record<keyof LrclibRecord, unknown>>;

function toRecord(raw: RawRecord): LrclibRecord {
  return {
    id: typeof raw.id === "number" ? raw.id : 0,
    trackName: typeof raw.trackName === "string" ? raw.trackName : null,
    artistName: typeof raw.artistName === "string" ? raw.artistName : null,
    albumName: typeof raw.albumName === "string" ? raw.albumName : null,
    duration: typeof raw.duration === "number" ? raw.duration : null,
    instrumental: raw.instrumental === true,
    plainLyrics: typeof raw.plainLyrics === "string" && raw.plainLyrics.trim() ? raw.plainLyrics : null,
    syncedLyrics: typeof raw.syncedLyrics === "string" && raw.syncedLyrics.trim() ? raw.syncedLyrics : null,
  };
}

async function request<T>(path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T | null> {
  const response = await fetchImpl(`${HOST}${path}`, {
    ...init,
    headers: { "user-agent": userAgent(), accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new LrclibError(`LRCLIB ответил ${response.status}`, response.status);
  return (await response.json()) as T;
}

export class LrclibError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LrclibError";
    this.status = status;
  }
}

/** Точный поиск. Самый надёжный, когда известна длительность. */
export async function lookup(
  query: LrclibQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    artist_name: query.artist,
    track_name: query.title,
  });
  if (query.album) params.set("album_name", query.album);
  if (query.duration && query.duration > 0) {
    params.set("duration", String(Math.round(query.duration)));
  }

  const raw = await request<RawRecord>(`/api/get?${params}`, { method: "GET" }, fetchImpl);
  return raw ? toRecord(raw) : null;
}

/** Обычный поиск. Берём ближайшее по длительности и с разметкой. */
export async function search(
  query: LrclibQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    artist_name: query.artist,
    track_name: query.title,
  });

  const raw = await request<RawRecord[]>(`/api/search?${params}`, { method: "GET" }, fetchImpl);
  const results = (raw ?? []).map(toRecord).filter((item) => !item.instrumental);
  return pickBest(results, query.duration);
}

/** Из найденного выбираем то, что вероятнее всего именно этот трек. */
export function pickBest(results: LrclibRecord[], duration?: number): LrclibRecord | null {
  const usable = results.filter((item) => item.syncedLyrics || item.plainLyrics);
  if (usable.length === 0) return null;

  if (!duration || duration <= 0) {
    return usable.find((item) => item.syncedLyrics) ?? usable[0];
  }

  // Расхождение больше пяти секунд — это, скорее всего, другая версия трека.
  const close = usable.filter((item) => Math.abs((item.duration ?? 0) - duration) <= 5);
  const pool = close.length ? close : usable;
  return pool.find((item) => item.syncedLyrics) ?? pool[0];
}

/** Ищем сперва точно, потом обычным поиском. */
export async function find(
  query: LrclibQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<LrclibRecord | null> {
  const exact = await lookup(query, fetchImpl);
  if (exact && !exact.instrumental && (exact.syncedLyrics || exact.plainLyrics)) return exact;
  return search(query, fetchImpl);
}

export async function requestChallenge(fetchImpl: typeof fetch = fetch): Promise<Challenge> {
  const raw = await request<{ prefix?: string; target?: string }>(
    "/api/request-challenge",
    { method: "POST" },
    fetchImpl,
  );
  if (!raw?.prefix || !raw.target) throw new LrclibError("LRCLIB не выдал задачу", 502);
  return { prefix: raw.prefix, target: raw.target };
}

export type PublishPayload = {
  trackName: string;
  artistName: string;
  albumName: string;
  /** Секунды. LRCLIB сверяет её при поиске, так что без неё толку мало. */
  duration: number;
  plainLyrics: string;
  syncedLyrics: string;
};

export type PublishResult = {
  ok: boolean;
  status: number;
  message?: string;
};

/**
 * Отдаёт текст в LRCLIB: берёт задачу, решает её и публикует.
 *
 * Пословные метки снимаются: расширенный LRC там не ждут, а обычный
 * понимают все.
 */
export async function publish(
  payload: PublishPayload,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PublishResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const challenge = await requestChallenge(fetchImpl);
  const nonce = solveChallenge(challenge, { timeoutMs: options.timeoutMs ?? 60_000 });

  const response = await fetchImpl(`${HOST}/api/publish`, {
    method: "POST",
    headers: {
      "user-agent": userAgent(),
      "content-type": "application/json",
      "x-publish-token": publishToken(challenge.prefix, nonce),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 201 || response.status === 200) {
    return { ok: true, status: response.status };
  }

  let message: string | undefined;
  try {
    const body = (await response.json()) as { message?: string };
    message = body.message;
  } catch {
    message = undefined;
  }
  return { ok: false, status: response.status, message };
}
