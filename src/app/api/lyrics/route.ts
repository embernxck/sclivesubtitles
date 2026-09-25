import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { splitContent, toLyricsPayload } from "@/lib/lyricsService";
import { createLyrics, getTrack } from "@/lib/repo";

const Body = z.object({
  trackId: z.string().min(1),
  /** Простыня текста или готовый LRC — разберём сами. */
  content: z.string().min(1).max(100_000),
  authorName: z.string().max(60).nullish(),
  language: z.string().max(20).nullish(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Текст не разобрался");

  const track = await getTrack(parsed.data.trackId);
  if (!track) return fail(404, "Сначала нужен трек");

  const { plain, synced, hasWords } = splitContent(parsed.data.content);
  if (!plain && !synced) return fail(400, "Текст пустой");

  const key = clientKey(request);
  const row = await createLyrics({
    trackId: track.id,
    plain,
    synced,
    hasWords,
    language: parsed.data.language ?? null,
    source: "user",
    authorName: parsed.data.authorName?.trim() || null,
    authorKey: key,
  });

  return json(toLyricsPayload(row, true), 201);
}
