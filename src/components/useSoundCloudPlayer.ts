"use client";

/**
 * Обёртка над Widget API SoundCloud.
 *
 * Звук играет их плеер в iframe — мы его только спрашиваем и двигаем. Так
 * прослушивание честно засчитывается артисту, а нам не нужен ни их ключ,
 * ни их аудиопоток.
 *
 * Тонкость: `PLAY_PROGRESS` приходит примерно три раза в секунду. Для
 * подсветки по словам этого мало, поэтому между событиями мы досчитываем
 * позицию по часам — от последнего известного значения.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type ProgressEvent = { currentPosition?: number };

type Widget = {
  bind(event: string, listener: (payload: ProgressEvent) => void): void;
  unbind(event: string): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  getDuration(callback: (milliseconds: number) => void): void;
  getPosition(callback: (milliseconds: number) => void): void;
};

type WidgetApi = {
  (element: HTMLIFrameElement): Widget;
  Events: Record<string, string>;
};

declare global {
  interface Window {
    SC?: { Widget: WidgetApi };
  }
}

const API_URL = "https://w.soundcloud.com/player/api.js";

let apiPromise: Promise<void> | null = null;

function loadWidgetApi(): Promise<void> {
  if (window.SC?.Widget) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("плеер не загрузился")));
      return;
    }

    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("плеер не загрузился"));
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });

  return apiPromise;
}

export type PlayerState = {
  ready: boolean;
  playing: boolean;
  /** Длительность в миллисекундах. `0`, пока плеер не ответил. */
  duration: number;
  error: string | null;
};

export type PlayerControls = PlayerState & {
  /** Текущая позиция в миллисекундах, досчитанная до этого мгновения. */
  position: () => number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (milliseconds: number) => void;
  /** Отмотать на `delta` миллисекунд от текущего места. */
  nudge: (delta: number) => void;
};

export function useSoundCloudPlayer(
  iframe: React.RefObject<HTMLIFrameElement | null>,
): PlayerControls {
  const widgetRef = useRef<Widget | null>(null);
  const anchorRef = useRef({ position: 0, at: 0 });
  const playingRef = useRef(false);

  const [state, setState] = useState<PlayerState>({
    ready: false,
    playing: false,
    duration: 0,
    error: null,
  });

  const anchor = useCallback((position: number) => {
    anchorRef.current = { position: Math.max(0, position), at: performance.now() };
  }, []);

  useEffect(() => {
    const element = iframe.current;
    if (!element) return;

    let cancelled = false;

    loadWidgetApi()
      .then(() => {
        if (cancelled || !window.SC) return;

        const widget = window.SC.Widget(element);
        const events = window.SC.Widget.Events;
        widgetRef.current = widget;

        widget.bind(events.READY, () => {
          if (cancelled) return;
          widget.getDuration((duration) => {
            if (!cancelled) setState((old) => ({ ...old, ready: true, duration }));
          });
        });

        widget.bind(events.PLAY, () => {
          playingRef.current = true;
          widget.getPosition((position) => anchor(position));
          setState((old) => ({ ...old, playing: true }));
        });

        widget.bind(events.PAUSE, () => {
          playingRef.current = false;
          widget.getPosition((position) => {
            anchor(position);
            setState((old) => ({ ...old, playing: false }));
          });
        });

        widget.bind(events.FINISH, () => {
          playingRef.current = false;
          setState((old) => ({ ...old, playing: false }));
        });

        widget.bind(events.PLAY_PROGRESS, (payload) => {
          if (typeof payload.currentPosition === "number") anchor(payload.currentPosition);
        });

        widget.bind(events.SEEK, (payload) => {
          if (typeof payload.currentPosition === "number") anchor(payload.currentPosition);
        });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((old) => ({ ...old, error: error.message }));
      });

    return () => {
      cancelled = true;
      widgetRef.current = null;
    };
  }, [iframe, anchor]);

  const position = useCallback(() => {
    const { position: known, at } = anchorRef.current;
    if (!playingRef.current || at === 0) return known;
    return known + (performance.now() - at);
  }, []);

  const play = useCallback(() => widgetRef.current?.play(), []);
  const pause = useCallback(() => widgetRef.current?.pause(), []);

  const toggle = useCallback(() => {
    if (playingRef.current) widgetRef.current?.pause();
    else widgetRef.current?.play();
  }, []);

  const seek = useCallback(
    (milliseconds: number) => {
      const target = Math.max(0, milliseconds);
      anchor(target);
      widgetRef.current?.seekTo(target);
    },
    [anchor],
  );

  const nudge = useCallback((delta: number) => seek(position() + delta), [position, seek]);

  return { ...state, position, play, pause, toggle, seek, nudge };
}
