import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { getLyrics, vote } from "@/lib/repo";

const Body = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Голос может быть только «за» или «против»");

  const row = await getLyrics(id);
  if (!row || row.hidden) return fail(404, "Текст не найден");

  return json({ votes: await vote(id, clientKey(request), parsed.data.value) });
}
