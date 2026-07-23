"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  playing: boolean;
  enabled?: boolean;
  volume?: number;
};

/** フィールド滞在中だけループ再生するBGM */
export default function FieldBgm({
  src,
  playing,
  enabled = true,
  volume = 0.35,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeBoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const clearResume = () => {
      if (resumeBoundRef.current) {
        window.removeEventListener("pointerdown", resumeBoundRef.current);
        window.removeEventListener("keydown", resumeBoundRef.current);
        resumeBoundRef.current = null;
      }
    };

    const shouldPlay = playing && enabled;
    const audio = new Audio(encodeURI(src));
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = volume;
    audioRef.current = audio;

    if (shouldPlay) {
      const tryPlay = () => {
        audio.play().catch(() => {
          clearResume();
          const resume = () => {
            audio.play().catch(() => {});
            clearResume();
          };
          resumeBoundRef.current = resume;
          window.addEventListener("pointerdown", resume);
          window.addEventListener("keydown", resume);
        });
      };

      // src 切替直後でも確実に再生
      if (audio.readyState >= 2) tryPlay();
      else audio.addEventListener("canplay", tryPlay, { once: true });
    }

    return () => {
      clearResume();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [src, playing, enabled, volume]);

  return null;
}
