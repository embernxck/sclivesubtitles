/**
 * Чистка названий SoundCloud и отпечаток трека.
 *
 * На SoundCloud заголовок редко бывает голым названием: там и «(prod. …)»,
 * и «[FREE DL]», и «Артист - Песня» внутри поля названия, притом что профиль
 * называется как лейбл. Прежде чем искать текст в чужих базах или сводить
 * два залива одного трека в один, всё это надо снять.
 */

/** Скобочный мусор, который к названию не относится. */
const NOISE = [
  /\((?:prod\.?|produced by)[^)]*\)/gi,
  /\[(?:prod\.?|produced by)[^\]]*\]/gi,
  /\((?:free|free dl|free download|buy|download|out now|link in bio)[^)]*\)/gi,
  /\[(?:free|free dl|free download|buy|download|out now|link in bio)[^\]]*\]/gi,
  /\((?:official|official video|official audio|lyric video|music video|visualizer|audio|video|hq|hd)\)/gi,
  /\[(?:official|official video|official audio|lyric video|music video|visualizer|audio|video|hq|hd)\]/gi,
  /\((?:premiere|exclusive|support|snippet|teaser|preview)[^)]*\)/gi,
  /\[(?:premiere|exclusive|support|snippet|teaser|preview)[^\]]*\]/gi,
  /\*+[^*]*\*+/g,
  /【[^】]*】/g,
];

/** Приписки без скобок в конце: «… | Free Download», «… // out now». */
const TRAILING = [
  /\s*[|/]{1,2}\s*(free download|free dl|out now|buy now|download)\s*$/gi,
  /\s*[-–—]\s*(free download|free dl|out now)\s*$/gi,
];

const SEPARATORS = [" - ", " – ", " — ", " -- "];

export type CleanedTitle = {
  artist: string;
  title: string;
};

function strip(raw: string): string {
  let text = raw;
  for (const pattern of NOISE) text = text.replace(pattern, "");
  for (const pattern of TRAILING) text = text.replace(pattern, "");
  return text;
}

function collapse(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/^[\s\-–—_|/]+|[\s\-–—_|/]+$/g, "");
}

/** «Artist - Title» внутри поля названия. */
function splitArtistTitle(title: string, knownArtist: string): CleanedTitle | null {
  for (const separator of SEPARATORS) {
    const at = title.indexOf(separator);
    if (at === -1) continue;

    const left = collapse(title.slice(0, at));
    const right = collapse(title.slice(at + separator.length));
    if (!left || !right) continue;

    // Слева тот же артист — просто убираем дубль.
    if (left.toLowerCase() === knownArtist.toLowerCase()) {
      return { artist: knownArtist, title: right };
    }
    // Профиль на SoundCloud часто называется не так, как артист: верим названию.
    return { artist: left, title: right };
  }
  return null;
}

export function cleanTitle(rawArtist: string, rawTitle: string): CleanedTitle {
  let title = strip(rawTitle);
  let artist = strip(rawArtist);

  const split = splitArtistTitle(title, artist);
  if (split) {
    artist = split.artist;
    title = split.title;
  }

  title = collapse(title);
  artist = collapse(artist);

  // Если от названия ничего не осталось (весь заголовок был «(Official Video)»),
  // берём исходное: искать пустое бессмысленно, неточное — хоть какой-то шанс.
  if (!title) title = collapse(rawTitle) || rawTitle.trim();
  if (!artist) artist = collapse(rawArtist) || rawArtist.trim();
  return { artist, title };
}

/**
 * Отпечаток трека: по нему два залива одной песни попадают в одну карточку,
 * даже если ссылки разные. Только буквы и цифры, регистр снят.
 */
export function fingerprint(artist: string, title: string): string {
  const cleaned = cleanTitle(artist, title);
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  return `${normalize(cleaned.artist)}|${normalize(cleaned.title)}`;
}

/** Часто «feat. …» мешает точному поиску — отдаём вариант и без него. */
export function withoutFeaturing(title: string): string {
  return collapse(
    title.replace(/\s*[([]?\s*(feat\.?|ft\.?|featuring|с участием)\s[^)\]]*[)\]]?\s*$/i, ""),
  );
}
