import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { splitContent, toLyricsPayload } from "@/lib/lyricsService";
import { getLyrics, updateLyrics } from "@/lib/repo";

const Patch = z.object({
  content: z.string().min(1).max(100_000),
  authorName: z.string().max(60).nullish(),
  language: z.string().max(20).nullish(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const row = await getLyrics(id);
  if (!row || row.hidden) return fail(404, "Текст не найден");
  return json(toLyricsPayload(row, row.authorKey === clientKey(request)));
}

/** Правит только автор — тот же браузер, что и создавал. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = Patch.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Текст не разобрался");

  const { plain, synced, hasWords } = splitContent(parsed.data.content);
  if (!plain && !synced) return fail(400, "Текст пустой");

  const row = await updateLyrics(id, clientKey(request), {
    plain,
    synced,
    hasWords,
    language: parsed.data.language ?? undefined,
    authorName: parsed.data.authorName ?? undefined,
  });

  if (!row) {
    return fail(403, "Это чужой текст. Его можно не править, а добавить свою версию");
  }
  return json(toLyricsPayload(row, true));
}
