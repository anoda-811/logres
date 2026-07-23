"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { WORLD_AREAS, type AreaId, type WorldArea } from "../lib/locations";
import styles from "./WorldMapModal.module.css";

type Props = {
  open: boolean;
  currentAreaId: AreaId;
  onClose: () => void;
  onTravel: (areaId: AreaId) => void;
};

export default function WorldMapModal({
  open,
  currentAreaId,
  onClose,
  onTravel,
}: Props) {
  const [selected, setSelected] = useState<WorldArea | null>(null);

  if (!open || typeof document === "undefined") return null;

  const ui = (
    <div className={styles.root} role="dialog" aria-label="ワールドマップ">
      <div className={styles.panel}>
        <div className={styles.map}>
          <div className={styles.land} />
          <div className={styles.mountains} />
          <div className={styles.forest} />
          <div className={styles.clouds} />

          <div className={styles.path} aria-hidden>
            <svg className={styles.pathSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
              <path
                d="M 8 70 C 30 60, 45 40, 78 28"
                fill="none"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="1.8"
                strokeDasharray="3 3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {WORLD_AREAS.map((area) => {
            const here = area.id === currentAreaId;
            const isSelected = selected?.id === area.id;
            return (
              <button
                key={area.id}
                type="button"
                className={[
                  styles.node,
                  here ? styles.nodeHere : "",
                  isSelected ? styles.nodeSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${area.x}%`, top: `${area.y}%` }}
                onClick={() => setSelected(area)}
              >
                <span
                  className={`${styles.icon} ${
                    area.icon === "castle" ? styles.iconCastle : styles.iconGrass
                  }`}
                >
                  <span className={styles.iconGlyph} aria-hidden />
                </span>
                <span className={styles.label}>
                  {area.name}
                  {here ? "（いまここ）" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.title}>ワールドマップ</div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          とじる
        </button>

        {selected && (
          <div className={styles.confirm}>
            <p className={styles.confirmName}>{selected.name}</p>
            <p className={styles.confirmDesc}>{selected.desc}</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.goBtn}
                disabled={selected.id === currentAreaId}
                onClick={() => {
                  onTravel(selected.id);
                  setSelected(null);
                  onClose();
                }}
              >
                {selected.id === currentAreaId ? "すでにここにいます" : "移動する"}
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setSelected(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
