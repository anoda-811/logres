"use client";

import { createPortal } from "react-dom";
import { WARP_DESTINATIONS, type AreaId } from "../lib/locations";
import styles from "./ShopModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  currentAreaId: AreaId;
  onWarp: (areaId: AreaId) => void;
};

export default function WarpShopModal({
  open,
  onClose,
  currentAreaId,
  onWarp,
}: Props) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.root} role="dialog" aria-label="ワープ屋">
      <div
        className={styles.panel}
        style={{ height: "auto", maxHeight: "80vh" }}
      >
        <header className={styles.head}>
          <div className={styles.headLeft}>
            <h2 className={styles.title}>ワープ屋</h2>
            <p className={styles.subtitle}>行き先を選んでワープできます</p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            ✕
          </button>
        </header>

        <div style={{ padding: 12, overflow: "auto" }}>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 10,
            }}
          >
            {WARP_DESTINATIONS.map((dest) => {
              const here = dest.id === currentAreaId;
              return (
                <li
                  key={dest.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 4,
                    border: "1px solid rgba(220,220,230,0.28)",
                    background: "rgba(20,22,28,0.55)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        marginBottom: 4,
                      }}
                    >
                      {dest.name}
                      {here ? (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "#8fd4ff",
                            fontWeight: 700,
                          }}
                        >
                          いまここ
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(230,220,190,0.75)",
                        fontWeight: 600,
                      }}
                    >
                      {dest.desc}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnBuy}`}
                    disabled={here}
                    onClick={() => {
                      if (here) return;
                      onWarp(dest.id);
                    }}
                    style={{ flexShrink: 0, minWidth: 88 }}
                  >
                    {here ? "ここです" : "ワープ"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}
