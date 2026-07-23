"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SettingsModal from "./SettingsModal";

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
    body: "装備やアイテムはここから見る予定。いまは準備中。",
  },
  {
    id: "skill",
    label: "スキル",
    title: "スキル",
    body: "習得スキルの確認・セットはここ。戦闘のスキルとは別枠の予定。",
  },
  {
    id: "quest",
    label: "クエスト",
    title: "クエスト",
    body: "クエストボードをここに出す予定。",
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
  level?: number;
  hp?: number;
  maxHp?: number;
  exp?: number;
  maxExp?: number;
  money?: number;
  locationName?: string;
  playerName?: string;
  bgmEnabled?: boolean;
  onToggleBgm?: () => void;
};

export default function FieldHUD({
  onReturnTitle,
  onOpenWorldMap,
  level = 1,
  hp = 40,
  maxHp = 40,
  exp = 12,
  maxExp = 100,
  money = 164,
  locationName = "草原フィールド",
  playerName = "ゆうしゃ",
  bgmEnabled = true,
  onToggleBgm,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [hoverId, setHoverId] = useState<SideId | null>(null);
  const [pinnedId, setPinnedId] = useState<SideId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeId = pinnedId ?? hoverId;
  const active = SIDE_ITEMS.find((s) => s.id === activeId) ?? null;

  if (!mounted) return null;

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
              className={`fh-side-tab ${activeId === item.id ? "is-active" : ""}`}
              onMouseEnter={() => {
                if (item.id !== "world") setHoverId(item.id);
              }}
              onFocus={() => {
                if (item.id !== "world") setHoverId(item.id);
              }}
              onClick={() => {
                if (item.id === "world") {
                  setPinnedId(null);
                  setHoverId(null);
                  onOpenWorldMap?.();
                  return;
                }
                setPinnedId((cur) => (cur === item.id ? null : item.id));
              }}
            >
              <span className="fh-side-label">{item.label}</span>
            </button>
          ))}
        </div>
        {active && active.id !== "world" && (
          <div className="fh-side-panel">
            <h3>{active.title}</h3>
            <p>{active.body}</p>
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
        <div className="fh-status-head">
          {playerName}
          <span className="fh-status-lv"> Lv.{level}</span>
        </div>
        <div className="fh-bar-row">
          <span className="fh-bar-label">HP</span>
          <div className="fh-bar hp">
            <div
              className="fh-bar-fill"
              style={{ width: `${Math.min(100, (hp / maxHp) * 100)}%` }}
            />
            <span className="fh-bar-num">
              {hp} / {maxHp}
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
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
