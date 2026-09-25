import { json } from "@/lib/http";
import { toTrackPayload } from "@/lib/lyricsService";
import { recentTracks, searchTracks } from "@/lib/repo";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const tracks = query ? await searchTracks(query) : await recentTracks();
  return json({ tracks: tracks.map(toTrackPayload) });
}
