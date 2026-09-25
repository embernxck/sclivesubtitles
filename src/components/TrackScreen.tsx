"use client";

/**
 * Страница трека: плеер, текст под музыку и всё, что с текстом можно сделать.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, rememberAuthorName, savedAuthorName } from "@/lib/client";
import { formatLrc, linesFromPlain, parseLrc, type LrcLine } from "@/lib/lrc";
import type { LyricsPayload, TrackView } from "@/lib/lyricsService";
import { KaraokeView } from "./KaraokeView";
import { SoundCloudPlayer } from "./SoundCloudPlayer";
import { SyncStudio } from "./SyncStudio";
import { TextEntry } from "./TextEntry";
import { useSoundCloudPlayer } from "./useSoundCloudPlayer";
import { VersionsPanel } from "./VersionsPanel";

type Mode = "read" | "write" | "sync";

type Props = {
  trackId: string;
  initial: TrackView;
  canPublish: boolean;
};

export function TrackScreen({ trackId, initial, canPublish }: Props) {
  const [view, setView] = useState(initial);
  const [mode, setMode] = useState<Mode>("read");
  const [currentId, setCurrentId] = useState<string | null>(initial.lyrics[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [showVersions, setShowVersions] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const player = useSoundCloudPlayer(iframeRef);
  const durationSent = useRef(false);

  useEffect(() => setAuthorName(savedAuthorName()), []);

  const refresh = useCallback(async () => {
    const next = await api<TrackView>(`/api/track/${trackId}`);
    setView(next);
    setCurrentId((old) =>
      old && next.lyrics.some((item) => item.id === old) ? old : (next.lyrics[0]?.id ?? null),
    );
  }, [trackId]);

  /**
   * Длительность знает только плеер. Узнав её, сообщаем серверу: с ней
   * он точнее ищет текст в LRCLIB, а без неё туда нельзя ничего отдать.
   */
  useEffect(() => {
    if (!player.duration || durationSent.current) return;
    durationSent.current = true;

    void api<TrackView>(`/api/track/${trackId}/duration`, {
      method: "POST",
      body: JSON.stringify({ durationMs: player.duration }),
    })
      .then((next) => {
        setView(next);
        setCurrentId((old) => old ?? next.lyrics[0]?.id ?? null);
      })
      .catch(() => {
        // Не страшно: текст просто останется тем, что уже есть.
      });
  }, [player.duration, trackId]);

  const current: LyricsPayload | null = useMemo(
    () => view.lyrics.find((item) => item.id === currentId) ?? view.lyrics[0] ?? null,
    [view.lyrics, currentId],
  );

  const lines: LrcLine[] = useMemo(() => {
    if (!current) return [];
    return current.synced ? parseLrc(current.synced).lines : linesFromPlain(current.plain);
  }, [current]);

  const save = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      rememberAuthorName(authorName);
      await refresh();
      setMode("read");
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Не получилось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const saveText = (content: string) =>
    save(async () => {
      if (current?.mine) {
        await api(`/api/lyrics/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ content, authorName: authorName || null }),
        });
        return;
      }
      const created = await api<LyricsPayload>("/api/lyrics", {
        method: "POST",
        body: JSON.stringify({ trackId, content, authorName: authorName || null }),
      });
      setCurrentId(created.id);
    });

  /**
   * Разметка чужого текста не правит чужое, а заводит свою версию: у автора
   * текста своя работа, у разметчика — своя.
   */
  const saveSync = (lrc: string) =>
    save(async () => {
      if (current?.mine) {
        await api(`/api/lyrics/${current.id}`, {
          method: "PATCH",
          body: JSON.stringify({ content: lrc, authorName: authorName || null }),
        });
        return;
      }
      const created = await api<LyricsPayload>("/api/lyrics", {
        method: "POST",
        body: JSON.stringify({ trackId, content: lrc, authorName: authorName || null }),
      });
      setCurrentId(created.id);
    });

  const { track } = view;

  return (
    <div className="stack stack--wide">
      <div className="track-head">
        {track.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 10, background: "var(--surface-raised)" }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="title">{track.title}</div>
          <div className="artist">{track.artist}</div>
          <a className="muted small" href={track.permalink} target="_blank" rel="noreferrer">
            открыть на SoundCloud
          </a>
        </div>
      </div>

      <SoundCloudPlayer ref={iframeRef} scTrackId={track.id} hidden={mode === "sync"} />

      {player.error ? <div className="notice notice--error">{player.error}</div> : null}
      {error ? <div className="notice notice--error">{error}</div> : null}

      {mode === "write" ? (
        <TextEntry
          initial={current?.mine ? (current.plain ?? "") : ""}
          authorName={authorName}
          onAuthorNameChange={setAuthorName}
          onCancel={() => setMode("read")}
          onSave={saveText}
          saving={saving}
        />
      ) : mode === "sync" ? (
        <SyncStudio
          lines={lines.length ? stripTiming(lines) : []}
          player={player}
          saving={saving}
          onCancel={() => setMode("read")}
          onSave={saveSync}
        />
      ) : current ? (
        <>
          <KaraokeView
            lines={lines}
            position={player.position}
            playing={player.playing}
            onSeek={player.seek}
          />

          <div className="row">
            <button type="button" className="btn btn--primary" onClick={() => setMode("sync")}>
              {current.synced ? "Переразметить" : "Разметить по времени"}
            </button>
            <button type="button" className="btn" onClick={() => setMode("write")}>
              {current.mine ? "Править текст" : "Своя версия текста"}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setShowVersions((old) => !old)}
            >
              Версии ({view.lyrics.length})
            </button>
          </div>

          {!current.synced ? (
            <div className="notice">
              Текст есть, но без меток времени — он просто лежит целиком.
              Нажми «Разметить по времени», включи трек и отбей строки: минут
              пять, и текст поедет под музыку.
            </div>
          ) : null}
        </>
      ) : (
        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0 }}>Текста нигде нет</h2>
            <p className="muted" style={{ margin: 0 }}>
              Мы посмотрели у себя и в открытой базе LRCLIB — пусто. Так обычно
              и бывает с тем, что выходит только на SoundCloud. Значит, первым
              будешь ты.
            </p>
            <div className="row">
              <button type="button" className="btn btn--primary" onClick={() => setMode("write")}>
                Написать текст
              </button>
            </div>
          </div>
        </div>
      )}

      {showVersions && mode === "read" && view.lyrics.length > 0 ? (
        <VersionsPanel
          versions={view.lyrics}
          currentId={current?.id ?? null}
          onSelect={setCurrentId}
          onChanged={() => void refresh()}
          canPublish={canPublish}
        />
      ) : null}
    </div>
  );
}

/** Разметка начинается с чистого текста — старые метки только мешают. */
function stripTiming(lines: LrcLine[]): LrcLine[] {
  return lines.map((line) => ({ time: null, text: line.text }));
}

/** Пригодится, когда понадобится отдать готовый LRC наружу без пословных меток. */
export function plainLrc(lines: LrcLine[]): string {
  return formatLrc(lines, { words: false });
}
