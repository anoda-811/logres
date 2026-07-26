import type { MonsterDef } from "./monsters";
import { GEAR_RARITY_META, getGear, ownGear } from "./equipment";

export type TreasureDrop = {
  id: string;
  name: string;
  qty: number;
  /** 表示色（レア度など） */
  color: string;
  /** 装備なら所持に追加 */
  gearId?: string;
};

const BLUE = "#6eb6ff";
const GREEN = "#6fdc8c";
const GOLD = GEAR_RARITY_META.UR.color;

/** 通常戦向けの軽い素材ドロップ（表示用） */
const FIELD_MATS: { id: string; name: string; color: string; chance: number }[] =
  [
    { id: "mat_mushroom", name: "霊峰キノコ", color: BLUE, chance: 0.45 },
    { id: "mat_herb", name: "草原の葉", color: GREEN, chance: 0.3 },
    { id: "mat_stone", name: "英雄石", color: GREEN, chance: 0.12 },
  ];

function pushUnique(
  list: TreasureDrop[],
  drop: TreasureDrop
): void {
  const prev = list.find((d) => d.id === drop.id);
  if (prev) {
    prev.qty += drop.qty;
    return;
  }
  list.push({ ...drop });
}

/** 戦闘勝利時のトレジャードロップを抽選し、装備は所持に追加 */
export function rollAndGrantBattleTreasure(
  monster: MonsterDef,
  enemyCount: number
): TreasureDrop[] {
  const drops: TreasureDrop[] = [];
  const n = Math.max(1, enemyCount);

  if (monster.boss) {
    pushUnique(drops, {
      id: "chest_kelpie",
      name: `${monster.name}の宝箱`,
      qty: 1,
      color: GOLD,
    });
    const gear = getGear("hakugeki");
    if (gear) {
      ownGear(gear.id);
      pushUnique(drops, {
        id: `gear_${gear.id}`,
        name: gear.name,
        qty: 1,
        color: GEAR_RARITY_META[gear.rarity].color,
        gearId: gear.id,
      });
    }
    pushUnique(drops, {
      id: "mat_stone_boss",
      name: "英雄石",
      qty: 1,
      color: GREEN,
    });
    return drops;
  }

  for (let i = 0; i < n; i++) {
    for (const mat of FIELD_MATS) {
      if (Math.random() < mat.chance) {
        pushUnique(drops, {
          id: mat.id,
          name: mat.name,
          qty: 1,
          color: mat.color,
        });
      }
    }
  }

  return drops;
}
