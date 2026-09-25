import { fail, json } from "@/lib/http";
import { formatLrc, parseLrc } from "@/lib/lrc";
import * as lrclib from "@/lib/lrclib";
import { clientKey } from "@/lib/http";
import { getLyrics, getTrack, markPublished } from "@/lib/repo";
import { PowTimeout } from "@/lib/pow";

/**
 * Отдаёт размеченный текст обратно в LRCLIB.
 *
 * Правила простые и намеренно жёсткие: это публикация наружу, отменить её
 * нельзя.
 *   * включается владельцем копии сервиса (`SCLIVE_LRCLIB_PUBLISH`);
 *   * жмёт кнопку сам автор текста, а не случайный посетитель;
 *   * отдаём только своё — то, что пришло из LRCLIB, туда не возвращаем;
 *   * только с разметкой и с известной длительностью: без них запись
 *     в их базе бесполезна;
 *   * пословные метки снимаем — там ждут обычный LRC.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.SCLIVE_LRCLIB_PUBLISH !== "true") {
    return fail(403, "Отдача в LRCLIB на этой копии сервиса выключена");
  }

  const { id } = await context.params;
  const row = await getLyrics(id);
  if (!row || row.hidden) return fail(404, "Текст не найден");
  if (row.authorKey !== clientKey(request)) {
    return fail(403, "Отдать в LRCLIB может только автор текста");
  }
  if (row.source !== "user") return fail(400, "Это текст из LRCLIB, возвращать его туда незачем");
  if (row.published) return fail(409, "Этот текст уже отдан");
  if (!row.synced) return fail(400, "Без разметки отдавать нечего");

  const track = await getTrack(row.trackId);
  if (!track) return fail(404, "Трек не найден");
  if (!track.durationMs) return fail(400, "Неизвестна длительность трека");

  const { lines } = parseLrc(row.synced);

  try {
    const result = await lrclib.publish({
      trackName: track.title,
      artistName: track.artist,
      albumName: "",
      duration: Math.round(track.durationMs / 1000),
      plainLyrics: row.plain,
      syncedLyrics: formatLrc(lines, { words: false }),
    });

    if (!result.ok) {
      return fail(502, result.message ?? `LRCLIB отказал (${result.status})`);
    }

    await markPublished(id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof PowTimeout) {
      return fail(504, "Не успели решить задачу LRCLIB. Попробуй ещё раз");
    }
    console.error("не отдали в LRCLIB", error);
    return fail(502, "LRCLIB не отвечает");
  }
}
