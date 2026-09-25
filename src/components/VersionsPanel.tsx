"use client";

/**
 * Версии текста у одного трека: выбрать, поддержать голосом, забрать `.lrc`,
 * пожаловаться, отдать своё в LRCLIB.
 *
 * Версий может быть несколько намеренно: перевод, другой залив, чья-то более
 * точная разметка. Побеждает не последняя, а лучшая — по голосам.
 */

import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { LyricsPayload } from "@/lib/lyricsService";

type Props = {
  versions: LyricsPayload[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
  canPublish: boolean;
};

const REASONS = [
  { value: "wrong", label: "Текст неверный" },
  { value: "spam", label: "Мусор или спам" },
  { value: "copyright", label: "Нарушает права" },
  { value: "other", label: "Другое" },
] as const;

export function VersionsPanel({ versions, currentId, onSelect, onChanged, canPublish }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setMessage(null);
    try {
      await action();
      onChanged();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Не получилось");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <h2>Версии текста</h2>

      {message ? <div className="notice notice--error">{message}</div> : null}

      {versions.map((version) => (
        <div key={version.id} className={`version ${version.id === currentId ? "is-current" : ""}`}>
          <div className="meta">
            <div className="who">
              {version.authorName ?? (version.source === "lrclib" ? "LRCLIB" : "Аноним")}{" "}
              {version.synced ? (
                <span className="badge badge--synced">
                  {version.hasWords ? "по словам" : "с метками"}
                </span>
              ) : (
                <span className="badge">без меток</span>
              )}
              {version.mine ? <span className="badge">моя</span> : null}
            </div>
            <div className="muted small">
              {version.source === "lrclib" ? "из открытой базы LRCLIB" : "написано здесь"} ·
              голосов: {version.votes}
              {version.published ? " · отдано в LRCLIB" : ""}
            </div>
          </div>

          <div className="row row--tight">
            {version.id === currentId ? null : (
              <button type="button" className="btn btn--small" onClick={() => onSelect(version.id)}>
                Показать
              </button>
            )}
            <button
              type="button"
              className="btn btn--small"
              disabled={busy === version.id}
              title="Текст хороший"
              onClick={() =>
                run(version.id, async () => {
                  await api(`/api/lyrics/${version.id}/vote`, {
                    method: "POST",
                    body: JSON.stringify({ value: 1 }),
                  });
                })
              }
            >
              За
            </button>
            <a className="btn btn--small" href={`/api/lyrics/${version.id}/lrc`}>
              .lrc
            </a>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => setReporting(reporting === version.id ? null : version.id)}
            >
              Жалоба
            </button>
            {canPublish && version.mine && version.synced && !version.published ? (
              <button
                type="button"
                className="btn btn--small"
                disabled={busy === version.id}
                title="Отдать разметку в открытую базу LRCLIB"
                onClick={() =>
                  run(version.id, async () => {
                    await api(`/api/lyrics/${version.id}/publish`, { method: "POST" });
                    setMessage("Отдано в LRCLIB. Спасибо — теперь это есть у всех");
                  })
                }
              >
                В LRCLIB
              </button>
            ) : null}
          </div>

          {reporting === version.id ? (
            <div className="stack" style={{ flexBasis: "100%", marginTop: 10 }}>
              <div className="row row--tight">
                {REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    className="btn btn--small btn--danger"
                    disabled={busy === version.id}
                    onClick={() =>
                      run(version.id, async () => {
                        await api(`/api/lyrics/${version.id}/report`, {
                          method: "POST",
                          body: JSON.stringify({ reason: reason.value }),
                        });
                        setReporting(null);
                        setMessage("Жалоба принята");
                      })
                    }
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
