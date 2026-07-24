export type QuestDef = {
  id: string;
  title: string;
  description: string;
  /** 討伐対象モンスター ID */
  targetMonsterId: number;
  targetCount: number;
  rewardMoney: number;
};

export type QuestStatus = "active" | "completed";

export type QuestProgress = {
  questId: string;
  status: QuestStatus;
  progress: number;
};

export const QUEST_DEFS: QuestDef[] = [
  {
    id: "red_slime_hunt",
    title: "レッドスライム討伐",
    description: "草原フィールドでレッドスライムを3体たおせ。",
    targetMonsterId: 1,
    targetCount: 3,
    rewardMoney: 100,
  },
];

const QUEST_KEY = "logres.quests";
const MONEY_KEY = "logres.money";
const EXP_KEY = "logres.exp";
const LEVEL_KEY = "logres.level";
const DEFAULT_MONEY = 164;
const DEFAULT_EXP = 0;
const DEFAULT_LEVEL = 1;
const MAX_LEVEL = 99;

type Listener = () => void;
const listeners = new Set<Listener>();

export type QuestSnapshot = {
  money: number;
  level: number;
  exp: number;
  maxExp: number;
  quests: QuestProgress[];
};

const SERVER_SNAPSHOT: QuestSnapshot = {
  money: DEFAULT_MONEY,
  level: DEFAULT_LEVEL,
  exp: DEFAULT_EXP,
  maxExp: expToNextLevel(DEFAULT_LEVEL),
  quests: [],
};

let cachedSnapshot: QuestSnapshot | null = null;

/**
 * レベル L → L+1 に必要な経験値。
 * 上がるほど指数的に増える（Lv1:40 → Lv5:約154 → Lv10:約826）。
 */
export function expToNextLevel(level: number): number {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (lv >= MAX_LEVEL) return 0;
  return Math.max(1, Math.floor(40 * Math.pow(1.4, lv - 1)));
}

function clampLevel(n: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(n)));
}

/** 余剰経験値でレベルを繰り上げた結果を返す（保存はしない） */
export function resolveLevelProgress(
  level: number,
  exp: number
): { level: number; exp: number; levelsGained: number } {
  let lv = clampLevel(level);
  let xp = Math.max(0, Math.floor(exp));
  let gained = 0;
  while (lv < MAX_LEVEL) {
    const need = expToNextLevel(lv);
    if (xp < need) break;
    xp -= need;
    lv += 1;
    gained += 1;
  }
  if (lv >= MAX_LEVEL) {
    lv = MAX_LEVEL;
    xp = 0;
  }
  return { level: lv, exp: xp, levelsGained: gained };
}

function readSnapshot(): QuestSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  const rawLevel = loadLevelRaw();
  const rawExp = loadExpRaw();
  const progress = resolveLevelProgress(rawLevel, rawExp);
  // 旧データで経験値が閾値超えの場合はここで正規化保存
  if (progress.level !== rawLevel || progress.exp !== rawExp) {
    try {
      localStorage.setItem(LEVEL_KEY, String(progress.level));
      localStorage.setItem(EXP_KEY, String(progress.exp));
    } catch {
      /* ignore */
    }
  }
  return {
    money: loadMoney(),
    level: progress.level,
    exp: progress.exp,
    maxExp: Math.max(1, expToNextLevel(progress.level)),
    quests: loadQuestProgress(),
  };
}

function invalidateSnapshot() {
  cachedSnapshot = null;
}

function emit() {
  invalidateSnapshot();
  listeners.forEach((l) => l());
}

export function subscribeQuests(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuestDef(id: string): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.id === id);
}

export function loadQuestProgress(): QuestProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuestProgress[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuestProgress(list: QuestProgress[]) {
  localStorage.setItem(QUEST_KEY, JSON.stringify(list));
  emit();
}

export function loadMoney(): number {
  if (typeof window === "undefined") return DEFAULT_MONEY;
  try {
    const raw = localStorage.getItem(MONEY_KEY);
    if (raw == null) return DEFAULT_MONEY;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_MONEY;
  } catch {
    return DEFAULT_MONEY;
  }
}

export function saveMoney(amount: number) {
  localStorage.setItem(MONEY_KEY, String(Math.max(0, Math.floor(amount))));
  emit();
}

export function addMoney(delta: number) {
  saveMoney(loadMoney() + delta);
}

function loadLevelRaw(): number {
  if (typeof window === "undefined") return DEFAULT_LEVEL;
  try {
    const raw = localStorage.getItem(LEVEL_KEY);
    if (raw == null) return DEFAULT_LEVEL;
    const n = Number(raw);
    return Number.isFinite(n) ? clampLevel(n) : DEFAULT_LEVEL;
  } catch {
    return DEFAULT_LEVEL;
  }
}

function loadExpRaw(): number {
  if (typeof window === "undefined") return DEFAULT_EXP;
  try {
    const raw = localStorage.getItem(EXP_KEY);
    if (raw == null) return DEFAULT_EXP;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : DEFAULT_EXP;
  } catch {
    return DEFAULT_EXP;
  }
}

export function loadLevel(): number {
  return resolveLevelProgress(loadLevelRaw(), loadExpRaw()).level;
}

export function loadExp(): number {
  return resolveLevelProgress(loadLevelRaw(), loadExpRaw()).exp;
}

export function saveLevel(level: number) {
  localStorage.setItem(LEVEL_KEY, String(clampLevel(level)));
  emit();
}

export function saveExp(amount: number) {
  localStorage.setItem(EXP_KEY, String(Math.max(0, Math.floor(amount))));
  emit();
}

export type ExpGainResult = {
  levelsGained: number;
  level: number;
  exp: number;
  maxExp: number;
};

/** 経験値を加算し、足りればレベルアップ。上がった段数を返す */
export function addExp(delta: number): ExpGainResult {
  const before = resolveLevelProgress(loadLevelRaw(), loadExpRaw());
  const after = resolveLevelProgress(
    before.level,
    before.exp + Math.max(0, Math.floor(delta))
  );
  try {
    localStorage.setItem(LEVEL_KEY, String(after.level));
    localStorage.setItem(EXP_KEY, String(after.exp));
  } catch {
    /* ignore */
  }
  emit();
  return {
    levelsGained: after.levelsGained,
    level: after.level,
    exp: after.exp,
    maxExp: Math.max(1, expToNextLevel(after.level)),
  };
}

export function getActiveQuests(): QuestProgress[] {
  return loadQuestProgress().filter((q) => q.status === "active");
}

export function getOwnedQuests(): QuestProgress[] {
  return loadQuestProgress();
}

export function isQuestAccepted(questId: string): boolean {
  return loadQuestProgress().some((q) => q.questId === questId);
}

export function acceptQuest(questId: string): boolean {
  const def = getQuestDef(questId);
  if (!def) return false;
  const list = loadQuestProgress();
  if (list.some((q) => q.questId === questId)) return false;
  list.push({ questId, status: "active", progress: 0 });
  saveQuestProgress(list);
  return true;
}

/** バトル勝利時に呼ぶ。該当クエストの進捗を進め、達成なら報酬を付与 */
export function recordMonsterKill(monsterId: number): string[] {
  const list = loadQuestProgress();
  const completedTitles: string[] = [];
  let moneyGain = 0;
  let changed = false;

  for (const entry of list) {
    if (entry.status !== "active") continue;
    const def = getQuestDef(entry.questId);
    if (!def || def.targetMonsterId !== monsterId) continue;
    entry.progress = Math.min(def.targetCount, entry.progress + 1);
    changed = true;
    if (entry.progress >= def.targetCount) {
      entry.status = "completed";
      moneyGain += def.rewardMoney;
      completedTitles.push(def.title);
    }
  }

  if (changed) {
    saveQuestProgress(list);
    if (moneyGain > 0) addMoney(moneyGain);
  }
  return completedTitles;
}

/** useSyncExternalStore 用。同一内容なら同一参照を返す */
export function getQuestSnapshot(): QuestSnapshot {
  if (!cachedSnapshot) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

export function getServerQuestSnapshot(): QuestSnapshot {
  return SERVER_SNAPSHOT;
}
