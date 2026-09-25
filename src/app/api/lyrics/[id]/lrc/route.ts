import { fail } from "@/lib/http";
import { formatLrc, parseLrc } from "@/lib/lrc";
import { getLyrics, getTrack } from "@/lib/repo";

/**
 * Выгрузка `.lrc` — чтобы текст можно было унести в свой плеер.
 *
 * `?words=0` снимает пословные метки: расширенный LRC понимают не все.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = await getLyrics(id);
  if (!row || row.hidden) return fail(404, "Текст не найден");

  const track = await getTrack(row.trackId);
  const words = new URL(request.url).searchParams.get("words") !== "0";

  const body = row.synced
    ? formatLrc(parseLrc(row.synced).lines, {
        words,
        meta: {
          title: track?.title,
          artist: track?.artist,
          by: row.authorName ?? undefined,
          length: track?.durationMs ? track.durationMs / 1000 : undefined,
        },
      })
    : row.plain;

  const name = `${track?.artist ?? "track"} - ${track?.title ?? id}`.replace(/[\\/:*?"<>|]/g, "_");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        `${name}.${row.synced ? "lrc" : "txt"}`,
      )}`,
    },
  });
}
