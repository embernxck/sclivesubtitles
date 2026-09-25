"use client";

import { forwardRef } from "react";
import { embedUrl } from "@/lib/soundcloud";

type Props = {
  scTrackId: string;
  /** Плеер можно убрать с глаз: управление всё равно наше. */
  hidden?: boolean;
};

/**
 * Встроенный плеер SoundCloud. Звук идёт только через него — своего
 * проигрывания у нас нет и не будет.
 */
export const SoundCloudPlayer = forwardRef<HTMLIFrameElement, Props>(
  function SoundCloudPlayer({ scTrackId, hidden = false }, ref) {
    return (
      <div className={hidden ? "player-hidden" : undefined}>
        <iframe
          ref={ref}
          className="player-frame"
          title="Плеер SoundCloud"
          allow="autoplay"
          src={embedUrl(scTrackId)}
        />
      </div>
    );
  },
);
