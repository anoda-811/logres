"use client";

import { createPortal } from "react-dom";
import styles from "./BossBattleConfirm.module.css";

type Props = {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function BossBattleConfirm({
  name,
  onConfirm,
  onCancel,
}: Props) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-label="戦闘確認"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.panel}>
        <h2 className={styles.head}>{name}</h2>
        <div className={styles.body}>
          <p>戦闘しますか？</p>
          <p className={styles.note}>(PT全員での戦闘となります。)</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.yes}`}
            onClick={onConfirm}
          >
            する
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.no}`}
            onClick={onCancel}
          >
            やめる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
