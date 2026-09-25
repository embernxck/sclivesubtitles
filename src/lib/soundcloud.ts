/**
 * Что мы знаем о треке SoundCloud — и откуда.
 *
 * Официальное API SoundCloud требует `client_id`, а регистрацию приложений там
 * давно закрыли. Поэтому мы им не пользуемся вообще. Нам хватает двух вещей,
 * которые открыты всем и без ключа:
 *
 *   * oEmbed (`/oembed`) — название, автор, обложка и адрес встроенного плеера;
 *   * Widget API — сам плеер в iframe, он же сообщает длительность и позицию.
 *
 * Звук мы не трогаем и никуда не перекладываем: играет родной плеер
 * SoundCloud, со своей рекламой и своим счётчиком прослушиваний. Мы рисуем
 * текст поверх.
 */

import { cleanTitle, fingerprint } from "./normalize";

export type TrackInfo = {
  /** Числовой id SoundCloud. Основной ключ трека у нас. */
  scTrackId: string;
  /** Канонический адрес вида `https://soundcloud.com/автор/трек`. */
  permalink: string;
  title: string;
  artist: string;
  /** Как называется у самого SoundCloud — до чистки. */
  rawTitle: string;
  artworkUrl: string | null;
  fingerprint: string;
};

export class TrackResolveError extends Error {
  readonly code: "bad-url" | "not-found" | "unavailable";

  constructor(code: "bad-url" | "not-found" | "unavailable", message: string) {
    super(message);
    this.name = "TrackResolveError";
    this.code = code;
  }
}

const HOSTS = new Set(["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"]);
const SHORT_HOSTS = new Set(["on.soundcloud.com", "snd.sc"]);

/** Разделы, которые треками не являются. */
const NOT_A_TRACK = new Set([
  "discover", "stream", "upload", "you", "settings", "search", "charts",
  "pages", "imprint", "tags", "people", "mobile", "signin", "terms",
]);

/**
 * Приводит что угодно к адресу трека.
 *
 * Принимает полный адрес, адрес без схемы и просто «автор/трек». Хвост
 * с параметрами срезает, но `secret_token` приватной ссылки сохраняет —
 * без него такой трек не открыть.
 */
export function normalizeTrackUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new TrackResolveError("bad-url", "Пустая ссылка");

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new TrackResolveError("bad-url", "Это не похоже на ссылку");
  }

  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) return url.toString();
  if (!HOSTS.has(host)) {
    throw new TrackResolveError("bad-url", "Ссылка не на SoundCloud");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new TrackResolveError("bad-url", "Это ссылка на профиль, а не на трек");
  }
  if (NOT_A_TRACK.has(parts[0].toLowerCase())) {
    throw new TrackResolveError("bad-url", "Это служебный раздел SoundCloud");
  }
  if (parts[1].toLowerCase() === "sets") {
    throw new TrackResolveError("bad-url", "Это плейлист. Нужна ссылка на отдельный трек");
  }

  const secret = url.searchParams.get("secret_token");
  const canonical = new URL(`https://soundcloud.com/${parts[0]}/${parts[1]}`);
  if (secret) canonical.searchParams.set("secret_token", secret);
  return canonical.toString();
}

export function isShortLink(url: string): boolean {
  try {
    return SHORT_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Короткие ссылки `on.soundcloud.com/…` разворачиваются редиректом. */
export async function expandShortLink(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(url, { method: "HEAD", redirect: "follow" });
  if (!response.url || isShortLink(response.url)) {
    throw new TrackResolveError("not-found", "Короткая ссылка никуда не ведёт");
  }
  return normalizeTrackUrl(response.url);
}

type OEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
};

/** Обложку oEmbed отдаёт мелкой — просим размер побольше у того же CDN. */
export function upgradeArtwork(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/-t\d+x\d+\.(jpg|png)/i, "-t500x500.$1");
}

/** oEmbed кладёт в заголовок «Песня by Автор» — автор в нём лишний. */
export function stripAuthorSuffix(title: string, author: string): string {
  if (!author) return title.trim();
  const suffix = ` by ${author}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title.trim();
}

export function extractTrackId(embedHtml: string | undefined): string | null {
  if (!embedHtml) return null;
  const decoded = decodeURIComponent(embedHtml);
  const match = /api\.soundcloud\.com(?:%2F|\/)tracks(?:%2F|\/)(\d+)/i.exec(decoded);
  return match ? match[1] : null;
}

export function parseOEmbed(data: OEmbed, permalink: string): TrackInfo {
  const scTrackId = extractTrackId(data.html);
  if (!scTrackId) {
    throw new TrackResolveError("unavailable", "SoundCloud не отдал номер трека");
  }

  const author = (data.author_name ?? "").trim();
  const rawTitle = stripAuthorSuffix(data.title ?? "", author);
  const cleaned = cleanTitle(author, rawTitle);

  return {
    scTrackId,
    permalink,
    title: cleaned.title,
    artist: cleaned.artist,
    rawTitle,
    artworkUrl: upgradeArtwork(data.thumbnail_url),
    fingerprint: fingerprint(author, rawTitle),
  };
}

/** Адрес встроенного плеера для iframe. Больше ничего для звука не нужно. */
export function embedUrl(scTrackId: string, options: { visual?: boolean } = {}): string {
  const url = new URL("https://w.soundcloud.com/player/");
  url.searchParams.set("url", `https://api.soundcloud.com/tracks/${scTrackId}`);
  url.searchParams.set("show_artwork", "false");
  url.searchParams.set("show_comments", "false");
  url.searchParams.set("sharing", "false");
  url.searchParams.set("buying", "false");
  url.searchParams.set("download", "false");
  url.searchParams.set("visual", options.visual ? "true" : "false");
  return url.toString();
}

export async function resolveTrack(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TrackInfo> {
  let permalink = normalizeTrackUrl(rawUrl);
  if (isShortLink(permalink)) permalink = await expandShortLink(permalink, fetchImpl);

  const endpoint = new URL("https://soundcloud.com/oembed");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("url", permalink);

  const response = await fetchImpl(endpoint.toString(), {
    headers: { accept: "application/json" },
  });

  if (response.status === 404 || response.status === 403) {
    throw new TrackResolveError("not-found", "Трек не найден или закрыт от встраивания");
  }
  if (!response.ok) {
    throw new TrackResolveError("unavailable", `SoundCloud ответил ${response.status}`);
  }

  return parseOEmbed((await response.json()) as OEmbed, permalink);
}
