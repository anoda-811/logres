"use client";

import { useEffect, useState } from "react";
import styles from "./WorldSelectScreen.module.css";
import {
  addCharacter,
  deleteCharacter,
  ensureDefaultCharacter,
  renameCharacter,
  setActiveCharacterId,
  type PlayerCharacter,
} from "../lib/characters";

export type WorldInfo = {
  id: string;
  name: string;
  subtitle: string;
};

const WORLDS: WorldInfo[] = [
  { id: "1", name: "ワールド 1", subtitle: "草原の冒険がはじまる世界" },
  { id: "2", name: "ワールド 2", subtitle: "準備中のワールド" },
];

type Props = {
  onStart: (world: WorldInfo, character: PlayerCharacter) => void;
};

export default function WorldSelectScreen({ onStart }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<PlayerCharacter[]>([]);
  const [activeCharId, setActiveCharId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");

  const selected = WORLDS.find((w) => w.id === selectedId) ?? null;
  const activeChar =
    characters.find((c) => c.id === activeCharId) ?? characters[0] ?? null;

  useEffect(() => {
    if (!selectedId) {
      setCharacters([]);
      setActiveCharId(null);
      setEditing(false);
      return;
    }
    const list = ensureDefaultCharacter(selectedId);
    setCharacters(list);
    setActiveCharId(list[0]?.id ?? null);
    setEditing(false);
  }, [selectedId]);

  const selectChar = (id: string) => {
    setActiveCharId(id);
    setActiveCharacterId(id);
    setEditing(false);
  };

  const startEdit = () => {
    if (!activeChar) return;
    setDraftName(activeChar.name);
    setEditing(true);
  };

  const saveName = () => {
    if (!activeChar) return;
    const updated = renameCharacter(activeChar.id, draftName);
    if (!updated) return;
    setCharacters(ensureDefaultCharacter(selectedId!));
    setEditing(false);
  };

  const handleAdd = () => {
    if (!selectedId) return;
    if (characters.length >= 5) {
      alert("キャラは最大5人までです");
      return;
    }
    const created = addCharacter(selectedId, `キャラ${characters.length + 1}`);
    const list = ensureDefaultCharacter(selectedId);
    setCharacters(list);
    setActiveCharId(created.id);
    setDraftName(created.name);
    setEditing(true);
  };

  const handleDelete = () => {
    if (!activeChar || !selectedId) return;
    if (characters.length <= 1) {
      alert("最後の1人は削除できません");
      return;
    }
    if (!confirm(`「${activeChar.name}」を削除しますか？`)) return;
    deleteCharacter(activeChar.id);
    const list = ensureDefaultCharacter(selectedId);
    setCharacters(list);
    setActiveCharId(list[0]?.id ?? null);
    setEditing(false);
  };

  return (
    <div className={styles.root}>
      <div className={styles.sky} />
      <div className={styles.clouds} aria-hidden />
      <div className={styles.emblem} aria-hidden />

      <header className={styles.header}>
        <span className={styles.headerBar}>ワールドセレクト</span>
      </header>

      <p className={styles.lead}>
        <span className={styles.leadLine} />
        ログインするワールドを選択してください
        <span className={styles.leadLine} />
      </p>

      <div className={styles.body}>
        <div className={styles.list}>
          {WORLDS.map((world) => {
            const locked = world.id !== "1";
            const active = selectedId === world.id;
            return (
              <button
                key={world.id}
                type="button"
                className={[
                  styles.worldBtn,
                  active ? styles.worldBtnActive : "",
                  locked ? styles.worldBtnLocked : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={locked}
                onClick={() => setSelectedId(world.id)}
              >
                {world.name}
                {locked && <span className={styles.lock}>準備中</span>}
              </button>
            );
          })}
        </div>

        <div
          className={`${styles.preview} ${selected ? styles.previewOpen : ""}`}
        >
          {selected && activeChar ? (
            <div className={styles.charWrap}>
              <div className={styles.charFrame}>
                <img src="/chara.png" alt="キャラクター" draggable={false} />
              </div>
              <div className={styles.charShadow} aria-hidden />

              <div className={styles.charSlots}>
                {characters.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`${styles.charSlot} ${c.id === activeChar.id ? styles.charSlotOn : ""}`}
                    onClick={() => selectChar(c.id)}
                    title={c.name}
                  >
                    {c.name.slice(0, 2)}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.charSlotAdd}
                  onClick={handleAdd}
                  title="キャラ追加"
                >
                  ＋
                </button>
              </div>

              {editing ? (
                <div className={styles.nameEdit}>
                  <input
                    className={styles.nameInput}
                    value={draftName}
                    maxLength={12}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    placeholder="名前（最大12文字）"
                  />
                  <button
                    type="button"
                    className={styles.nameSave}
                    onClick={saveName}
                  >
                    保存
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.charNameBtn}
                  onClick={startEdit}
                  title="クリックで名前編集"
                >
                  {activeChar.name}
                  <span className={styles.editHint}>編集</span>
                </button>
              )}

              <p className={styles.charSub}>{selected.subtitle}</p>

              <div className={styles.charActions}>
                <button
                  type="button"
                  className={styles.subBtn}
                  onClick={startEdit}
                >
                  名前変更
                </button>
                <button
                  type="button"
                  className={styles.subBtnDanger}
                  onClick={handleDelete}
                >
                  削除
                </button>
              </div>

              <button
                type="button"
                className={styles.startBtn}
                onClick={() => {
                  setActiveCharacterId(activeChar.id);
                  onStart(selected, activeChar);
                }}
              >
                ゲームスタート
              </button>
            </div>
          ) : (
            <p className={styles.previewEmpty}>
              ワールドを選ぶとキャラが表示されます
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
