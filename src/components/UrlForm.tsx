"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { TrackView } from "@/lib/lyricsService";

/** Ссылка на трек — единственное, что нужно для начала. */
export function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const view = await api<TrackView>("/api/track", {
        method: "POST",
        body: JSON.stringify({ url: url.trim() }),
      });
      router.push(`/track/${view.track.id}`);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : "Не получилось открыть трек");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <input
        className="field"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="soundcloud.com/автор/трек"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        aria-label="Ссылка на трек SoundCloud"
      />
      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Открываю…" : "Открыть трек"}
        </button>
        <span className="muted small">Можно просто вставить ссылку из приложения</span>
      </div>
      {error ? <div className="notice notice--error">{error}</div> : null}
    </form>
  );
}
