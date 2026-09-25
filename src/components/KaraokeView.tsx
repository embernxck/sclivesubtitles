"use client";

/**
 * Показ текста под музыку.
 *
 * Подсвечивается строка, а если есть пословная разметка — ещё и слово.
 * Позицию спрашиваем каждый кадр, но перерисовываемся только когда строка
 * или слово сменились: иначе на длинном тексте телефон греется впустую.
 *
 * Тап по строке перематывает к ней — так удобнее всего проверять разметку.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { activeLineIndex, activeWordIndex, type LrcLine } from "@/lib/lrc";

type Props = {
  lines: LrcLine[];
  /** Позиция в миллисекундах. Функция, а не число: спрашиваем её каждый кадр. */
  position: () => number;
  playing: boolean;
  onSeek?: (milliseconds: number) => void;
};

export function KaraokeView({ lines, position, playing, onSeek }: Props) {
  const [active, setActive] = useState(-1);
  const [word, setWord] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Человек листает сам — не вырываем у него прокрутку. */
  const manualUntil = useRef(0);

  const timed = useMemo(() => lines.filter((line) => line.time !== null), [lines]);

  useEffect(() => {
    let frame = 0;

    const tick = () => {
      const seconds = position() / 1000;
      const nextLine = activeLineIndex(timed, seconds);
      setActive((old) => (old === nextLine ? old : nextLine));

      const current = timed[nextLine];
      const nextWord = current ? activeWordIndex(current, seconds) : -1;
      setWord((old) => (old === nextWord ? old : nextWord));

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timed, position]);

  useEffect(() => {
    if (active < 0 || !playing) return;
    if (performance.now() < manualUntil.current) return;

    lineRefs.current[active]?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, [active, playing]);

  if (timed.length === 0) {
    return (
      <div className="karaoke karaoke--plain">
        {lines.map((line) => line.text).join("\n")}
      </div>
    );
  }

  return (
    <div
      className="karaoke"
      ref={containerRef}
      onWheel={() => {
        manualUntil.current = performance.now() + 4000;
      }}
      onTouchMove={() => {
        manualUntil.current = performance.now() + 4000;
      }}
    >
      {timed.map((line, index) => {
        const state = index === active ? "is-active" : index < active ? "is-past" : "";
        const instrumental = line.text.trim() === "";

        return (
          <button
            key={`${line.time}-${index}`}
            type="button"
            ref={(element) => {
              lineRefs.current[index] = element;
            }}
            className={`karaoke-line ${state} ${instrumental ? "is-instrumental" : ""}`}
            onClick={() => onSeek?.((line.time ?? 0) * 1000)}
            aria-current={index === active ? "true" : undefined}
          >
            {instrumental ? "♪" : renderWords(line, index === active ? word : -1)}
          </button>
        );
      })}
    </div>
  );
}

function renderWords(line: LrcLine, sungUpTo: number) {
  if (!line.words || line.words.length < 2) return line.text;

  return line.words.map((item, index) => (
    <span key={index} className={`karaoke-word ${index <= sungUpTo ? "is-sung" : ""}`}>
      {item.text}
      {index < line.words!.length - 1 ? " " : ""}
    </span>
  ));
}
