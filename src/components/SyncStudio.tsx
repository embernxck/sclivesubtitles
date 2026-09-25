"use client";

/**
 * Студия разметки: играет трек, человек жмёт кнопку в начале каждой строки.
 *
 * Всё состояние живёт в чистом движке (`lib/sync`), здесь только показ,
 * клавиши и плеер. Пробел — тап, Backspace — отменить, это самый быстрый
 * способ разметить песню целиком.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLrc, type LrcLine } from "@/lib/lrc";
import {
  createSession,
  currentLine,
  DEFAULT_LATENCY,
  draft,
  isFinished,
  progress,
  retimeFrom,
  tap,
  tokenize,
  undo,
  type SyncMode,
} from "@/lib/sync";
import type { PlayerControls } from "./useSoundCloudPlayer";

type Props = {
  lines: LrcLine[];
  player: PlayerControls;
  saving: boolean;
  onCancel: () => void;
  onSave: (lrc: string) => Promise<void>;
};

export function SyncStudio({ lines, player, saving, onCancel, onSave }: Props) {
  const [mode, setMode] = useState<SyncMode>("line");
  const [latencyMs, setLatencyMs] = useState(Math.round(DEFAULT_LATENCY * 1000));
  const [state, setState] = useState(() => createSession(lines, { latency: DEFAULT_LATENCY }));

  // Смена режима или поправки начинает разметку заново: мешать в одном
  // тексте метки, снятые по-разному, — верный способ получить кашу.
  const restart = useCallback(
    (nextMode: SyncMode, nextLatencyMs: number) => {
      setMode(nextMode);
      setLatencyMs(nextLatencyMs);
      setState(createSession(lines, { mode: nextMode, latency: nextLatencyMs / 1000 }));
      player.seek(0);
    },
    [lines, player],
  );

  const handleTap = useCallback(() => {
    if (!player.playing) {
      player.play();
      return;
    }
    setState((old) => tap(old, player.position() / 1000));
  }, [player]);

  const handleUndo = useCallback(() => {
    setState((old) => {
      const result = undo(old);
      if (result.seekTo !== null) player.seek(result.seekTo * 1000);
      return result.state;
    });
  }, [player]);

  const handleRetimeLine = useCallback(() => {
    setState((old) => {
      const target = Math.max(0, old.cursor - 1);
      const next = retimeFrom(old, target);
      const previous = target > 0 ? next.lines[target - 1].time : 0;
      player.seek((previous ?? 0) * 1000);
      return next;
    });
  }, [player]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (event.code === "Space") {
        event.preventDefault();
        handleTap();
      } else if (event.code === "Backspace") {
        event.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTap, handleUndo]);

  const done = progress(state);
  const finished = isFinished(state);
  const line = currentLine(state);
  const upcoming = state.lines.slice(state.cursor + 1, state.cursor + 3);

  const stage = useMemo(() => {
    if (!line) return <span className="muted">Разметка закончена</span>;
    if (line.text.trim() === "") return <span className="muted">♪ проигрыш</span>;
    if (mode === "line") return line.text;

    // В пословном режиме видно, докуда уже дошли.
    const words = tokenize(line.text);
    return words.map((word, index) => (
      <span key={index} className={index < state.wordCursor ? "done" : "pending"}>
        {word}
        {index < words.length - 1 ? " " : ""}
      </span>
    ));
  }, [line, mode, state.wordCursor]);

  return (
    <div className="stack stack--wide">
      <div>
        <h2>Разметка</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Включи трек и жми кнопку ровно в тот момент, когда начинается
          показанная строка. Промахнулся — <kbd>Backspace</kbd>, вернёмся на шаг
          назад и переиграем с предыдущей метки.
        </p>
      </div>

      <div className="studio-stage">
        <div className="current">{stage}</div>
        {upcoming.map((item, index) => (
          <div key={index} className="upcoming">
            {item.text.trim() === "" ? "♪" : item.text}
          </div>
        ))}
      </div>

      <div className="progress-track" aria-hidden>
        <div
          className="progress-fill"
          style={{ width: `${done.total ? (done.done / done.total) * 100 : 0}%` }}
        />
      </div>

      <button
        type="button"
        className="tap-button"
        onPointerDown={(event) => {
          event.preventDefault();
          handleTap();
        }}
        disabled={finished}
      >
        {finished
          ? "Готово"
          : !player.playing
            ? "Включить трек"
            : mode === "line"
              ? "Строка началась"
              : "Слово"}
      </button>

      <div className="row">
        <button type="button" className="btn btn--small" onClick={() => player.toggle()}>
          {player.playing ? "Пауза" : "Играть"}
        </button>
        <button type="button" className="btn btn--small" onClick={() => player.nudge(-3000)}>
          −3 с
        </button>
        <button type="button" className="btn btn--small" onClick={handleUndo}>
          Шаг назад
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={handleRetimeLine}
          disabled={state.cursor === 0}
        >
          Переиграть строку
        </button>
        <span className="spacer" />
        <span className="muted small">
          {done.done} из {done.total}
        </span>
      </div>

      <details className="card">
        <summary className="small muted" style={{ cursor: "pointer" }}>
          Тонкая настройка
        </summary>
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="row">
            <span className="small">Режим:</span>
            <button
              type="button"
              className={`btn btn--small ${mode === "line" ? "btn--primary" : ""}`}
              onClick={() => restart("line", latencyMs)}
            >
              По строкам
            </button>
            <button
              type="button"
              className={`btn btn--small ${mode === "word" ? "btn--primary" : ""}`}
              onClick={() => restart("word", latencyMs)}
            >
              По словам
            </button>
          </div>
          <label className="small stack" style={{ gap: 6 }}>
            <span>
              Поправка на задержку реакции: <strong>{latencyMs} мс</strong>
            </span>
            <input
              type="range"
              min={0}
              max={400}
              step={10}
              value={latencyMs}
              onChange={(event) => restart(mode, Number(event.target.value))}
            />
            <span className="muted">
              Слышишь строку — и только потом жмёшь. На эту величину метки
              сдвигаются назад. Смена режима или поправки начинает разметку заново.
            </span>
          </label>
        </div>
      </details>

      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || done.done === 0}
          onClick={() => {
            player.pause();
            void onSave(formatLrc(draft(state)));
          }}
        >
          {saving ? "Сохраняю…" : finished ? "Сохранить разметку" : "Сохранить, что есть"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            player.pause();
            onCancel();
          }}
          disabled={saving}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
