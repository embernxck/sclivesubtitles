import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { trackView } from "@/lib/lyricsService";
import { getTrack, setTrackDuration } from "@/lib/repo";

const Body = z.object({ durationMs: z.number().positive() });

/**
 * Длительность знает только плеер, и только когда трек загрузится.
 * Узнав её, мы можем точнее поискать текст в LRCLIB — поэтому в ответ
 * отдаём карточку заново.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Нужна длительность трека");

  const existing = await getTrack(id);
  if (!existing) return fail(404, "Такого трека у нас нет");

  if (existing.durationMs !== Math.round(parsed.data.durationMs)) {
    await setTrackDuration(id, parsed.data.durationMs);
  }

  const track = await getTrack(id);
  return json(await trackView(track!, clientKey(request)));
}
