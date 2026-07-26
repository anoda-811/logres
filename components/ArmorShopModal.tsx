"use client";

import { createPortal } from "react-dom";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  ARMORS,
  ARMOR_SHOP_TABS,
  buyArmor,
  equipGear,
  getGearSnapshot,
  getServerGearSnapshot,
  subscribeGear,
  type GearKind,
  type GearRarity,
} from "../lib/equipment";
import {
  addMoney,
  getQuestSnapshot,
  getServerQuestSnapshot,
  loadMoney,
  subscribeQuests,
} from "../lib/quests";
import { pushChatMessage } from "../lib/chatStore";
import styles from "./ShopModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

type PartTab = GearKind | "all";

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

function partIcon(slot: GearKind): string {
  switch (slot) {
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

function partLabel(slot: GearKind): string {
  return ARMOR_SHOP_TABS.find((t) => t.id === slot)?.label ?? "防具";
}

function rarityClass(r: GearRarity): string {
  return styles[`rarity${r}` as keyof typeof styles] ?? "";
}

function rarityTagClass(r: GearRarity): string {
  return styles[`rarityTag${r}` as keyof typeof styles] ?? "";
}

export default function ArmorShopModal({ open, onClose }: Props) {
  const { owned, equipped } = useGearSnap();
  const money = useMoney();
  const [tab, setTab] = useState<PartTab>("all");

  const list = useMemo(() => {
    return ARMORS.filter((a) => tab === "all" || a.slot === tab);
  }, [tab]);

  if (!open || typeof document === "undefined") return null;

  const isEquipped = (id: string) => Object.values(equipped).includes(id);

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

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="防具屋"
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headLeft}>
            <span className={styles.title}>防具屋</span>
            <span className={styles.subtitle}>
              防具職人「リーネ」— 防具・装飾の購入　
              <span className={styles.money}>
                所持金 {money.toLocaleString()} 円
              </span>
            </span>
          </div>
          <div className={styles.headRight}>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <aside className={styles.tabs} aria-label="防具の部位">
            {ARMOR_SHOP_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </aside>

          <div className={styles.list}>
            {list.length === 0 ? (
              <p className={styles.empty}>この部位の商品はまだありません</p>
            ) : (
              list.map((w) => {
                const has = owned.includes(w.id);
                const eq = isEquipped(w.id);
                return (
                  <div
                    key={w.id}
                    className={`${styles.card} ${eq ? styles.cardEq : ""} ${rarityClass(w.rarity)}`}
                  >
                    <span className={styles.cardIcon}>{partIcon(w.slot)}</span>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTop}>
                        <span className={styles.cardName}>
                          <span
                            className={`${styles.rarityTag} ${rarityTagClass(w.rarity)}`}
                          >
                            {w.rarity}
                          </span>
                          {w.name}
                        </span>
                        <span className={styles.cardStats}>
                          DEF +{w.defBonus}
                          {w.atkBonus > 0 ? ` / ATK +${w.atkBonus}` : ""}
                          {w.critBonus > 0 ? ` / CRIT +${w.critBonus}%` : ""}
                        </span>
                      </div>
                      <p className={styles.cardDesc}>{w.desc}</p>
                      <div className={styles.cardMeta}>
                        {partLabel(w.slot)}
                        {" ／ "}
                        {has
                          ? eq
                            ? "装備中"
                            : "所持中"
                          : w.price <= 0
                            ? "無料"
                            : `${w.price.toLocaleString()} 円`}
                      </div>
                    </div>
                    <div className={styles.cardActions}>
                      {has ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnEquip}`}
                          disabled={eq}
                          onClick={() => onEquip(w.id, w.name)}
                        >
                          {eq ? "装備中" : "装備する"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnBuy}`}
                          onClick={() => onBuy(w.id)}
                        >
                          購入する
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className={styles.foot}>
          <span className={styles.footHint}>
            左のタブで部位・装飾ごとに切り替えられます
          </span>
          <button type="button" className={styles.footClose} onClick={onClose}>
            とじる
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
