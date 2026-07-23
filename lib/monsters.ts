export type MonsterDef = {
  id: number;
  name: string;
  maxHp: number;
  atk: number;
  image: string;
};

export const MONSTERS: Record<number, MonsterDef> = {
  1: {
    id: 1,
    name: "レッドスライム",
    maxHp: 30,
    atk: 4,
    image: "/slime.png",
  },
};

export type FieldMonster = {
  instanceId: string;
  id: number;
  name: string;
  col: number;
  row: number;
};

export const DEFAULT_FIELD_MONSTERS: FieldMonster[] = [
  { instanceId: "slime-7-4", id: 1, name: "レッドスライム", col: 7, row: 4 },
  { instanceId: "slime-7-10", id: 1, name: "レッドスライム", col: 7, row: 10 },
];

/** 倒してから復活するまでの時間（ミリ秒） */
export const MONSTER_RESPAWN_MS = 30_000;

const DEFEATED_KEY = "defeatedMonstersUntil";

/** instanceId -> 復活時刻(epoch ms) */
export type DefeatUntilMap = Record<string, number>;

export function getMonster(id: number | string | null): MonsterDef {
  const n = Number(id);
  return MONSTERS[n] ?? MONSTERS[1];
}

export function readDefeatUntilMap(): DefeatUntilMap {
  try {
    const raw = sessionStorage.getItem(DEFEATED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DefeatUntilMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeDefeatUntilMap(map: DefeatUntilMap) {
  sessionStorage.setItem(DEFEATED_KEY, JSON.stringify(map));
}

/** 期限切れを掃除して、いま倒されている ID の Set を返す */
export function getActiveDefeats(now = Date.now()): Set<string> {
  const map = readDefeatUntilMap();
  let changed = false;
  const active = new Set<string>();
  for (const [id, until] of Object.entries(map)) {
    if (until > now) {
      active.add(id);
    } else {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeDefeatUntilMap(map);
  return active;
}

export function markMonsterDefeated(instanceId: string, now = Date.now()) {
  const map = readDefeatUntilMap();
  map[instanceId] = now + MONSTER_RESPAWN_MS;
  writeDefeatUntilMap(map);
}

export function getAliveFieldMonsters(now = Date.now()): FieldMonster[] {
  const defeated = getActiveDefeats(now);
  return DEFAULT_FIELD_MONSTERS.filter((m) => !defeated.has(m.instanceId));
}
