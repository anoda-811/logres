"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import {
  QUEST_DEFS,
  acceptQuest,
  getServerQuestSnapshot,
  getQuestSnapshot,
  isQuestAccepted,
  subscribeQuests,
} from "../lib/quests";
import { pushChatMessage } from "../lib/chatStore";
import styles from "./QuestBoardModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

function useQuestSnap() {
  return useSyncExternalStore(
    subscribeQuests,
    getQuestSnapshot,
    getServerQuestSnapshot
  );
}

export default function QuestBoardModal({ open, onClose }: Props) {
  useQuestSnap();

  if (!open || typeof document === "undefined") return null;

  const onAccept = (questId: string, title: string) => {
    if (!acceptQuest(questId)) return;
    pushChatMessage(`クエスト「${title}」をうけた！`, "system");
  };

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="クエストボード"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8, 10, 16, 0.62)",
      }}
    >
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(380px, 92vw)",
          maxHeight: "min(78vh, 520px)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 14px 12px",
          borderRadius: 12,
          background: "linear-gradient(180deg, #3a2a1c 0%, #2a1e14 100%)",
          border: "2px solid rgba(210, 170, 110, 0.65)",
          color: "#f5ead6",
          boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
        }}
      >
        <h3
          className={styles.title}
          style={{
            margin: "0 0 4px",
            fontSize: 18,
            fontWeight: 800,
            textAlign: "center",
            color: "#ffe7b0",
          }}
        >
          クエストボード
        </h3>
        <p
          className={styles.sub}
          style={{
            margin: "0 0 14px",
            fontSize: 12,
            textAlign: "center",
            opacity: 0.75,
          }}
        >
          城下町の掲示板 — 受注できる依頼
        </p>
        <div
          className={styles.list}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 12,
          }}
        >
          {QUEST_DEFS.map((q) => {
            const taken = isQuestAccepted(q.id);
            return (
              <div
                key={q.id}
                className={styles.card}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.28)",
                  border: "1px solid rgba(220,180,120,0.28)",
                }}
              >
                <h4
                  className={styles.cardTitle}
                  style={{
                    margin: "0 0 6px",
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#fff3d4",
                  }}
                >
                  {q.title}
                </h4>
                <p
                  className={styles.cardDesc}
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "#e0d0b8",
                  }}
                >
                  {q.description}
                </p>
                <div
                  className={styles.meta}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: "#ffe082" }}>
                    報酬: {q.rewardMoney.toLocaleString()} 円
                  </span>
                  <button
                    type="button"
                    className={styles.accept}
                    disabled={taken}
                    onClick={() => onAccept(q.id, q.title)}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,220,140,0.45)",
                      background: taken
                        ? "rgba(255,255,255,0.12)"
                        : "linear-gradient(180deg, #c48a3a, #8f5a1e)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: taken ? "default" : "pointer",
                      opacity: taken ? 0.55 : 1,
                    }}
                  >
                    {taken ? "受注済み" : "受注する"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          style={{
            width: "100%",
            padding: 11,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(0,0,0,0.35)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          とじる
        </button>
      </div>
    </div>,
    document.body
  );
}
