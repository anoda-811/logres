"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ACTIVE_SLOT_COUNT,
  PASSIVE_SLOT_COUNT,
  clearDeckSlot,
  equipSkillToDeck,
  getServerSkillSnapshot,
  getSkill,
  getSkillSnapshot,
  setDeckSlot,
  skillsOfKind,
  spCostColor,
  subscribeSkills,
  type SkillDef,
  type SkillKind,
} from "../lib/skills";
import styles from "./SkillMenuModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

type DragPayload = {
  skillId: string;
  from: "owned" | "deck";
  kind: SkillKind;
  index?: number;
};

const DND_MIME = "application/x-logres-skill";

function badgeColorFor(sk: SkillDef): string {
  if (sk.kind === "active" && sk.active) {
    return spCostColor(sk.active.cost);
  }
  return sk.badgeColor ?? "#cde";
}

function useSkillSnap() {
  return useSyncExternalStore(
    subscribeSkills,
    getSkillSnapshot,
    getServerSkillSnapshot
  );
}

function parsePayload(e: DragEvent): DragPayload | null {
  try {
    const raw =
      e.dataTransfer.getData(DND_MIME) ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return null;
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export default function SkillMenuModal({ open, onClose }: Props) {
  const { deck } = useSkillSnap();
  const [kind, setKind] = useState<SkillKind>("active");
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [selectedOwned, setSelectedOwned] = useState<string | null>(null);

  const slotCount = kind === "active" ? ACTIVE_SLOT_COUNT : PASSIVE_SLOT_COUNT;
  const slots = kind === "active" ? deck.active : deck.passive;
  const ownedList = useMemo(() => skillsOfKind(kind), [kind]);
  const equippedSet = useMemo(
    () => new Set(slots.filter(Boolean) as string[]),
    [slots]
  );

  if (!open || typeof document === "undefined") return null;

  const startDrag = (
    e: DragEvent,
    payload: DragPayload
  ) => {
    e.dataTransfer.effectAllowed = "move";
    const json = JSON.stringify(payload);
    e.dataTransfer.setData(DND_MIME, json);
    e.dataTransfer.setData("text/plain", json);
  };

  const onDropToSlot = (index: number, e: DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);
    const payload = parsePayload(e);
    if (!payload || payload.kind !== kind) return;
    if (payload.from === "deck" && payload.index === index) return;
    setDeckSlot(kind, index, payload.skillId);
    setSelectedOwned(null);
  };

  const onDropRemove = (e: DragEvent) => {
    e.preventDefault();
    const payload = parsePayload(e);
    if (!payload || payload.from !== "deck" || payload.kind !== kind) return;
    if (typeof payload.index === "number") {
      clearDeckSlot(kind, payload.index);
    }
  };

  const tryEquipOwned = (skillId: string) => {
    if (equippedSet.has(skillId)) return;
    if (equipSkillToDeck(skillId)) {
      setSelectedOwned(null);
      return;
    }
    // 満杯なら選択だけ残す
    setSelectedOwned(skillId);
  };

  const onSlotClick = (index: number) => {
    const cur = slots[index];
    if (selectedOwned) {
      const def = getSkill(selectedOwned);
      if (def && def.kind === kind) {
        setDeckSlot(kind, index, selectedOwned);
        setSelectedOwned(null);
        return;
      }
    }
    if (cur) clearDeckSlot(kind, index);
  };

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="スキル"
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <h2 className={styles.title}>スキル</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className={styles.body}>
          {/* 左：デッキ */}
          <section className={styles.col} aria-label="スキルデッキ設定">
            <div className={styles.colHead}>
              <span>スキルデッキ設定</span>
              <select className={styles.deckSelect} value="0" disabled>
                <option value="0">デッキ0</option>
              </select>
            </div>
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${kind === "active" ? styles.tabOn : ""}`}
                onClick={() => {
                  setKind("active");
                  setSelectedOwned(null);
                }}
              >
                アクティブ
              </button>
              <button
                type="button"
                className={`${styles.tab} ${kind === "passive" ? styles.tabOn : ""}`}
                onClick={() => {
                  setKind("passive");
                  setSelectedOwned(null);
                }}
              >
                パッシブ
              </button>
            </div>
            <ul className={styles.list}>
              {Array.from({ length: slotCount }, (_, i) => {
                const id = slots[i];
                const def = id ? getSkill(id) : undefined;
                const empty = !def;
                return (
                  <li key={`slot-${kind}-${i}`}>
                    <div
                      className={`${styles.slot} ${empty ? styles.slotEmpty : ""} ${
                        dragOverSlot === i ? styles.slotOver : ""
                      } ${selectedOwned && empty ? styles.slotSelected : ""}`}
                      draggable={!!def}
                      onDragStart={(e) => {
                        if (!def) {
                          e.preventDefault();
                          return;
                        }
                        startDrag(e, {
                          skillId: def.id,
                          from: "deck",
                          kind,
                          index: i,
                        });
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverSlot(i);
                      }}
                      onDragLeave={() =>
                        setDragOverSlot((cur) => (cur === i ? null : cur))
                      }
                      onDrop={(e) => onDropToSlot(i, e)}
                      onClick={() => onSlotClick(i)}
                      title={
                        empty
                          ? selectedOwned
                            ? "タップでセット"
                            : "空き枠"
                          : `${def.name}（クリックで外す）`
                      }
                    >
                      <span className={styles.icon} aria-hidden>
                        {def?.icon ?? "・"}
                      </span>
                      <span className={styles.name}>
                        {def?.name ?? "（空き）"}
                      </span>
                      {def?.badge != null && (
                        <span
                          className={styles.badge}
                          style={{ color: badgeColorFor(def) }}
                        >
                          {def.badge}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={styles.arrowCol} aria-hidden>
            <span className={styles.arrow}>◀</span>
          </div>

          {/* 右：取得一覧 */}
          <section
            className={styles.col}
            aria-label="取得済みスキル一覧"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={onDropRemove}
          >
            <div className={styles.colHead}>
              <span>取得済みスキル一覧</span>
              <select className={styles.filterSelect} value="all" disabled>
                <option value="all">すべて({ownedList.length})</option>
              </select>
            </div>
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${kind === "active" ? styles.tabOn : ""}`}
                onClick={() => {
                  setKind("active");
                  setSelectedOwned(null);
                }}
              >
                アクティブ
              </button>
              <button
                type="button"
                className={`${styles.tab} ${kind === "passive" ? styles.tabOn : ""}`}
                onClick={() => {
                  setKind("passive");
                  setSelectedOwned(null);
                }}
              >
                パッシブ
              </button>
            </div>
            <ul className={styles.list}>
              {ownedList.map((sk) => {
                const equipped = equippedSet.has(sk.id);
                return (
                  <li key={sk.id}>
                    <div
                      className={`${styles.row} ${equipped ? styles.rowEquipped : ""} ${
                        selectedOwned === sk.id ? styles.slotSelected : ""
                      }`}
                      draggable={!equipped}
                      onDragStart={(e) => {
                        if (equipped) {
                          e.preventDefault();
                          return;
                        }
                        startDrag(e, {
                          skillId: sk.id,
                          from: "owned",
                          kind,
                        });
                      }}
                      onClick={() => {
                        if (equipped) return;
                        if (selectedOwned === sk.id) {
                          tryEquipOwned(sk.id);
                        } else {
                          setSelectedOwned(sk.id);
                          tryEquipOwned(sk.id);
                        }
                      }}
                      title={sk.desc}
                    >
                      <span className={styles.icon} aria-hidden>
                        {sk.icon}
                      </span>
                      <span className={styles.name}>{sk.name}</span>
                      {sk.badge != null && (
                        <span
                          className={styles.badge}
                          style={{ color: badgeColorFor(sk) }}
                        >
                          {sk.badge}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <p className={styles.hint}>
          右のスキルを左へドラッグしてセット。パッシブは3枠まで。空き枠クリック／右クリック相当で外せます。
          {kind === "passive"
            ? " 種族キラーはスライム・バード・ビーストに効果。"
            : ""}
        </p>
      </div>
    </div>,
    document.body
  );
}
