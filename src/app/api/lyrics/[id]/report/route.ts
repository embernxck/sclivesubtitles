import { z } from "zod";
import { clientKey, fail, json, readJson } from "@/lib/http";
import { getLyrics, report } from "@/lib/repo";

const Body = z.object({
  reason: z.enum(["wrong", "spam", "copyright", "other"]),
  note: z.string().max(500).nullish(),
});

/**
 * Жалоба на текст. Отдельный повод — «нарушает права»: правообладателю
 * нужен способ убрать текст сразу, а не письмом через неделю.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Не понял, в чём жалоба");

  const row = await getLyrics(id);
  if (!row) return fail(404, "Текст не найден");

  const result = await report(id, parsed.data.reason, parsed.data.note ?? null, clientKey(request));
  return json(result);
}
