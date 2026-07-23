"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  getChatMessages,
  getServerChatMessages,
  pushChatMessage,
  subscribeChat,
  type ChatMessage,
} from "../lib/chatStore";

function useChatMessages(): ChatMessage[] {
  return useSyncExternalStore(
    subscribeChat,
    getChatMessages,
    getServerChatMessages
  );
}

type Props = {
  /** 画面右下に固定 */
  className?: string;
};

export default function ChatPanel({ className = "" }: Props) {
  const messages = useChatMessages();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    pushChatMessage(draft, "chat");
    setDraft("");
  };

  return (
    <div
      className={`chat-panel ${className}`}
      style={
        className.includes("field-chat")
          ? {
              position: "fixed",
              left: 40,
              bottom: 16,
              width: "min(380px, calc(100vw - 56px))",
              height: 168,
              zIndex: 10060,
            }
          : undefined
      }
    >
      <div className="chat-panel-head">チャット / バトル情報</div>
      <div className="chat-panel-log" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-empty">ここにチャットとバトル情報が表示されます</p>
        )}
        {messages.map((m) => (
          <p key={m.id} className={`chat-line kind-${m.kind}`}>
            {m.kind === "battle" && <span className="tag">[Bt]</span>}
            {m.kind === "system" && <span className="tag">[Sys]</span>}
            {m.kind === "chat" && <span className="tag">[Chat]</span>} {m.text}
          </p>
        ))}
      </div>
      <form className="chat-panel-form" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="メッセージを入力…"
          maxLength={80}
          autoComplete="off"
        />
        <button type="submit">送信</button>
      </form>
    </div>
  );
}
