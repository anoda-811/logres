"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  EQUIP_SLOTS,
  equipGear,
  gearMatchesSlot,
  getCombatPower,
  getGear,
  getGearSnapshot,
  getServerGearSnapshot,
  getTotalAtkBonus,
  getTotalCritRate,
  getTotalDefBonus,
  subscribeGear,
  unequipSlot,
  type EquipSlot,
  type GearDef,
  type GearKind,
} from "../lib/equipment";
import { pushChatMessage } from "../lib/chatStore";
import styles from "./InventoryModal.module.css";

type Props = {
  open: boolean;
  playerName?: string;
  onClose: () => void;
};

type BagTab = "all" | "weapon" | "armor" | "accessory";

const BAG_TABS: { id: BagTab; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "weapon", label: "武器" },
  { id: "armor", label: "防具" },
  { id: "accessory", label: "装飾" },
];

const ARMOR_KINDS: GearKind[] = ["head", "body", "arms", "waist", "feet"];

function useGearSnap() {
  return useSyncExternalStore(
    subscribeGear,
    getGearSnapshot,
    getServerGearSnapshot
  );
}

function iconFor(kind: GearKind): string {
  switch (kind) {
    case "weapon":
      return "剣";
    case "head":
      return "頭";
    case "body":
      return "胴";
    case "arms":
      return "手";
    case "waist":
      return "下";
    case "feet":
      return "足";
    default:
      return "飾";
  }
}

export default function InventoryModal({
  open,
  playerName = "ゆうしゃ",
  onClose,
}: Props) {
  const { owned, equipped } = useGearSnap();
  const [selectedSlot, setSelectedSlot] = useState<EquipSlot>("weapon");
  const [bagTab, setBagTab] = useState<BagTab>("all");

  const atk = getTotalAtkBonus();
  const def = getTotalDefBonus();
  const crit = getTotalCritRate();
  const power = getCombatPower();
  const hp = 40 + def * 2;
  const magAtk = Math.floor(atk * 0.4);
  const magDef = Math.floor(def * 0.8);

  const bagList = useMemo(() => {
    const items = owned
      .map((id) => getGear(id))
      .filter((g): g is GearDef => !!g);

    const byTab = items.filter((g) => {
      if (bagTab === "all") return true;
      if (bagTab === "weapon") return g.slot === "weapon";
      if (bagTab === "accessory") return g.slot === "accessory";
      return ARMOR_KINDS.includes(g.slot);
    });

    // 選択中スロットに合うものを上へ
    return byTab.sort((a, b) => {
      const am = gearMatchesSlot(a, selectedSlot) ? 0 : 1;
      const bm = gearMatchesSlot(b, selectedSlot) ? 0 : 1;
      return am - bm;
    });
  }, [owned, bagTab, selectedSlot]);

  if (!open || typeof document === "undefined") return null;

  const onPick = (gear: GearDef) => {
    if (!gearMatchesSlot(gear, selectedSlot)) {
      // 合うスロットへ自動切替して装備
      const slot = EQUIP_SLOTS.find((s) => s.kind === gear.slot)?.id;
      if (!slot) return;
      setSelectedSlot(slot);
      if (equipped[slot] === gear.id) return;
      if (!equipGear(gear.id, slot)) return;
      pushChatMessage(`${gear.name} を装備した`, "system");
      return;
    }
    if (equipped[selectedSlot] === gear.id) return;
    if (!equipGear(gear.id, selectedSlot)) return;
    pushChatMessage(`${gear.name} を装備した`, "system");
  };

  const onUnequip = (slot: EquipSlot) => {
    const cur = equipped[slot];
    if (!cur || slot === "weapon") return;
    const name = getGear(cur)?.name ?? "装備";
    unequipSlot(slot);
    pushChatMessage(`${name} をはずした`, "system");
  };

  const mainSlots = EQUIP_SLOTS.filter((s) => s.group === "main");
  const accSlots = EQUIP_SLOTS.filter((s) => s.group === "acc");

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="持ち物" onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headLeft}>
            <span className={styles.title}>もちもの</span>
            <div className={styles.topTabs}>
              <button type="button" className={`${styles.topTab} ${styles.topTabOn}`}>
                武具
              </button>
              <button type="button" className={styles.topTab} disabled>
                補助防具
              </button>
            </div>
          </div>
          <div className={styles.headRight}>
            <span className={styles.equipListBtn}>装備一覧</span>
            <button type="button" className={styles.close} onClick={onClose} aria-label="閉じる">
              ×
            </button>
          </div>
        </header>

        <div className={styles.body}>
          {/* 左: ステータス */}
          <aside className={styles.stats}>
            <div className={styles.powerBox}>
              <div className={styles.powerLabel}>総合能力</div>
              <div className={styles.powerValue}>{power.toLocaleString()}</div>
            </div>
            <div className={styles.statList}>
              <div className={styles.statRow}>
                <span>HP</span>
                <strong>{hp}</strong>
              </div>
              <div className={styles.statRow}>
                <span>物攻</span>
                <strong>{8 + atk}</strong>
              </div>
              <div className={styles.statRow}>
                <span>魔攻</span>
                <strong>{3 + magAtk}</strong>
              </div>
              <div className={styles.statRow}>
                <span>物防</span>
                <strong>{2 + def}</strong>
              </div>
              <div className={styles.statRow}>
                <span>魔防</span>
                <strong>{1 + magDef}</strong>
              </div>
              <div className={`${styles.statRow} ${styles.muted}`}>
                <span>命中</span>
                <strong>100</strong>
              </div>
              <div className={`${styles.statRow} ${styles.muted}`}>
                <span>回避</span>
                <strong>5</strong>
              </div>
              <div className={styles.statRow}>
                <span>Critical</span>
                <strong>{crit}%</strong>
              </div>
            </div>
            <div className={styles.playerTag}>{playerName}</div>
          </aside>

          {/* 中央: 装備 */}
          <section className={styles.equip}>
            <div className={styles.equipHead}>装備: Lv.1 {playerName}</div>

            <div className={styles.slotBlock}>
              <div className={styles.slotLabel}>武器</div>
              {mainSlots
                .filter((s) => s.id === "weapon")
                .map((slot) => {
                  const gear = equipped[slot.id] ? getGear(equipped[slot.id]!) : null;
                  const on = selectedSlot === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`${styles.slotRow} ${on ? styles.slotOn : ""}`}
                      onClick={() => setSelectedSlot(slot.id)}
                    >
                      <span className={styles.slotIcon}>{iconFor(slot.kind)}</span>
                      <span className={styles.slotKind}>武器</span>
                      <span className={styles.slotName}>{gear?.name ?? "（未装備）"}</span>
                      <span className={styles.slotMeta}>
                        {gear
                          ? [
                              `ATK+${gear.atkBonus}`,
                              gear.critBonus > 0 ? `CRIT+${gear.critBonus}%` : null,
                            ]
                              .filter(Boolean)
                              .join(" ")
                          : ""}
                      </span>
                      <span className={styles.slotPlay} aria-hidden>
                        ›
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className={styles.slotBlock}>
              <div className={styles.slotLabel}>防具</div>
              {mainSlots
                .filter((s) => s.id !== "weapon")
                .map((slot) => {
                  const gear = equipped[slot.id] ? getGear(equipped[slot.id]!) : null;
                  const on = selectedSlot === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`${styles.slotRow} ${on ? styles.slotOn : ""}`}
                      onClick={() => setSelectedSlot(slot.id)}
                      onDoubleClick={() => onUnequip(slot.id)}
                    >
                      <span className={styles.slotIcon}>{iconFor(slot.kind)}</span>
                      <span className={styles.slotKind}>{slot.label}</span>
                      <span className={styles.slotName}>{gear?.name ?? "（未装備）"}</span>
                      <span className={styles.slotMeta}>
                        {gear
                          ? [
                              `DEF+${gear.defBonus}`,
                              gear.atkBonus > 0 ? `ATK+${gear.atkBonus}` : null,
                              gear.critBonus > 0 ? `CRIT+${gear.critBonus}%` : null,
                            ]
                              .filter(Boolean)
                              .join(" ")
                          : ""}
                      </span>
                      <span className={styles.slotPlay} aria-hidden>
                        ›
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className={styles.slotBlock}>
              <div className={styles.slotLabel}>装飾品</div>
              <div className={styles.accRow}>
                {accSlots.map((slot) => {
                  const gear = equipped[slot.id] ? getGear(equipped[slot.id]!) : null;
                  const on = selectedSlot === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`${styles.accSlot} ${on ? styles.slotOn : ""}`}
                      onClick={() => setSelectedSlot(slot.id)}
                      onDoubleClick={() => onUnequip(slot.id)}
                      title={gear?.name ?? "空き"}
                    >
                      <span className={styles.slotIcon}>飾</span>
                      <span className={styles.accName}>{gear?.name ?? "空"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 右: 持ち物一覧 */}
          <section className={styles.bag}>
            <div className={styles.bagHead}>
              <span>{playerName} の持ち物</span>
            </div>
            <div className={styles.bagInner}>
              <div className={styles.bagTabs}>
                {BAG_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.bagTab} ${bagTab === t.id ? styles.bagTabOn : ""}`}
                    onClick={() => setBagTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className={styles.bagList}>
                {bagList.length === 0 && (
                  <p className={styles.empty}>アイテムがありません</p>
                )}
                {bagList.map((g) => {
                  const can = gearMatchesSlot(g, selectedSlot);
                  const eqSomewhere = Object.values(equipped).includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`${styles.bagItem} ${can ? styles.bagItemCan : ""} ${
                        eqSomewhere ? styles.bagItemEq : ""
                      }`}
                      onClick={() => onPick(g)}
                    >
                      <span className={styles.slotIcon}>{iconFor(g.slot)}</span>
                      <span className={styles.bagItemBody}>
                        <strong>{g.name}</strong>
                        <small>
                          ATK+{g.atkBonus} / DEF+{g.defBonus}
                          {g.critBonus > 0 ? ` / CRIT+${g.critBonus}%` : ""}
                          {eqSomewhere ? "　装備中" : ""}
                        </small>
                      </span>
                      <span className={styles.bagArrow} aria-hidden>
                        ›
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.bagFoot}>
              <span className={styles.bagFootCap}>
                {owned.length}/40
              </span>
              <div className={styles.bagFootBtns}>
                <span className={styles.bagFootBtn} title="整理">▲</span>
                <span className={styles.bagFootBtn} title="ロック">鍵</span>
                <span className={styles.bagFootBtn} title="捨てる">捨</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
