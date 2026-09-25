import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { trackView } from "@/lib/lyricsService";
import { upsertTrack } from "@/lib/repo";
import { resolveTrack, TrackResolveError } from "@/lib/soundcloud";

const Body = z.object({
  url: z.string().min(1),
  /** Плеер сообщает длительность, когда трек загрузится. */
  durationMs: z.number().positive().optional(),
});

/** Ссылка на трек → карточка трека со всеми версиями текста. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Нужна ссылка на трек");

  try {
    const info = await resolveTrack(parsed.data.url);
    const track = await upsertTrack(info, parsed.data.durationMs ?? null);
    return json(await trackView(track, clientKey(request)));
  } catch (error) {
    if (error instanceof TrackResolveError) {
      return fail(error.code === "bad-url" ? 400 : 404, error.message);
    }
    console.error("не разобрали ссылку", error);
    return fail(502, "SoundCloud не отвечает. Попробуй ещё раз");
  }
}
