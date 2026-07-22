export type ChatKind = "chat" | "battle" | "system";

export type ChatMessage = {
  id: string;
  text: string;
  kind: ChatKind;
  at: number;
};

export type SpeechBubble = {
  text: string;
  until: number;
};

const MAX_MESSAGES = 80;
const BUBBLE_MS = 3500;

let messages: ChatMessage[] = [];
let bubble: SpeechBubble | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** SSR用。毎回新しい配列を返すと useSyncExternalStore が無限ループする */
const EMPTY_MESSAGES: ChatMessage[] = [];

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeChat(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatMessages() {
  return messages;
}

export function getServerChatMessages() {
  return EMPTY_MESSAGES;
}

export function getSpeechBubble() {
  return bubble;
}

export function getServerSpeechBubble() {
  return null;
}

export function pushChatMessage(text: string, kind: ChatKind = "chat") {
  const trimmed = text.trim();
  if (!trimmed) return;

  const msg: ChatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    kind,
    at: Date.now(),
  };
  messages = [...messages.slice(-(MAX_MESSAGES - 1)), msg];

  if (kind === "chat") {
    bubble = { text: trimmed, until: Date.now() + BUBBLE_MS };
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble = null;
      bubbleTimer = null;
      notify();
    }, BUBBLE_MS);
  }

  notify();
}

export function pushBattleLog(text: string) {
  pushChatMessage(text, "battle");
}
