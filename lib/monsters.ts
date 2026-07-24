export type MonsterDef = {
  id: number;
  name: string;
  maxHp: number;
  atk: number;
  image: string;
  /** 討伐時の経験値 */
  expReward: number;
  /** 討伐時のお金（円） */
  moneyReward: number;
};

export const MONSTERS: Record<number, MonsterDef> = {
  1: {
    id: 1,
    name: "レッドスライム",
    maxHp: 30,
    atk: 4,
    image: "/slime.png",
    expReward: 8,
    moneyReward: 5,
  },
  2: {
    id: 2,
    name: "コンドル",
    maxHp: 55,
    atk: 8,
    image: "/condor.png",
    expReward: 18,
    moneyReward: 12,
  },
};

export type FieldMonster = {
  instanceId: string;
  id: number;
  name: string;
  col: number;
  row: number;
};

/** 出現枠（位置はフィールド側でランダム配置） */
export type FieldMonsterSpawn = {
  instanceId: string;
  id: number;
  name: string;
};

export const FIELD_MONSTER_SPAWNS: FieldMonsterSpawn[] = [
  { instanceId: "slime-a", id: 1, name: "レッドスライム" },
  { instanceId: "slime-b", id: 1, name: "レッドスライム" },
  { instanceId: "condor-a", id: 2, name: "コンドル" },
  { instanceId: "condor-b", id: 2, name: "コンドル" },
];

/** 互換用（固定座標は使わない） */
export const DEFAULT_FIELD_MONSTERS: FieldMonster[] = [];

/** 倒してから復活するまでの時間（ミリ秒） */
export const MONSTER_RESPAWN_MS = 8_000;

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

export type Cell = { col: number; row: number };

function cellKey(c: number, r: number) {
  return `${c},${r}`;
}

/** 空きマスをランダムに1つ */
export function pickRandomFreeCell(
  cols: number,
  rows: number,
  blocked: Cell[],
  occupied: Cell[],
  avoid?: Cell | null
): Cell | null {
  const blockedSet = new Set(blocked.map((b) => cellKey(b.col, b.row)));
  const occSet = new Set(occupied.map((o) => cellKey(o.col, o.row)));
  if (avoid) occSet.add(cellKey(avoid.col, avoid.row));

  const free: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = cellKey(c, r);
      if (blockedSet.has(k) || occSet.has(k)) continue;
      free.push({ col: c, row: r });
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

/** 生存中のスポーン枠 */
export function getAliveSpawns(now = Date.now()): FieldMonsterSpawn[] {
  const defeated = getActiveDefeats(now);
  return FIELD_MONSTER_SPAWNS.filter((s) => !defeated.has(s.instanceId));
}

/** 初期配置：ランダム位置で生成 */
export function createRandomFieldMonsters(
  cols: number,
  rows: number,
  blocked: Cell[],
  avoidCenter?: Cell | null,
  now = Date.now()
): FieldMonster[] {
  const out: FieldMonster[] = [];
  for (const spawn of getAliveSpawns(now)) {
    const cell = pickRandomFreeCell(cols, rows, blocked, out, avoidCenter);
    if (!cell) break;
    out.push({
      instanceId: spawn.instanceId,
      id: spawn.id,
      name: spawn.name,
      col: cell.col,
      row: cell.row,
    });
  }
  return out;
}

/**
 * 生存リストを同期。残っている敵の座標は維持し、復活した敵だけランダム再配置。
 */
export function syncAliveFieldMonsters(
  current: FieldMonster[],
  cols: number,
  rows: number,
  blocked: Cell[],
  avoidCenter?: Cell | null,
  now = Date.now()
): FieldMonster[] {
  const alive = getAliveSpawns(now);
  const aliveIds = new Set(alive.map((s) => s.instanceId));
  const kept = current.filter((m) => aliveIds.has(m.instanceId));
  const keptIds = new Set(kept.map((m) => m.instanceId));

  const next = [...kept];
  for (const spawn of alive) {
    if (keptIds.has(spawn.instanceId)) continue;
    const cell = pickRandomFreeCell(cols, rows, blocked, next, avoidCenter);
    if (!cell) continue;
    next.push({
      instanceId: spawn.instanceId,
      id: spawn.id,
      name: spawn.name,
      col: cell.col,
      row: cell.row,
    });
  }
  return next;
}

/** @deprecated syncAliveFieldMonsters を使う */
export function getAliveFieldMonsters(now = Date.now()): FieldMonster[] {
  const defeated = getActiveDefeats(now);
  return FIELD_MONSTER_SPAWNS.filter((s) => !defeated.has(s.instanceId)).map(
    (s) => ({
      instanceId: s.instanceId,
      id: s.id,
      name: s.name,
      col: 0,
      row: 0,
    })
  );
}
