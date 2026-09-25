import { clientKey, fail, json } from "@/lib/http";
import { trackView } from "@/lib/lyricsService";
import { getTrack } from "@/lib/repo";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const track = await getTrack(id);
  if (!track) return fail(404, "Такого трека у нас нет");
  return json(await trackView(track, clientKey(request)));
}
