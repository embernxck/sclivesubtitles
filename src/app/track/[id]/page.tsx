import { notFound } from "next/navigation";
import { TrackScreen } from "@/components/TrackScreen";
import { trackView } from "@/lib/lyricsService";
import { getTrack } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await getTrack(id);
  if (!track) notFound();

  // Первая отрисовка идёт с сервера — страницей можно делиться, и она
  // откроется с текстом сразу, не дожидаясь запросов из браузера.
  const view = await trackView(track, "");

  return (
    <TrackScreen
      trackId={id}
      initial={view}
      canPublish={process.env.SCLIVE_LRCLIB_PUBLISH === "true"}
    />
  );
}
