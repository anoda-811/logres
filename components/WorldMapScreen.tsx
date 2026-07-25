"use client";

import { useState } from "react";
import { WORLD_AREAS, type AreaId, type WorldArea } from "../lib/locations";
import styles from "./WorldMapScreen.module.css";

type Props = {
  currentAreaId: AreaId;
  onClose: () => void;
  onTravel: (areaId: AreaId) => void;
};

export default function WorldMapScreen({
  currentAreaId,
  onClose,
  onTravel,
}: Props) {
  const [selected, setSelected] = useState<WorldArea | null>(null);

  return (
    <div className={styles.root} role="dialog" aria-label="ワールドマップ">
      <div className={styles.stage}>
        <div className={styles.mapFrame}>
          <img
            className={styles.mapArt}
            src="/ui/world-map.png"
            alt="ワールドマップ"
            draggable={false}
          />

          {WORLD_AREAS.map((area) => {
            const here = area.id === currentAreaId;
            const isSelected = selected?.id === area.id;
            return (
              <button
                key={area.id}
                type="button"
                className={[
                  styles.node,
                  area.icon === "grass" ? styles.nodeGrass : styles.nodeCastle,
                  here ? styles.nodeHere : "",
                  isSelected ? styles.nodeSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: `${area.x}%`, top: `${area.y}%` }}
                onClick={() => setSelected(area)}
                aria-label={area.name}
              >
                <span className={styles.pin} aria-hidden />
                <span className={styles.label}>
                  {area.name}
                  {here ? (
                    <span className={styles.hereTag}>いまここ</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <header className={styles.header}>
          <h1 className={styles.title}>ワールドマップ</h1>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            とじる
          </button>
        </header>

        <p className={styles.hint}>行き先を選んで移動できます</p>

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
                  if (selected.id === currentAreaId) return;
                  onTravel(selected.id);
                }}
              >
                {selected.id === currentAreaId
                  ? "すでにここにいます"
                  : "移動する"}
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
}
