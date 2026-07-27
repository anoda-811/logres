import { loadSfxEnabled, saveSfxEnabled } from "./settings";

const CLICK_SRC = "/sfx/click.mp3";
const CLICK_VOLUME = 0.05;
const JAEGER_RUMBLE_SRC = "/sfx/jaeger-rumble.wav";
const JAEGER_RUMBLE_VOLUME = 0.65;

type Listener = () => void;
const listeners = new Set<Listener>();

let sfxEnabled = true;
let hydrated = false;

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  sfxEnabled = loadSfxEnabled();
  hydrated = true;
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeSfx(listener: Listener) {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSfxEnabled(): boolean {
  ensureHydrated();
  return sfxEnabled;
}

export function getServerSfxEnabled(): boolean {
  return true;
}

export function setSfxEnabled(enabled: boolean) {
  sfxEnabled = enabled;
  hydrated = true;
  saveSfxEnabled(enabled);
  emit();
}

export function toggleSfxEnabled(): boolean {
  const next = !getSfxEnabled();
  setSfxEnabled(next);
  return next;
}

function playSfx(src: string, volume: number) {
  if (typeof window === "undefined") return;
  ensureHydrated();
  if (!sfxEnabled) return;
  try {
    const audio = new Audio(src);
    audio.volume = Math.max(0, Math.min(1, volume));
    void audio.play().catch(() => {
      /* 自動再生制限など */
    });
  } catch {
    /* ignore */
  }
}

/** クリック音（OFF なら無音。連続クリック用に都度生成） */
export function playClickSfx() {
  playSfx(CLICK_SRC, CLICK_VOLUME);
}

/** ランギィールイェーガー発動時の地鳴り */
export function playJaegerRumbleSfx() {
  playSfx(JAEGER_RUMBLE_SRC, JAEGER_RUMBLE_VOLUME);
}
