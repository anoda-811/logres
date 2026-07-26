"use client";

import { useEffect } from "react";
import { playClickSfx } from "../lib/sfx";

/**
 * 画面全体のポインタ操作でクリック音を鳴らす。
 * 効果音 OFF のときは playClickSfx 側で無音。
 */
export default function ClickSfxListener() {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      playClickSfx();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  return null;
}
