"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import {
  WEAPONS,
  buyWeapon,
  equipWeapon,
  getServerWeaponSnapshot,
  getWeaponSnapshot,
  subscribeWeapons,
} from "../lib/weapons";
import {
  addMoney,
  getQuestSnapshot,
  getServerQuestSnapshot,
  loadMoney,
  subscribeQuests,
} from "../lib/quests";
import { pushChatMessage } from "../lib/chatStore";
import styles from "./WeaponShopModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

function useWeaponSnap() {
  return useSyncExternalStore(
    subscribeWeapons,
    getWeaponSnapshot,
    getServerWeaponSnapshot
  );
}

function useMoney() {
  return useSyncExternalStore(
    subscribeQuests,
    getQuestSnapshot,
    getServerQuestSnapshot
  ).money;
}

export default function WeaponShopModal({ open, onClose }: Props) {
  const { owned, equippedId } = useWeaponSnap();
  const money = useMoney();

  if (!open || typeof document === "undefined") return null;

  const onEquip = (id: string, name: string) => {
    if (!equipWeapon(id)) return;
    pushChatMessage(`${name} を装備した`, "system");
  };

  const onBuy = (id: string) => {
    const result = buyWeapon(id, loadMoney(), (amount) => {
      if (loadMoney() < amount) return false;
      addMoney(-amount);
      return true;
    });
    pushChatMessage(result.message, result.ok ? "system" : "system");
  };

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="武器屋"
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
          width: "min(400px, 92vw)",
          maxHeight: "min(78vh, 560px)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 14px 12px",
          borderRadius: 12,
          background: "linear-gradient(180deg, #2a3038 0%, #1a1e24 100%)",
          border: "2px solid rgba(180, 190, 210, 0.45)",
          color: "#eef3ff",
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
          武器屋
        </h3>
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12,
            textAlign: "center",
            opacity: 0.75,
          }}
        >
          鍛冶屋「ガルフ」— 武器の購入・装備　所持金 {money.toLocaleString()} 円
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
          {WEAPONS.map((w) => {
            const has = owned.includes(w.id);
            const eq = equippedId === w.id;
            return (
              <div
                key={w.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: eq
                    ? "rgba(90, 160, 220, 0.18)"
                    : "rgba(255,255,255,0.05)",
                  border: eq
                    ? "1px solid rgba(140, 200, 255, 0.45)"
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
                  <strong style={{ fontSize: 14 }}>{w.name}</strong>
                  <span style={{ fontSize: 12, color: "#ffe082", fontWeight: 700 }}>
                    ATK +{w.atkBonus}
                  </span>
                </div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "#c5d0e4",
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
                          : "linear-gradient(180deg, #4a7ab8, #2e5080)",
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
                        border: "1px solid rgba(255, 200, 120, 0.45)",
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
