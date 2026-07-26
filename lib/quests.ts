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
    description: "キルギム草原でレッドスライムを3体たおせ。",
    targetMonsterId: 1,
    targetCount: 3,
    rewardMoney: 100,
  },
];

const QUEST_KEY = "logres.quests";
const MONEY_KEY = "logres.money";
const EXP_KEY = "logres.exp";
const LEVEL_KEY = "logres.level";
const HP_KEY = "logres.hp";
const HP_UPDATED_KEY = "logres.hpUpdatedAt";
const DEFAULT_MONEY = 164;
const DEFAULT_EXP = 0;
const DEFAULT_LEVEL = 1;
const MAX_LEVEL = 60;
/** 最大HPまで自然回復するのにかかる秒数（フィールド） */
const HP_FULL_REGEN_SEC = 120;

/**
 * レベルごとの最大HP（index = レベル）。
 * 表にない高レベルは末尾から LEVEL ごとに +24。
 */
const MAX_HP_BY_LEVEL: number[] = [
  0,
  // 1-10
  40, 48, 56, 65, 74, 84, 95, 106, 118, 131,
  // 11-20
  145, 160, 176, 193, 211, 230, 250, 271, 293, 316,
  // 21-30
  340, 365, 391, 418, 446, 475, 505, 536, 568, 601,
];
const HP_GROWTH_AFTER_TABLE = 24;

/**
 * Lv → 次レベルに必要な経験値（ログレス準拠）。
 * index = レベル。Lv60 は最大なので 0。
 */
const EXP_TO_NEXT: number[] = [
  0,
  // 1-10
  120, 200, 400, 680, 1000, 1400, 1800, 2200, 2600, 3000,
  // 11-20
  3600, 4200, 4800, 5400, 6000, 6600, 7200, 7800, 9400, 10000,
  // 21-30
  12400, 14800, 17200, 19600, 22000, 24400, 26800, 29200, 31600, 48000,
  // 31-40
  72000, 108000, 162000, 243000, 364500, 550000, 750000, 980000, 1230000,
  1500000,
  // 41-50
  1824000, 2245200, 2834900, 3719400, 5046200, 6173980, 7304015, 8436310,
  9570870, 10932342,
  // 51-59（60は最大）
  12296537, 13663460, 15033117, 16405513, 17780654, 19158545, 20539192,
  21922600, 23308775,
  // 60
  0,
];

export function getMaxLevel(): number {
  return MAX_LEVEL;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export type QuestSnapshot = {
  money: number;
  level: number;
  exp: number;
  maxExp: number;
  maxHp: number;
  hp: number;
  quests: QuestProgress[];
};

function clampLevel(n: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(n)));
}

/** そのレベルの最大HP */
export function maxHpForLevel(level: number): number {
  const lv = clampLevel(level);
  if (lv < MAX_HP_BY_LEVEL.length) return MAX_HP_BY_LEVEL[lv];
  const lastLv = MAX_HP_BY_LEVEL.length - 1;
  return MAX_HP_BY_LEVEL[lastLv] + (lv - lastLv) * HP_GROWTH_AFTER_TABLE;
}

const SERVER_SNAPSHOT: QuestSnapshot = {
  money: DEFAULT_MONEY,
  level: DEFAULT_LEVEL,
  exp: DEFAULT_EXP,
  maxExp: expToNextLevel(DEFAULT_LEVEL),
  maxHp: maxHpForLevel(DEFAULT_LEVEL),
  hp: maxHpForLevel(DEFAULT_LEVEL),
  quests: [],
};

let cachedSnapshot: QuestSnapshot | null = null;

/**
 * レベル L → L+1 に必要な経験値（ログレス経験値テーブル）。
 */
export function expToNextLevel(level: number): number {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (lv >= MAX_LEVEL) return 0;
  return EXP_TO_NEXT[lv] ?? 0;
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
  const maxHp = maxHpForLevel(progress.level);
  const hp = Math.floor(getPlayerHp(maxHp));
  return {
    money: loadMoney(),
    level: progress.level,
    exp: progress.exp,
    maxExp: Math.max(1, expToNextLevel(progress.level)),
    maxHp,
    hp,
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

function readHpUpdatedAt(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = localStorage.getItem(HP_UPDATED_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

function readStoredHp(maxHp: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HP_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(maxHp, n));
  } catch {
    return null;
  }
}

/** 経過時間ぶんの自然回復を適用した現在HP（保存もする） */
export function getPlayerHp(maxHp = maxHpForLevel(loadLevel())): number {
  if (typeof window === "undefined") return maxHp;
  const now = Date.now();
  const stored = readStoredHp(maxHp);
  const updatedAt = readHpUpdatedAt();
  let hp = stored === null ? maxHp : stored;
  if (hp < maxHp) {
    const elapsed = Math.max(0, (now - updatedAt) / 1000);
    const rate = maxHp / HP_FULL_REGEN_SEC;
    hp = Math.min(maxHp, hp + rate * elapsed);
  }
  // 表示用に小数は保持しつつ、保存は細かく更新
  try {
    localStorage.setItem(HP_KEY, String(hp));
    localStorage.setItem(HP_UPDATED_KEY, String(now));
  } catch {
    /* ignore */
  }
  return hp;
}

/** 戦闘終了時など、現在HPを保存（敗北で0なら1に） */
export function savePlayerHp(hp: number, opts?: { allowZero?: boolean }) {
  const maxHp = maxHpForLevel(loadLevel());
  let next = Math.max(0, Math.min(maxHp, hp));
  if (!opts?.allowZero && next <= 0) next = 1;
  try {
    localStorage.setItem(HP_KEY, String(next));
    localStorage.setItem(HP_UPDATED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  emit();
}

/** フィールドでの自然回復を進め、購読者へ通知 */
export function tickPlayerHpRegen(): number {
  const maxHp = maxHpForLevel(loadLevel());
  const hp = getPlayerHp(maxHp);
  invalidateSnapshot();
  listeners.forEach((l) => l());
  return hp;
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
