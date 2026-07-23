"use client";

import { createPortal } from "react-dom";
import styles from "./SettingsModal.module.css";

type Props = {
  open: boolean;
  bgmEnabled: boolean;
  onToggleBgm: () => void;
  onClose: () => void;
};

export default function SettingsModal({
  open,
  bgmEnabled,
  onToggleBgm,
  onClose,
}: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label="設定"
      onClick={onClose}
    >
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={styles.title}>設定</h3>
        <div className={styles.row}>
          <span className={styles.label}>BGM</span>
          <button
            type="button"
            className={`${styles.toggle} ${bgmEnabled ? styles.toggleOn : ""}`}
            onClick={onToggleBgm}
          >
            {bgmEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          とじる
        </button>
      </div>
    </div>,
    document.body
  );
}
