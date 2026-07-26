"use client";

import { createPortal } from "react-dom";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  WEAPONS,
  WEAPON_GENRES,
  buyWeapon,
  equipWeapon,
  getServerWeaponSnapshot,
  getWeaponSnapshot,
  subscribeWeapons,
  type GearRarity,
  type WeaponGenre,
} from "../lib/weapons";
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

type GenreTab = WeaponGenre | "all";

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

function genreIcon(g?: WeaponGenre): string {
  switch (g) {
    case "hammer":
      return "槌";
    case "dagger":
      return "短";
    case "spear":
      return "槍";
    default:
      return "剣";
  }
}

function genreLabel(g?: WeaponGenre): string {
  return WEAPON_GENRES.find((x) => x.id === g)?.label ?? "剣";
}

function rarityClass(r: GearRarity): string {
  return styles[`rarity${r}` as keyof typeof styles] ?? "";
}

function rarityTagClass(r: GearRarity): string {
  return styles[`rarityTag${r}` as keyof typeof styles] ?? "";
}

export default function WeaponShopModal({ open, onClose }: Props) {
  const { owned, equippedId } = useWeaponSnap();
  const money = useMoney();
  const [tab, setTab] = useState<GenreTab>("all");

  const list = useMemo(() => {
    return WEAPONS.filter((w) => {
      if (tab !== "all" && w.weaponGenre !== tab) return false;
      // ドロップ専用（price 0）は所持後のみ表示
      if (w.price <= 0 && w.id !== "wood" && !owned.includes(w.id)) {
        return false;
      }
      return true;
    });
  }, [tab, owned]);

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
    pushChatMessage(result.message, "system");
  };

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="武器屋"
      onClick={onClose}
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div className={styles.headLeft}>
            <span className={styles.title}>武器屋</span>
            <span className={styles.subtitle}>
              鍛冶屋「ガルフ」— 武器の購入・装備　
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
          <aside className={styles.tabs} aria-label="武器ジャンル">
            {WEAPON_GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`${styles.tab} ${tab === g.id ? styles.tabOn : ""}`}
                onClick={() => setTab(g.id)}
              >
                {g.label}
              </button>
            ))}
          </aside>

          <div className={styles.list}>
            {list.length === 0 ? (
              <p className={styles.empty}>このジャンルの武器はまだありません</p>
            ) : (
              list.map((w) => {
                const has = owned.includes(w.id);
                const eq = equippedId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`${styles.card} ${eq ? styles.cardEq : ""} ${rarityClass(w.rarity)}`}
                  >
                    <span className={styles.cardIcon}>
                      {genreIcon(w.weaponGenre)}
                    </span>
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
                          ATK +{w.atkBonus}
                          {w.critBonus > 0 ? ` / CRIT +${w.critBonus}%` : ""}
                        </span>
                      </div>
                      <p className={styles.cardDesc}>{w.desc}</p>
                      <div className={styles.cardMeta}>
                        {genreLabel(w.weaponGenre)}
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
            左のタブで剣・槌などの系統を切り替えられます
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
