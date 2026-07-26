"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import SettingsModal from "./SettingsModal";
import InventoryModal from "./InventoryModal";
import SkillMenuModal from "./SkillMenuModal";
import {
  getQuestDef,
  getQuestSnapshot,
  getServerQuestSnapshot,
  subscribeQuests,
  tickPlayerHpRegen,
} from "../lib/quests";

type SideId = "world" | "bag" | "skill" | "quest" | "guild" | "gacha";

const SIDE_ITEMS: { id: SideId; label: string; title: string; body: string }[] = [
  {
    id: "world",
    label: "ワールドマップ",
    title: "ワールドマップ",
    body: "マップを開いて各地へ移動できます。",
  },
  {
    id: "bag",
    label: "もちもの",
    title: "もちもの / 装備",
    body: "",
  },
  {
    id: "skill",
    label: "スキル",
    title: "スキル",
    body: "",
  },
  {
    id: "quest",
    label: "クエスト",
    title: "所持クエスト",
    body: "",
  },
  {
    id: "guild",
    label: "ギルド",
    title: "ギルド",
    body: "ギルド機能は未実装。",
  },
  {
    id: "gacha",
    label: "ガチャ",
    title: "ガチャ",
    body: "ガチャは未実装。",
  },
];

type Props = {
  onReturnTitle: () => void;
  onOpenWorldMap?: () => void;
  hp?: number;
  maxHp?: number;
  locationName?: string;
  playerName?: string;
  bgmEnabled?: boolean;
  onToggleBgm?: () => void;
  sfxEnabled?: boolean;
  onToggleSfx?: () => void;
};

function useQuestSnap() {
  return useSyncExternalStore(
    subscribeQuests,
    getQuestSnapshot,
    getServerQuestSnapshot
  );
}

export default function FieldHUD({
  onReturnTitle,
  onOpenWorldMap,
  hp,
  maxHp,
  locationName = "キルギム草原 - 始まりの草原",
  playerName = "ゆうしゃ",
  bgmEnabled = true,
  onToggleBgm,
  sfxEnabled = true,
  onToggleSfx,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [hoverId, setHoverId] = useState<SideId | null>(null);
  const [pinnedId, setPinnedId] = useState<SideId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const { money, quests, level, exp, maxExp, maxHp: levelMaxHp, hp: storedHp } =
    useQuestSnap();
  const displayMaxHp = maxHp ?? levelMaxHp;
  const displayHp = hp ?? Math.ceil(storedHp);

  useEffect(() => setMounted(true), []);

  // フィールド滞在中は時間経過でHP自然回復
  useEffect(() => {
    const id = window.setInterval(() => {
      tickPlayerHpRegen();
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const activeId = pinnedId ?? hoverId;
  const active = SIDE_ITEMS.find((s) => s.id === activeId) ?? null;

  if (!mounted) return null;

  const owned = quests
    .map((q) => {
      const def = getQuestDef(q.questId);
      if (!def) return null;
      return { ...q, def };
    })
    .filter(Boolean) as {
    questId: string;
    status: "active" | "completed";
    progress: number;
    def: NonNullable<ReturnType<typeof getQuestDef>>;
  }[];

  const ui = (
    <div
      className="field-hud"
      aria-label="フィールドUI"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        pointerEvents: "none",
      }}
    >
      <aside
        className="fh-sidebar"
        style={{ pointerEvents: "auto" }}
        onMouseLeave={() => setHoverId(null)}
      >
        <div className="fh-side-rail">
          {SIDE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`fh-side-tab ${
                activeId === item.id ||
                (item.id === "bag" && inventoryOpen) ||
                (item.id === "skill" && skillOpen)
                  ? "is-active"
                  : ""
              }`}
              onMouseEnter={() => {
                if (
                  item.id !== "world" &&
                  item.id !== "bag" &&
                  item.id !== "skill"
                ) {
                  setHoverId(item.id);
                }
              }}
              onFocus={() => {
                if (
                  item.id !== "world" &&
                  item.id !== "bag" &&
                  item.id !== "skill"
                ) {
                  setHoverId(item.id);
                }
              }}
              onClick={() => {
                if (item.id === "world") {
                  setPinnedId(null);
                  setHoverId(null);
                  onOpenWorldMap?.();
                  return;
                }
                if (item.id === "bag") {
                  setPinnedId(null);
                  setHoverId(null);
                  setInventoryOpen(true);
                  return;
                }
                if (item.id === "skill") {
                  setPinnedId(null);
                  setHoverId(null);
                  setSkillOpen(true);
                  return;
                }
                setPinnedId((cur) => (cur === item.id ? null : item.id));
              }}
            >
              <span className="fh-side-label">{item.label}</span>
            </button>
          ))}
        </div>
        {active &&
          active.id !== "world" &&
          active.id !== "bag" &&
          active.id !== "skill" && (
          <div className="fh-side-panel">
            <h3>{active.title}</h3>
            {active.id === "quest" ? (
              <div className="fh-quest-list">
                {owned.length === 0 ? (
                  <p>
                    所持クエストはありません。城下町のクエストボードで受注できます。
                  </p>
                ) : (
                  owned.map((q) => {
                    const done = q.status === "completed";
                    const pct = Math.min(
                      100,
                      (q.progress / q.def.targetCount) * 100
                    );
                    return (
                      <div key={q.questId} className="fh-quest-item">
                        <div className="fh-quest-item-head">
                          <strong>{q.def.title}</strong>
                          <span className={done ? "done" : "active"}>
                            {done ? "達成" : "進行中"}
                          </span>
                        </div>
                        <p className="fh-quest-desc">{q.def.description}</p>
                        <div className="fh-quest-progress">
                          <div className="fh-quest-bar">
                            <div style={{ width: `${pct}%` }} />
                          </div>
                          <span>
                            {q.progress} / {q.def.targetCount}
                          </span>
                        </div>
                        <div className="fh-quest-reward">
                          報酬: {q.def.rewardMoney.toLocaleString()} 円
                          {done ? "（受取済）" : ""}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <p>{active.body}</p>
            )}
            <button
              type="button"
              className="fh-side-close"
              onClick={() => {
                setPinnedId(null);
                setHoverId(null);
              }}
            >
              とじる
            </button>
          </div>
        )}
      </aside>

      <div className="fh-status" style={{ pointerEvents: "auto" }}>
        <div className="fh-status-lvbox">
          <span className="fh-status-sword" aria-hidden />
          <span className="fh-status-lv-label">レベル</span>
          <span className="fh-status-lv-num">{level}</span>
        </div>
        <div className="fh-status-bars">
          <div className="fh-bar-row">
            <span className="fh-bar-label">HP</span>
            <div className="fh-bar hp">
              <div
                className="fh-bar-fill"
                style={{ width: `${Math.min(100, (displayHp / displayMaxHp) * 100)}%` }}
              />
              <span className="fh-bar-num">
                {displayHp} / {displayMaxHp}
              </span>
            </div>
          </div>
          <div className="fh-bar-row">
            <span className="fh-bar-label">EXP</span>
            <div className="fh-bar exp">
              <div
                className="fh-bar-fill"
                style={{ width: `${Math.min(100, (exp / maxExp) * 100)}%` }}
              />
              <span className="fh-bar-num">
                {exp} / {maxExp}
              </span>
            </div>
          </div>
          <div className="fh-bar-row">
            <span className="fh-bar-label">名声</span>
            <div className="fh-bar fame">
              <div className="fh-bar-fill" style={{ width: "42%" }} />
              <span className="fh-bar-num">420 / 1000</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fh-topbar" style={{ pointerEvents: "auto" }}>
        <div className="fh-currency">
          <span className="fh-currency-label">所持金</span>
          <span>{money.toLocaleString()}</span>
        </div>
        <div className="fh-currency muted">
          <span className="fh-currency-label">GP</span>
          <span>0</span>
        </div>
        <div className="fh-currency muted">
          <span className="fh-currency-label">LP</span>
          <span>0</span>
        </div>
      </div>

      <div className="fh-menu-wrap" style={{ pointerEvents: "auto" }}>
        <button
          type="button"
          className="fh-menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
        >
          メニュー ▾
        </button>
        {menuOpen && (
          <div className="fh-menu-dropdown">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
            >
              設定
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onReturnTitle();
              }}
            >
              タイトルへ戻る
            </button>
          </div>
        )}
        <div className="fh-location">{locationName}</div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(ui, document.body)}
      <SettingsModal
        open={settingsOpen}
        bgmEnabled={bgmEnabled}
        onToggleBgm={() => onToggleBgm?.()}
        sfxEnabled={sfxEnabled}
        onToggleSfx={() => onToggleSfx?.()}
        onClose={() => setSettingsOpen(false)}
      />
      <InventoryModal
        open={inventoryOpen}
        playerName={playerName}
        onClose={() => setInventoryOpen(false)}
      />
      <SkillMenuModal open={skillOpen} onClose={() => setSkillOpen(false)} />
    </>
  );
}
