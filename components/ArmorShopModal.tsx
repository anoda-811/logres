"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import {
  ARMORS,
  buyArmor,
  equipGear,
  getGearSnapshot,
  getServerGearSnapshot,
  subscribeGear,
} from "../lib/equipment";
import {
  addMoney,
  getQuestSnapshot,
  getServerQuestSnapshot,
  loadMoney,
  subscribeQuests,
} from "../lib/quests";
import { pushChatMessage } from "../lib/chatStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

function useGearSnap() {
  return useSyncExternalStore(
    subscribeGear,
    getGearSnapshot,
    getServerGearSnapshot
  );
}

function useMoney() {
  return useSyncExternalStore(
    subscribeQuests,
    getQuestSnapshot,
    getServerQuestSnapshot
  ).money;
}

export default function ArmorShopModal({ open, onClose }: Props) {
  const { owned, equipped } = useGearSnap();
  const money = useMoney();

  if (!open || typeof document === "undefined") return null;

  const onEquip = (id: string, name: string) => {
    if (!equipGear(id)) return;
    pushChatMessage(`${name} を装備した`, "system");
  };

  const onBuy = (id: string) => {
    const result = buyArmor(id, loadMoney(), (amount) => {
      if (loadMoney() < amount) return false;
      addMoney(-amount);
      return true;
    });
    pushChatMessage(result.message, "system");
  };

  const isEquipped = (id: string) => Object.values(equipped).includes(id);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="防具屋"
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 92vw)",
          maxHeight: "min(78vh, 560px)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 14px 12px",
          borderRadius: 12,
          background: "linear-gradient(180deg, #3a2428 0%, #1e1418 100%)",
          border: "2px solid rgba(220, 140, 140, 0.45)",
          color: "#fff0f0",
          boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
        }}
      >
        <h3
          style={{
            margin: "0 0 4px",
            fontSize: 18,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          防具屋
        </h3>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12,
            textAlign: "center",
            opacity: 0.75,
          }}
        >
          防具職人「リーネ」— 防具・装飾の購入　所持金 {money.toLocaleString()} 円
        </p>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 12,
          }}
        >
          {ARMORS.map((w) => {
            const has = owned.includes(w.id);
            const eq = isEquipped(w.id);
            const slotLabel =
              w.slot === "head"
                ? "頭"
                : w.slot === "body"
                  ? "上半身"
                  : w.slot === "arms"
                    ? "手"
                    : w.slot === "waist"
                      ? "下半身"
                      : w.slot === "feet"
                        ? "足"
                        : "装飾";
            return (
              <div
                key={w.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: eq
                    ? "rgba(220, 100, 100, 0.18)"
                    : "rgba(255,255,255,0.05)",
                  border: eq
                    ? "1px solid rgba(255, 160, 160, 0.45)"
                    : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <strong style={{ fontSize: 14 }}>
                    [{slotLabel}] {w.name}
                  </strong>
                  <span style={{ fontSize: 12, color: "#ffe082", fontWeight: 700 }}>
                    DEF +{w.defBonus}
                    {w.atkBonus > 0 ? ` / ATK +${w.atkBonus}` : ""}
                    {w.critBonus > 0 ? ` / CRIT +${w.critBonus}%` : ""}
                  </span>
                </div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "#e0d0d0",
                  }}
                >
                  {w.desc}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, opacity: 0.8 }}>
                    {has
                      ? eq
                        ? "装備中"
                        : "所持中"
                      : w.price <= 0
                        ? "無料"
                        : `${w.price.toLocaleString()} 円`}
                  </span>
                  {has ? (
                    <button
                      type="button"
                      disabled={eq}
                      onClick={() => onEquip(w.id, w.name)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.22)",
                        background: eq
                          ? "rgba(255,255,255,0.08)"
                          : "linear-gradient(180deg, #b85a5a, #803030)",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: eq ? "default" : "pointer",
                        opacity: eq ? 0.55 : 1,
                      }}
                    >
                      {eq ? "装備中" : "装備する"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBuy(w.id)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 6,
                        border: "1px solid rgba(255, 180, 140, 0.45)",
                        background: "linear-gradient(180deg, #c48a3a, #8f5a1e)",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      購入する
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
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
